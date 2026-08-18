import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { currentUserId } from '../../auth/middleware.js';
import { handler, validate, validated } from '../../middleware/validate.js';
import { getActiveCall, listCallHistory } from './service.js';

export const callsRouter = Router();

/**
 * Historial de llamadas. El ciclo de vida de una llamada (iniciar, aceptar,
 * colgar) ocurre por WebSocket; aquí solo se consulta.
 */
callsRouter.get(
  '/',
  validate(
    z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().min(1).max(60).optional(),
    }),
    'query',
  ),
  handler(async (req, res) => {
    const query = validated<{ cursor?: string; limit?: number }>(req, 'query');
    res.json(await listCallHistory(currentUserId(req), query));
  }),
);

/** Servidores ICE para WebRTC (también llegan en el ack de `call:start`). */
callsRouter.get(
  '/ice-servers',
  handler(async (_req, res) => {
    res.json({ iceServers: env.iceServers });
  }),
);

/** Llamada activa en una conversación, para reincorporarse tras recargar. */
callsRouter.get(
  '/active/:conversationId',
  handler(async (req, res) => {
    res.json({ call: await getActiveCall(currentUserId(req), req.params.conversationId) });
  }),
);
