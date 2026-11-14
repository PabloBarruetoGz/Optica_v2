import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en v2/.env');
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, max: 10 });
pool.on('error', (error) => console.error('Error de conexión PostgreSQL:', error.message));
