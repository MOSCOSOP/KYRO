import type { NotificationType } from '@kyro/shared';
import { prisma } from '../../lib/prisma.js';
import { emitToUsers } from '../../realtime/broadcast.js';
import { notificationInclude, serializeNotifications } from '../../serializers/notification.js';
import { parsePreferences } from '../../serializers/user.js';

interface CreateInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  data?: Record<string, string>;
  actorId?: string | null;
}

/** Comprueba las preferencias del usuario antes de molestarle. */
function allows(preferencesJson: string | null, type: NotificationType) {
  const preferences = parsePreferences(preferencesJson);
  switch (type) {
    case 'message':
      return preferences.notifications.messages;
    case 'mention':
      return preferences.notifications.mentions;
    case 'announcement':
    case 'event':
    case 'invite':
      return preferences.notifications.communities;
    case 'call':
      return preferences.notifications.calls;
    default:
      return true;
  }
}

export async function notify(input: CreateInput) {
  if (input.actorId === input.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { preferencesJson: true },
  });
  if (!user || !allows(user.preferencesJson, input.type)) return null;

  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      dataJson: input.data ? JSON.stringify(input.data) : null,
      actorId: input.actorId ?? null,
    },
    include: notificationInclude,
  });

  const [notification] = await serializeNotifications([row]);
  const unreadCount = await countUnread(input.userId);
  emitToUsers([input.userId], 'notification:new', { notification, unreadCount });
  return notification;
}

export async function notifyMany(inputs: CreateInput[]) {
  await Promise.all(inputs.map((input) => notify(input)));
}

export function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
