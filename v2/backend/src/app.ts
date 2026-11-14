import { agendaRouter } from './agenda.js';
import { ordersRouter } from './orders.js';
import { whatsappRouter } from './whatsapp.js';
import { instagramRouter } from './instagram.js';
import { carouselsRouter } from './carousels.js';
import { toNodeHandler } from 'better-auth/node';
import { auth, googleEnabled } from './auth.js';
import { profilesRouter } from './profiles.js';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pool } from './db.js';
import { inquirySchema } from './schema.js';
export const app = express();
app.disable('x-powered-by');
app.use(helmet());
// Use the socket/Express address, never an untrusted incoming IP header.
app.use('/api/auth', (req, _res, next) => { req.headers['x-real-ip'] = req.ip || req.socket.remoteAddress || '127.0.0.1'; next(); });
app.all('/api/auth/*splat', toNodeHandler(auth));
app.use('/api', whatsappRouter);
app.use(express.json({ limit: '32kb' }));
app.get('/api/auth-options', (_req, res) => { res.set('Cache-Control', 'no-store').json({ google: googleEnabled }); });
app.use('/api', carouselsRouter);
app.use('/api', instagramRouter);
app.use('/api', ordersRouter);
app.use('/api', agendaRouter);
app.use('/api', profilesRouter);
app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch { res.status(503).json({ status: 'error', database: 'unavailable' }); }
});
app.post('/api/inquiries', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiados envíos. Intenta más tarde.' } }), async (req, res) => {
  const parsed = inquirySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Revisa los campos del formulario.', fields: parsed.error.flatten().fieldErrors }); return; }
  const d = parsed.data;
  const corporate = d.kind === 'Operativo empresarial';
  try {
    const result = await pool.query(`INSERT INTO inquiries (kind, name, email, phone, service, company, employees, appointment_date, appointment_time, address, message)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [d.kind, d.name, d.email, d.phone, d.service, corporate ? d.company : null, corporate ? d.employees : null, corporate ? d.appointmentDate : null, corporate ? d.appointmentTime : null, corporate ? d.address : null, d.message]);
    res.status(201).json({ id: result.rows[0].id, message: 'Recibimos tu consulta. Te contactaremos pronto.' });
  } catch (error) { console.error('No se pudo guardar la consulta:', error instanceof Error ? error.message : 'Error'); res.status(503).json({ error: 'No pudimos guardar tu consulta. Intenta nuevamente más tarde.' }); }
});
app.use('/api', (_req, res) => { res.status(404).json({ error: 'Ruta no encontrada.' }); });
app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({ error: status === 413 ? 'Solicitud demasiado grande.' : status >= 500 ? 'No pudimos completar la solicitud. Intenta nuevamente.' : 'Solicitud inválida.' });
});
