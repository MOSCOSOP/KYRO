import type { Contact, ContactStatus, PublicUser } from '@kyro/shared';
import { LIMITS } from '@kyro/shared';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { insensitiveContains, prisma } from '../../lib/prisma.js';
import { sanitizeText } from '../../lib/text.js';
import { broadcastPresence } from '../../realtime/broadcast.js';
import {
  parsePreferences,
  publicUserSelect,
  serializeCurrentUser,
  serializeUserAsync,
  serializeUsers,
} from '../../serializers/user.js';
import { notify } from '../notifications/service.js';

export async function getProfile(username: string, viewerId: string) {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { ...publicUserSelect, id: true },
  });
  if (!user) throw notFound('No encontramos a esa persona');

  const [profile, communities, contact, sharedConversation] = await Promise.all([
    serializeUserAsync(user),
    prisma.communityMember.findMany({
      where: { userId: user.id, community: { isPublic: true } },
      take: 12,
      include: { community: { select: { id: true, name: true, iconUrl: true, slug: true } } },
    }),
    viewerId === user.id
      ? null
      : prisma.contact.findFirst({
          where: {
            OR: [
              { requesterId: viewerId, addresseeId: user.id },
              { requesterId: user.id, addresseeId: viewerId },
            ],
          },
        }),
    viewerId === user.id
      ? null
      : prisma.conversation.findFirst({
          where: {
            type: 'direct',
            AND: [{ members: { some: { userId: viewerId } } }, { members: { some: { userId: user.id } } }],
          },
          select: { id: true },
        }),
  ]);

  return {
    user: profile,
    communities: communities.map((membership) => membership.community),
    contact: contact
      ? {
          status: contact.status as ContactStatus,
          outgoing: contact.requesterId === viewerId,
        }
      : null,
    directConversationId: sharedConversation?.id ?? null,
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('Cuenta no encontrada');
  return serializeCurrentUser(user);
}

interface UpdateProfileInput {
  displayName?: string;
  username?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  accentColor?: string | null;
  status?: string;
  customStatus?: { emoji: string | null; text: string | null; expiresAt: string | null } | null;
  activity?: { kind: string; name: string; details: string | null } | null;
  preferences?: Record<string, unknown>;
  onboarded?: boolean;
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const data: Record<string, unknown> = {};

  if (input.displayName !== undefined) {
    const displayName = sanitizeText(input.displayName, LIMITS.displayName.max);
    if (!displayName) throw badRequest('El nombre no puede estar vacío');
    data.displayName = displayName;
  }

  if (input.username !== undefined) {
    const username = input.username.trim().toLowerCase();
    if (!LIMITS.username.pattern.test(username) || username.length < LIMITS.username.min) {
      throw badRequest('El usuario solo admite letras, números, punto y guion bajo');
    }
    const taken = await prisma.user.findFirst({
      where: { username, id: { not: userId } },
      select: { id: true },
    });
    if (taken) throw conflict('Ese nombre de usuario ya está en uso');
    data.username = username;
  }

  if (input.bio !== undefined) data.bio = input.bio ? sanitizeText(input.bio, LIMITS.bio.max) : null;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  if (input.accentColor !== undefined) data.accentColor = input.accentColor;
  if (input.status !== undefined) data.status = input.status;

  if (input.customStatus !== undefined) {
    data.customStatusJson = input.customStatus
      ? JSON.stringify({
          emoji: input.customStatus.emoji?.slice(0, 8) ?? null,
          text: input.customStatus.text
            ? sanitizeText(input.customStatus.text, LIMITS.customStatus.max)
            : null,
          expiresAt: input.customStatus.expiresAt ?? null,
        })
      : null;
  }

  if (input.activity !== undefined) {
    data.activityJson = input.activity
      ? JSON.stringify({ ...input.activity, startedAt: new Date().toISOString() })
      : null;
  }

  if (input.preferences) {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferencesJson: true },
    });
    const merged = {
      ...parsePreferences(current?.preferencesJson ?? null),
      ...input.preferences,
    };
    data.preferencesJson = JSON.stringify(merged);
  }

  if (input.onboarded) data.onboardedAt = new Date();

  const user = await prisma.user.update({ where: { id: userId }, data });
  await broadcastPresence(userId);
  return serializeCurrentUser(user);
}

export async function searchUsers(viewerId: string, query: string, limit = 12): Promise<PublicUser[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const rows = await prisma.user.findMany({
    where: {
      id: { not: viewerId },
      OR: [
        { username: insensitiveContains(trimmed) },
        { displayName: insensitiveContains(trimmed) },
      ],
    },
    take: limit,
    select: publicUserSelect,
  });
  return serializeUsers(rows);
}

/** Personas sugeridas: conocidos de tus comunidades que aún no son contactos. */
export async function suggestedPeople(viewerId: string, limit = 8) {
  const communities = await prisma.communityMember.findMany({
    where: { userId: viewerId },
    select: { communityId: true },
  });

  const contacts = await prisma.contact.findMany({
    where: { OR: [{ requesterId: viewerId }, { addresseeId: viewerId }] },
    select: { requesterId: true, addresseeId: true },
  });
  const known = new Set([viewerId, ...contacts.flatMap((c) => [c.requesterId, c.addresseeId])]);

  const candidates = await prisma.communityMember.findMany({
    where: {
      communityId: { in: communities.map((membership) => membership.communityId) },
      userId: { notIn: [...known] },
    },
    distinct: ['userId'],
    take: limit,
    include: { user: { select: publicUserSelect } },
  });

  return serializeUsers(candidates.map((candidate) => candidate.user));
}

/* --------------------------------- Contactos ------------------------------- */

export async function listContacts(userId: string): Promise<Contact[]> {
  const rows = await prisma.contact.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    orderBy: { updatedAt: 'desc' },
    include: {
      requester: { select: publicUserSelect },
      addressee: { select: publicUserSelect },
    },
  });

  const others = rows.map((row) => (row.requesterId === userId ? row.addressee : row.requester));
  const users = await serializeUsers(others);

  return rows.map((row, index) => ({
    id: row.id,
    user: users[index],
    status: row.status as ContactStatus,
    outgoing: row.requesterId === userId,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function requestContact(userId: string, targetId: string) {
  if (userId === targetId) throw badRequest('No puedes añadirte a ti mismo');
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, displayName: true },
  });
  if (!target) throw notFound('Esa persona no existe');

  const existing = await prisma.contact.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: targetId },
        { requesterId: targetId, addresseeId: userId },
      ],
    },
  });

  if (existing) {
    if (existing.status === 'accepted') return { status: 'accepted' as ContactStatus };
    // Si la otra persona ya te había enviado solicitud, se acepta directamente.
    if (existing.requesterId === targetId && existing.status === 'pending') {
      await prisma.contact.update({ where: { id: existing.id }, data: { status: 'accepted' } });
      return { status: 'accepted' as ContactStatus };
    }
    return { status: existing.status as ContactStatus };
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });

  await prisma.contact.create({ data: { requesterId: userId, addresseeId: targetId } });
  await notify({
    userId: targetId,
    actorId: userId,
    type: 'contact_request',
    title: `${me?.displayName ?? 'Alguien'} quiere conectar contigo`,
    body: 'Revisa la solicitud en Actividad',
    data: { userId },
  });

  return { status: 'pending' as ContactStatus };
}

export async function respondToContact(
  userId: string,
  contactId: string,
  action: 'accept' | 'decline' | 'block',
) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw notFound('Solicitud no encontrada');
  if (contact.addresseeId !== userId && contact.requesterId !== userId) {
    throw notFound('Solicitud no encontrada');
  }

  if (action === 'accept') {
    if (contact.addresseeId !== userId) throw badRequest('Solo el destinatario puede aceptar');
    await prisma.contact.update({ where: { id: contactId }, data: { status: 'accepted' } });
    await notify({
      userId: contact.requesterId,
      actorId: userId,
      type: 'contact_request',
      title: 'Tu solicitud fue aceptada',
      body: 'Ya pueden conversar',
      data: { userId },
    });
    return { status: 'accepted' as ContactStatus };
  }

  if (action === 'block') {
    await prisma.contact.update({
      where: { id: contactId },
      data: { status: 'blocked', requesterId: userId, addresseeId: contact.requesterId === userId ? contact.addresseeId : contact.requesterId },
    });
    return { status: 'blocked' as ContactStatus };
  }

  await prisma.contact.delete({ where: { id: contactId } });
  return { status: 'declined' };
}

export async function removeContact(userId: string, targetId: string) {
  await prisma.contact.deleteMany({
    where: {
      OR: [
        { requesterId: userId, addresseeId: targetId },
        { requesterId: targetId, addresseeId: userId },
      ],
    },
  });
  return { removed: true };
}
