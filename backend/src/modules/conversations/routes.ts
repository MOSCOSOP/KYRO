import { Router } from 'express';
import { z } from 'zod';
import { LIMITS } from '@kyro/shared';
import { currentUserId } from '../../auth/middleware.js';
import { handler, validate, validated } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import * as service from './service.js';
import * as messages from '../messages/service.js';
import { promoteGroupToCommunity } from '../communities/service.js';

export const conversationsRouter = Router();

conversationsRouter.get(
  '/',
  handler(async (req, res) => {
    res.json({ items: await service.listConversations(currentUserId(req)) });
  }),
);

conversationsRouter.post(
  '/direct',
  validate(z.object({ userId: z.string().min(1) })),
  handler(async (req, res) => {
    const body = validated<{ userId: string }>(req);
    res.status(201).json(await service.openDirectConversation(currentUserId(req), body.userId));
  }),
);

conversationsRouter.post(
  '/group',
  validate(
    z.object({
      name: z.string().min(1).max(LIMITS.conversationName.max),
      memberIds: z.array(z.string()).max(200).default([]),
      topic: z.string().max(LIMITS.topic.max).optional(),
    }),
  ),
  handler(async (req, res) => {
    const body = validated<{ name: string; memberIds: string[]; topic?: string }>(req);
    res.status(201).json(await service.createGroup(currentUserId(req), body));
  }),
);

conversationsRouter.get(
  '/:id',
  handler(async (req, res) => {
    res.json(await service.getConversation(req.params.id, currentUserId(req)));
  }),
);

conversationsRouter.patch(
  '/:id',
  validate(
    z.object({
      name: z.string().max(LIMITS.conversationName.max).optional(),
      topic: z.string().max(LIMITS.topic.max).nullable().optional(),
      avatarUrl: z.string().url().nullable().optional(),
    }),
  ),
  handler(async (req, res) => {
    const body = validated<{ name?: string; topic?: string | null; avatarUrl?: string | null }>(req);
    res.json(await service.updateConversation(req.params.id, currentUserId(req), body));
  }),
);

conversationsRouter.get(
  '/:id/members',
  handler(async (req, res) => {
    res.json({ items: await service.listMembers(req.params.id, currentUserId(req)) });
  }),
);

conversationsRouter.post(
  '/:id/members',
  validate(z.object({ memberIds: z.array(z.string()).min(1).max(100) })),
  handler(async (req, res) => {
    const body = validated<{ memberIds: string[] }>(req);
    res.json(await service.addMembers(req.params.id, currentUserId(req), body.memberIds));
  }),
);

conversationsRouter.delete(
  '/:id/members/:userId',
  handler(async (req, res) => {
    res.json(await service.removeMember(req.params.id, currentUserId(req), req.params.userId));
  }),
);

conversationsRouter.patch(
  '/:id/members/:userId',
  validate(z.object({ role: z.enum(['admin', 'moderator', 'member']) })),
  handler(async (req, res) => {
    const body = validated<{ role: string }>(req);
    res.json({
      items: await service.setMemberRole(
        req.params.id,
        currentUserId(req),
        req.params.userId,
        body.role,
      ),
    });
  }),
);

conversationsRouter.post(
  '/:id/leave',
  handler(async (req, res) => {
    const userId = currentUserId(req);
    res.json(await service.removeMember(req.params.id, userId, userId));
  }),
);

conversationsRouter.post(
  '/:id/convert-to-group',
  validate(
    z.object({
      name: z.string().min(1).max(LIMITS.conversationName.max),
      memberIds: z.array(z.string()).max(100).default([]),
    }),
  ),
  handler(async (req, res) => {
    const body = validated<{ name: string; memberIds: string[] }>(req);
    res.json(await service.convertDirectToGroup(req.params.id, currentUserId(req), body));
  }),
);

conversationsRouter.post(
  '/:id/promote-to-community',
  validate(
    z.object({
      name: z.string().max(LIMITS.communityName.max).optional(),
      description: z.string().max(LIMITS.communityDescription.max).optional(),
      isPublic: z.boolean().optional(),
    }),
  ),
  handler(async (req, res) => {
    const body = validated<{ name?: string; description?: string; isPublic?: boolean }>(req);
    res.status(201).json(await promoteGroupToCommunity(req.params.id, currentUserId(req), body));
  }),
);

conversationsRouter.post(
  '/:id/read',
  handler(async (req, res) => {
    res.json(await service.markRead(req.params.id, currentUserId(req)));
  }),
);

conversationsRouter.patch(
  '/:id/settings',
  validate(z.object({ muted: z.boolean().optional(), pinned: z.boolean().optional() })),
  handler(async (req, res) => {
    const body = validated<{ muted?: boolean; pinned?: boolean }>(req);
    res.json(await service.setMemberFlags(req.params.id, currentUserId(req), body));
  }),
);

/* ------------------------------ Mensajes del hilo -------------------------- */

conversationsRouter.get(
  '/:id/messages',
  validate(
    z.object({
      cursor: z.string().optional(),
      around: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).optional(),
    }),
    'query',
  ),
  handler(async (req, res) => {
    const query = validated<{ cursor?: string; around?: string; limit?: number }>(req, 'query');
    res.json(await messages.listMessages(req.params.id, currentUserId(req), query));
  }),
);

conversationsRouter.post(
  '/:id/messages',
  writeLimiter,
  validate(
    z.object({
      content: z.string().max(LIMITS.messageContent.max).default(''),
      replyToId: z.string().nullable().optional(),
      attachmentTokens: z.array(z.string()).max(LIMITS.attachmentsPerMessage).optional(),
    }),
  ),
  handler(async (req, res) => {
    const body = validated<{
      content: string;
      replyToId?: string | null;
      attachmentTokens?: string[];
    }>(req);
    const message = await messages.createMessage({
      conversationId: req.params.id,
      authorId: currentUserId(req),
      content: body.content,
      replyToId: body.replyToId ?? null,
      attachmentTokens: body.attachmentTokens,
    });
    res.status(201).json(message);
  }),
);

conversationsRouter.get(
  '/:id/pinned',
  handler(async (req, res) => {
    res.json({ items: await messages.listPinned(req.params.id, currentUserId(req)) });
  }),
);

conversationsRouter.get(
  '/:id/files',
  validate(z.object({ kind: z.enum(['image', 'video', 'audio', 'file']).optional() }), 'query'),
  handler(async (req, res) => {
    const query = validated<{ kind?: string }>(req, 'query');
    res.json({
      items: await messages.listConversationFiles(req.params.id, currentUserId(req), query.kind),
    });
  }),
);

conversationsRouter.get(
  '/:id/search',
  validate(z.object({ q: z.string().min(2).max(80) }), 'query'),
  handler(async (req, res) => {
    const query = validated<{ q: string }>(req, 'query');
    res.json({
      items: await messages.searchMessages(currentUserId(req), query.q, {
        conversationId: req.params.id,
      }),
    });
  }),
);
