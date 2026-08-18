import type { RoomParticipant } from '@kyro/shared';
import { ephemeral } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { publicUserSelect, serializeUsers } from '../serializers/user.js';

/**
 * Estado de las salas de voz/reunión. Es efímero por naturaleza: vive en Redis
 * (o en memoria) y nunca en la base de datos.
 */

interface RawState {
  muted: boolean;
  deafened: boolean;
  sharingScreen: boolean;
  camera: boolean;
  joinedAt: string;
}

const roomKey = (roomId: string) => `room:${roomId}`;
const userRoomKey = (userId: string) => `room:user:${userId}`;

export async function joinRoom(roomId: string, userId: string) {
  const previous = await ephemeral.get(userRoomKey(userId));
  if (previous && previous !== roomId) await leaveRoom(previous, userId);

  const state: RawState = {
    muted: false,
    deafened: false,
    sharingScreen: false,
    camera: false,
    joinedAt: new Date().toISOString(),
  };
  await ephemeral.hset(roomKey(roomId), userId, JSON.stringify(state));
  await ephemeral.set(userRoomKey(userId), roomId, 60 * 60 * 12);
  return state;
}

export async function leaveRoom(roomId: string, userId: string) {
  await ephemeral.hdel(roomKey(roomId), userId);
  const current = await ephemeral.get(userRoomKey(userId));
  if (current === roomId) await ephemeral.del(userRoomKey(userId));
}

export async function leaveCurrentRoom(userId: string) {
  const roomId = await ephemeral.get(userRoomKey(userId));
  if (!roomId) return null;
  await leaveRoom(roomId, userId);
  return roomId;
}

export async function updateRoomState(
  roomId: string,
  userId: string,
  patch: Partial<Omit<RawState, 'joinedAt'>>,
) {
  const raw = await ephemeral.hgetall(roomKey(roomId));
  const current = raw[userId] ? (JSON.parse(raw[userId]) as RawState) : null;
  if (!current) return null;
  const next = { ...current, ...patch };
  await ephemeral.hset(roomKey(roomId), userId, JSON.stringify(next));
  return next;
}

export async function roomMemberIds(roomId: string) {
  const raw = await ephemeral.hgetall(roomKey(roomId));
  return Object.keys(raw);
}

export async function roomParticipants(roomId: string): Promise<RoomParticipant[]> {
  const raw = await ephemeral.hgetall(roomKey(roomId));
  const userIds = Object.keys(raw);
  if (userIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: publicUserSelect,
  });
  const serialized = await serializeUsers(users);

  return serialized
    .map((user) => {
      const state = JSON.parse(raw[user.id]) as RawState;
      return {
        user,
        muted: state.muted,
        deafened: state.deafened,
        sharingScreen: state.sharingScreen,
        camera: state.camera,
        joinedAt: state.joinedAt,
      } satisfies RoomParticipant;
    })
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

export async function participantsByRoom(roomIds: string[]) {
  const entries = await Promise.all(
    roomIds.map(async (roomId) => [roomId, await roomParticipants(roomId)] as const),
  );
  return new Map(entries);
}
