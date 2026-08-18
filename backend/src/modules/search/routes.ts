import { Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../../auth/middleware.js';
import { handler, validate, validated } from '../../middleware/validate.js';
import { globalSearch } from './service.js';

export const searchRouter = Router();

searchRouter.get(
  '/',
  validate(z.object({ q: z.string().max(80) }), 'query'),
  handler(async (req, res) => {
    const query = validated<{ q: string }>(req, 'query');
    res.json(await globalSearch(currentUserId(req), query.q));
  }),
);
