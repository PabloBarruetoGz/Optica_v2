import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { app } from './app.js';
import { pool } from './db.js';
import { processPickup } from './whatsapp.js';

test('órdenes privadas, agenda concurrente y avisos de retiro con proveedor simulado', async () => {
  const schema='commerce_test_'+randomUUID().replaceAll('-','');
  const setup=await pool.connect();
  await setup.query(`CREATE SCHEMA ${schema}`);
  try {
    await setup.query(`SET search_path TO ${schema}`);
    for(const table of ['user','session','account','verification']) await setup.query(`CREATE TABLE "${table}" (LIKE public."${table}" INCLUDING ALL)`);
    for(const migration of ['011_orders.sql','012_advisory_agenda.sql']) await setup.query(await readFile(new URL('../migrations/'+migration,import.meta.url),'utf8'));
  } finally { setup.release(); }
  pool.options.options='-c search_path='+schema;
  const clients=await Promise.all(Array.from({length:10},()=>pool.connect()));
  await Promise.all(clients.map(c=>c.query(`SET search_path TO ${schema}`)));clients.forEach(c=>c.release());
  const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const base='http://127.0.0.1:'+address.port+'/api';
  const origin=process.env.BETTER_AUTH_URL||'http://127.0.0.1:5186';
  const send=(path:string,method='GET',body?:unknown,cookie='')=>fetch(base+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  async function user(role='client') {
    const r=await send('/auth/sign-up/email','POST',{name:'Cuenta de prueba',email:randomUUID()+'@example.com',password:randomUUID()});
    assert.equal(r.status,200);const item=(await r.json()).user;
    if(role==='admin')await pool.query('UPDATE "user" SET role=$1 WHERE id=$2',[role,item.id]);
    return {id:item.id,cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')};
  }
  try {
    const admin=await user('admin'), client=await user(), other=await user();
    const input={customerId:client.id,phone:'+56 9 1111 2222',description:'Lentes de prueba',internalNotes:'privado',whatsappConsent:true};
    assert.equal((await send('/admin/orders','POST',input,client.cookie)).status,403);
    assert.equal((await send('/admin/orders','POST',{...input,phone:'1'},admin.cookie)).status,400);
    const registration=await send('/admin/orders','POST',input,admin.cookie);
    assert.equal(registration.status,201);
    const {order}=await registration.json();
    const patch=(status:string,id=order.id)=>send('/admin/orders/'+id,'PATCH',{status},admin.cookie);
    assert.equal((await patch('ready')).status,409);
    assert.equal((await patch('preparing')).status,200);
    assert.equal((await patch('processing')).status,200);
    const ready=await Promise.all([patch('ready'),patch('ready')]);
    assert.deepEqual(ready.map(r=>r.status),[200,200]);
    const list=await send('/orders','GET',undefined,client.cookie);
    assert.equal(list.status,200);const own=(await list.json()).orders;
    assert.equal(own.length,1);assert.equal(own[0].history.length,4);
    assert.equal(own[0].status,'ready');assert.equal(own[0].internal_notes,undefined);assert.equal(own[0].phone,undefined);
    assert.deepEqual((await (await send('/orders','GET',undefined,other.cookie)).json()).orders,[]);
    assert.equal((await send('/admin/orders/'+order.id,'GET',undefined,other.cookie)).status,403);
    assert.equal((await send('/admin/orders?q='+order.number+'&page=1','GET',undefined,admin.cookie)).status,200);
    let detail=(await (await send('/admin/orders/'+order.id,'GET',undefined,admin.cookie)).json());
    assert.equal(detail.notification.recipient,'+56911112222');assert.equal(detail.notification.status,'pending');
    const noConsent=await (await send('/admin/orders','POST',{...input,whatsappConsent:false},admin.cookie)).json();
    for (const status of ['preparing','processing','ready']) assert.equal((await patch(status,noConsent.order.id)).status,200);
    assert.equal((await pool.query('SELECT status FROM pickup_notifications WHERE order_id=$1',[noConsent.order.id])).rows[0].status,'skipped');

    Object.assign(process.env,{WHATSAPP_ENABLED:'true',WHATSAPP_TOKEN:'fake',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_GRAPH_VERSION:'v27.0',WHATSAPP_TEMPLATE:'test',WHATSAPP_TEMPLATE_LANGUAGE:'es',WHATSAPP_APP_SECRET:'fake-secret'});
    let calls=0;let reject=true;
    const mock=(async (_url,options)=>{
      if(options?.method!=='POST')return Response.json({display_phone_number:'+56 9 5363 9502'});
      calls++;
      assert.equal(JSON.parse(String(options.body)).to,'56911112222');
      return reject?Response.json({}, {status:429}):Response.json({messages:[{id:'wamid.test'}]});
    }) as typeof fetch;
    await Promise.all([processPickup(mock),processPickup(mock)]);
    assert.equal(calls,1);
    await processPickup(mock);assert.equal(calls,1);
    assert.equal((await pool.query('SELECT status FROM lens_orders WHERE id=$1',[order.id])).rows[0].status,'ready');
    await pool.query("UPDATE pickup_notifications SET next_attempt=now() WHERE order_id=$1",[order.id]);
    reject=false;await processPickup(mock);await processPickup(mock);assert.equal(calls,2);
    const callback=JSON.stringify({entry:[{changes:[{value:{metadata:{phone_number_id:'123'},statuses:[{id:'wamid.test',status:'delivered'}]}}]}]});
    const hook=(signature:string)=>fetch(base+'/webhooks/whatsapp',{method:'POST',body:callback,headers:{'Content-Type':'application/json','x-hub-signature-256':signature}});
    assert.equal((await hook('invalid')).status,403);
    assert.equal((await hook('sha256='+createHmac('sha256','fake-secret').update(callback).digest('hex'))).status,200);
    detail=(await (await send('/admin/orders/'+order.id,'GET',undefined,admin.cookie)).json());
    assert.equal(detail.notification.status,'delivered');assert.equal(detail.attempts.length,2);
    assert.equal((await send('/admin/orders/'+order.id+'/retry-notification','POST',{},admin.cookie)).status,409);

    const day=(await pool.query("SELECT ((now() AT TIME ZONE 'America/Santiago')::date+14)::text AS day")).rows[0].day;
    const availability=async()=> (await (await send('/advisories/availability?week='+day)).json()).slots;
    const block={date:day,time:'10:00',end:'11:30',duration:30};
    assert.equal((await send('/admin/agenda/slots','POST',block,client.cookie)).status,403);
    assert.equal((await send('/admin/agenda/slots','POST',block,admin.cookie)).status,201);
    assert.equal((await send('/admin/agenda/slots','POST',block,admin.cookie)).status,409);
    assert.deepEqual(await availability(),[]);
    const draft=(await (await send('/admin/agenda?week='+day,'GET',undefined,admin.cookie)).json()).slots;
    const [first,second,third]=draft;
    const form={slotId:first.id,requestId:randomUUID(),name:'Reserva prueba',phone:'+56911112222'};
    assert.equal((await send('/advisories/bookings','POST',form)).status,409);
    const blockSlot=(id:string)=>send('/admin/agenda/slots/'+id,'PATCH',{state:'blocked'},admin.cookie);
    assert.equal((await blockSlot(third.id)).status,200);
    assert.equal((await send('/admin/agenda/publish','POST',{week:day},admin.cookie)).status,200);
    assert.equal((await availability()).length,2);
    assert.equal((await send('/advisories/bookings','POST',{...form,slotId:third.id})).status,409);
    const otherForm={...form,requestId:randomUUID()};
    const replies=await Promise.all([send('/advisories/bookings','POST',form),send('/advisories/bookings','POST',otherForm)]);
    assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);
    const winner=replies.findIndex(r=>r.status===201);
    const booked=(await replies[winner].json()).booking;
    assert.equal((await send('/advisories/bookings','POST',winner===0?form:otherForm)).status,200);
    assert.equal((await blockSlot(first.id)).status,409);
    assert.equal((await send('/admin/agenda/bookings/'+booked.id,'PATCH',{action:'reschedule',slotId:second.id},admin.cookie)).status,200);
    assert.equal((await availability())[0].id,first.id);
    assert.equal((await send('/admin/agenda/bookings/'+booked.id,'PATCH',{action:'cancel'},admin.cookie)).status,200);
    assert.equal((await availability()).length,2);
    const history=(await (await send('/admin/agenda/bookings/'+booked.id,'GET',undefined,admin.cookie)).json()).history;
    assert.deepEqual(history.map((h:{action:string})=>h.action),['confirmed','rescheduled','cancelled']);
    const dst=(await pool.query(`SELECT d::date::text AS day FROM generate_series(current_date+1,current_date+400,interval '1 day') d
      WHERE (d::timestamp AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago' <> d::timestamp
      ORDER BY d LIMIT 1`)).rows[0];
    assert.ok(dst);
    assert.equal((await send('/admin/agenda/slots','POST',{date:dst.day,time:'00:00',end:'01:30',duration:30},admin.cookie)).status,409);
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();
  }
});
