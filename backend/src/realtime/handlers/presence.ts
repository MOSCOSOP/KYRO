import type { PresenceStatus } from '@kyro/shared';
import { LIMITS } from '@kyro/shared';
import { prisma } from '../../lib/prisma.js';
import type { KyroSocket } from '../io.js';
import { broadcastPresence } from '../broadcast.js';
import { heartbeat, setStatus } from '../presence.js';

const VALID: PresenceStatus[] = ['available', 'away', 'dnd', 'invisible', 'offline'];

export function registerPresenceHandlers(socket: KyroSocket) {
  const { userId } = socket.data;

  socket.on('presence:heartbeat', () => {
    void heartbeat(userId);
  });

  socket.on('presence:set', async ({ status, customStatus, activity }) => {
    const data: Record<string, unknown> = {};

    if (status && VALID.includes(status)) {
      data.status = status;
      await setStatus(userId, status);
    }

    if (customStatus !== undefined) {
      data.customStatusJson = customStatus
        ? JSON.stringify({
            emoji: customStatus.emoji?.slice(0, 8) ?? null,
            text: customStatus.text?.slice(0, LIMITS.customStatus.max) ?? null,
            expiresAt: customStatus.expiresAt ?? null,
          })
        : null;
    }

    if (activity !== undefined) {
      data.activityJson = activity
        ? JSON.stringify({
            kind: activity.kind,
            name: String(activity.name).slice(0, 60),
            details: activity.details ? String(activity.details).slice(0, 80) : null,
            startedAt: activity.startedAt ?? new Date().toISOString(),
          })
        : null;
    }

    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id: userId }, data });
    }
    await broadcastPresence(userId);
  });
}
