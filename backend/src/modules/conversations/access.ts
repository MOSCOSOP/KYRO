import type { MemberRole } from '@kyro/shared';
import { ROLE_RANK } from '@kyro/shared';
import { forbidden, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

export interface ConversationAccess {
  conversation: {
    id: string;
    type: string;
    communityId: string | null;
    channelKind: string | null;
    name: string | null;
  };
  role: MemberRole;
}

export async function getAccess(
  conversationId: string,
  userId: string,
): Promise<ConversationAccess | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, type: true, communityId: true, channelKind: true, name: true },
  });
  if (!conversation) return null;

  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { role: true },
  });

  if (membership) return { conversation, role: membership.role as MemberRole };

  // Los canales heredan el acceso de la comunidad: si eres miembro, entras.
  if (conversation.communityId) {
    const communityMember = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: conversation.communityId, userId } },
      select: { role: true },
    });
    if (communityMember) {
      await prisma.conversationMember.create({
        data: { conversationId, userId, role: communityMember.role },
      });
      return { conversation, role: communityMember.role as MemberRole };
    }
  }

  return null;
}

export async function requireAccess(conversationId: string, userId: string) {
  const access = await getAccess(conversationId, userId);
  if (!access) throw notFound('Esta conversación no existe o no tienes acceso');
  return access;
}

/** En canales de anuncios solo publican moderadores en adelante. */
export function assertCanSend(access: ConversationAccess) {
  if (access.conversation.channelKind === 'announcement' && ROLE_RANK[access.role] < ROLE_RANK.moderator) {
    throw forbidden('Solo el equipo de la comunidad puede publicar en este canal');
  }
}

export function assertCanModerate(access: ConversationAccess) {
  if (ROLE_RANK[access.role] < ROLE_RANK.moderator) {
    throw forbidden('Necesitas permisos de moderación');
  }
}
