import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { unauthorized } from '../lib/errors.js';

export interface AccessTokenPayload {
  sub: string;
  username: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'kyro',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET, { issuer: 'kyro' }) as AccessTokenPayload;
  } catch {
    throw unauthorized();
  }
}

export function accessTokenTtlSeconds(): number {
  const value = env.ACCESS_TOKEN_TTL;
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return 900;
  const amount = Number(match[1]);
  const unit = match[2];
  const factor = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return amount * factor;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Crea un refresh token opaco; en base de datos solo vive su hash. */
export async function issueRefreshToken(
  userId: string,
  context: { userAgent?: string; ip?: string },
) {
  const token = `${randomBytes(32).toString('base64url')}.${randomBytes(16).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400_000);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: context.userAgent?.slice(0, 250),
      ip: context.ip?.slice(0, 64),
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/** Rotación: el token usado se revoca y se emite uno nuevo. */
export async function rotateRefreshToken(
  token: string,
  context: { userAgent?: string; ip?: string },
) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    // Reutilización de un token revocado: se cierran todas las sesiones.
    if (record?.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw unauthorized('La sesión expiró, vuelve a iniciar sesión');
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  const next = await issueRefreshToken(record.userId, context);
  return { user: record.user, ...next };
}

export async function revokeRefreshToken(token: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export const REFRESH_COOKIE = 'kyro_rt';

export function refreshCookieOptions() {
  // Con frontend y backend en dominios distintos el navegador exige
  // SameSite=None y HTTPS; en el mismo dominio se usa lo más estricto posible.
  const crossSite = env.CROSS_SITE_COOKIES;

  return {
    httpOnly: true,
    sameSite: crossSite ? ('none' as const) : env.isProd ? ('strict' as const) : ('lax' as const),
    secure: crossSite || env.isProd,
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400_000,
  };
}
