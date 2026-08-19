import { Router } from 'express';
import { z } from 'zod';
import { LIMITS } from '@kyro/shared';
import { authLimiter } from '../../middleware/rateLimit.js';
import { handler, validate, validated } from '../../middleware/validate.js';
import { currentUserId, requireAuth } from '../../auth/middleware.js';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  rotateRefreshToken,
  revokeAllSessions,
  revokeRefreshToken,
  signAccessToken,
  accessTokenTtlSeconds,
} from '../../auth/tokens.js';
import { unauthorized } from '../../lib/errors.js';
import { serializeCurrentUser } from '../../serializers/user.js';
import * as service from './service.js';

const passwordSchema = z
  .string()
  .min(LIMITS.password.min, `La contraseña necesita al menos ${LIMITS.password.min} caracteres`)
  .max(LIMITS.password.max);

const registerSchema = z.object({
  email: z.string().email('Correo no válido').max(160),
  username: z
    .string()
    .min(LIMITS.username.min)
    .max(LIMITS.username.max)
    .regex(LIMITS.username.pattern, 'Solo letras minúsculas, números, punto y guion bajo'),
  password: passwordSchema,
  displayName: z.string().max(LIMITS.displayName.max).optional(),
});

const loginSchema = z.object({
  identifier: z.string().min(3).max(160),
  password: z.string().min(1).max(LIMITS.password.max),
});

export const authRouter = Router();

function context(req: import('express').Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  handler(async (req, res) => {
    const body = validated<z.infer<typeof registerSchema>>(req);
    const session = await service.register(body, context(req));
    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions());
    res.status(201).json({
      user: session.user,
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
    });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  handler(async (req, res) => {
    const body = validated<z.infer<typeof loginSchema>>(req);
    const session = await service.login(body, context(req));
    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions());
    res.json({
      user: session.user,
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
    });
  }),
);

/**
 * Disponibilidad de un @usuario. Público a propósito: se consulta mientras se
 * escribe el registro. Solo responde sí o no —nunca revela datos de la cuenta—
 * y va con el límite estricto de autenticación.
 */
authRouter.get(
  '/username',
  authLimiter,
  validate(z.object({ u: z.string().max(LIMITS.username.max + 10) }), 'query'),
  handler(async (req, res) => {
    const { u } = validated<{ u: string }>(req, 'query');
    res.json(await service.checkUsername(u));
  }),
);

authRouter.post(
  '/refresh',
  authLimiter,
  handler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('No hay sesión activa');

    const rotated = await rotateRefreshToken(token, context(req));
    res.cookie(REFRESH_COOKIE, rotated.token, refreshCookieOptions());
    res.json({
      user: serializeCurrentUser(rotated.user),
      accessToken: signAccessToken({ sub: rotated.user.id, username: rotated.user.username }),
      expiresIn: accessTokenTtlSeconds(),
    });
  }),
);

authRouter.post(
  '/logout',
  handler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/logout-all',
  requireAuth,
  handler(async (req, res) => {
    await revokeAllSessions(currentUserId(req));
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/sessions',
  requireAuth,
  handler(async (req, res) => {
    res.json({ items: await service.listSessions(currentUserId(req)) });
  }),
);

authRouter.delete(
  '/sessions/:id',
  requireAuth,
  handler(async (req, res) => {
    res.json(await service.revokeSession(currentUserId(req), req.params.id));
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  authLimiter,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema })),
  handler(async (req, res) => {
    const body = validated<{ currentPassword: string; newPassword: string }>(req);
    res.json(await service.changePassword(currentUserId(req), body));
  }),
);
