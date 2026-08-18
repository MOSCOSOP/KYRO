#!/usr/bin/env node
/**
 * Prepara la base de datos de KYRO.
 *
 * El esquema de referencia (prisma/schema.prisma) apunta a PostgreSQL, que es
 * el destino de producción. Para desarrollar sin instalar nada, si DATABASE_URL
 * empieza por `file:` se genera una copia con proveedor SQLite. El esquema es
 * deliberadamente compatible con ambos: sin enums ni listas escalares.
 *
 *   node scripts/db-setup.mjs           → db push + generate
 *   node scripts/db-setup.mjs studio    → abre Prisma Studio
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..');
const schemaPath = path.join(backendDir, 'prisma', 'schema.prisma');
const devSchemaPath = path.join(backendDir, 'prisma', 'schema.dev.prisma');

const databaseUrl = process.env.DATABASE_URL ?? 'file:./kyro.db';
const isSqlite = databaseUrl.startsWith('file:');

function resolvePrismaCli() {
  const candidates = [
    path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js'),
    path.join(backendDir, '..', 'node_modules', 'prisma', 'build', 'index.js'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    console.error('No se encontró el CLI de Prisma. Ejecuta primero: npm install');
    process.exit(1);
  }
  return found;
}

function activeSchema() {
  if (!isSqlite) return schemaPath;

  const source = fs.readFileSync(schemaPath, 'utf8');
  const sqlite = source.replace(
    /datasource\s+db\s*\{[^}]*\}/,
    'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}',
  );
  fs.writeFileSync(
    devSchemaPath,
    '// Generado por scripts/db-setup.mjs a partir de schema.prisma. No editar.\n' + sqlite,
  );
  return devSchemaPath;
}

function run(args) {
  const result = spawnSync(process.execPath, [resolvePrismaCli(), ...args], {
    cwd: backendDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const schema = activeSchema();
console.log(`KYRO · base de datos ${isSqlite ? 'SQLite (desarrollo)' : 'PostgreSQL'}`);

if (process.argv[2] === 'studio') {
  run(['studio', '--schema', schema]);
} else {
  run(['db', 'push', '--schema', schema, '--skip-generate']);
  run(['generate', '--schema', schema]);
  console.log('\nListo. Datos de ejemplo opcionales: npm run db:seed');
}
