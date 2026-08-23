import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LinkPreview } from '@kyro/shared';
import { env } from '../../config/env.js';
import { safeFetch, UnsafeUrlError } from '../../lib/safeFetch.js';

const HTML_MAX_BYTES = 512 * 1024;
const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 300;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

/*
 * Caché en memoria. Con este tamaño de servicio no hace falta nada más: se
 * pierde al reiniciar y se vuelve a pedir, que es exactamente lo que debe
 * pasar. Si algún día hay varias instancias, esto se cambia por la base de
 * datos sin tocar el resto del módulo.
 */
const cache = new Map<string, { value: LinkPreview | null; expiresAt: number }>();
const inFlight = new Map<string, Promise<LinkPreview | null>>();

export async function getLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  const key = rawUrl.trim();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const running = inFlight.get(key);
  if (running) return running;

  const task = fetchPreview(key)
    .catch((error) => {
      // Un enlace que no da vista previa no es un fallo de la aplicación: se
      // recuerda el «no» un rato para no reintentar en cada render.
      if (error instanceof UnsafeUrlError) return null;
      return null;
    })
    .then((value) => {
      remember(key, value);
      return value;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task;
}

function remember(key: string, value: LinkPreview | null) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function fetchPreview(rawUrl: string): Promise<LinkPreview | null> {
  const response = await safeFetch(rawUrl, {
    maxBytes: HTML_MAX_BYTES,
    accept: 'text/html,application/xhtml+xml',
    stopAfter: '</head>',
  });
  if (!response.contentType.includes('html')) return null;

  const html = response.body.toString('utf8');
  const meta = readMeta(html);
  const title = meta['og:title'] ?? meta['twitter:title'] ?? readTitle(html);
  if (!title) return null;

  const image = meta['og:image'] ?? meta['og:image:url'] ?? meta['twitter:image'] ?? null;
  const absoluteImage = image ? toAbsolute(decodeEntities(image), response.url) : null;

  return {
    url: response.url,
    siteName: meta['og:site_name'] ?? new URL(response.url).hostname.replace(/^www\./, ''),
    title: clean(title, 140),
    description: clean(meta['og:description'] ?? meta['description'] ?? '', 220) || null,
    imageUrl: absoluteImage ? signedImageUrl(absoluteImage) : null,
  };
}

/*
 * Lectura de etiquetas sin un analizador de HTML completo. Solo se buscan
 * <meta> en la cabecera, y no se ejecuta ni se inserta nada del documento, así
 * que un HTML retorcido puede como mucho dar una vista previa pobre.
 */
const META = /<meta\s+[^>]*>/gi;
const ATTR = /([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi;

function readMeta(html: string): Record<string, string> {
  const head = html.slice(0, html.search(/<\/head>/i) + 1 || html.length);
  const result: Record<string, string> = {};

  for (const tag of head.match(META) ?? []) {
    const attributes: Record<string, string> = {};
    for (const attribute of tag.matchAll(ATTR)) {
      attributes[attribute[1].toLowerCase()] = attribute[3] ?? attribute[4] ?? '';
    }
    const name = (attributes.property ?? attributes.name)?.toLowerCase();
    const content = attributes.content;
    if (name && content && !(name in result)) result[name] = content;
  }
  return result;
}

function readTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1] : '';
}

function toAbsolute(value: string, base: string) {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
};

/*
 * Las entidades hay que deshacerlas también en la dirección de la imagen: un
 * `&amp;` literal dentro de una URL la convierte en otra que no existe.
 */
function decodeEntities(value: string) {
  return value.replace(/&(#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith('#')) {
      const point = Number(code.slice(1));
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function clean(value: string, max: number) {
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/* ------------------------------ Imagen firmada ----------------------------- */

/*
 * La imagen no se sirve desde el sitio original: eso revelaría la IP de quien
 * lee el mensaje a un tercero. Va por el servidor, y para que el servidor no
 * se convierta en un proxy abierto solo acepta direcciones que él mismo haya
 * firmado al construir la vista previa.
 */
function sign(url: string) {
  return createHmac('sha256', env.JWT_SECRET).update(`link-image:${url}`).digest('base64url');
}

function signedImageUrl(url: string) {
  const encoded = Buffer.from(url, 'utf8').toString('base64url');
  return `/api/links/image?u=${encodeURIComponent(encoded)}&s=${sign(url)}`;
}

export function verifyImageUrl(encoded: string, signature: string) {
  let url: string;
  try {
    url = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = Buffer.from(sign(url));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return url;
}

export async function fetchPreviewImage(url: string) {
  const response = await safeFetch(url, { maxBytes: IMAGE_MAX_BYTES, accept: 'image/*' });
  if (!IMAGE_TYPES.has(response.contentType)) throw new UnsafeUrlError('No es una imagen');
  return response;
}
