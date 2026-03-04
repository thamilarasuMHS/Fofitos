#!/usr/bin/env node
import 'dotenv/config';

/**
 * Initialize PostgreSQL database with Fofitos schema.
 * Run against plain Postgres (not Supabase). Uses DATABASE_URL from env.
 *
 * Usage: node scripts/init-db.mjs
 * Or:    npm run db:init
 */

import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it in .env or pass as env var.');
  process.exit(1);
}

// Parse URL to get target db and build admin URL (connects to 'postgres')
const url = new URL(DATABASE_URL.replace(/^postgresql:/, 'postgres:'));
const dbName = (url.pathname || '/postgres').slice(1) || 'postgres';
url.pathname = '/postgres';
const adminUrl = url.toString().replace(/^postgres:/, 'postgresql:');

async function ensureDatabaseExists() {
  if (dbName === 'postgres') return;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const { rows } = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    if (rows.length === 0) {
      await admin.query('CREATE DATABASE "' + dbName.replace(/"/g, '""') + '"');
      console.log('  ✓ Created database:', dbName);
    }
  } catch (e) {
    if (e.code === '42P04') return; // already exists
    throw e;
  } finally {
    await admin.end();
  }
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function runSql(sql, label) {
  try {
    await client.query(sql);
    console.log('  ✓', label);
  } catch (err) {
    console.error('  ✗', label);
    throw err;
  }
}

async function main() {
  console.log('Connecting to database...');
  await ensureDatabaseExists();
  await client.connect();

  try {
    console.log('\n1. Bootstrap (auth schema for plain Postgres)...');
    const bootstrap = readFileSync(
      join(root, 'supabase', 'bootstrap_plain_postgres.sql'),
      'utf8'
    );
    await runSql(bootstrap, 'bootstrap_plain_postgres.sql');

    const migrationsDir = join(root, 'supabase', 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log('\n2. Migrations...');
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await runSql(sql, file);
    }

    console.log('\n✓ Database initialized successfully.');
  } catch (err) {
    console.error('\nError:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
