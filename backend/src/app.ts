import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { forbidden } from './lib/errors.js';
import { httpLogger } from './middleware/httpLogger.js';
import { requireAuth, requireExistingUser } from './auth/middleware.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { storage } from './storage/index.js';
import { LocalStorage } from './storage/local.js';

import { authRouter } from './modules/auth/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { conversationsRouter } from './modules/conversations/routes.js';
import { messagesRouter } from './modules/messages/routes.js';
import { communitiesRouter } from './modules/communities/routes.js';
import { notificationsRouter } from './modules/notifications/routes.js';
import { searchRouter } from './modules/search/routes.js';
import { uploadsRouter } from './modules/uploads/routes.js';
import { callsRouter } from './modules/calls/routes.js';

export function createApp() {
  const app = express();

  // Detrás de un proxy (Railway, Fly, Nginx) para IPs reales en rate limiting.
  if (env.isProd) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // La API no sirve HTML; el frontend va en su propio origen con su CSP.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Sin origen: peticiones del propio servidor, curl o apps nativas.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        callback(forbidden('Origen no permitido'));
      },
      credentials: true,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  app.use(httpLogger);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'kyro', time: new Date().toISOString() });
  });

  // Archivos subidos cuando se usa el driver local (en producción: S3/R2).
  if (storage instanceof LocalStorage) {
    app.use(
      '/uploads',
      express.static(storage.rootDir, {
        index: false,
        dotfiles: 'deny',
        maxAge: '7d',
        setHeaders(res) {
          // Nunca se ejecuta nada de lo subido: siempre se entrega inerte.
          res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
          res.setHeader('X-Content-Type-Options', 'nosniff');
        },
      }),
    );
  }

  // Autenticación: público (tiene su propio límite estricto por endpoint).
  app.use('/api/auth', authRouter);

  // A partir de aquí todo exige sesión válida.
  const api = express.Router();
  api.use(requireAuth, requireExistingUser, apiLimiter);
  api.use('/users', usersRouter);
  api.use('/conversations', conversationsRouter);
  api.use('/messages', messagesRouter);
  api.use('/communities', communitiesRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/search', searchRouter);
  api.use('/uploads', uploadsRouter);
  api.use('/calls', callsRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
