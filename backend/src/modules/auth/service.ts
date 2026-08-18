import { LIMITS } from '@kyro/shared';
import { badRequest, conflict, forbidden, unauthorized } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { sanitizeText } from '../../lib/text.js';
import { env } from '../../config/env.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { accessTokenTtlSeconds, issueRefreshToken, signAccessToken } from '../../auth/tokens.js';
import { serializeCurrentUser } from '../../serializers/user.js';

interface RequestContext {
  userAgent?: string;
  ip?: string;
}

export async function register(
  input: { email: string; username: string; password: string; displayName?: string },
  context: RequestContext,
) {
  if (!env.ALLOW_REGISTRATION) throw forbidden('El registro está cerrado por ahora');

  const email = input.email.trim().toLowerCase();
  const username = input.username.trim().toLowerCase();
  const displayName = sanitizeText(input.displayName || input.username, LIMITS.displayName.max);

  const [emailTaken, usernameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
  ]);
  if (emailTaken) throw conflict('Ya existe una cuenta con ese correo');
  if (usernameTaken) throw conflict('Ese nombre de usuario ya está en uso');

  const user = await prisma.user.create({
    data: {
      email,
      username,
      displayName,
      passwordHash: await hashPassword(input.password),
      status: 'available',
    },
  });

  return issueSession(user, context);
}

export async function login(
  input: { identifier: string; password: string },
  context: RequestContext,
) {
  const identifier = input.identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });

  // Mismo mensaje y coste similar tanto si el usuario existe como si no.
  if (!user) {
    await hashPassword(input.password);
    throw unauthorized('Correo o contraseña incorrectos');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw unauthorized('Correo o contraseña incorrectos');

  return issueSession(user, context);
}

export async function issueSession(
  user: Parameters<typeof serializeCurrentUser>[0],
  context: RequestContext,
) {
  const accessToken = signAccessToken({ sub: user.id, username: user.username });
  const refresh = await issueRefreshToken(user.id, context);

  return {
    user: serializeCurrentUser(user),
    accessToken,
    expiresIn: accessTokenTtlSeconds(),
    refreshToken: refresh.token,
  };
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) throw badRequest('La contraseña actual no es correcta');

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
  return { changed: true };
}

export async function listSessions(userId: string) {
  const sessions = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
  });
  return sessions.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    ip: session.ip,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  }));
}

export async function revokeSession(userId: string, sessionId: string) {
  await prisma.refreshToken.updateMany({
    where: { id: sessionId, userId },
    data: { revokedAt: new Date() },
  });
  return { revoked: true };
}
