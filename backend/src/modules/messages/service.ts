import type { Message, Paginated } from '@kyro/shared';
import { LIMITS } from '@kyro/shared';
import type { Prisma } from '@prisma/client';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { insensitiveContains, prisma } from '../../lib/prisma.js';
import { excerpt, extractMentionUsernames, mentionsEveryone, sanitizeText } from '../../lib/text.js';
import { emitToConversationMembers, emitToUsers } from '../../realtime/broadcast.js';
import { messageInclude, serializeMessage, serializeMessages, type MessageRow } from '../../serializers/message.js';
import { conversationInclude, serializeConversation } from '../../serializers/conversation.js';
import { notify } from '../notifications/service.js';
import { assertCanSend, requireAccess, type ConversationAccess } from '../conversations/access.js';
import { verifyUploadToken } from '../uploads/tokens.js';
import { ROLE_RANK } from '@kyro/shared';

/* --------------------------------- Lectura -------------------------------- */

interface ListOptions {
  cursor?: string | null;
  limit?: number;
  /** Cargar el contexto alrededor de un mensaje concreto (saltar a un resultado). */
  around?: string | null;
}

export async function listMessages(
  conversationId: string,
  viewerId: string,
  options: ListOptions = {},
): Promise<Paginated<Message>> {
  await requireAccess(conversationId, viewerId);
  const limit = Math.min(options.limit ?? LIMITS.pageSize, 100);

  if (options.around) {
    const anchor = await prisma.message.findFirst({
      where: { id: options.around, conversationId },
      select: { createdAt: true },
    });
    if (!anchor) throw notFound('Mensaje no encontrado');
    const half = Math.floor(limit / 2);
    const [older, newer] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId, createdAt: { lt: anchor.createdAt } },
        orderBy: { createdAt: 'desc' },
        take: half,
        include: messageInclude,
      }),
      prisma.message.findMany({
        where: { conversationId, createdAt: { gte: anchor.createdAt } },
        orderBy: { createdAt: 'asc' },
        take: half,
        include: messageInclude,
      }),
    ]);
    const rows = [...older.reverse(), ...newer];
    return {
      items: await withReadState(rows, conversationId, viewerId),
      nextCursor: rows.length > 0 ? rows[0].createdAt.toISOString() : null,
      hasMore: older.length === half,
    };
  }

  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      ...(options.cursor ? { createdAt: { lt: new Date(options.cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: messageInclude,
  });

  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();

  return {
    items: await withReadState(page, conversationId, viewerId),
    nextCursor: page.length > 0 ? page[0].createdAt.toISOString() : null,
    hasMore,
  };
}

async function withReadState(rows: MessageRow[], conversationId: string, viewerId: string) {
  const readStates = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true, lastReadAt: true },
  });
  return serializeMessages(rows, { viewerId, readStates });
}

export async function getMessage(messageId: string, viewerId: string) {
  const row = await prisma.message.findUnique({ where: { id: messageId }, include: messageInclude });
  if (!row) throw notFound('Mensaje no encontrado');
  await requireAccess(row.conversationId, viewerId);
  const [message] = await serializeMessages([row], { viewerId });
  return message;
}

export async function listPinned(conversationId: string, viewerId: string) {
  await requireAccess(conversationId, viewerId);
  const rows = await prisma.message.findMany({
    where: { conversationId, pinnedAt: { not: null }, deletedAt: null },
    orderBy: { pinnedAt: 'desc' },
    take: 50,
    include: messageInclude,
  });
  return serializeMessages(rows, { viewerId });
}

export async function searchMessages(
  viewerId: string,
  query: string,
  options: { conversationId?: string; limit?: number } = {},
) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const memberships = await prisma.conversationMember.findMany({
    where: { userId: viewerId },
    select: { conversationId: true },
  });
  const allowed = memberships.map((m) => m.conversationId);
  const scope = options.conversationId
    ? allowed.includes(options.conversationId)
      ? [options.conversationId]
      : []
    : allowed;
  if (scope.length === 0) return [];

  const rows = await prisma.message.findMany({
    where: {
      conversationId: { in: scope },
      deletedAt: null,
      content: insensitiveContains(trimmed),
    },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 30,
    include: messageInclude,
  });
  return serializeMessages(rows, { viewerId });
}

export async function listSaved(viewerId: string) {
  const saved = await prisma.savedMessage.findMany({
    where: { userId: viewerId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { messageId: true },
  });
  const rows = await prisma.message.findMany({
    where: { id: { in: saved.map((s) => s.messageId) }, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: messageInclude,
  });
  return serializeMessages(rows, { viewerId });
}

/* --------------------------------- Escritura ------------------------------- */

interface CreateInput {
  conversationId: string;
  authorId: string;
  content: string;
  replyToId?: string | null;
  attachmentTokens?: string[];
}

export async function createMessage(input: CreateInput): Promise<Message> {
  const access = await requireAccess(input.conversationId, input.authorId);
  assertCanSend(access);

  const content = sanitizeText(input.content ?? '', LIMITS.messageContent.max);
  const tokens = (input.attachmentTokens ?? []).slice(0, LIMITS.attachmentsPerMessage);

  if (!content && tokens.length === 0) throw badRequest('El mensaje está vacío');

  if (input.replyToId) {
    const parent = await prisma.message.findFirst({
      where: { id: input.replyToId, conversationId: input.conversationId },
      select: { id: true },
    });
    if (!parent) throw badRequest('El mensaje al que respondes ya no existe');
  }

  const attachments = tokens.map((token) => verifyUploadToken(token, input.authorId));
  const mentionIds = await resolveMentions(content, access, input.authorId);

  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId: input.conversationId,
        authorId: input.authorId,
        content,
        type: 'text',
        replyToId: input.replyToId ?? null,
        attachments: {
          create: attachments.map((attachment) => ({
            conversationId: input.conversationId,
            uploaderId: input.authorId,
            kind: attachment.kind,
            url: attachment.url,
            storageKey: attachment.key,
            name: attachment.name,
            size: attachment.size,
            mimeType: attachment.mimeType,
            width: attachment.width ?? null,
            height: attachment.height ?? null,
            durationMs: attachment.durationMs ?? null,
          })),
        },
        mentions: { create: mentionIds.map((userId) => ({ userId })) },
      },
      include: messageInclude,
    });

    await tx.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: message.createdAt },
    });

    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId: input.conversationId, userId: input.authorId } },
      data: { lastReadAt: message.createdAt },
    });

    return message;
  });

  const [message] = await serializeMessages([created], { viewerId: input.authorId });
  await fanOutMessage(created, message, access);
  return message;
}

/** Mensajes generados por el sistema (alguien se unió, llamada finalizada…). */
export async function createSystemMessage(
  conversationId: string,
  content: string,
  meta?: Record<string, unknown>,
  type: 'system' | 'call' = 'system',
) {
  const created = await prisma.message.create({
    data: {
      conversationId,
      content,
      type,
      metaJson: meta ? JSON.stringify(meta) : null,
    },
    include: messageInclude,
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: created.createdAt },
  });

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: conversationInclude,
  });
  if (!conversation) return null;

  const message = serializeMessage(created, { viewerId: '' });
  const serializedConversation = await serializeConversation(conversation, '');
  emitToConversationMembers(conversationId, 'message:new', {
    message,
    conversation: serializedConversation,
  });
  return message;
}

async function fanOutMessage(row: MessageRow, message: Message, access: ConversationAccess) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: row.conversationId },
    include: conversationInclude,
  });
  if (!conversation) return;

  const serialized = await serializeConversation(conversation, row.authorId ?? '');
  emitToConversationMembers(row.conversationId, 'message:new', {
    message,
    conversation: serialized,
  });

  const members = await prisma.conversationMember.findMany({
    where: { conversationId: row.conversationId, userId: { not: row.authorId ?? '' } },
    select: { userId: true, muted: true },
  });

  const authorName = row.author?.displayName ?? 'Alguien';
  const mentioned = new Set(row.mentions.map((mention) => mention.userId));
  const isChannel = access.conversation.type === 'channel';
  const isAnnouncement = access.conversation.channelKind === 'announcement';
  const contextName =
    access.conversation.type === 'direct' ? authorName : (access.conversation.name ?? 'Conversación');
  const preview = message.content
    ? excerpt(message.content, 140)
    : `${message.attachments.length} archivo(s)`;

  await Promise.all(
    members.map(async (member) => {
      if (member.muted) return;
      const isMentioned = mentioned.has(member.userId);
      if (isChannel && !isMentioned && !isAnnouncement) return;

      await notify({
        userId: member.userId,
        actorId: row.authorId,
        type: isMentioned ? 'mention' : isAnnouncement ? 'announcement' : 'message',
        title: isMentioned ? `${authorName} te mencionó en ${contextName}` : contextName,
        body: preview,
        data: {
          conversationId: row.conversationId,
          messageId: row.id,
          ...(access.conversation.communityId
            ? { communityId: access.conversation.communityId }
            : {}),
        },
      });
    }),
  );
}

async function resolveMentions(
  content: string,
  access: ConversationAccess,
  authorId: string,
): Promise<string[]> {
  const usernames = extractMentionUsernames(content);
  const ids = new Set<string>();

  if (usernames.length > 0) {
    const users = await prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });
    const memberIds = await prisma.conversationMember.findMany({
      where: {
        conversationId: access.conversation.id,
        userId: { in: users.map((user) => user.id) },
      },
      select: { userId: true },
    });
    for (const member of memberIds) ids.add(member.userId);
  }

  if (mentionsEveryone(content) && ROLE_RANK[access.role] >= ROLE_RANK.moderator) {
    const members = await prisma.conversationMember.findMany({
      where: { conversationId: access.conversation.id },
      select: { userId: true },
      take: 500,
    });
    for (const member of members) ids.add(member.userId);
  }

  ids.delete(authorId);
  return [...ids];
}

export async function editMessage(messageId: string, userId: string, content: string) {
  const row = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, authorId: true, conversationId: true, deletedAt: true },
  });
  if (!row || row.deletedAt) throw notFound('Mensaje no encontrado');
  if (row.authorId !== userId) throw forbidden('Solo puedes editar tus mensajes');

  const clean = sanitizeText(content, LIMITS.messageContent.max);
  if (!clean) throw badRequest('El mensaje no puede quedar vacío');

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content: clean, editedAt: new Date() },
    include: messageInclude,
  });

  const [message] = await serializeMessages([updated], { viewerId: userId });
  emitToConversationMembers(row.conversationId, 'message:updated', { message });
  return message;
}

export async function deleteMessage(messageId: string, userId: string) {
  const row = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, authorId: true, conversationId: true },
  });
  if (!row) throw notFound('Mensaje no encontrado');

  if (row.authorId !== userId) {
    const access = await requireAccess(row.conversationId, userId);
    if (ROLE_RANK[access.role] < ROLE_RANK.moderator) {
      throw forbidden('Solo puedes eliminar tus mensajes');
    }
  }

  const deletedAt = new Date();
  await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt, content: '', pinnedAt: null },
  });
  await prisma.attachment.deleteMany({ where: { messageId } });

  emitToConversationMembers(row.conversationId, 'message:deleted', {
    conversationId: row.conversationId,
    messageId,
    deletedAt: deletedAt.toISOString(),
  });
  return { id: messageId, deletedAt: deletedAt.toISOString() };
}

export async function toggleReaction(messageId: string, userId: string, emoji: string) {
  const clean = emoji.trim().slice(0, 24);
  if (!clean) throw badRequest('Reacción no válida');

  const row = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, deletedAt: true },
  });
  if (!row || row.deletedAt) throw notFound('Mensaje no encontrado');
  await requireAccess(row.conversationId, userId);

  const existing = await prisma.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji: clean } },
    select: { id: true },
  });

  if (existing) await prisma.reaction.delete({ where: { id: existing.id } });
  else await prisma.reaction.create({ data: { messageId, userId, emoji: clean } });

  const updated = await prisma.message.findUnique({ where: { id: messageId }, include: messageInclude });
  if (!updated) throw notFound('Mensaje no encontrado');

  const members = await prisma.conversationMember.findMany({
    where: { conversationId: row.conversationId },
    select: { userId: true },
  });

  // Cada miembro necesita saber si la reacción es suya.
  for (const member of members) {
    const [message] = await serializeMessages([updated], { viewerId: member.userId });
    emitToUsers([member.userId], 'message:reaction', {
      conversationId: row.conversationId,
      messageId,
      reactions: message.reactions,
    });
  }

  const [mine] = await serializeMessages([updated], { viewerId: userId });
  return mine.reactions;
}

export async function setPinned(messageId: string, userId: string, pinned: boolean) {
  const row = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, deletedAt: true },
  });
  if (!row || row.deletedAt) throw notFound('Mensaje no encontrado');

  const access = await requireAccess(row.conversationId, userId);
  const isPrivate = access.conversation.type !== 'channel';
  if (!isPrivate && ROLE_RANK[access.role] < ROLE_RANK.moderator) {
    throw forbidden('Necesitas permisos para fijar mensajes en un canal');
  }

  const pinnedAt = pinned ? new Date() : null;
  await prisma.message.update({ where: { id: messageId }, data: { pinnedAt } });

  emitToConversationMembers(row.conversationId, 'message:pinned', {
    conversationId: row.conversationId,
    messageId,
    pinnedAt: pinnedAt?.toISOString() ?? null,
  });
  return { pinnedAt: pinnedAt?.toISOString() ?? null };
}

export async function toggleSaved(messageId: string, userId: string) {
  const row = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true },
  });
  if (!row) throw notFound('Mensaje no encontrado');
  await requireAccess(row.conversationId, userId);

  const existing = await prisma.savedMessage.findUnique({
    where: { userId_messageId: { userId, messageId } },
    select: { id: true },
  });
  if (existing) {
    await prisma.savedMessage.delete({ where: { id: existing.id } });
    return { saved: false };
  }
  await prisma.savedMessage.create({ data: { userId, messageId } });
  return { saved: true };
}

/* --------------------------------- Archivos -------------------------------- */

export async function listConversationFiles(
  conversationId: string,
  viewerId: string,
  kind?: string,
) {
  await requireAccess(conversationId, viewerId);
  const where: Prisma.AttachmentWhereInput = {
    conversationId,
    message: { deletedAt: null },
    ...(kind ? { kind } : {}),
  };
  const rows = await prisma.attachment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { message: { select: { id: true, createdAt: true, author: { select: { id: true, displayName: true } } } } },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    url: row.url,
    name: row.name,
    size: row.size,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    messageId: row.messageId,
    createdAt: row.createdAt.toISOString(),
    uploader: row.message.author,
  }));
}
