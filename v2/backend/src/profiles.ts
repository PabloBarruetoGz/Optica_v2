import { Router, type Request, type Response, type NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';
import { auth } from './auth.js';
import { pool } from './db.js';
export const profilesRouter = Router();
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) { res.status(401).json({ error: 'Debes iniciar sesión.' }); return; }
  if (session.user.role !== 'admin') { res.status(403).json({ error: 'Se requiere el perfil Administrador.' }); return; }
  res.locals.userId = session.user.id;
  next();
}
profilesRouter.get('/me', async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) { res.status(401).json({ error: 'Debes iniciar sesión.' }); return; }
  const profile = await pool.query('SELECT code, name, description FROM profiles WHERE code = $1', [session.user.role]);
  res.json({ user: { id: session.user.id, name: session.user.name, email: session.user.email, role: session.user.role }, profile: profile.rows[0] });
});
profilesRouter.use('/admin', requireAdmin);
profilesRouter.get('/admin/profiles', async (_req, res) => {
  res.json({ profiles: (await pool.query('SELECT code, name, description FROM profiles ORDER BY code')).rows });
});
profilesRouter.get('/admin/users', async (_req, res) => {
  // Return only profile data; never password hashes, session tokens or account credentials.
  const result = await pool.query('SELECT id, name, email, role, "createdAt" AS created_at FROM "user" ORDER BY "createdAt" DESC LIMIT 100');
  res.json({ users: result.rows });
});
profilesRouter.get('/admin/inquiries', async (_req, res) => {
  const result = await pool.query('SELECT id, kind, name, email, phone, service, company, employees, appointment_date, appointment_time, address, message, created_at FROM inquiries ORDER BY created_at DESC LIMIT 100');
  res.json({ inquiries: result.rows });
});
profilesRouter.patch('/admin/users/:id/role', async (req, res) => {
  const allowedOrigins = await auth.options.trustedOrigins;
  const origin = req.get('origin');
  if (!origin || !Array.isArray(allowedOrigins) || !allowedOrigins.includes(origin)) {
    res.status(403).json({ error: 'Origen no autorizado.' }); return;
  }
  const body = z.object({ role: z.enum(['admin', 'client']) }).strict().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'Solo existen los perfiles Administrador y Cliente.' }); return; }
  if (req.params.id === res.locals.userId) { res.status(409).json({ error: 'No puedes modificar tu propio perfil de acceso.' }); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize role changes so concurrent demotions cannot remove every admin.
    await client.query('LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE');
    const acting = await client.query('SELECT role FROM "user" WHERE id = $1', [res.locals.userId]);
    if (acting.rows[0]?.role !== 'admin') { await client.query('ROLLBACK'); res.status(403).json({ error: 'Se requiere el perfil Administrador.' }); return; }
    const target = await client.query('SELECT role FROM "user" WHERE id = $1', [req.params.id]);
    if (!target.rowCount) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Usuario no encontrado.' }); return; }
    if (target.rows[0].role === 'admin' && body.data.role === 'client') {
      const count = await client.query('SELECT count(*)::int AS total FROM "user" WHERE role = $1', ['admin']);
      if (count.rows[0].total <= 1) { await client.query('ROLLBACK'); res.status(409).json({ error: 'Debe existir al menos un administrador.' }); return; }
    }
    const result = await client.query('UPDATE "user" SET role = $1, "updatedAt" = now() WHERE id = $2 RETURNING id, name, email, role', [body.data.role, req.params.id]);
    // Invalidate other sessions immediately when access rights change.
    await client.query('DELETE FROM session WHERE "userId" = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ user: result.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});
