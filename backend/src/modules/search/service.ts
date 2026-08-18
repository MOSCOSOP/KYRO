import type { SearchResults } from '@kyro/shared';
import { insensitiveContains, prisma } from '../../lib/prisma.js';
import { conversationInclude, serializeConversations } from '../../serializers/conversation.js';
import { communityInclude, serializeCommunity } from '../../serializers/community.js';
import { searchMessages } from '../messages/service.js';
import { searchUsers } from '../users/service.js';

/**
 * Búsqueda global: una sola caja para personas, conversaciones, comunidades,
 * canales, mensajes y archivos. Todo se limita al ámbito del usuario.
 */
export async function globalSearch(userId: string, query: string): Promise<SearchResults> {
  const trimmed = query.trim();
  const empty: SearchResults = {
    people: [],
    conversations: [],
    communities: [],
    channels: [],
    messages: [],
    files: [],
  };
  if (trimmed.length < 2) return empty;

  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true },
  });
  const conversationIds = memberships.map((membership) => membership.conversationId);

  const [people, conversationRows, communityRows, channelRows, messages, fileRows] =
    await Promise.all([
      searchUsers(userId, trimmed, 8),
      prisma.conversation.findMany({
        where: {
          id: { in: conversationIds },
          type: { in: ['direct', 'group'] },
          OR: [
            { name: insensitiveContains(trimmed) },
            { members: { some: { user: { displayName: insensitiveContains(trimmed) } } } },
          ],
        },
        take: 6,
        include: conversationInclude,
      }),
      prisma.community.findMany({
        where: {
          OR: [
            { name: insensitiveContains(trimmed) },
            { description: insensitiveContains(trimmed) },
          ],
          AND: [{ OR: [{ isPublic: true }, { members: { some: { userId } } }] }],
        },
        take: 6,
        include: communityInclude,
      }),
      prisma.conversation.findMany({
        where: {
          id: { in: conversationIds },
          type: 'channel',
          name: insensitiveContains(trimmed),
        },
        take: 6,
        include: conversationInclude,
      }),
      searchMessages(userId, trimmed, { limit: 12 }),
      prisma.attachment.findMany({
        where: {
          conversationId: { in: conversationIds },
          name: insensitiveContains(trimmed),
          message: { deletedAt: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { message: { select: { conversationId: true, conversation: { select: { name: true, type: true } } } } },
      }),
    ]);

  const memberRoles = await prisma.communityMember.findMany({
    where: { userId, communityId: { in: communityRows.map((row) => row.id) } },
    select: { communityId: true, role: true, muted: true },
  });
  const roleMap = new Map(memberRoles.map((row) => [row.communityId, row]));

  return {
    people,
    conversations: await serializeConversations(conversationRows, userId),
    channels: await serializeConversations(channelRows, userId),
    communities: communityRows.map((row) => {
      const membership = roleMap.get(row.id);
      return serializeCommunity(row, {
        role: (membership?.role as never) ?? null,
        muted: membership?.muted ?? false,
      });
    }),
    messages,
    files: fileRows.map((row) => ({
      id: row.id,
      kind: row.kind as never,
      url: row.url,
      name: row.name,
      size: row.size,
      mimeType: row.mimeType,
      width: row.width,
      height: row.height,
      durationMs: row.durationMs,
      conversationId: row.conversationId,
      messageId: row.messageId,
      conversationName: row.message.conversation.name ?? 'Conversación',
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
