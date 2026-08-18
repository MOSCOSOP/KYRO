import 'dotenv/config';
import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),

  /** Orígenes permitidos, separados por coma. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  PUBLIC_URL: z.string().default('http://localhost:4000'),

  /** Postgres en produccion; SQLite (relativo a prisma/) para desarrollo local. */
  DATABASE_URL: z.string().default('file:./kyro.db'),
  REDIS_URL: z.string().optional(),

  JWT_SECRET: z.string().min(16).default('kyro-development-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(16).default('kyro-development-refresh-secret-change'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /** local | s3 */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool(true),

  /** Servidores ICE para WebRTC (JSON array). STUN público por defecto. */
  ICE_SERVERS: z.string().default('[{"urls":"stun:stun.l.google.com:19302"}]'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  LOG_LEVEL: z.string().default('info'),
  ALLOW_REGISTRATION: bool(true),

  /**
   * Actívalo cuando el frontend viva en otro dominio (por ejemplo, en Vercel):
   * la cookie de sesión pasa a SameSite=None y exige HTTPS.
   */
  CROSS_SITE_COOKIES: bool(false),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Configuración inválida:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

// Prisma lee DATABASE_URL directamente del entorno, así que se propaga el
// valor por defecto para que el proyecto arranque sin ningún fichero .env.
process.env.DATABASE_URL = raw.DATABASE_URL;

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  isDev: raw.NODE_ENV === 'development',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  iceServers: parseIceServers(raw.ICE_SERVERS),
  /** postgres | sqlite — deducido de la URL, usado para adaptar consultas. */
  dbProvider: raw.DATABASE_URL.startsWith('file:') ? ('sqlite' as const) : ('postgres' as const),
};

function parseIceServers(value: string) {
  try {
    const parsedValue = JSON.parse(value);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

if (env.isProd) {
  const insecure =
    env.JWT_SECRET.includes('development') || env.JWT_REFRESH_SECRET.includes('development');
  if (insecure) {
    // eslint-disable-next-line no-console
    console.error('JWT_SECRET y JWT_REFRESH_SECRET deben configurarse en producción.');
    process.exit(1);
  }
}
