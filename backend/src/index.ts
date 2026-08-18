import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { closeRedis, redisEnabled } from './lib/redis.js';
import { initRealtime, shutdownRealtime } from './realtime/io.js';

async function main() {
  const app = createApp();
  const server = http.createServer(app);

  await initRealtime(server);

  await new Promise<void>((resolve) => {
    server.listen(env.PORT, env.HOST, resolve);
  });

  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      db: env.dbProvider,
      redis: redisEnabled ? 'redis' : 'memoria',
      storage: env.STORAGE_DRIVER,
    },
    'KYRO backend en marcha',
  );

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Cerrando KYRO…');

    const forced = setTimeout(() => process.exit(1), 10_000);
    forced.unref();

    try {
      await shutdownRealtime();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await prisma.$disconnect();
      await closeRedis();
    } catch (err) {
      logger.error({ err }, 'Error durante el apagado');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Promesa rechazada sin manejar');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Excepción no capturada');
    void shutdown('uncaughtException');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'No se pudo arrancar el servidor');
  process.exit(1);
});
