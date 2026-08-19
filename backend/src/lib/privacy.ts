import type { Audience, UserPreferences } from '@kyro/shared';
import { prisma } from './prisma.js';

/**
 * Reglas de privacidad, aplicadas en el servidor.
 *
 * Vive aparte de los serializadores para poder usarse también desde la capa de
 * presencia sin crear dependencias circulares: la privacidad se consulta en
 * sitios muy distintos y no debe arrastrar medio backend con ella.
 */

type Privacy = UserPreferences['privacy'];

const DEFAULT: Privacy = {
  messages: 'everyone',
  calls: 'everyone',
  showPresence: true,
  showLastSeen: true,
};

export function readPrivacy(preferencesJson: string | null | undefined): Privacy {
  if (!preferencesJson) return DEFAULT;
  try {
    const parsed = JSON.parse(preferencesJson) as Partial<UserPreferences>;
    return { ...DEFAULT, ...(parsed.privacy ?? {}) };
  } catch {
    return DEFAULT;
  }
}

/** Quien esconde su presencia aparece como desconectado para los demás. */
export function hidesPresence(preferencesJson: string | null | undefined) {
  return !readPrivacy(preferencesJson).showPresence;
}

export function hidesLastSeen(preferencesJson: string | null | undefined) {
  return !readPrivacy(preferencesJson).showLastSeen;
}

/** ¿Son contactos aceptados? Es la condición de las preferencias «solo contactos». */
export async function areContacts(a: string, b: string) {
  const contact = await prisma.contact.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
    select: { id: true },
  });
  return Boolean(contact);
}

/**
 * ¿Puede `actorId` iniciar esto con `targetId`? Se consulta antes de abrir una
 * conversación o de empezar una llamada.
 */
export async function allowsFrom(
  targetId: string,
  actorId: string,
  channel: keyof Pick<Privacy, 'messages' | 'calls'>,
): Promise<boolean> {
  if (targetId === actorId) return true;

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { preferencesJson: true },
  });
  const audience: Audience = readPrivacy(target?.preferencesJson)[channel];

  if (audience === 'everyone') return true;
  return areContacts(targetId, actorId);
}
