import { Router } from 'express';
import { z } from 'zod';
import { handler, validate, validated } from '../../middleware/validate.js';
import { fetchPreviewImage, getLinkPreview, verifyImageUrl } from './service.js';

export const linksRouter = Router();

linksRouter.get(
  '/preview',
  validate(z.object({ url: z.string().url().max(2048) }), 'query'),
  handler(async (req, res) => {
    const { url } = validated<{ url: string }>(req, 'query');
    const preview = await getLinkPreview(url);
    // Sin vista previa no es un error: el mensaje se queda con su enlace.
    res.json({ preview });
  }),
);

/*
 * El proxy de imagen va fuera de la sesión a propósito: una etiqueta <img> no
 * lleva la cabecera de autorización. Lo que lo protege es la firma, que solo
 * existe para direcciones que salieron de una vista previa nuestra.
 */
export const linkImageRouter = Router();

linkImageRouter.get(
  '/',
  validate(z.object({ u: z.string().max(3072), s: z.string().max(128) }), 'query'),
  handler(async (req, res) => {
    const { u, s } = validated<{ u: string; s: string }>(req, 'query');
    const url = verifyImageUrl(u, s);
    if (!url) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Firma no válida' } });
      return;
    }

    try {
      const image = await fetchPreviewImage(url);
      res.setHeader('content-type', image.contentType);
      res.setHeader('cache-control', 'public, max-age=86400, immutable');
      res.setHeader('cross-origin-resource-policy', 'cross-origin');
      res.send(image.body);
    } catch {
      res.status(404).end();
    }
  }),
);
