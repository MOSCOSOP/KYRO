import type { ServerToClientEvents } from '@kyro/shared';
import { prisma } from '../lib/prisma.js';
import { ephemeral } from '../lib/redis.js';
import { conversationRoom, emit, voiceRoomChannel } from './io.js';
import { effectiveStatus } from './presence.js';
import { parseActivity, parseCustomStatus } from '../serializers/user.js';

type EventName = keyof ServerToClientEvents;
type EventPayload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

export function emitToUsers<E extends EventName>(
  userIds: string[],
  event: E,
  payload: EventPayload<E>,
  options: { exclude?: string[] } = {},
) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  emit({ targets: { kind: 'user', ids: unique }, event, payload, exclude: options.exclude });
}

export function emitToConversationRoom<E extends EventName>(
  conversationId: string,
  event: E,
  payload: EventPayload<E>,
  options: { exclude?: string[] } = {},
) {
  emit({
    targets: { kind: 'room', ids: [conversationRoom(conversationId)] },
    event,
    payload,
    exclude: options.exclude,
  });
}

export function emitToVoiceRoom<E extends EventName>(
  roomId: string,
  event: E,
  payload: EventPayload<E>,
  options: { exclude?: string[] } = {},
) {
  emit({
    targets: { kind: 'room', ids: [voiceRoomChannel(roomId)] },
    event,
    payload,
    exclude: options.exclude,
  });
}

export async function conversationMemberIds(conversationId: string) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

export async function emitToConversationMembers<E extends EventName>(
  conversationId: string,
  event: E,
  payload: EventPayload<E>,
  options: { exclude?: string[] } = {},
) {
  const ids = await conversationMemberIds(conversationId);
  emitToUsers(ids, event, payload, options);
}

/**
 * Audiencia de presencia: personas que comparten conversación o contacto.
 * Se cachea brevemente porque se recalcula en cada conexión/desconexión.
 */
export async function presenceAudience(userId: string): Promise<string[]> {
  const cacheKey = `audience:${userId}`;
  const cached = await ephemeral.get(cacheKey);
  if (cached) return JSON.parse(cached) as string[];

  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true },
    take: 300,
  });

  const [peers, contacts] = await Promise.all([
    prisma.conversationMember.findMany({
      where: { conversationId: { in: memberships.map((m) => m.conversationId) } },
      select: { userId: true },
      distinct: ['userId'],
      take: 500,
    }),
    prisma.contact.findMany({
      where: {
        status: 'accepted',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
      take: 500,
    }),
  ]);

  const ids = new Set<string>();
  for (const peer of peers) ids.add(peer.userId);
  for (const contact of contacts) {
    ids.add(contact.requesterId);
    ids.add(contact.addresseeId);
  }
  ids.delete(userId);

  const list = [...ids];
  await ephemeral.set(cacheKey, JSON.stringify(list), 60);
  return list;
}

export async function broadcastPresence(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      customStatusJson: true,
      activityJson: true,
      lastSeenAt: true,
    },
  });
  if (!user) return;

  const status = await effectiveStatus(user.id, user.status as never);
  const audience = await presenceAudience(userId);

  emitToUsers([...audience, userId], 'presence:update', {
    userId,
    status,
    customStatus: parseCustomStatus(user.customStatusJson),
    activity: parseActivity(user.activityJson),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
  });
}
