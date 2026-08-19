import type { UserActivity } from '@kyro/shared';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { broadcastPresence } from './broadcast.js';

/**
 * Presencia por contexto.
 *
 * En KYRO el estado no lo escribe solo el usuario: cuando entra en una llamada
 * o en una sala de voz, los demás lo ven al momento. Es información que el
 * servidor ya conoce con certeza, así que la publica él —no el cliente— y así
 * nadie puede aparentar algo que no está ocurriendo.
 *
 * Lo que el usuario haya escrito a mano se guarda y se devuelve intacto al
 * salir: el contexto se superpone, no lo pisa.
 */

const CONTEXT_LABEL = {
  call: 'En una llamada',
  room: 'En una sala de voz',
} as const;

export type ContextKind = keyof typeof CONTEXT_LABEL;

/** Actividad escrita por el usuario, aparcada mientras dura el contexto. */
const parked = new Map<string, string | null>();

function isContextActivity(raw: string | null) {
  if (!raw) return false;
  try {
    const activity = JSON.parse(raw) as UserActivity & { context?: ContextKind };
    return Boolean(activity.context);
  } catch {
    return false;
  }
}

export async function enterContext(userId: string, kind: ContextKind) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activityJson: true },
    });
    if (!user) return;

    // Solo se aparca lo que escribió el usuario, nunca otro contexto.
    if (!isContextActivity(user.activityJson)) parked.set(userId, user.activityJson);

    const activity = {
      kind: 'custom' as const,
      name: CONTEXT_LABEL[kind],
      details: null,
      startedAt: new Date().toISOString(),
      context: kind,
    };

    await prisma.user.update({
      where: { id: userId },
      data: { activityJson: JSON.stringify(activity) },
    });
    await broadcastPresence(userId);
  } catch (err) {
    logger.error({ err, userId, kind }, 'No se pudo publicar la presencia por contexto');
  }
}

export async function leaveContext(userId: string, kind: ContextKind) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activityJson: true },
    });
    if (!user) return;

    // Si el usuario cambió su actividad mientras tanto, se respeta la suya.
    if (!isContextActivity(user.activityJson)) {
      parked.delete(userId);
      return;
    }

    const previous = parked.get(userId) ?? null;
    parked.delete(userId);

    await prisma.user.update({ where: { id: userId }, data: { activityJson: previous } });
    await broadcastPresence(userId);
  } catch (err) {
    logger.error({ err, userId, kind }, 'No se pudo restaurar la presencia');
  }
}
