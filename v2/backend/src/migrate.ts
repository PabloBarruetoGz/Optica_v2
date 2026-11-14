import { readFile } from 'node:fs/promises';
import { getMigrations } from 'better-auth/db/migration';
import { auth } from './auth.js';
import { pool } from './db.js';
async function apply(name: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(51863186)');
    const applied = await client.query('SELECT 1 FROM app_migrations WHERE name = $1', [name]);
    if (!applied.rowCount) {
      await client.query(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
      await client.query('INSERT INTO app_migrations (name) VALUES ($1)', [name]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
try {
  await pool.query('CREATE TABLE IF NOT EXISTS app_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  await apply('001_inquiries.sql');
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  for (const name of ['002_profiles.sql', '003_carousels.sql', '004_carousel_new_photos.sql', '005_carousel_numbering.sql', '006_service_descriptions.sql', '007_instagram.sql', '010_remove_reviews.sql', '011_orders.sql', '012_advisory_agenda.sql']) await apply(name);
  console.log('PostgreSQL: esquema y perfiles Administrador / Cliente preparados.');
} finally { await pool.end(); }
