import type { ChannelKind, Conversation, ConversationType, MemberRole } from '@kyro/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { effectiveStatuses } from '../realtime/presence.js';
import { publicUserSelect, serializeUser } from './user.js';
import { serializePreview } from './message.js';

export const conversationInclude = {
  members: {
    take: 24,
    orderBy: { joinedAt: 'asc' },
    include: { user: { select: publicUserSelect } },
  },
  _count: { select: { members: true } },
} satisfies Prisma.ConversationInclude;

export type ConversationRow = Prisma.ConversationGetPayload<{
  include: typeof conversationInclude;
}>;

/**
 * Convierte filas de conversación en el contrato público, resolviendo en lote
 * los datos derivados (no leídos, último mensaje, presencia de los miembros).
 */
export async function serializeConversations(
  rows: ConversationRow[],
  viewerId: string,
): Promise<Conversation[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [lastMessages, unreadCounts, statuses] = await Promise.all([
    fetchLastMessages(ids),
    fetchUnreadCounts(rows, viewerId),
    effectiveStatuses(rows.flatMap((row) => row.members.map((member) => member.user))),
  ]);

  return rows.map((row) => {
    const me = row.members.find((member) => member.userId === viewerId);
    const members = row.members
      .filter((member) => row.type !== 'direct' || member.userId !== viewerId)
      .map((member) => serializeUser(member.user, statuses.get(member.userId) ?? 'offline'));
    const other = row.type === 'direct' ? members[0] : null;

    return {
      id: row.id,
      type: row.type as ConversationType,
      communityId: row.communityId,
      channelKind: (row.channelKind as ChannelKind | null) ?? null,
      name: row.type === 'direct' ? (other?.displayName ?? 'Conversación') : row.name,
      topic: row.topic,
      avatarUrl: row.type === 'direct' ? (other?.avatarUrl ?? null) : row.avatarUrl,
      createdAt: row.createdAt.toISOString(),
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      unreadCount: unreadCounts.get(row.id) ?? 0,
      muted: me?.muted ?? false,
      pinned: me?.pinned ?? false,
      myRole: (me?.role as MemberRole) ?? 'member',
      memberCount: row._count.members,
      members,
      lastMessage: serializePreview(lastMessages.get(row.id) ?? null),
    } satisfies Conversation;
  });
}

export async function serializeConversation(row: ConversationRow, viewerId: string) {
  const [conversation] = await serializeConversations([row], viewerId);
  return conversation;
}

async function fetchLastMessages(conversationIds: string[]) {
  const rows = await prisma.message.findMany({
    where: { conversationId: { in: conversationIds } },
    orderBy: { createdAt: 'desc' },
    distinct: ['conversationId'],
    select: {
      id: true,
      conversationId: true,
      authorId: true,
      content: true,
      type: true,
      createdAt: true,
      deletedAt: true,
      author: { select: { displayName: true } },
      attachments: { take: 1, select: { kind: true, name: true } },
      _count: { select: { attachments: true } },
    },
  });
  return new Map(rows.map((row) => [row.conversationId, row]));
}

async function fetchUnreadCounts(rows: ConversationRow[], viewerId: string) {
  const clauses: Prisma.MessageWhereInput[] = [];

  for (const row of rows) {
    const me = row.members.find((member) => member.userId === viewerId);
    if (!me) continue;
    clauses.push({
      conversationId: row.id,
      authorId: { not: viewerId },
      deletedAt: null,
      ...(me.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
    });
  }

  if (clauses.length === 0) return new Map<string, number>();

  const grouped = await prisma.message.groupBy({
    by: ['conversationId'],
    where: { OR: clauses },
    _count: { _all: true },
  });

  return new Map(grouped.map((row) => [row.conversationId, row._count._all]));
}
