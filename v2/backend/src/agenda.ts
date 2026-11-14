import { createHash } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { checkOrigin, Conflict, phone, transaction, uuid } from './commerce.js';
import { pool } from './db.js';
import { requireAdmin } from './profiles.js';

export const agendaRouter=Router();
const date=z.iso.date();
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const state=z.enum(['draft','published','blocked']);
const range=`s.starts_at >= ($1::date::timestamp AT TIME ZONE 'America/Santiago')
  AND s.starts_at < (($1::date+7)::timestamp AT TIME ZONE 'America/Santiago')`;
const publicSlot='s.id,s.starts_at,s.ends_at';
const freeSlots=`s.state='published' AND s.starts_at>now()
    AND NOT EXISTS(SELECT 1 FROM advisory_bookings b WHERE b.slot_id=s.id AND b.status='confirmed')`;
function failure(error:unknown,res:import('express').Response) {
  if (error instanceof Conflict) {res.status(409).json({error:error.message});return;}
  if ((error as {code?:string})?.code==='23P01') {res.status(409).json({error:'Ese bloque se superpone con un horario existente.'});return;}
  throw error;
}
agendaRouter.get('/advisories/availability',async(req,res)=>{
  const week=date.safeParse(req.query.week);
  if (!week.success) {res.status(400).json({error:'Indica una fecha válida.'});return;}
  const {rows:slots}=await pool.query(`SELECT ${publicSlot} FROM advisory_slots s
    WHERE ${range} AND ${freeSlots} ORDER BY s.starts_at`,[week.data]);
  const nextDay=slots.length?null:(await pool.query(`SELECT (s.starts_at AT TIME ZONE 'America/Santiago')::date::text AS day
    FROM advisory_slots s WHERE s.starts_at >= (($1::date+7)::timestamp AT TIME ZONE 'America/Santiago')
    AND ${freeSlots} ORDER BY s.starts_at LIMIT 1`,[week.data])).rows[0]?.day ?? null;
  res.set('Cache-Control','no-store').json({slots,nextDay});
});
const appointment=z.object({slotId:uuid,requestId:uuid,name:z.string().trim().min(2).max(150),phone,
  email:z.union([z.literal(''),z.email().max(254)]).optional()}).strict();
agendaRouter.post('/advisories/bookings',checkOrigin,rateLimit({windowMs:600000,limit:12,legacyHeaders:false,
  message:{error:'Demasiados intentos. Intenta nuevamente más tarde.'}}),async(req,res)=>{
  const parsed=appointment.safeParse(req.body);
  if (!parsed.success) {res.status(400).json({error:'Revisa tus datos y selecciona un horario.'});return;}
  const d=parsed.data;
  const hash=createHash('sha256').update(JSON.stringify([d.slotId,d.name,d.phone,d.email||''])).digest('hex');
  try {
    const result=await transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 1))',[d.requestId]);
      const previous=(await db.query(`SELECT b.id,b.status,b.request_hash,h.slot_id,s.starts_at,s.ends_at
        FROM advisory_bookings b JOIN advisory_booking_history h ON h.booking_id=b.id AND h.action='confirmed'
        JOIN advisory_slots s ON s.id=h.slot_id WHERE b.request_id=$1`,[d.requestId])).rows[0];
      if (previous) {
        if (previous.request_hash!==hash) throw new Conflict('Esta solicitud ya se utilizó con otros datos.');
        if (previous.status!=='confirmed') throw new Conflict('Esta reserva fue cancelada.');
        const actual=(await db.query(`SELECT b.id,s.starts_at,s.ends_at FROM advisory_bookings b JOIN advisory_slots s ON s.id=b.slot_id WHERE b.id=$1`,[previous.id])).rows[0];
        return {booking:actual,repeated:true};
      }
      const slot=(await db.query("SELECT id,starts_at,ends_at FROM advisory_slots WHERE id=$1 AND starts_at>clock_timestamp() AND state='published' FOR UPDATE",[d.slotId])).rows[0];
      if (!slot) throw new Conflict('Ese horario ya no está disponible.');
      const booking=(await db.query(`INSERT INTO advisory_bookings(slot_id,name,phone,email,request_id,request_hash)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(slot_id) WHERE status='confirmed' DO NOTHING RETURNING id`,
        [d.slotId,d.name,d.phone,d.email||null,d.requestId,hash])).rows[0];
      if (!booking) throw new Conflict('Otra persona ya reservó ese horario.');
      await db.query("INSERT INTO advisory_booking_history(booking_id,slot_id,action) VALUES($1,$2,'confirmed')",[booking.id,d.slotId]);
      return {booking:{id:booking.id,starts_at:slot.starts_at,ends_at:slot.ends_at},repeated:false};
    });
    res.set('Cache-Control','no-store').status(result.repeated?200:201).json({booking:result.booking});
  } catch(error){failure(error,res);}
});
agendaRouter.use('/admin/agenda',requireAdmin,(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
agendaRouter.get('/admin/agenda',async(req,res)=>{
  const week=date.safeParse(req.query.week);
  if (!week.success) {res.status(400).json({error:'Indica una fecha válida.'});return;}
  res.json({slots:(await pool.query(`SELECT ${publicSlot},s.state,
    (SELECT coalesce(json_agg(b ORDER BY b.created_at DESC),'[]')
      FROM (SELECT id,name,phone,email,status,created_at FROM advisory_bookings WHERE slot_id=s.id) b) AS bookings
    FROM advisory_slots s WHERE ${range} ORDER BY s.starts_at`,[week.data])).rows});
});
agendaRouter.get('/admin/agenda/bookings/:id',async(req,res)=>{
  if (!uuid.safeParse(req.params.id).success) {res.sendStatus(404);return;}
  res.json({history:(await pool.query(`SELECT h.action,h.created_at,s.starts_at FROM advisory_booking_history h
    JOIN advisory_slots s ON s.id=h.slot_id WHERE h.booking_id=$1 ORDER BY h.id`,[req.params.id])).rows});
});
const block=z.object({date,time,end:time,duration:z.number().int().min(10).max(180),publish:z.boolean().optional().default(false)}).strict();
agendaRouter.post('/admin/agenda/slots',checkOrigin,async(req,res)=>{
  const parsed=block.safeParse(req.body);
  if (!parsed.success) {res.status(400).json({error:'Revisa el día, los horarios y la duración.'});return;}
  const d=parsed.data;
  const minutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
  const size=minutes(d.end)-minutes(d.time);
  if (size<d.duration || size%d.duration) {res.status(400).json({error:'El bloque debe contener cupos completos de la duración indicada.'});return;}
  try {
    const count=await transaction(async db=>{
      const r=await db.query(`WITH walls AS (
        SELECT wall FROM generate_series($1::timestamp,$2::timestamp,$3::int*interval '1 minute') wall),
      instants AS (SELECT wall,wall AT TIME ZONE 'America/Santiago' AS instant FROM walls)
      SELECT instant, (instant AT TIME ZONE 'America/Santiago'=wall
        AND (instant-interval '1 hour') AT TIME ZONE 'America/Santiago'<>wall
        AND (instant+interval '1 hour') AT TIME ZONE 'America/Santiago'<>wall
        AND instant>clock_timestamp()) AS valid FROM instants ORDER BY wall`,[`${d.date}T${d.time}`,`${d.date}T${d.end}`,d.duration]);
      if (r.rows.some(row=>!row.valid)) throw new Conflict('El bloque incluye horarios pasados o afectados por el cambio de hora en Chile.');
      for (let i=1;i<r.rows.length;i++) {
        const start=r.rows[i-1].instant,end=r.rows[i].instant;
        if (end-start!==d.duration*60000) throw new Conflict('El bloque cruza un cambio de hora en Chile.');
        await db.query('INSERT INTO advisory_slots(starts_at,ends_at,state) VALUES($1,$2,$3)',[start,end,d.publish?'published':'draft']);
      }
      return r.rows.length-1;
    });
    res.status(201).json({count});
  } catch(error){failure(error,res);}
});
agendaRouter.post('/admin/agenda/publish',checkOrigin,async(req,res)=>{
  const week=z.object({week:date}).strict().safeParse(req.body);
  if (!week.success) {res.status(400).json({error:'Semana inválida.'});return;}
  const result=await pool.query(`UPDATE advisory_slots s SET state='published' WHERE ${range} AND s.state='draft' AND s.starts_at>clock_timestamp()`,[week.data.week]);
  res.json({count:result.rowCount});
});
agendaRouter.patch('/admin/agenda/slots/:id',checkOrigin,async(req,res)=>{
  const parsed=z.object({state}).strict().safeParse(req.body);
  if (!parsed.success||!uuid.safeParse(req.params.id).success) {res.status(400).json({error:'Cambio inválido.'});return;}
  try {
    await transaction(async db=>{
      if (!(await db.query('SELECT 1 FROM advisory_slots WHERE id=$1 AND starts_at>clock_timestamp() FOR UPDATE',[req.params.id])).rowCount) throw new Conflict('Horario no disponible para edición.');
      if ((await db.query("SELECT 1 FROM advisory_bookings WHERE slot_id=$1 AND status='confirmed'",[req.params.id])).rowCount) throw new Conflict('Cancela o reprograma la cita antes de cambiar este cupo.');
      await db.query('UPDATE advisory_slots SET state=$2 WHERE id=$1',[req.params.id,parsed.data.state]);
    });
    res.json({ok:true});
  } catch(error){failure(error,res);}
});
agendaRouter.patch('/admin/agenda/bookings/:id',checkOrigin,async(req,res)=>{
  const parsed=z.union([z.object({action:z.literal('cancel')}).strict(),z.object({action:z.literal('reschedule'),slotId:uuid}).strict()]).safeParse(req.body);
  if (!parsed.success||!uuid.safeParse(req.params.id).success) {res.status(400).json({error:'Cambio inválido.'});return;}
  const d=parsed.data;
  try {
    await transaction(async db=>{
      const booking=(await db.query("SELECT slot_id FROM advisory_bookings WHERE id=$1 AND status='confirmed' FOR UPDATE",[req.params.id])).rows[0];
      if (!booking) throw new Conflict('La reserva ya no está confirmada.');
      const destination=d.action==='reschedule'?d.slotId:booking.slot_id;
      const slots=(await db.query("SELECT id,state,starts_at>clock_timestamp() AS future FROM advisory_slots WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[[booking.slot_id,destination]])).rows;
      if (!slots.find(s=>s.id===booking.slot_id)?.future) throw new Conflict('La cita ya comenzó.');
      if (d.action==='reschedule') {
        const slot=slots.find(s=>s.id===destination);
        if (!slot?.future||slot.state!=='published'||destination===booking.slot_id||
          (await db.query("SELECT 1 FROM advisory_bookings WHERE slot_id=$1 AND status='confirmed'",[destination])).rowCount) throw new Conflict('Selecciona un cupo publicado y libre.');
        await db.query('UPDATE advisory_bookings SET slot_id=$2 WHERE id=$1',[req.params.id,destination]);
      } else await db.query("UPDATE advisory_bookings SET status='cancelled' WHERE id=$1",[req.params.id]);
      await db.query('INSERT INTO advisory_booking_history(booking_id,slot_id,action,actor_id) VALUES($1,$2,$3,$4)',
        [req.params.id,destination,d.action==='cancel'?'cancelled':'rescheduled',res.locals.userId]);
    });
    res.json({ok:true});
  } catch(error){failure(error,res);}
});
