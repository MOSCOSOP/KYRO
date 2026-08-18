import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

const SILENT_PATHS = new Set(['/api/health']);

/**
 * Registro de peticiones. Deliberadamente mínimo: método, ruta, estado,
 * duración y usuario. Nunca se registran cuerpos ni cabeceras de autenticación.
 */
export function httpLogger(req: Request, res: Response, next: NextFunction) {
  if (SILENT_PATHS.has(req.path)) return next();

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const payload = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Math.round(ms),
      userId: req.userId,
    };

    if (res.statusCode >= 500) logger.error(payload, 'petición fallida');
    else if (res.statusCode >= 400) logger.warn(payload, 'petición rechazada');
    else logger.debug(payload, 'petición');
  });

  next();
}
