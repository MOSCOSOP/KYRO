import type { Attachment, AttachmentKind, Message, MessagePreview, MessageType, Reaction } from '@kyro/shared';
import type { Prisma } from '@prisma/client';
import { publicUserSelect, serializeUser } from './user.js';
import { effectiveStatuses } from '../realtime/presence.js';

export const messageInclude = {
  author: { select: publicUserSelect },
  attachments: true,
  reactions: { select: { emoji: true, userId: true } },
  mentions: { select: { userId: true } },
  savedBy: { select: { userId: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      authorId: true,
      deletedAt: true,
      author: { select: { displayName: true } },
      _count: { select: { attachments: true } },
    },
  },
} satisfies Prisma.MessageInclude;

export type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

interface SerializeContext {
  viewerId: string;
  /** Última lectura de cada miembro, para calcular el estado "leído". */
  readStates?: { userId: string; lastReadAt: Date | null }[];
}

function groupReactions(
  reactions: { emoji: string; userId: string }[],
  viewerId: string,
): Reaction[] {
  const map = new Map<string, Reaction>();
  for (const row of reactions) {
    const existing = map.get(row.emoji);
    if (existing) {
      existing.count += 1;
      existing.userIds.push(row.userId);
      if (row.userId === viewerId) existing.reacted = true;
    } else {
      map.set(row.emoji, {
        emoji: row.emoji,
        count: 1,
        userIds: [row.userId],
        reacted: row.userId === viewerId,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}

function serializeAttachment(row: MessageRow['attachments'][number]): Attachment {
  return {
    id: row.id,
    kind: row.kind as AttachmentKind,
    url: row.url,
    name: row.name,
    size: row.size,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
  };
}

export function serializeMessage(
  row: MessageRow,
  ctx: SerializeContext,
  authorStatus: Parameters<typeof serializeUser>[1] = 'offline',
): Message {
  const deleted = Boolean(row.deletedAt);
  return {
    id: row.id,
    conversationId: row.conversationId,
    author: row.author ? serializeUser(row.author, authorStatus) : null,
    content: deleted ? '' : row.content,
    type: row.type as MessageType,
    meta: row.metaJson ? safeJson(row.metaJson) : null,
    attachments: deleted ? [] : row.attachments.map(serializeAttachment),
    reactions: deleted ? [] : groupReactions(row.reactions, ctx.viewerId),
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          content: row.replyTo.deletedAt ? '' : row.replyTo.content,
          authorId: row.replyTo.authorId ?? '',
          authorName: row.replyTo.author?.displayName ?? 'Cuenta eliminada',
          deletedAt: row.replyTo.deletedAt?.toISOString() ?? null,
          attachmentCount: row.replyTo._count.attachments,
        }
      : null,
    mentions: row.mentions.map((m) => m.userId),
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    pinnedAt: row.pinnedAt?.toISOString() ?? null,
    saved: row.savedBy.some((s) => s.userId === ctx.viewerId),
    createdAt: row.createdAt.toISOString(),
    readBy:
      ctx.readStates
        ?.filter(
          (state) =>
            state.userId !== row.authorId &&
            state.lastReadAt !== null &&
            state.lastReadAt >= row.createdAt,
        )
        .map((state) => state.userId) ?? [],
  };
}

export async function serializeMessages(rows: MessageRow[], ctx: SerializeContext) {
  const authors = rows.map((row) => row.author).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const statuses = await effectiveStatuses(authors);
  return rows.map((row) =>
    serializeMessage(row, ctx, (row.authorId && statuses.get(row.authorId)) || 'offline'),
  );
}

export function serializePreview(
  row: {
    id: string;
    authorId: string | null;
    content: string;
    type: string;
    createdAt: Date;
    deletedAt: Date | null;
    author?: { displayName: string } | null;
    _count?: { attachments: number };
  } | null,
): MessagePreview | null {
  if (!row) return null;
  return {
    id: row.id,
    authorId: row.authorId ?? '',
    authorName: row.author?.displayName ?? 'Cuenta eliminada',
    content: row.deletedAt ? '' : row.content,
    type: row.type as MessageType,
    attachmentCount: row._count?.attachments ?? 0,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function safeJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
