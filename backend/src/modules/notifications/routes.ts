import { Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../../auth/middleware.js';
import { handler, validate, validated } from '../../middleware/validate.js';
import { prisma } from '../../lib/prisma.js';
import { notificationInclude, serializeNotifications } from '../../serializers/notification.js';
import { countUnread } from './service.js';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  validate(
    z.object({
      cursor: z.string().optional(),
      unreadOnly: z.coerce.boolean().optional(),
      limit: z.coerce.number().min(1).max(60).optional(),
    }),
    'query',
  ),
  handler(async (req, res) => {
    const userId = currentUserId(req);
    const query = validated<{ cursor?: string; unreadOnly?: boolean; limit?: number }>(req, 'query');
    const limit = query.limit ?? 30;

    const rows = await prisma.notification.findMany({
      where: {
        userId,
        ...(query.unreadOnly ? { readAt: null } : {}),
        ...(query.cursor ? { createdAt: { lt: new Date(query.cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: notificationInclude,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    res.json({
      items: await serializeNotifications(page),
      nextCursor: page.length > 0 ? page[page.length - 1].createdAt.toISOString() : null,
      hasMore,
      unreadCount: await countUnread(userId),
    });
  }),
);

notificationsRouter.get(
  '/unread-count',
  handler(async (req, res) => {
    res.json({ count: await countUnread(currentUserId(req)) });
  }),
);

notificationsRouter.post(
  '/read',
  validate(z.object({ ids: z.array(z.string()).max(200).optional() })),
  handler(async (req, res) => {
    const userId = currentUserId(req);
    const body = validated<{ ids?: string[] }>(req);
    await prisma.notification.updateMany({
      where: { userId, readAt: null, ...(body.ids ? { id: { in: body.ids } } : {}) },
      data: { readAt: new Date() },
    });
    res.json({ unreadCount: await countUnread(userId) });
  }),
);

notificationsRouter.delete(
  '/:id',
  handler(async (req, res) => {
    await prisma.notification.deleteMany({
      where: { id: req.params.id, userId: currentUserId(req) },
    });
    res.json({ deleted: true });
  }),
);
