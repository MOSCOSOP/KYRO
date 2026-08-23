import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/**
 * Base de datos de pruebas: se crea desde cero antes de la primera prueba.
 *
 * Es un fichero aparte del de desarrollo; borrarlo y volver a levantarlo es
 * más barato y más fiable que limpiar tablas entre pruebas.
 *
 * El esquema de referencia apunta a PostgreSQL, así que aquí se escribe una
 * copia con proveedor SQLite —igual que hace scripts/db-setup.mjs— y se empuja
 * sin regenerar el cliente: regenerarlo falla en Windows si el servidor de
 * desarrollo está en marcha, y para las pruebas no hace falta.
 */
export function setup() {
  const schema = resolve(root, 'prisma/schema.test.prisma');
  const source = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');

  writeFileSync(
    schema,
    '// Generado por tests/global-setup.ts. No editar.\n' +
      source.replace(
        /datasource\s+db\s*\{[^}]*\}/,
        'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}',
      ),
  );

  rmSync(resolve(root, 'prisma/test.db'), { force: true });
  execFileSync(
    'node',
    [
      resolve(root, '../node_modules/prisma/build/index.js'),
      'db',
      'push',
      '--schema',
      schema,
      '--skip-generate',
      '--accept-data-loss',
    ],
    { stdio: 'ignore', env: { ...process.env, DATABASE_URL: 'file:./test.db' } },
  );
}

export function teardown() {
  rmSync(resolve(root, 'storage-test'), { force: true, recursive: true });
  rmSync(resolve(root, 'prisma/schema.test.prisma'), { force: true });
}
