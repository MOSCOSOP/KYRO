import type { PresenceStatus } from '@kyro/shared';
import { PRESENCE_TTL_SECONDS } from '@kyro/shared';
import { ephemeral } from '../lib/redis.js';

/**
 * Presencia en vivo.
 *
 * La *preferencia* de estado (disponible / ausente / no molestar / invisible)
 * vive en la base de datos; la *conexión* vive en el almacén efímero con TTL,
 * de modo que una caída del proceso no deja a nadie "en línea" para siempre.
 */

const key = (userId: string) => `presence:${userId}`;

interface PresenceRecord {
  connections: number;
  status: PresenceStatus;
  updatedAt: string;
}

export async function markOnline(userId: string, status: PresenceStatus) {
  const current = await read(userId);
  const record: PresenceRecord = {
    connections: (current?.connections ?? 0) + 1,
    status,
    updatedAt: new Date().toISOString(),
  };
  await ephemeral.set(key(userId), JSON.stringify(record), PRESENCE_TTL_SECONDS * 3);
  return record;
}

export async function markOffline(userId: string) {
  const current = await read(userId);
  if (!current) return { connections: 0 };
  const connections = Math.max(0, current.connections - 1);
  if (connections === 0) {
    await ephemeral.del(key(userId));
    return { connections: 0 };
  }
  await ephemeral.set(
    key(userId),
    JSON.stringify({ ...current, connections, updatedAt: new Date().toISOString() }),
    PRESENCE_TTL_SECONDS * 3,
  );
  return { connections };
}

export async function heartbeat(userId: string) {
  const current = await read(userId);
  if (!current) return;
  await ephemeral.set(
    key(userId),
    JSON.stringify({ ...current, updatedAt: new Date().toISOString() }),
    PRESENCE_TTL_SECONDS * 3,
  );
}

export async function setStatus(userId: string, status: PresenceStatus) {
  const current = await read(userId);
  if (!current) return;
  await ephemeral.set(
    key(userId),
    JSON.stringify({ ...current, status, updatedAt: new Date().toISOString() }),
    PRESENCE_TTL_SECONDS * 3,
  );
}

async function read(userId: string): Promise<PresenceRecord | null> {
  const raw = await ephemeral.get(key(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PresenceRecord;
  } catch {
    return null;
  }
}

/** Estado visible para terceros: invisible y desconectado se ven igual. */
export async function effectiveStatus(
  userId: string,
  storedStatus: PresenceStatus,
): Promise<PresenceStatus> {
  const record = await read(userId);
  if (!record || record.connections <= 0) return 'offline';
  const status = record.status ?? storedStatus;
  return status === 'invisible' ? 'offline' : status;
}

export async function effectiveStatuses(
  users: { id: string; status: string }[],
): Promise<Map<string, PresenceStatus>> {
  const entries = await Promise.all(
    users.map(async (user) => {
      const status = await effectiveStatus(user.id, user.status as PresenceStatus);
      return [user.id, status] as const;
    }),
  );
  return new Map(entries);
}

export async function isOnline(userId: string) {
  const record = await read(userId);
  return Boolean(record && record.connections > 0);
}
