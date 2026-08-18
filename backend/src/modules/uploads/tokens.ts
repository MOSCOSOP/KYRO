import jwt from 'jsonwebtoken';
import type { AttachmentKind } from '@kyro/shared';
import { env } from '../../config/env.js';
import { badRequest } from '../../lib/errors.js';

export interface UploadTokenPayload {
  key: string;
  url: string;
  name: string;
  size: number;
  mimeType: string;
  kind: AttachmentKind;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  uploaderId: string;
}

/**
 * El archivo se sube antes que el mensaje. En lugar de dejar filas huérfanas
 * en la base de datos, la subida devuelve un token firmado que el envío del
 * mensaje canjea por un adjunto real.
 */
export function signUploadToken(payload: UploadTokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '2h', issuer: 'kyro-upload' });
}

export function verifyUploadToken(token: string, uploaderId: string): UploadTokenPayload {
  let payload: UploadTokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'kyro-upload' }) as UploadTokenPayload;
  } catch {
    throw badRequest('El archivo adjunto expiró, vuelve a subirlo');
  }
  if (payload.uploaderId !== uploaderId) throw badRequest('Adjunto no válido');
  return payload;
}
