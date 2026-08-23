import { useEffect, useState } from 'react';
import type { LinkPreview } from '@kyro/shared';
import { API_ORIGIN, api } from './api';

/*
 * Una vista previa por dirección, compartida por todos los mensajes que la
 * mencionen. El servidor ya guarda su propia caché; esta evita además que dos
 * mensajes con el mismo enlace pidan lo mismo a la vez.
 */
const cache = new Map<string, LinkPreview | null>();
const inFlight = new Map<string, Promise<LinkPreview | null>>();

function load(url: string) {
  const cached = inFlight.get(url);
  if (cached) return cached;

  const task = api
    .get<{ preview: LinkPreview | null }>(`/links/preview?url=${encodeURIComponent(url)}`)
    .then((response) => response.preview)
    .catch(() => null)
    .then((preview) => {
      cache.set(url, preview);
      return preview;
    })
    .finally(() => inFlight.delete(url));

  inFlight.set(url, task);
  return task;
}

/** La imagen viene como ruta relativa; en producción el API vive en otro origen. */
export function previewImageSrc(path: string) {
  return path.startsWith('/') ? `${API_ORIGIN}${path}` : path;
}

export function useLinkPreview(url: string | null) {
  const [preview, setPreview] = useState<LinkPreview | null>(() =>
    url ? (cache.get(url) ?? null) : null,
  );

  useEffect(() => {
    if (!url) {
      setPreview(null);
      return;
    }
    if (cache.has(url)) {
      setPreview(cache.get(url) ?? null);
      return;
    }

    let alive = true;
    void load(url).then((value) => {
      if (alive) setPreview(value);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  return preview;
}

/** El primer enlace del mensaje. Con dos o más, ninguno: la lista sería ruido. */
export function firstLink(content: string) {
  const matches = content.match(/https?:\/\/[^\s<]+/gi);
  if (!matches || matches.length !== 1) return null;
  return matches[0].replace(/[.,;:!?)\]]+$/, '');
}
