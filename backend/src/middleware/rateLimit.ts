import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../config/env.js';

const base: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'rate_limited', message: 'Demasiadas peticiones. Espera un momento.' },
  },
};

/** Límite general de la API. */
export const apiLimiter = rateLimit({
  ...base,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  keyGenerator: (req) => req.userId ?? req.ip ?? 'anon',
});

/** Límite estricto para endpoints sensibles (login, registro, refresh). */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 10 * 60_000,
  limit: env.isDev ? 200 : 20,
  message: {
    error: {
      code: 'rate_limited',
      message: 'Demasiados intentos. Vuelve a intentarlo en unos minutos.',
    },
  },
});

/** Envío de mensajes: protege contra spam sin molestar al uso normal. */
export const writeLimiter = rateLimit({
  ...base,
  windowMs: 10_000,
  limit: 40,
  keyGenerator: (req) => req.userId ?? req.ip ?? 'anon',
});

export const uploadLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 40,
  keyGenerator: (req) => req.userId ?? req.ip ?? 'anon',
});
