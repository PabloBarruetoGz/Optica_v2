import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router, raw } from 'express';
import { pool } from './db.js';
import { transaction } from './commerce.js';

const sender = '56953639502';
export function whatsappSettings() {
  const { WHATSAPP_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: id, WHATSAPP_GRAPH_VERSION: version,
    WHATSAPP_TEMPLATE: template, WHATSAPP_TEMPLATE_LANGUAGE: language } = process.env;
  return process.env.WHATSAPP_ENABLED === 'true' && token && id && /^\d+$/.test(id) && version && /^v\d+\.\d+$/.test(version) && template && language
    ? { token,id,version,template,language } : null;
}
type Job = { id: string; recipient: string; attempts: number; number: string };
export async function processPickup(send: typeof fetch = fetch) {
  const config = whatsappSettings();
  if (!config) return;
  // Expired claims may have reached Meta; never automatically resend them.
  await pool.query("UPDATE pickup_notifications SET status='uncertain',error_code='claim_expired',updated_at=now() WHERE status='sending' AND updated_at < now()-interval '5 minutes'");
  const job = await transaction(async db => (await db.query<Job>(`WITH candidate AS (
    SELECT n.id,o.number FROM pickup_notifications n JOIN lens_orders o ON o.id=n.order_id
    WHERE n.status='pending' AND n.next_attempt<=now() AND o.status='ready' AND o.whatsapp_consent
    ORDER BY n.next_attempt LIMIT 1 FOR UPDATE OF n SKIP LOCKED)
    UPDATE pickup_notifications n SET status='sending',attempts=attempts+1,updated_at=now()
    FROM candidate c WHERE n.id=c.id RETURNING n.id,n.recipient,n.attempts,c.number`)).rows[0]);
  if (!job) return;
  let status = 'uncertain', code: string | null = null, providerId: string | null = null;
  try {
    if (!/^\+56[2-9]\d{8}$/.test(job.recipient) || job.recipient.slice(1)===sender) {
      status='failed'; code='invalid_recipient';
    } else {
      const base = `https://graph.facebook.com/${config.version}/${config.id}`;
      const headers = { Authorization: `Bearer ${config.token}` };
      const check = await send(`${base}?fields=display_phone_number`,{headers,signal:AbortSignal.timeout(8000)});
      const profile = check.ok ? await check.json() : null;
      if (String(profile?.display_phone_number || '').replace(/\D/g,'') !== sender) {
        status='failed'; code='sender_unverified';
      } else {
        const response=await send(`${base}/messages`,{ method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
          headers:{...headers,'Content-Type':'application/json'},
          body:JSON.stringify({ messaging_product:'whatsapp',to:job.recipient.slice(1),type:'template',
            biz_opaque_callback_data:job.id,
            template:{name:config.template,language:{code:config.language},components:[{type:'body',parameters:[{type:'text',text:job.number}]}]} }) });
        const body=await response.json().catch(()=>null);
        if (response.ok && typeof body?.messages?.[0]?.id==='string') { status='sent'; providerId=body.messages[0].id; }
        else if (response.status===429) { status=job.attempts<3?'pending':'failed'; code='http_429'; }
        else if (response.status>=400 && response.status<500 && response.status!==408) {status='failed';code='http_'+response.status;}
        else { code='unconfirmed_response'; }
      }
    }
  } catch { code='network_or_timeout'; }
  await transaction(async db=>{
    await db.query('INSERT INTO pickup_notification_attempts(notification_id,attempt,outcome,code) VALUES($1,$2,$3,$4)',[job.id,job.attempts,status,code]);
    await db.query(`UPDATE pickup_notifications SET status=$2,error_code=$3,provider_id=$4,
      next_attempt=now()+($5::integer * interval '1 minute'),updated_at=now()
      WHERE id=$1 AND status='sending'`,[job.id,status,code,providerId,2**job.attempts]);
  });
}
export const whatsappRouter=Router();
whatsappRouter.get('/webhooks/whatsapp',(req,res)=>{
  const token=process.env.WHATSAPP_VERIFY_TOKEN;
  if (!token || req.query['hub.verify_token']!==token || req.query['hub.mode']!=='subscribe' || typeof req.query['hub.challenge']!=='string') {res.sendStatus(403);return;}
  res.type('text/plain').send(req.query['hub.challenge']);
});
whatsappRouter.post('/webhooks/whatsapp',raw({type:'application/json',limit:'128kb'}),async(req,res)=>{
  const secret=process.env.WHATSAPP_APP_SECRET;
  if (!secret || !Buffer.isBuffer(req.body)) {res.sendStatus(403);return;}
  const expected=Buffer.from('sha256='+createHmac('sha256',secret).update(req.body).digest('hex'));
  const provided=Buffer.from(req.get('x-hub-signature-256') || '');
  if (provided.length!==expected.length || !timingSafeEqual(provided,expected)) {res.sendStatus(403);return;}
  let body;
  try {body=JSON.parse(req.body.toString());} catch {res.sendStatus(400);return;}
  for (const entry of (Array.isArray(body?.entry)?body.entry:[])) for (const change of (Array.isArray(entry?.changes)?entry.changes:[])) {
    if (change?.value?.metadata?.phone_number_id!==process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
    for (const item of (Array.isArray(change.value.statuses)?change.value.statuses:[])) {
      if (typeof item?.id!=='string') continue;
      const status=item.status==='read'?'delivered':item.status;
      if (!['sent','delivered','failed'].includes(status)) continue;
      await pool.query(`UPDATE pickup_notifications SET status=$2,provider_id=coalesce(provider_id,$1),
        error_code=CASE WHEN $2='failed' THEN 'meta_delivery_failed' ELSE NULL END,updated_at=now()
        WHERE (provider_id=$1 OR (id::text=$3 AND provider_id IS NULL))
          AND (status IN ('sending','uncertain','sent') OR ($2='delivered' AND status='failed'))`,
        [item.id,status,typeof item.biz_opaque_callback_data==='string'?item.biz_opaque_callback_data:null]);
    }
  }
  res.sendStatus(200);
});
