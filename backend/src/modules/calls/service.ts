import type { Call, CallKind } from '@kyro/shared';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { callInclude, serializeCall } from '../../serializers/call.js';
import { emitToUsers } from '../../realtime/broadcast.js';
import { enterContext, leaveContext } from '../../realtime/context.js';
import { requireAccess } from '../conversations/access.js';
import { createSystemMessage } from '../messages/service.js';
import { notify } from '../notifications/service.js';

/** Tiempo que suena una llamada antes de marcarse como perdida. */
const RING_TIMEOUT_MS = 45_000;

/**
 * Temporizadores de timbre. Viven en el proceso que creó la llamada: si ese
 * proceso cae, la llamada se cierra igualmente cuando el iniciador se
 * desconecta (`releaseUserCalls`).
 */
const ringTimers = new Map<string, NodeJS.Timeout>();

function clearRingTimer(callId: string) {
  const timer = ringTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    ringTimers.delete(callId);
  }
}

async function loadCall(callId: string) {
  const call = await prisma.call.findUnique({ where: { id: callId }, include: callInclude });
  if (!call) throw notFound('Esa llamada ya no existe');
  return call;
}

async function audienceOf(conversationId: string) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return seconds + ' s';
  return minutes + ' min ' + String(seconds).padStart(2, '0') + ' s';
}

async function emitCallUpdate(callId: string, event: 'call:incoming' | 'call:updated') {
  const row = await loadCall(callId);
  const call = await serializeCall(row);
  emitToUsers(await audienceOf(row.conversationId), event, { call });
  return call;
}

/* ------------------------------- Iniciar ---------------------------------- */

export async function startCall(
  userId: string,
  input: { conversationId: string; kind: CallKind },
): Promise<Call> {
  const access = await requireAccess(input.conversationId, userId);
  if (access.conversation.type === 'channel') {
    throw forbidden('En las comunidades se usan salas de voz, no llamadas directas');
  }

  const members = await audienceOf(input.conversationId);
  if (members.length < 2) throw badRequest('Necesitas a alguien al otro lado para llamar');

  // Si ya hay una llamada viva en esta conversación, el usuario se une a ella.
  const existing = await prisma.call.findFirst({
    where: { conversationId: input.conversationId, status: { in: ['ringing', 'ongoing'] } },
    orderBy: { startedAt: 'desc' },
  });
  if (existing) return joinCall(userId, existing.id);

  const created = await prisma.call.create({
    data: {
      conversationId: input.conversationId,
      initiatorId: userId,
      kind: input.kind,
      status: 'ringing',
      participants: { create: { userId, joinedAt: new Date() } },
    },
    include: callInclude,
  });

  const call = await serializeCall(created);
  await enterContext(userId, 'call');
  emitToUsers(members, 'call:incoming', { call });

  const label = input.kind === 'video' ? 'Videollamada entrante' : 'Llamada entrante';
  await Promise.all(
    members
      .filter((memberId) => memberId !== userId)
      .map((memberId) =>
        notify({
          userId: memberId,
          actorId: userId,
          type: 'call',
          title: label,
          body: call.initiator?.displayName ?? null,
          data: { callId: call.id, conversationId: input.conversationId, kind: input.kind },
        }),
      ),
  );

  const timer = setTimeout(() => {
    void endCall(created.id, 'missed', 'timeout').catch((err) =>
      logger.error({ err, callId: created.id }, 'No se pudo cerrar la llamada sin respuesta'),
    );
  }, RING_TIMEOUT_MS);
  timer.unref?.();
  ringTimers.set(created.id, timer);

  return call;
}

/* -------------------------------- Unirse ---------------------------------- */

export async function joinCall(userId: string, callId: string): Promise<Call> {
  const row = await loadCall(callId);
  await requireAccess(row.conversationId, userId);
  if (row.status === 'ended' || row.status === 'missed' || row.status === 'declined') {
    throw badRequest('Esa llamada ya terminó');
  }

  clearRingTimer(callId);
  await prisma.callParticipant.upsert({
    where: { callId_userId: { callId, userId } },
    create: { callId, userId, joinedAt: new Date() },
    update: { joinedAt: new Date(), leftAt: null },
  });
  if (row.status !== 'ongoing') {
    await prisma.call.update({ where: { id: callId }, data: { status: 'ongoing' } });
  }
  await enterContext(userId, 'call');

  return emitCallUpdate(callId, 'call:updated');
}

export const acceptCall = joinCall;

/* ------------------------------- Rechazar --------------------------------- */

export async function declineCall(userId: string, callId: string): Promise<Call | null> {
  const row = await loadCall(callId);
  await requireAccess(row.conversationId, userId);
  if (row.status === 'ended' || row.status === 'declined' || row.status === 'missed') return null;

  await prisma.callParticipant.upsert({
    where: { callId_userId: { callId, userId } },
    create: { callId, userId, leftAt: new Date() },
    update: { leftAt: new Date() },
  });

  const conversation = await prisma.conversation.findUnique({
    where: { id: row.conversationId },
    select: { type: true },
  });

  const stillIn = row.participants.filter(
    (participant) => participant.userId !== userId && participant.joinedAt && !participant.leftAt,
  );

  // En un directo, rechazar cierra la llamada. En grupo, los demás siguen.
  if (conversation?.type === 'direct' || stillIn.length < 1) {
    await endCall(callId, 'declined', 'declined');
    return null;
  }

  return emitCallUpdate(callId, 'call:updated');
}

/* -------------------------------- Colgar ---------------------------------- */

export async function hangupCall(userId: string, callId: string): Promise<Call | null> {
  const row = await loadCall(callId);
  if (row.status === 'ended' || row.status === 'declined' || row.status === 'missed') return null;

  const isParticipant = row.participants.some((participant) => participant.userId === userId);
  if (!isParticipant) {
    await requireAccess(row.conversationId, userId);
    return null;
  }

  await prisma.callParticipant.updateMany({
    where: { callId, userId, leftAt: null },
    data: { leftAt: new Date() },
  });
  await leaveContext(userId, 'call');

  const remaining = row.participants.filter(
    (participant) => participant.userId !== userId && participant.joinedAt && !participant.leftAt,
  );

  // Colgar mientras suena la cancela; con la llamada en curso, termina cuando
  // deja de haber al menos dos personas dentro.
  if (row.status === 'ringing') {
    await endCall(callId, 'missed', 'cancelled');
    return null;
  }
  if (remaining.length < 2) {
    await endCall(callId, 'ended', 'hangup');
    return null;
  }

  return emitCallUpdate(callId, 'call:updated');
}

/* ------------------------------- Finalizar -------------------------------- */

export async function endCall(
  callId: string,
  status: 'ended' | 'missed' | 'declined',
  reason: string,
) {
  clearRingTimer(callId);

  const row = await prisma.call.findUnique({ where: { id: callId }, include: callInclude });
  if (!row || row.endedAt) return;

  const endedAt = new Date();
  await prisma.$transaction([
    prisma.call.update({ where: { id: callId }, data: { status, endedAt } }),
    prisma.callParticipant.updateMany({
      where: { callId, leftAt: null },
      data: { leftAt: endedAt },
    }),
  ]);

  for (const participant of row.participants) {
    await leaveContext(participant.userId, 'call');
  }

  emitToUsers(await audienceOf(row.conversationId), 'call:ended', {
    callId,
    conversationId: row.conversationId,
    reason,
  });

  const kindLabel = row.kind === 'video' ? 'Videollamada' : 'Llamada';
  const durationMs = endedAt.getTime() - row.startedAt.getTime();
  let content = kindLabel + ' perdida';
  if (status === 'ended') content = kindLabel + ' · ' + formatDuration(durationMs);
  else if (status === 'declined') content = kindLabel + ' rechazada';

  await createSystemMessage(
    row.conversationId,
    content,
    {
      callId,
      kind: row.kind,
      status,
      durationMs: status === 'ended' ? durationMs : 0,
      initiatorId: row.initiatorId,
    },
    'call',
  );
}

/**
 * Al desconectarse un usuario sale de todas sus llamadas vivas: así no quedan
 * llamadas fantasma cuando alguien cierra la pestaña.
 */
export async function releaseUserCalls(userId: string) {
  const active = await prisma.call.findMany({
    where: {
      status: { in: ['ringing', 'ongoing'] },
      participants: { some: { userId, leftAt: null } },
    },
    select: { id: true },
  });
  for (const call of active) {
    await hangupCall(userId, call.id).catch(() => undefined);
  }
}

/* -------------------------------- Consulta -------------------------------- */

export async function getActiveCall(userId: string, conversationId: string) {
  await requireAccess(conversationId, userId);
  const row = await prisma.call.findFirst({
    where: { conversationId, status: { in: ['ringing', 'ongoing'] } },
    orderBy: { startedAt: 'desc' },
    include: callInclude,
  });
  return row ? serializeCall(row) : null;
}

export async function listCallHistory(
  userId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(options.limit ?? 30, 60);
  const rows = await prisma.call.findMany({
    where: {
      participants: { some: { userId } },
      ...(options.cursor ? { startedAt: { lt: new Date(options.cursor) } } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: limit + 1,
    include: callInclude,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: await Promise.all(page.map((row) => serializeCall(row))),
    nextCursor: page.length > 0 ? page[page.length - 1]!.startedAt.toISOString() : null,
    hasMore,
  };
}
