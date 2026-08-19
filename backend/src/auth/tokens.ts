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
/** Ventana en la que un token recién rotado sigue sirviendo (carreras entre pestañas). */
const ROTATION_GRACE_MS = 30_000;

export async function issueRefreshToken(
  userId: string,
  context: { userAgent?: string; ip?: string },
  /** Token al que sustituye, para poder seguir la cadena de rotación. */
  replacesId?: string,
) {
  const token = `${randomBytes(32).toString('base64url')}.${randomBytes(16).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400_000);
  const created = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: context.userAgent?.slice(0, 250),
      ip: context.ip?.slice(0, 64),
      expiresAt,
    },
  });

  if (replacesId) {
    await prisma.refreshToken.update({
      where: { id: replacesId },
      data: { replacedById: created.id },
    });
  }

  return { token, expiresAt };
}

/** Sigue la cadena de sustituciones hasta el token que aún está vivo. */
async function activeReplacement(id: string) {
  let current = id;

  for (let hop = 0; hop < 5; hop++) {
    const record = await prisma.refreshToken.findUnique({
      where: { id: current },
      select: { id: true, revokedAt: true, expiresAt: true, replacedById: true },
    });
    if (!record?.replacedById) return null;

    const next = await prisma.refreshToken.findUnique({
      where: { id: record.replacedById },
      select: { id: true, revokedAt: true, expiresAt: true, replacedById: true },
    });
    if (!next) return null;
    if (!next.revokedAt && next.expiresAt > new Date()) return next;

    current = next.id;
  }

  return null;
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

  if (!record || record.expiresAt < new Date()) {
    throw unauthorized('La sesión expiró, vuelve a iniciar sesión');
  }

  if (record.revokedAt) {
    /*
     * Un token ya rotado puede significar dos cosas muy distintas:
     *
     * - Una carrera normal: dos pestañas (o dos recargas) refrescan a la vez y
     *   la segunda llega con el token que la primera acaba de sustituir. Eso no
     *   es un ataque, y cerrar todas las sesiones por ello echaría al usuario
     *   de la aplicación constantemente.
     * - Un token robado que se reutiliza más tarde. Ahí sí hay que cerrar todo.
     *
     * Se distinguen por el tiempo y por la cadena de sustitución: dentro de la
     * ventana de gracia se continúa desde el token vigente; fuera de ella, se
     * revoca la sesión entera.
     */
    const head = await activeReplacement(record.id);
    const withinGrace = Date.now() - record.revokedAt.getTime() < ROTATION_GRACE_MS;

    if (head && withinGrace) {
      await prisma.refreshToken.update({
        where: { id: head.id },
        data: { revokedAt: new Date() },
      });
      const next = await issueRefreshToken(record.userId, context, head.id);
      return { user: record.user, ...next };
    }

    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('La sesión expiró, vuelve a iniciar sesión');
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  const next = await issueRefreshToken(record.userId, context, record.id);
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
