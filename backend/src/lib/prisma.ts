import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const prisma = new PrismaClient({
  log: env.isDev ? [{ emit: 'event', level: 'query' }, 'warn', 'error'] : ['warn', 'error'],
});

if (env.isDev) {
  // Solo se registran consultas lentas para no ensuciar la salida.
  // El tipado de $on depende de la configuración de `log`, de ahí el puente.
  const client = prisma as unknown as {
    $on(event: 'query', callback: (e: { duration: number; query: string }) => void): void;
  };
  client.$on('query', (e) => {
    if (e.duration > 120) {
      logger.debug({ ms: e.duration }, `consulta lenta: ${e.query.slice(0, 160)}`);
    }
  });
}

/**
 * `mode: 'insensitive'` solo existe en PostgreSQL; en SQLite el operador LIKE
 * ya es insensible a mayúsculas para ASCII.
 */
export function insensitiveContains(value: string) {
  return env.dbProvider === 'postgres'
    ? { contains: value, mode: 'insensitive' as const }
    : { contains: value };
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
