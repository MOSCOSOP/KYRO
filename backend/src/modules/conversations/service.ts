import type { Conversation } from '@kyro/shared';
import { LIMITS, ROLE_RANK } from '@kyro/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { sanitizeText } from '../../lib/text.js';
import { emitToConversationMembers, emitToUsers } from '../../realtime/broadcast.js';
import { conversationInclude, serializeConversation, serializeConversations } from '../../serializers/conversation.js';
import { publicUserSelect, serializeUsers } from '../../serializers/user.js';
import { createSystemMessage } from '../messages/service.js';
import { notify } from '../notifications/service.js';
import { requireAccess } from './access.js';

/* ---------------------------------- Lectura -------------------------------- */

/** Bandeja del usuario: chats directos y grupos (los canales viven en su comunidad). */
export async function listConversations(userId: string): Promise<Conversation[]> {
  const rows = await prisma.conversation.findMany({
    where: {
      members: { some: { userId } },
      type: { in: ['direct', 'group'] },
    },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: conversationInclude,
  });

  const conversations = await serializeConversations(rows, userId);
  return conversations.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt);
  });
}

export async function getConversation(conversationId: string, userId: string) {
  await requireAccess(conversationId, userId);
  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: conversationInclude,
  });
  if (!row) throw notFound('Conversación no encontrada');
  return serializeConversation(row, userId);
}

export async function listMembers(conversationId: string, userId: string) {
  await requireAccess(conversationId, userId);
  const rows = await prisma.conversationMember.findMany({
    where: { conversationId },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    include: { user: { select: publicUserSelect } },
    take: 500,
  });
  const users = await serializeUsers(rows.map((row) => row.user));
  return rows.map((row, index) => ({
    userId: row.userId,
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
    lastReadAt: row.lastReadAt?.toISOString() ?? null,
    user: users[index],
  }));
}

/* --------------------------------- Escritura ------------------------------- */

/** Abre (o recupera) el chat directo con otra persona. */
export async function openDirectConversation(userId: string, otherUserId: string) {
  if (userId === otherUserId) throw badRequest('No puedes abrir un chat contigo mismo');

  const other = await prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true } });
  if (!other) throw notFound('Esa persona no existe');

  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'direct',
      AND: [{ members: { some: { userId } } }, { members: { some: { userId: otherUserId } } }],
    },
    include: conversationInclude,
  });
  if (existing) return serializeConversation(existing, userId);

  const created = await prisma.conversation.create({
    data: {
      type: 'direct',
      createdById: userId,
      members: {
        create: [
          { userId, role: 'member' },
          { userId: otherUserId, role: 'member' },
        ],
      },
    },
    include: conversationInclude,
  });

  const conversation = await serializeConversation(created, userId);
  const forOther = await serializeConversation(created, otherUserId);
  emitToUsers([otherUserId], 'conversation:created', { conversation: forOther });
  return conversation;
}

export async function createGroup(
  userId: string,
  input: { name: string; memberIds: string[]; topic?: string },
) {
  const name = sanitizeText(input.name, LIMITS.conversationName.max);
  if (!name) throw badRequest('El grupo necesita un nombre');

  const memberIds = [...new Set(input.memberIds.filter((id) => id !== userId))].slice(0, 200);
  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true },
  });

  const created = await prisma.conversation.create({
    data: {
      type: 'group',
      name,
      topic: input.topic ? sanitizeText(input.topic, LIMITS.topic.max) : null,
      createdById: userId,
      lastMessageAt: new Date(),
      members: {
        create: [
          { userId, role: 'owner' },
          ...users.map((user) => ({ userId: user.id, role: 'member' })),
        ],
      },
    },
    include: conversationInclude,
  });

  await createSystemMessage(created.id, 'Se creó el grupo', { event: 'group_created' });

  for (const user of users) {
    const conversation = await serializeConversation(created, user.id);
    emitToUsers([user.id], 'conversation:created', { conversation });
    await notify({
      userId: user.id,
      actorId: userId,
      type: 'invite',
      title: `Te añadieron a ${name}`,
      body: 'Toca para abrir la conversación',
      data: { conversationId: created.id },
    });
  }

  return serializeConversation(created, userId);
}

export async function updateConversation(
  conversationId: string,
  userId: string,
  input: { name?: string; topic?: string | null; avatarUrl?: string | null },
) {
  const access = await requireAccess(conversationId, userId);
  if (access.conversation.type === 'direct') throw badRequest('Un chat directo no se puede editar');
  if (ROLE_RANK[access.role] < ROLE_RANK.admin) throw forbidden('Necesitas ser administrador');

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      ...(input.name !== undefined ? { name: sanitizeText(input.name, LIMITS.conversationName.max) } : {}),
      ...(input.topic !== undefined
        ? { topic: input.topic ? sanitizeText(input.topic, LIMITS.topic.max) : null }
        : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    },
    include: conversationInclude,
  });

  const conversation = await serializeConversation(updated, userId);
  emitToConversationMembers(conversationId, 'conversation:updated', { conversation });
  return conversation;
}

export async function addMembers(conversationId: string, userId: string, memberIds: string[]) {
  const access = await requireAccess(conversationId, userId);
  if (access.conversation.type === 'direct') {
    throw badRequest('Convierte el chat en grupo para añadir a más personas');
  }

  const existing = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((member) => member.userId));
  const toAdd = [...new Set(memberIds)].filter((id) => !existingIds.has(id)).slice(0, 100);
  if (toAdd.length === 0) return getConversation(conversationId, userId);

  const users = await prisma.user.findMany({
    where: { id: { in: toAdd } },
    select: { id: true, displayName: true },
  });

  await prisma.conversationMember.createMany({
    data: users.map((user) => ({ conversationId, userId: user.id, role: 'member' })),
  });

  await createSystemMessage(
    conversationId,
    users.length === 1
      ? `${users[0].displayName} se unió a la conversación`
      : `${users.length} personas se unieron a la conversación`,
    { event: 'members_added', userIds: users.map((user) => user.id) },
  );

  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: conversationInclude,
  });

  for (const user of users) {
    if (!row) break;
    const conversation = await serializeConversation(row, user.id);
    emitToUsers([user.id], 'conversation:created', { conversation });
  }

  return getConversation(conversationId, userId);
}

/**
 * Convierte un chat directo en grupo sin perder el historial: la continuidad
 * entre "hablar con alguien" y "crear un grupo" es parte del producto.
 */
export async function convertDirectToGroup(
  conversationId: string,
  userId: string,
  input: { name: string; memberIds: string[] },
) {
  const access = await requireAccess(conversationId, userId);
  if (access.conversation.type !== 'direct') throw badRequest('Esta conversación ya es un grupo');

  const name = sanitizeText(input.name, LIMITS.conversationName.max);
  if (!name) throw badRequest('El grupo necesita un nombre');

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { type: 'group', name },
  });
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { role: 'owner' },
  });

  await createSystemMessage(conversationId, `La conversación ahora es el grupo "${name}"`, {
    event: 'converted_to_group',
  });

  if (input.memberIds.length > 0) {
    await addMembers(conversationId, userId, input.memberIds);
  }

  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: conversationInclude,
  });
  if (!row) throw notFound('Conversación no encontrada');

  const conversation = await serializeConversation(row, userId);
  emitToConversationMembers(conversationId, 'conversation:updated', { conversation });
  return conversation;
}

export async function removeMember(conversationId: string, userId: string, targetId: string) {
  const access = await requireAccess(conversationId, userId);
  if (access.conversation.type === 'direct') throw badRequest('No aplica a chats directos');

  const target = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetId } },
    include: { user: { select: { displayName: true } } },
  });
  if (!target) throw notFound('Esa persona no está en la conversación');

  const isSelf = userId === targetId;
  if (!isSelf && ROLE_RANK[access.role] <= ROLE_RANK[target.role as never]) {
    throw forbidden('No puedes expulsar a alguien con tu mismo rango o superior');
  }

  await prisma.conversationMember.delete({ where: { id: target.id } });
  await createSystemMessage(
    conversationId,
    isSelf
      ? `${target.user.displayName} salió de la conversación`
      : `${target.user.displayName} fue expulsado`,
    { event: isSelf ? 'member_left' : 'member_removed', userId: targetId },
  );

  emitToUsers([targetId], 'conversation:removed', { conversationId });
  return { removed: true };
}

export async function setMemberFlags(
  conversationId: string,
  userId: string,
  flags: { muted?: boolean; pinned?: boolean },
) {
  await requireAccess(conversationId, userId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: flags,
  });
  return getConversation(conversationId, userId);
}

export async function markRead(conversationId: string, userId: string) {
  await requireAccess(conversationId, userId);
  const lastReadAt = new Date();
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt },
  });
  emitToConversationMembers(conversationId, 'conversation:read', {
    conversationId,
    userId,
    lastReadAt: lastReadAt.toISOString(),
    unreadCount: 0,
  });
  return { lastReadAt: lastReadAt.toISOString() };
}

export async function setMemberRole(
  conversationId: string,
  userId: string,
  targetId: string,
  role: string,
) {
  const access = await requireAccess(conversationId, userId);
  if (ROLE_RANK[access.role] < ROLE_RANK.admin) throw forbidden('Necesitas ser administrador');
  if (!['admin', 'moderator', 'member'].includes(role)) throw badRequest('Rol no válido');
  if (targetId === userId) throw conflict('No puedes cambiar tu propio rol');

  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: targetId } },
    data: { role },
  });
  return listMembers(conversationId, userId);
}
