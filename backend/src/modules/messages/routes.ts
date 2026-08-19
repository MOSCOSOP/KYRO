import { Router } from 'express';
import { z } from 'zod';
import { LIMITS } from '@kyro/shared';
import { currentUserId } from '../../auth/middleware.js';
import { handler, validate, validated } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import * as service from './service.js';

export const messagesRouter = Router();

messagesRouter.get(
  '/saved',
  handler(async (req, res) => {
    res.json({ items: await service.listSaved(currentUserId(req)) });
  }),
);

messagesRouter.get(
  '/:id',
  handler(async (req, res) => {
    res.json(await service.getMessage(req.params.id, currentUserId(req)));
  }),
);

messagesRouter.patch(
  '/:id',
  writeLimiter,
  validate(z.object({ content: z.string().min(1).max(LIMITS.messageContent.max) })),
  handler(async (req, res) => {
    const body = validated<{ content: string }>(req);
    res.json(await service.editMessage(req.params.id, currentUserId(req), body.content));
  }),
);

messagesRouter.delete(
  '/:id',
  handler(async (req, res) => {
    res.json(await service.deleteMessage(req.params.id, currentUserId(req)));
  }),
);

messagesRouter.post(
  '/:id/reactions',
  writeLimiter,
  validate(z.object({ emoji: z.string().min(1).max(24) })),
  handler(async (req, res) => {
    const body = validated<{ emoji: string }>(req);
    res.json({
      reactions: await service.toggleReaction(req.params.id, currentUserId(req), body.emoji),
    });
  }),
);

messagesRouter.post(
  '/:id/pin',
  validate(z.object({ pinned: z.boolean() })),
  handler(async (req, res) => {
    const body = validated<{ pinned: boolean }>(req);
    res.json(await service.setPinned(req.params.id, currentUserId(req), body.pinned));
  }),
);

messagesRouter.post(
  '/:id/save',
  handler(async (req, res) => {
    res.json(await service.toggleSaved(req.params.id, currentUserId(req)));
  }),
);

messagesRouter.post(
  '/:id/forward',
  writeLimiter,
  validate(z.object({ conversationIds: z.array(z.string()).min(1).max(10) })),
  handler(async (req, res) => {
    const body = validated<{ conversationIds: string[] }>(req);
    res.status(201).json({
      items: await service.forwardMessage(req.params.id, currentUserId(req), body.conversationIds),
    });
  }),
);
