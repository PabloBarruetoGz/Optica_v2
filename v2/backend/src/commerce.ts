import type { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';
import { auth } from './auth.js';
import { pool } from './db.js';

export const uuid = z.uuid();
export const phone = z.string().trim().max(25).transform(value => value.replace(/[ ()-]/g, ''))
  .pipe(z.string().regex(/^(?:\+56)?[2-9]\d{8}$/)).transform(value => value.startsWith('+') ? value : '+56' + value);
export async function session(req: Request) { return auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); }
export async function checkOrigin(req: Request, res: Response, next: NextFunction) {
  const origins = await auth.options.trustedOrigins;
  if (!Array.isArray(origins) || !origins.includes(req.get('origin') || '')) { res.status(403).json({ error: 'Origen no autorizado.' }); return; }
  next();
}
export async function transaction<T>(run: (db: PoolClient) => Promise<T>) {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const value = await run(db); await db.query('COMMIT'); return value; }
  catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
export class Conflict extends Error {}
