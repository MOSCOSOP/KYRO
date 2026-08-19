import { Router } from 'express';
import { z } from 'zod';
import { LIMITS } from '@kyro/shared';
import { currentUserId } from '../../auth/middleware.js';
import { handler, validate, validated } from '../../middleware/validate.js';
import * as service from './service.js';

export const usersRouter = Router();

const updateSchema = z.object({
  displayName: z.string().max(LIMITS.displayName.max).optional(),
  username: z.string().max(LIMITS.username.max).optional(),
  bio: z.string().max(LIMITS.bio.max).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  status: z.enum(['available', 'away', 'dnd', 'invisible']).optional(),
  customStatus: z
    .object({
      emoji: z.string().max(8).nullable(),
      text: z.string().max(LIMITS.customStatus.max).nullable(),
      expiresAt: z.string().datetime().nullable(),
    })
    .nullable()
    .optional(),
  activity: z
    .object({
      kind: z.enum(['gaming', 'music', 'working', 'studying', 'custom']),
      name: z.string().max(60),
      details: z.string().max(80).nullable(),
    })
    .nullable()
    .optional(),
  preferences: z
    .object({
      notifications: z
        .object({
          messages: z.boolean(),
          mentions: z.boolean(),
          communities: z.boolean(),
          calls: z.boolean(),
          sounds: z.boolean(),
        })
        .partial()
        .optional(),
      privacy: z
        .object({
          messages: z.enum(['everyone', 'contacts']),
          calls: z.enum(['everyone', 'contacts']),
          showPresence: z.boolean(),
          showLastSeen: z.boolean(),
        })
        .partial()
        .optional(),
      reducedMotion: z.boolean().optional(),
      enterToSend: z.boolean().optional(),
    })
    .optional(),
  onboarded: z.boolean().optional(),
});

usersRouter.get(
  '/me',
  handler(async (req, res) => {
    res.json(await service.getMe(currentUserId(req)));
  }),
);

usersRouter.patch(
  '/me',
  validate(updateSchema),
  handler(async (req, res) => {
    const body = validated<z.infer<typeof updateSchema>>(req);
    res.json(await service.updateProfile(currentUserId(req), body as never));
  }),
);

usersRouter.get(
  '/search',
  validate(z.object({ q: z.string().max(80), limit: z.coerce.number().min(1).max(30).optional() }), 'query'),
  handler(async (req, res) => {
    const query = validated<{ q: string; limit?: number }>(req, 'query');
    res.json({ items: await service.searchUsers(currentUserId(req), query.q, query.limit) });
  }),
);

usersRouter.get(
  '/suggested',
  handler(async (req, res) => {
    res.json({ items: await service.suggestedPeople(currentUserId(req)) });
  }),
);

usersRouter.get(
  '/contacts',
  handler(async (req, res) => {
    res.json({ items: await service.listContacts(currentUserId(req)) });
  }),
);

usersRouter.post(
  '/contacts',
  validate(z.object({ userId: z.string().min(1) })),
  handler(async (req, res) => {
    const body = validated<{ userId: string }>(req);
    res.json(await service.requestContact(currentUserId(req), body.userId));
  }),
);

usersRouter.post(
  '/contacts/:id/respond',
  validate(z.object({ action: z.enum(['accept', 'decline', 'block']) })),
  handler(async (req, res) => {
    const body = validated<{ action: 'accept' | 'decline' | 'block' }>(req);
    res.json(await service.respondToContact(currentUserId(req), req.params.id, body.action));
  }),
);

usersRouter.delete(
  '/contacts/:userId',
  handler(async (req, res) => {
    res.json(await service.removeContact(currentUserId(req), req.params.userId));
  }),
);

usersRouter.get(
  '/:username',
  handler(async (req, res) => {
    res.json(await service.getProfile(req.params.username, currentUserId(req)));
  }),
);
