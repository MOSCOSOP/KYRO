import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import type { StorageDriver, StoredFile } from './index.js';

/** Guarda los objetos en disco. El servidor los sirve en /uploads/<key>. */
export class LocalStorage implements StorageDriver {
  private root = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);

  private resolve(key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root)) throw new Error('Clave de objeto no válida');
    return target;
  }

  async save({ key, body, mimeType }: { key: string; body: Buffer; mimeType: string }) {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    const file: StoredFile = {
      key,
      url: `${env.PUBLIC_URL.replace(/\/$/, '')}/uploads/${key}`,
      size: body.byteLength,
      mimeType,
    };
    return file;
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }

  async urlFor(key: string) {
    return `${env.PUBLIC_URL.replace(/\/$/, '')}/uploads/${key}`;
  }

  get rootDir() {
    return this.root;
  }
}
