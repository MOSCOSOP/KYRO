import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { AttachmentKind } from '@kyro/shared';
import { ALLOWED_MIME, UPLOAD_LIMITS } from '@kyro/shared';
import { currentUserId } from '../../auth/middleware.js';
import { badRequest, tooLarge } from '../../lib/errors.js';
import { handler } from '../../middleware/validate.js';
import { uploadLimiter } from '../../middleware/rateLimit.js';
import { buildObjectKey, storage } from '../../storage/index.js';
import { signUploadToken } from './tokens.js';

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.video, files: 1 },
});

function classify(mimeType: string): AttachmentKind {
  if (ALLOWED_MIME.image.includes(mimeType as never)) return 'image';
  if (ALLOWED_MIME.video.includes(mimeType as never)) return 'video';
  if (ALLOWED_MIME.audio.includes(mimeType as never)) return 'audio';
  if (ALLOWED_MIME.file.includes(mimeType as never)) return 'file';
  throw badRequest('Ese tipo de archivo no está permitido');
}

const metadataSchema = z.object({
  width: z.coerce.number().int().positive().max(20000).optional(),
  height: z.coerce.number().int().positive().max(20000).optional(),
  durationMs: z.coerce.number().int().positive().max(24 * 3600_000).optional(),
  scope: z.enum(['message', 'avatar', 'community']).optional(),
});

uploadsRouter.post(
  '/',
  uploadLimiter,
  upload.single('file'),
  handler(async (req, res) => {
    const userId = currentUserId(req);
    const file = req.file;
    if (!file) throw badRequest('No se recibió ningún archivo');

    const kind = classify(file.mimetype);
    if (file.size > UPLOAD_LIMITS[kind]) {
      throw tooLarge(
        `Máximo ${Math.round(UPLOAD_LIMITS[kind] / (1024 * 1024))} MB para este tipo de archivo`,
      );
    }

    const metadata = metadataSchema.parse(req.body ?? {});
    const scope = metadata.scope ?? 'message';

    // Los SVG se guardan como descarga: nunca se sirven como documento activo.
    const mimeType =
      file.mimetype === 'image/svg+xml' && scope !== 'message'
        ? 'application/octet-stream'
        : file.mimetype;

    const key = buildObjectKey(`${scope}/${userId}`, file.originalname || 'archivo');
    const stored = await storage.save({
      key,
      body: file.buffer,
      mimeType,
      filename: file.originalname || 'archivo',
    });

    res.status(201).json({
      token: signUploadToken({
        key: stored.key,
        url: stored.url,
        name: file.originalname?.slice(0, 200) || 'archivo',
        size: stored.size,
        mimeType,
        kind,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        durationMs: metadata.durationMs ?? null,
        uploaderId: userId,
      }),
      attachment: {
        url: stored.url,
        name: file.originalname?.slice(0, 200) || 'archivo',
        size: stored.size,
        mimeType,
        kind,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        durationMs: metadata.durationMs ?? null,
      },
    });
  }),
);
