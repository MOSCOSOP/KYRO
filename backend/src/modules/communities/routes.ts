import { Router } from 'express';
import { z } from 'zod';
import { LIMITS } from '@kyro/shared';
import { currentUserId } from '../../auth/middleware.js';
import { handler, validate, validated } from '../../middleware/validate.js';
import * as service from './service.js';

export const communitiesRouter = Router();

communitiesRouter.get(
  '/',
  handler(async (req, res) => {
    res.json({ items: await service.listMyCommunities(currentUserId(req)) });
  }),
);

communitiesRouter.get(
  '/discover',
  validate(z.object({ q: z.string().max(60).optional() }), 'query'),
  handler(async (req, res) => {
    const query = validated<{ q?: string }>(req, 'query');
    res.json({ items: await service.discoverCommunities(currentUserId(req), query.q) });
  }),
);

communitiesRouter.get(
  '/events',
  handler(async (req, res) => {
    res.json({ items: await service.listUpcomingEvents(currentUserId(req)) });
  }),
);

communitiesRouter.post(
  '/',
  validate(
    z.object({
      name: z.string().min(1).max(LIMITS.communityName.max),
      description: z.string().max(LIMITS.communityDescription.max).optional(),
      isPublic: z.boolean().optional(),
      iconUrl: z.string().url().nullable().optional(),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    }),
  ),
  handler(async (req, res) => {
    const body = validated<Parameters<typeof service.createCommunity>[1]>(req);
    res.status(201).json(await service.createCommunity(currentUserId(req), body));
  }),
);

communitiesRouter.post(
  '/join',
  validate(z.object({ communityId: z.string().optional(), code: z.string().max(24).optional() })),
  handler(async (req, res) => {
    const body = validated<{ communityId?: string; code?: string }>(req);
    res.json(await service.joinCommunity(currentUserId(req), body));
  }),
);

communitiesRouter.get(
  '/:id',
  handler(async (req, res) => {
    res.json(await service.getCommunityDetail(req.params.id, currentUserId(req)));
  }),
);

communitiesRouter.patch(
  '/:id',
  validate(
    z.object({
      name: z.string().max(LIMITS.communityName.max).optional(),
      description: z.string().max(LIMITS.communityDescription.max).nullable().optional(),
      isPublic: z.boolean().optional(),
      iconUrl: z.string().url().nullable().optional(),
      bannerUrl: z.string().url().nullable().optional(),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    }),
  ),
  handler(async (req, res) => {
    const body = validated<Parameters<typeof service.updateCommunity>[2]>(req);
    res.json(await service.updateCommunity(req.params.id, currentUserId(req), body));
  }),
);

communitiesRouter.delete(
  '/:id',
  handler(async (req, res) => {
    res.json(await service.deleteCommunity(req.params.id, currentUserId(req)));
  }),
);

communitiesRouter.post(
  '/:id/leave',
  handler(async (req, res) => {
    res.json(await service.leaveCommunity(req.params.id, currentUserId(req)));
  }),
);

communitiesRouter.patch(
  '/:id/settings',
  validate(z.object({ muted: z.boolean() })),
  handler(async (req, res) => {
    const body = validated<{ muted: boolean }>(req);
    res.json(await service.setCommunityMuted(req.params.id, currentUserId(req), body.muted));
  }),
);

communitiesRouter.post(
  '/:id/invite-code',
  handler(async (req, res) => {
    res.json(await service.regenerateInviteCode(req.params.id, currentUserId(req)));
  }),
);

communitiesRouter.post(
  '/:id/invites',
  validate(z.object({ userIds: z.array(z.string()).min(1).max(20) })),
  handler(async (req, res) => {
    const body = validated<{ userIds: string[] }>(req);
    res.json(await service.inviteToCommunity(req.params.id, currentUserId(req), body.userIds));
  }),
);

/* ---------------------------------- Miembros ------------------------------- */

communitiesRouter.get(
  '/:id/members',
  handler(async (req, res) => {
    res.json({ items: await service.listCommunityMembers(req.params.id, currentUserId(req)) });
  }),
);

communitiesRouter.patch(
  '/:id/members/:userId',
  validate(z.object({ role: z.enum(['admin', 'moderator', 'member']) })),
  handler(async (req, res) => {
    const body = validated<{ role: 'admin' | 'moderator' | 'member' }>(req);
    res.json({
      items: await service.setCommunityRole(
        req.params.id,
        currentUserId(req),
        req.params.userId,
        body.role,
      ),
    });
  }),
);

communitiesRouter.delete(
  '/:id/members/:userId',
  handler(async (req, res) => {
    res.json(await service.kickMember(req.params.id, currentUserId(req), req.params.userId));
  }),
);

/* ---------------------------------- Canales -------------------------------- */

communitiesRouter.post(
  '/:id/channels',
  validate(
    z.object({
      name: z.string().min(1).max(LIMITS.channelName.max),
      kind: z.enum(['text', 'announcement']).optional(),
      topic: z.string().max(LIMITS.topic.max).optional(),
    }),
  ),
  handler(async (req, res) => {
    const body = validated<{ name: string; kind?: 'text' | 'announcement'; topic?: string }>(req);
    res.status(201).json(await service.createChannel(req.params.id, currentUserId(req), body));
  }),
);

communitiesRouter.patch(
  '/channels/:channelId',
  validate(
    z.object({
      name: z.string().max(LIMITS.channelName.max).optional(),
      topic: z.string().max(LIMITS.topic.max).nullable().optional(),
      position: z.number().int().min(0).max(100).optional(),
    }),
  ),
  handler(async (req, res) => {
    const body = validated<{ name?: string; topic?: string | null; position?: number }>(req);
    res.json(await service.updateChannel(req.params.channelId, currentUserId(req), body));
  }),
);

communitiesRouter.delete(
  '/channels/:channelId',
  handler(async (req, res) => {
    res.json(await service.deleteChannel(req.params.channelId, currentUserId(req)));
  }),
);

/* ----------------------------------- Salas --------------------------------- */

communitiesRouter.post(
  '/:id/rooms',
  validate(
    z.object({
      name: z.string().min(1).max(LIMITS.channelName.max),
      kind: z.enum(['voice', 'meeting', 'gaming']).optional(),
      topic: z.string().max(LIMITS.topic.max).optional(),
      maxParticipants: z.number().int().min(2).max(50).optional(),
    }),
  ),
  handler(async (req, res) => {
    const body = validated<Parameters<typeof service.createRoom>[2]>(req);
    res.status(201).json(await service.createRoom(req.params.id, currentUserId(req), body));
  }),
);

communitiesRouter.delete(
  '/rooms/:roomId',
  handler(async (req, res) => {
    res.json(await service.deleteRoom(req.params.roomId, currentUserId(req)));
  }),
);

/* ---------------------------------- Eventos -------------------------------- */

communitiesRouter.post(
  '/:id/events',
  validate(
    z.object({
      title: z.string().min(1).max(80),
      description: z.string().max(500).optional(),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime().nullable().optional(),
      roomId: z.string().nullable().optional(),
      channelId: z.string().nullable().optional(),
    }),
  ),
  handler(async (req, res) => {
    const body = validated<Parameters<typeof service.createEvent>[2]>(req);
    res.status(201).json(await service.createEvent(req.params.id, currentUserId(req), body));
  }),
);

communitiesRouter.post(
  '/events/:eventId/attendance',
  handler(async (req, res) => {
    res.json(await service.toggleAttendance(req.params.eventId, currentUserId(req)));
  }),
);

communitiesRouter.delete(
  '/events/:eventId',
  handler(async (req, res) => {
    res.json(await service.deleteEvent(req.params.eventId, currentUserId(req)));
  }),
);
