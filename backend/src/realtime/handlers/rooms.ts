import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { publicUserSelect, serializeUserAsync } from '../../serializers/user.js';
import { emitToUsers, emitToVoiceRoom } from '../broadcast.js';
import { voiceRoomChannel, type KyroSocket } from '../io.js';
import { enterContext, leaveContext } from '../context.js';
import { joinRoom, leaveRoom, roomMemberIds, roomParticipants, updateRoomState } from '../rooms.js';

async function roomAccess(roomId: string, userId: string) {
  const room = await prisma.voiceRoom.findUnique({
    where: { id: roomId },
    select: { id: true, communityId: true, maxParticipants: true },
  });
  if (!room) return null;
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: room.communityId, userId } },
    select: { id: true },
  });
  return membership ? room : null;
}

export function registerRoomHandlers(socket: KyroSocket) {
  const { userId } = socket.data;

  socket.on('room:join', async ({ roomId }, ack) => {
    const room = await roomAccess(roomId, userId);
    if (!room) {
      ack?.({ ok: false, error: 'No tienes acceso a esta sala' });
      return;
    }

    const current = await roomMemberIds(roomId);
    if (current.length >= room.maxParticipants && !current.includes(userId)) {
      ack?.({ ok: false, error: 'La sala está llena' });
      return;
    }

    await joinRoom(roomId, userId);
    await socket.join(voiceRoomChannel(roomId));
    await enterContext(userId, 'room');

    const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
    const participants = await roomParticipants(roomId);

    if (user) {
      const participant = participants.find((p) => p.user.id === userId) ?? {
        user: await serializeUserAsync(user),
        muted: false,
        deafened: false,
        sharingScreen: false,
        camera: false,
        joinedAt: new Date().toISOString(),
      };
      emitToVoiceRoom(roomId, 'room:peer-joined', { roomId, participant }, { exclude: [userId] });
    }

    emitToVoiceRoom(roomId, 'room:state', { roomId, participants });
    ack?.({ ok: true, participants, iceServers: env.iceServers });
  });

  socket.on('room:leave', async ({ roomId }) => {
    await leaveRoom(roomId, userId);
    await socket.leave(voiceRoomChannel(roomId));
    await leaveContext(userId, 'room');
    emitToVoiceRoom(roomId, 'room:peer-left', { roomId, userId });
    emitToVoiceRoom(roomId, 'room:state', { roomId, participants: await roomParticipants(roomId) });
  });

  socket.on('room:state-set', async ({ roomId, ...patch }) => {
    const updated = await updateRoomState(roomId, userId, patch);
    if (!updated) return;
    emitToVoiceRoom(roomId, 'room:state', { roomId, participants: await roomParticipants(roomId) });
  });

  socket.on('rtc:signal', async (payload) => {
    if (!payload?.to || !payload.scope?.id) return;

    // El servidor solo enruta: verifica que ambos estén en el mismo espacio.
    if (payload.scope.kind === 'room') {
      const members = await roomMemberIds(payload.scope.id);
      if (!members.includes(userId) || !members.includes(payload.to)) return;
    } else {
      // Los dos tienen que estar en la llamada: con `findFirst` bastaba con que
      // lo estuviera uno, y eso permitía señalizar hacia una llamada ajena.
      const participants = await prisma.callParticipant.findMany({
        where: { callId: payload.scope.id, userId: { in: [userId, payload.to] } },
        select: { userId: true },
      });
      const ids = new Set(participants.map((participant) => participant.userId));
      if (!ids.has(userId) || !ids.has(payload.to)) return;
    }

    emitToUsers([payload.to], 'rtc:signal', { ...payload, from: userId });
  });
}
