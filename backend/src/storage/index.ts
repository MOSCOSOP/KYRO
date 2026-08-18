import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { LocalStorage } from './local.js';
import { S3Storage } from './s3.js';

export interface StoredFile {
  key: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface StorageDriver {
  save(input: {
    key: string;
    body: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  /** URL pública o firmada para descargar el objeto. */
  urlFor(key: string): Promise<string>;
}

function createDriver(): StorageDriver {
  if (env.STORAGE_DRIVER === 's3') {
    if (!env.S3_BUCKET) {
      throw new Error('STORAGE_DRIVER=s3 requiere S3_BUCKET');
    }
    logger.info({ bucket: env.S3_BUCKET }, 'Almacenamiento: S3');
    return new S3Storage();
  }
  logger.info({ dir: env.STORAGE_LOCAL_DIR }, 'Almacenamiento: disco local');
  return new LocalStorage();
}

export const storage = createDriver();

export { buildObjectKey } from './keys.js';
