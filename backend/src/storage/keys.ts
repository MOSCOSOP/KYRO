import { randomBytes } from 'node:crypto';
import path from 'node:path';

/** Sanea el nombre original y genera una clave de objeto imposible de adivinar. */
export function buildObjectKey(scope: string, originalName: string) {
  const ext = path.extname(originalName).toLowerCase().slice(0, 12).replace(/[^a-z0-9.]/g, '');
  const base = path
    .basename(originalName, path.extname(originalName))
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const id = randomBytes(12).toString('hex');
  return `${scope}/${stamp}/${id}${base ? `-${base}` : ''}${ext}`;
}
