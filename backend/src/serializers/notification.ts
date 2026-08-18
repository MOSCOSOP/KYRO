import type { AppNotification, NotificationType } from '@kyro/shared';
import type { Prisma } from '@prisma/client';
import { publicUserSelect, serializeUsers } from './user.js';

export const notificationInclude = {
  actor: { select: publicUserSelect },
} satisfies Prisma.NotificationInclude;

export type NotificationRow = Prisma.NotificationGetPayload<{ include: typeof notificationInclude }>;

export async function serializeNotifications(rows: NotificationRow[]): Promise<AppNotification[]> {
  const actors = rows.map((row) => row.actor).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const serializedActors = await serializeUsers(actors);
  const byId = new Map(serializedActors.map((actor) => [actor.id, actor]));

  return rows.map((row) => ({
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    data: row.dataJson ? safeParse(row.dataJson) : null,
    actor: row.actorId ? (byId.get(row.actorId) ?? null) : null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

function safeParse(raw: string): Record<string, string> | null {
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}
