import type { CommunityDetail, MemberRole } from '@kyro/shared';
import { LIMITS, ROLE_RANK, can } from '@kyro/shared';
import { customAlphabet } from 'nanoid';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { insensitiveContains, prisma } from '../../lib/prisma.js';
import { sanitizeText, slugify } from '../../lib/text.js';
import { emitToUsers } from '../../realtime/broadcast.js';
import { conversationInclude, serializeConversations } from '../../serializers/conversation.js';
import {
  communityInclude,
  countOnlineMembers,
  serializeCommunity,
  serializeEvent,
  serializeMembers,
  serializeRooms,
} from '../../serializers/community.js';
import { publicUserSelect } from '../../serializers/user.js';
import { createSystemMessage } from '../messages/service.js';
import { notify } from '../notifications/service.js';

const inviteCode = customAlphabet('abcdefghjkmnpqrstuvwxyz23456789', 8);

/* --------------------------------- Consultas ------------------------------- */

export async function listMyCommunities(userId: string) {
  const memberships = await prisma.communityMember.findMany({
    where: { userId },
    include: { community: { include: communityInclude } },
    orderBy: { joinedAt: 'asc' },
  });

  return Promise.all(
    memberships.map(async (membership) => {
      const memberIds = await prisma.communityMember.findMany({
        where: { communityId: membership.communityId },
        select: { userId: true },
        take: 200,
      });
      return serializeCommunity(membership.community, {
        role: membership.role as MemberRole,
        muted: membership.muted,
        onlineCount: await countOnlineMembers(memberIds.map((member) => member.userId)),
      });
    }),
  );
}

export async function discoverCommunities(userId: string, query?: string) {
  const rows = await prisma.community.findMany({
    where: {
      isPublic: true,
      members: { none: { userId } },
      ...(query ? { name: insensitiveContains(query) } : {}),
    },
    orderBy: { members: { _count: 'desc' } },
    take: 24,
    include: communityInclude,
  });
  return rows.map((row) => serializeCommunity(row, { role: null, muted: false }));
}

export async function getMembership(communityId: string, userId: string) {
  return prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { role: true, muted: true },
  });
}

export async function requireMembership(communityId: string, userId: string) {
  const membership = await getMembership(communityId, userId);
  if (!membership) throw notFound('Esta comunidad no existe o no eres miembro');
  return { role: membership.role as MemberRole, muted: membership.muted };
}

export async function getCommunityDetail(
  communityId: string,
  userId: string,
): Promise<CommunityDetail> {
  const membership = await requireMembership(communityId, userId);
  const row = await prisma.community.findUnique({
    where: { id: communityId },
    include: communityInclude,
  });
  if (!row) throw notFound('Comunidad no encontrada');

  const [channelRows, roomRows, eventRows, memberIds] = await Promise.all([
    prisma.conversation.findMany({
      where: { communityId, type: 'channel' },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: conversationInclude,
    }),
    prisma.voiceRoom.findMany({
      where: { communityId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.communityEvent.findMany({
      where: { communityId, OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
      orderBy: { startsAt: 'asc' },
      take: 20,
      include: { _count: { select: { attendees: true } }, attendees: { where: { userId }, select: { id: true } } },
    }),
    prisma.communityMember.findMany({ where: { communityId }, select: { userId: true }, take: 200 }),
  ]);

  return {
    ...serializeCommunity(row, {
      role: membership.role,
      muted: membership.muted,
      onlineCount: await countOnlineMembers(memberIds.map((member) => member.userId)),
    }),
    channels: await serializeConversations(channelRows, userId),
    rooms: await serializeRooms(roomRows),
    events: eventRows.map((event) => serializeEvent(event, event.attendees.length > 0)),
  };
}

export async function listCommunityMembers(communityId: string, userId: string) {
  await requireMembership(communityId, userId);
  const rows = await prisma.communityMember.findMany({
    where: { communityId },
    orderBy: [{ joinedAt: 'asc' }],
    include: { user: { select: publicUserSelect } },
    take: 500,
  });
  return serializeMembers(rows);
}

/* --------------------------------- Creación -------------------------------- */

async function uniqueSlug(name: string) {
  const base = slugify(name) || 'comunidad';
  let candidate = base;
  let attempt = 1;
  while (await prisma.community.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${++attempt}`;
  }
  return candidate;
}

interface CreateCommunityInput {
  name: string;
  description?: string;
  isPublic?: boolean;
  iconUrl?: string | null;
  accentColor?: string | null;
}

export async function createCommunity(userId: string, input: CreateCommunityInput) {
  const name = sanitizeText(input.name, LIMITS.communityName.max);
  if (!name) throw badRequest('La comunidad necesita un nombre');

  const community = await prisma.community.create({
    data: {
      name,
      slug: await uniqueSlug(name),
      description: input.description ? sanitizeText(input.description, LIMITS.communityDescription.max) : null,
      isPublic: input.isPublic ?? true,
      iconUrl: input.iconUrl ?? null,
      accentColor: input.accentColor ?? null,
      inviteCode: inviteCode(),
      ownerId: userId,
      members: { create: { userId, role: 'owner' } },
      rooms: {
        create: [
          { name: 'Voz general', kind: 'voice', position: 0 },
          { name: 'Reuniones', kind: 'meeting', position: 1, maxParticipants: 30 },
        ],
      },
    },
    include: communityInclude,
  });

  await createChannelInternal(community.id, userId, { name: 'general', kind: 'text', position: 0 });
  await createChannelInternal(community.id, userId, {
    name: 'anuncios',
    kind: 'announcement',
    position: 1,
  });

  return serializeCommunity(community, { role: 'owner', muted: false, onlineCount: 1 });
}

/**
 * Un grupo que crece se convierte en comunidad conservando su historial:
 * el grupo pasa a ser el canal principal y sus miembros mantienen su rol.
 */
export async function promoteGroupToCommunity(
  conversationId: string,
  userId: string,
  input: { name?: string; description?: string; isPublic?: boolean },
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: { select: { userId: true, role: true } } },
  });
  if (!conversation) throw notFound('Conversación no encontrada');
  if (conversation.type !== 'group') throw badRequest('Solo un grupo puede convertirse en comunidad');

  const me = conversation.members.find((member) => member.userId === userId);
  if (!me || ROLE_RANK[me.role as MemberRole] < ROLE_RANK.admin) {
    throw forbidden('Necesitas ser administrador del grupo');
  }

  const name = sanitizeText(input.name ?? conversation.name ?? '', LIMITS.communityName.max);
  if (!name) throw badRequest('La comunidad necesita un nombre');

  const community = await prisma.community.create({
    data: {
      name,
      slug: await uniqueSlug(name),
      description: input.description ? sanitizeText(input.description, LIMITS.communityDescription.max) : null,
      isPublic: input.isPublic ?? false,
      iconUrl: conversation.avatarUrl,
      inviteCode: inviteCode(),
      ownerId: userId,
      members: {
        create: conversation.members.map((member) => ({
          userId: member.userId,
          role: member.userId === userId ? 'owner' : member.role,
        })),
      },
      rooms: { create: [{ name: 'Voz general', kind: 'voice', position: 0 }] },
    },
    include: communityInclude,
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      type: 'channel',
      channelKind: 'text',
      communityId: community.id,
      name: 'general',
      position: 0,
    },
  });

  await createChannelInternal(community.id, userId, {
    name: 'anuncios',
    kind: 'announcement',
    position: 1,
  });

  await createSystemMessage(
    conversationId,
    `Este grupo ahora es la comunidad "${name}". Este chat es su canal general.`,
    { event: 'promoted_to_community', communityId: community.id },
  );

  for (const member of conversation.members) {
    if (member.userId === userId) continue;
    emitToUsers([member.userId], 'conversation:removed', { conversationId });
    await notify({
      userId: member.userId,
      actorId: userId,
      type: 'invite',
      title: `${name} ahora es una comunidad`,
      body: 'Tus conversaciones siguen ahí, ahora con canales y salas de voz',
      data: { communityId: community.id, conversationId },
    });
  }

  return serializeCommunity(community, { role: 'owner', muted: false });
}

/* ---------------------------------- Miembros ------------------------------- */

export async function joinCommunity(userId: string, target: { communityId?: string; code?: string }) {
  const community = target.code
    ? await prisma.community.findUnique({ where: { inviteCode: target.code.trim().toLowerCase() }, include: communityInclude })
    : target.communityId
      ? await prisma.community.findUnique({ where: { id: target.communityId }, include: communityInclude })
      : null;

  if (!community) throw notFound('No encontramos esa comunidad');
  if (!community.isPublic && !target.code) {
    throw forbidden('Esta comunidad es privada: necesitas una invitación');
  }

  const existing = await getMembership(community.id, userId);
  if (existing) {
    return serializeCommunity(community, {
      role: existing.role as MemberRole,
      muted: existing.muted,
    });
  }

  await prisma.communityMember.create({
    data: { communityId: community.id, userId, role: 'member' },
  });

  // Alta en los canales de texto para que aparezcan de inmediato.
  const channels = await prisma.conversation.findMany({
    where: { communityId: community.id, type: 'channel' },
    select: { id: true },
  });
  // `skipDuplicates` no existe en SQLite: se filtra a mano para que el mismo
  // código valga en ambos motores.
  const already = await prisma.conversationMember.findMany({
    where: { userId, conversationId: { in: channels.map((channel) => channel.id) } },
    select: { conversationId: true },
  });
  const joined = new Set(already.map((row) => row.conversationId));
  const pending = channels.filter((channel) => !joined.has(channel.id));
  if (pending.length > 0) {
    await prisma.conversationMember.createMany({
      data: pending.map((channel) => ({ conversationId: channel.id, userId, role: 'member' })),
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  const general = channels[0];
  if (general && user) {
    await createSystemMessage(general.id, `${user.displayName} se unió a la comunidad`, {
      event: 'member_joined',
      userId,
    });
  }

  return serializeCommunity(community, { role: 'member', muted: false });
}

export async function leaveCommunity(communityId: string, userId: string) {
  const membership = await requireMembership(communityId, userId);
  if (membership.role === 'owner') {
    throw conflict('Transfiere la propiedad antes de salir de tu comunidad');
  }

  await prisma.communityMember.delete({
    where: { communityId_userId: { communityId, userId } },
  });
  const channels = await prisma.conversation.findMany({
    where: { communityId, type: 'channel' },
    select: { id: true },
  });
  await prisma.conversationMember.deleteMany({
    where: { userId, conversationId: { in: channels.map((channel) => channel.id) } },
  });

  return { left: true };
}

export async function setCommunityRole(
  communityId: string,
  userId: string,
  targetId: string,
  role: MemberRole,
) {
  const membership = await requireMembership(communityId, userId);
  if (!can(membership.role, 'member.role')) throw forbidden('Necesitas ser administrador');
  if (targetId === userId) throw conflict('No puedes cambiar tu propio rol');
  if (role === 'owner') throw badRequest('Usa la transferencia de propiedad');

  const target = await requireMembership(communityId, targetId);
  if (ROLE_RANK[membership.role] <= ROLE_RANK[target.role]) {
    throw forbidden('No puedes gestionar a alguien de tu mismo rango o superior');
  }

  await prisma.communityMember.update({
    where: { communityId_userId: { communityId, userId: targetId } },
    data: { role },
  });
  await prisma.conversationMember.updateMany({
    where: {
      userId: targetId,
      conversation: { communityId },
    },
    data: { role },
  });

  return listCommunityMembers(communityId, userId);
}

export async function kickMember(communityId: string, userId: string, targetId: string) {
  const membership = await requireMembership(communityId, userId);
  if (!can(membership.role, 'member.kick')) throw forbidden('Necesitas permisos de moderación');
  const target = await requireMembership(communityId, targetId);
  if (ROLE_RANK[membership.role] <= ROLE_RANK[target.role]) {
    throw forbidden('No puedes expulsar a alguien de tu mismo rango o superior');
  }

  await prisma.communityMember.delete({
    where: { communityId_userId: { communityId, userId: targetId } },
  });
  const channels = await prisma.conversation.findMany({
    where: { communityId, type: 'channel' },
    select: { id: true },
  });
  await prisma.conversationMember.deleteMany({
    where: { userId: targetId, conversationId: { in: channels.map((channel) => channel.id) } },
  });

  emitToUsers([targetId], 'conversation:removed', { conversationId: communityId });
  return { removed: true };
}

export async function inviteToCommunity(communityId: string, userId: string, targetIds: string[]) {
  const membership = await requireMembership(communityId, userId);
  if (!can(membership.role, 'member.invite')) throw forbidden('No puedes invitar a esta comunidad');

  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { name: true, inviteCode: true },
  });
  if (!community) throw notFound('Comunidad no encontrada');

  await Promise.all(
    targetIds.slice(0, 20).map((targetId) =>
      notify({
        userId: targetId,
        actorId: userId,
        type: 'invite',
        title: `Invitación a ${community.name}`,
        body: 'Únete a la comunidad',
        data: { communityId, code: community.inviteCode },
      }),
    ),
  );
  return { invited: targetIds.length };
}

/* ---------------------------------- Ajustes -------------------------------- */

export async function updateCommunity(
  communityId: string,
  userId: string,
  input: {
    name?: string;
    description?: string | null;
    isPublic?: boolean;
    iconUrl?: string | null;
    bannerUrl?: string | null;
    accentColor?: string | null;
  },
) {
  const membership = await requireMembership(communityId, userId);
  if (!can(membership.role, 'community.edit')) throw forbidden('Necesitas ser administrador');

  const updated = await prisma.community.update({
    where: { id: communityId },
    data: {
      ...(input.name !== undefined ? { name: sanitizeText(input.name, LIMITS.communityName.max) } : {}),
      ...(input.description !== undefined
        ? {
            description: input.description
              ? sanitizeText(input.description, LIMITS.communityDescription.max)
              : null,
          }
        : {}),
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      ...(input.iconUrl !== undefined ? { iconUrl: input.iconUrl } : {}),
      ...(input.bannerUrl !== undefined ? { bannerUrl: input.bannerUrl } : {}),
      ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
    },
    include: communityInclude,
  });

  return serializeCommunity(updated, { role: membership.role, muted: membership.muted });
}

export async function setCommunityMuted(communityId: string, userId: string, muted: boolean) {
  await requireMembership(communityId, userId);
  await prisma.communityMember.update({
    where: { communityId_userId: { communityId, userId } },
    data: { muted },
  });
  return { muted };
}

export async function regenerateInviteCode(communityId: string, userId: string) {
  const membership = await requireMembership(communityId, userId);
  if (!can(membership.role, 'community.edit')) throw forbidden('Necesitas ser administrador');
  const updated = await prisma.community.update({
    where: { id: communityId },
    data: { inviteCode: inviteCode() },
    select: { inviteCode: true },
  });
  return updated;
}

export async function deleteCommunity(communityId: string, userId: string) {
  const membership = await requireMembership(communityId, userId);
  if (!can(membership.role, 'community.delete')) throw forbidden('Solo el propietario puede eliminarla');
  await prisma.community.delete({ where: { id: communityId } });
  return { deleted: true };
}

/* ---------------------------------- Canales -------------------------------- */

async function createChannelInternal(
  communityId: string,
  creatorId: string,
  input: { name: string; kind: 'text' | 'announcement'; topic?: string | null; position?: number },
) {
  const members = await prisma.communityMember.findMany({
    where: { communityId },
    select: { userId: true, role: true },
    take: 500,
  });

  return prisma.conversation.create({
    data: {
      type: 'channel',
      channelKind: input.kind,
      communityId,
      name: slugify(input.name) || 'canal',
      topic: input.topic ?? null,
      position: input.position ?? 0,
      createdById: creatorId,
      members: {
        create: members.map((member) => ({ userId: member.userId, role: member.role })),
      },
    },
    include: conversationInclude,
  });
}

export async function createChannel(
  communityId: string,
  userId: string,
  input: { name: string; kind?: 'text' | 'announcement'; topic?: string },
) {
  const membership = await requireMembership(communityId, userId);
  if (!can(membership.role, 'channel.create')) throw forbidden('Necesitas ser administrador');

  const name = sanitizeText(input.name, LIMITS.channelName.max);
  if (!name) throw badRequest('El canal necesita un nombre');

  const count = await prisma.conversation.count({ where: { communityId, type: 'channel' } });
  const created = await createChannelInternal(communityId, userId, {
    name,
    kind: input.kind ?? 'text',
    topic: input.topic ? sanitizeText(input.topic, LIMITS.topic.max) : null,
    position: count,
  });

  const [channel] = await serializeConversations([created], userId);
  const memberIds = await prisma.communityMember.findMany({
    where: { communityId },
    select: { userId: true },
  });
  emitToUsers(
    memberIds.map((member) => member.userId),
    'conversation:created',
    { conversation: channel },
  );
  return channel;
}

export async function updateChannel(
  channelId: string,
  userId: string,
  input: { name?: string; topic?: string | null; position?: number },
) {
  const channel = await prisma.conversation.findUnique({
    where: { id: channelId },
    select: { communityId: true, type: true },
  });
  if (!channel?.communityId) throw notFound('Canal no encontrado');
  const membership = await requireMembership(channel.communityId, userId);
  if (!can(membership.role, 'channel.edit')) throw forbidden('Necesitas ser administrador');

  const updated = await prisma.conversation.update({
    where: { id: channelId },
    data: {
      ...(input.name !== undefined ? { name: slugify(input.name) || 'canal' } : {}),
      ...(input.topic !== undefined
        ? { topic: input.topic ? sanitizeText(input.topic, LIMITS.topic.max) : null }
        : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    },
    include: conversationInclude,
  });

  const [serialized] = await serializeConversations([updated], userId);
  const memberIds = await prisma.communityMember.findMany({
    where: { communityId: channel.communityId },
    select: { userId: true },
  });
  emitToUsers(
    memberIds.map((member) => member.userId),
    'conversation:updated',
    { conversation: serialized },
  );
  return serialized;
}

export async function deleteChannel(channelId: string, userId: string) {
  const channel = await prisma.conversation.findUnique({
    where: { id: channelId },
    select: { communityId: true },
  });
  if (!channel?.communityId) throw notFound('Canal no encontrado');
  const membership = await requireMembership(channel.communityId, userId);
  if (!can(membership.role, 'channel.delete')) throw forbidden('Necesitas ser administrador');

  const remaining = await prisma.conversation.count({
    where: { communityId: channel.communityId, type: 'channel' },
  });
  if (remaining <= 1) throw conflict('Una comunidad necesita al menos un canal');

  const memberIds = await prisma.communityMember.findMany({
    where: { communityId: channel.communityId },
    select: { userId: true },
  });
  await prisma.conversation.delete({ where: { id: channelId } });
  emitToUsers(
    memberIds.map((member) => member.userId),
    'conversation:removed',
    { conversationId: channelId },
  );
  return { deleted: true };
}

/* ----------------------------------- Salas --------------------------------- */

export async function createRoom(
  communityId: string,
  userId: string,
  input: { name: string; kind?: 'voice' | 'meeting' | 'gaming'; topic?: string; maxParticipants?: number },
) {
  const membership = await requireMembership(communityId, userId);
  if (!can(membership.role, 'room.create')) throw forbidden('Necesitas ser administrador');

  const name = sanitizeText(input.name, LIMITS.channelName.max);
  if (!name) throw badRequest('La sala necesita un nombre');

  const count = await prisma.voiceRoom.count({ where: { communityId } });
  const room = await prisma.voiceRoom.create({
    data: {
      communityId,
      name,
      kind: input.kind ?? 'voice',
      topic: input.topic ? sanitizeText(input.topic, LIMITS.topic.max) : null,
      maxParticipants: Math.min(Math.max(input.maxParticipants ?? 20, 2), 50),
      position: count,
    },
  });
  const [serialized] = await serializeRooms([room]);
  return serialized;
}

export async function deleteRoom(roomId: string, userId: string) {
  const room = await prisma.voiceRoom.findUnique({
    where: { id: roomId },
    select: { communityId: true },
  });
  if (!room) throw notFound('Sala no encontrada');
  const membership = await requireMembership(room.communityId, userId);
  if (!can(membership.role, 'room.manage')) throw forbidden('Necesitas permisos de moderación');
  await prisma.voiceRoom.delete({ where: { id: roomId } });
  return { deleted: true };
}

/* ---------------------------------- Eventos -------------------------------- */

export async function createEvent(
  communityId: string,
  userId: string,
  input: {
    title: string;
    description?: string;
    startsAt: string;
    endsAt?: string | null;
    roomId?: string | null;
    channelId?: string | null;
  },
) {
  const membership = await requireMembership(communityId, userId);
  if (!can(membership.role, 'event.create')) throw forbidden('Necesitas permisos de moderación');

  const title = sanitizeText(input.title, 80);
  if (!title) throw badRequest('El evento necesita un título');

  const created = await prisma.communityEvent.create({
    data: {
      communityId,
      title,
      description: input.description ? sanitizeText(input.description, 500) : null,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      roomId: input.roomId ?? null,
      channelId: input.channelId ?? null,
      createdById: userId,
      attendees: { create: { userId } },
    },
    include: { _count: { select: { attendees: true } } },
  });

  const members = await prisma.communityMember.findMany({
    where: { communityId, userId: { not: userId } },
    select: { userId: true },
    take: 500,
  });
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { name: true },
  });

  await Promise.all(
    members.map((member) =>
      notify({
        userId: member.userId,
        actorId: userId,
        type: 'event',
        title: `Nuevo evento en ${community?.name ?? 'la comunidad'}`,
        body: title,
        data: { communityId, eventId: created.id },
      }),
    ),
  );

  return serializeEvent(created, true);
}

export async function toggleAttendance(eventId: string, userId: string) {
  const event = await prisma.communityEvent.findUnique({
    where: { id: eventId },
    select: { communityId: true },
  });
  if (!event) throw notFound('Evento no encontrado');
  await requireMembership(event.communityId, userId);

  const existing = await prisma.eventAttendee.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { id: true },
  });
  if (existing) await prisma.eventAttendee.delete({ where: { id: existing.id } });
  else await prisma.eventAttendee.create({ data: { eventId, userId } });

  const updated = await prisma.communityEvent.findUnique({
    where: { id: eventId },
    include: { _count: { select: { attendees: true } } },
  });
  return serializeEvent(updated!, !existing);
}

export async function deleteEvent(eventId: string, userId: string) {
  const event = await prisma.communityEvent.findUnique({
    where: { id: eventId },
    select: { communityId: true, createdById: true },
  });
  if (!event) throw notFound('Evento no encontrado');
  const membership = await requireMembership(event.communityId, userId);
  if (event.createdById !== userId && !can(membership.role, 'event.create')) {
    throw forbidden('No puedes eliminar este evento');
  }
  await prisma.communityEvent.delete({ where: { id: eventId } });
  return { deleted: true };
}

export async function listUpcomingEvents(userId: string) {
  const memberships = await prisma.communityMember.findMany({
    where: { userId },
    select: { communityId: true },
  });
  const rows = await prisma.communityEvent.findMany({
    where: {
      communityId: { in: memberships.map((membership) => membership.communityId) },
      startsAt: { gte: new Date(Date.now() - 3600_000) },
    },
    orderBy: { startsAt: 'asc' },
    take: 10,
    include: {
      _count: { select: { attendees: true } },
      attendees: { where: { userId }, select: { id: true } },
      community: { select: { name: true, iconUrl: true } },
    },
  });
  return rows.map((row) => ({
    ...serializeEvent(row, row.attendees.length > 0),
    communityName: row.community.name,
    communityIconUrl: row.community.iconUrl,
  }));
}
