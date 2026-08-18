import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(unauthorized('Falta el token de acceso'));
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch (err) {
    next(err);
  }
}

/** Igual que requireAuth pero comprueba que el usuario siga existiendo. */
export async function requireExistingUser(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.userId) throw unauthorized();
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true } });
    if (!user) throw unauthorized('La cuenta ya no existe');
    next();
  } catch (err) {
    next(err);
  }
}

export function currentUserId(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
