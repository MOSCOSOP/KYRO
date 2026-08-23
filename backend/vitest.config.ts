import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    // Una sola base de datos de fichero: los archivos van de uno en uno.
    fileParallelism: false,
    env: {
      NODE_ENV: 'development',
      DATABASE_URL: 'file:./test.db',
      JWT_SECRET: 'secreto-de-pruebas-de-kyro',
      JWT_REFRESH_SECRET: 'secreto-de-refresco-de-pruebas',
      STORAGE_DRIVER: 'local',
      STORAGE_DIR: './storage-test',
      LOG_LEVEL: 'silent',
    },
  },
});
