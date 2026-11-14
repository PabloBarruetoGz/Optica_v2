import { Router } from 'express';
import { z } from 'zod';
import { checkOrigin, Conflict, phone, session, transaction, uuid } from './commerce.js';
import { pool } from './db.js';
import { requireAdmin } from './profiles.js';
import { whatsappSettings } from './whatsapp.js';

export const ordersRouter = Router();
const fields = z.object({
  phone, whatsappConsent: z.boolean().default(false), description: z.string().trim().min(2).max(300),
  lensType: z.string().trim().max(120).default(''), frame: z.string().trim().max(120).default(''),
  internalNotes: z.string().trim().max(1000).default(''),
}).strict();
const create = fields.extend({ customerId: z.string().min(1).max(100) });
const patch = z.union([fields, z.object({ status: z.string().regex(/^[a-z_]{1,32}$/) }).strict()]);
const visible = 'id, number, description, lens_type, frame, status, available_at, created_at, updated_at';

ordersRouter.get('/orders', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const identity = await session(req);
  if (!identity) { res.status(401).json({ error: 'Debes iniciar sesión.' }); return; }
  const { rows } = await pool.query(`SELECT ${visible}, (SELECT coalesce(json_agg(h ORDER BY h.id),'[]')
    FROM (SELECT id,status,created_at FROM lens_order_history WHERE order_id=o.id AND kind='status') h) AS history
    FROM lens_orders o WHERE customer_id=$1 ORDER BY number DESC LIMIT 100`, [identity.user.id]);
  res.json({ orders: rows, statuses: (await pool.query('SELECT * FROM lens_order_status ORDER BY position')).rows });
});
ordersRouter.use('/admin/orders', requireAdmin, (_req, res, next) => { res.set('Cache-Control','no-store'); next(); });
ordersRouter.get('/admin/orders/customers', async (req, res) => {
  const term = String(req.query.q || '').trim().slice(0,100);
  if (term.length < 2) { res.json({ customers: [] }); return; }
  res.json({ customers: (await pool.query(`SELECT id,name,email FROM "user" WHERE role='client'
    AND strpos(lower(name || ' ' || email),lower($1))>0 ORDER BY name,id LIMIT 25`, [term])).rows });
});
ordersRouter.get('/admin/orders', async (req, res) => {
  const filter = z.object({ q: z.string().max(100).default(''), status: z.string().max(32).default(''),
    from: z.iso.date().optional(), to: z.iso.date().optional(), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict().safeParse(req.query);
  if (!filter.success || (filter.data.from && filter.data.to && filter.data.from > filter.data.to)) { res.status(400).json({ error:'Filtros inválidos.' }); return; }
  const { q,status,from,to,page } = filter.data;
  const orders = await pool.query(`SELECT id,number,customer_name,status,created_at FROM lens_orders
    WHERE ($1='' OR strpos(lower(customer_name),lower($1))>0 OR number::text=$1)
    AND ($2='' OR status=$2)
    AND ($3::date IS NULL OR created_at >= ($3::date::timestamp AT TIME ZONE 'America/Santiago'))
    AND ($4::date IS NULL OR created_at < (($4::date+1)::timestamp AT TIME ZONE 'America/Santiago'))
    ORDER BY number DESC LIMIT 51 OFFSET $5`, [q,status,from??null,to??null,(page-1)*50]);
  const [statuses, transitions, counts] = await Promise.all([
    pool.query('SELECT * FROM lens_order_status ORDER BY position'),pool.query('SELECT source,target FROM lens_order_transition'),
    pool.query('SELECT status,count(*)::int AS total FROM lens_orders GROUP BY status'),
  ]);
  res.json({ orders:orders.rows.slice(0,50), more:orders.rows.length>50, statuses:statuses.rows, transitions:transitions.rows, counts:counts.rows });
});
ordersRouter.get('/admin/orders/:id', async (req,res) => {
  if (!uuid.safeParse(req.params.id).success) { res.status(404).json({ error:'Orden no encontrada.' }); return; }
  const [order,history,notification,attempts] = await Promise.all([
    pool.query('SELECT * FROM lens_orders WHERE id=$1',[req.params.id]),
    pool.query('SELECT id,status,kind,actor_id,created_at FROM lens_order_history WHERE order_id=$1 ORDER BY id',[req.params.id]),
    pool.query('SELECT recipient,status,attempts,error_code,updated_at,(provider_id IS NULL) AS retryable FROM pickup_notifications WHERE order_id=$1',[req.params.id]),
    pool.query(`SELECT a.attempt,a.outcome,a.code,a.recorded_at FROM pickup_notification_attempts a
      JOIN pickup_notifications n ON n.id=a.notification_id WHERE n.order_id=$1 ORDER BY a.attempt`,[req.params.id]),
  ]);
  if (!order.rowCount) { res.status(404).json({error:'Orden no encontrada.'}); return; }
  res.json({ order:order.rows[0], history:history.rows, notification:notification.rows[0] || null, attempts:attempts.rows, whatsappConfigured:Boolean(whatsappSettings()) });
});
ordersRouter.post('/admin/orders', checkOrigin, async (req,res) => {
  const parsed = create.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({error:'Revisa los datos de la orden y el teléfono chileno.'}); return; }
  const d=parsed.data;
  const order = await transaction(async db => {
    const r=await db.query(`INSERT INTO lens_orders(customer_id,customer_name,phone,description,lens_type,frame,internal_notes,whatsapp_consent)
      SELECT id,name,$2,$3,$4,$5,$6,$7 FROM "user" WHERE id=$1 AND role='client' RETURNING id,number`,
      [d.customerId,d.phone,d.description,d.lensType,d.frame,d.internalNotes,d.whatsappConsent]);
    if (!r.rowCount) return null;
    await db.query("INSERT INTO lens_order_history(order_id,actor_id,status,kind) VALUES($1,$2,'registered','status')",[r.rows[0].id,res.locals.userId]);
    return r.rows[0];
  });
  if (!order) { res.status(400).json({error:'Selecciona un cliente registrado.'}); return; }
  res.status(201).json({ order });
});
ordersRouter.patch('/admin/orders/:id', checkOrigin, async (req,res) => {
  const parsed=patch.safeParse(req.body);
  if (!parsed.success || !uuid.safeParse(req.params.id).success) { res.status(400).json({error:'Actualización inválida.'}); return; }
  const d=parsed.data, id=req.params.id;
  try {
    const order=await transaction(async db=>{
      const current=(await db.query('SELECT status,phone,whatsapp_consent FROM lens_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!current) return null;
      if ('status' in d) {
        if (current.status===d.status) return { id };
        if (!(await db.query('SELECT 1 FROM lens_order_transition WHERE source=$1 AND target=$2',[current.status,d.status])).rowCount) throw new Conflict('Ese cambio de estado no está permitido.');
        await db.query(`UPDATE lens_orders SET status=$2, updated_at=now(),
          available_at=CASE WHEN $2='ready' THEN now() ELSE available_at END WHERE id=$1`,[id,d.status]);
        if (d.status==='ready') await db.query('INSERT INTO pickup_notifications(order_id,recipient,status,error_code) VALUES($1,$2,$3,$4) ON CONFLICT(order_id) DO NOTHING',[id,current.phone,current.whatsapp_consent ? 'pending' : 'skipped',current.whatsapp_consent ? null : 'sin_consentimiento']);
        if (d.status==='cancelled' || d.status==='delivered') await db.query("UPDATE pickup_notifications SET status='cancelled',updated_at=now() WHERE order_id=$1 AND status='pending'",[id]);
        await db.query("INSERT INTO lens_order_history(order_id,actor_id,status,kind) VALUES($1,$2,$3,'status')",[id,res.locals.userId,d.status]);
      } else {
        if (['delivered','cancelled'].includes(current.status)) throw new Conflict('La orden está cerrada.');
        const edited=await db.query(`UPDATE lens_orders SET phone=$2,description=$3,lens_type=$4,frame=$5,internal_notes=$6,whatsapp_consent=$7,updated_at=now()
         WHERE id=$1 AND (phone,description,lens_type,frame,internal_notes,whatsapp_consent) IS DISTINCT FROM ($2,$3,$4,$5,$6,$7)`,[id,d.phone,d.description,d.lensType,d.frame,d.internalNotes,d.whatsappConsent]);
        if (edited.rowCount) await db.query(`UPDATE pickup_notifications SET recipient=$2,
          status=CASE WHEN $3 THEN 'pending' ELSE 'skipped' END,
          error_code=CASE WHEN $3 THEN NULL ELSE 'sin_consentimiento' END,updated_at=now()
          WHERE order_id=$1 AND status IN ('pending','skipped')`,[id,d.phone,d.whatsappConsent]);
        if (edited.rowCount) await db.query("INSERT INTO lens_order_history(order_id,actor_id,status,kind) VALUES($1,$2,$3,'edit')",[id,res.locals.userId,current.status]);
      }
      return { id };
    });
    if (!order) {res.status(404).json({error:'Orden no encontrada.'});return;}
    res.json({order});
  } catch(error) { if (!(error instanceof Conflict)) throw error; res.status(409).json({error:error.message}); }
});
ordersRouter.post('/admin/orders/:id/retry-notification',checkOrigin,async(req,res)=>{
  if (!uuid.safeParse(req.params.id).success) {res.status(404).json({error:'Orden no encontrada.'});return;}
  if (!whatsappSettings()) {res.status(409).json({error:'Configura WhatsApp antes de reintentar.'});return;}
  // Only rejections with no provider message ID are safe to retry.
  const result=await transaction(async db=>{
    await db.query('SELECT id FROM lens_orders WHERE id=$1 FOR UPDATE',[req.params.id]);
    return db.query(`UPDATE pickup_notifications n SET status='pending',recipient=o.phone,
      error_code=NULL,next_attempt=now(),updated_at=now()
      FROM lens_orders o WHERE o.id=$1 AND n.order_id=o.id AND o.status='ready' AND o.whatsapp_consent
      AND n.status IN ('failed','skipped') AND n.provider_id IS NULL AND n.attempts<5`,[req.params.id]);
  });
  if (!result.rowCount) {res.status(409).json({error:'Este aviso no se puede reenviar sin riesgo de duplicarlo o no tiene consentimiento.'});return;}
  res.json({ok:true});
});
