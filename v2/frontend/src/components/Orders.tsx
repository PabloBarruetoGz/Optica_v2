import { useState, type FormEvent } from 'react';
import { formatDate, formText, request, useResource } from '../lib/commerce';
import './commerce.css';

type Status={code:string;label:string;position:number};
type History={id:number;status:string;kind?:string;created_at:string};
type Order={id:string;number:string;status:string;description:string;customer_name:string;phone:string;whatsapp_consent:boolean;lens_type:string;frame:string;internal_notes:string;created_at:string;updated_at:string;available_at:string|null;history?:History[]};
type Summary={orders:Order[];statuses:Status[];transitions:{source:string;target:string}[];counts:{status:string;total:number}[];more:boolean};
type Detail={whatsappConfigured:boolean;order:Order;history:History[];notification:{retryable:boolean;status:string;recipient:string;attempts:number;error_code:string|null;updated_at:string}|null;attempts:{attempt:number;outcome:string;code:string|null;recorded_at:string}[]};
const notice:Record<string,string>={pending:'Pendiente',sending:'Enviando',sent:'Aceptado por WhatsApp',delivered:'Entregado',failed:'Fallido',uncertain:'Sin confirmación; revisar antes de reenviar',cancelled:'Cancelado',skipped:'No enviado: sin consentimiento'};
const label=(statuses:Status[],code:string)=>statuses.find(s=>s.code===code)?.label||code;
function OrderFields({order}:{order?:Order}){
  return <div className="commerce-grid">
    <label>Teléfono del cliente<input name="phone" type="tel" placeholder="+56 9 1234 5678" defaultValue={order?.phone} required maxLength={25}/></label>
    <label>Descripción del pedido<input name="description" defaultValue={order?.description} required minLength={2} maxLength={300}/></label>
    <label>Tipo de lente<input name="lensType" defaultValue={order?.lens_type} maxLength={120}/></label>
    <label>Montura o modelo<input name="frame" defaultValue={order?.frame} maxLength={120}/></label>
    <label>Observaciones internas<textarea name="internalNotes" defaultValue={order?.internal_notes} maxLength={1000}/></label>
    <label className="commerce-check"><input name="consent" type="checkbox" defaultChecked={order?.whatsapp_consent}/>El cliente autorizó recibir avisos de este pedido por WhatsApp.</label>
  </div>;
}
function fields(form:HTMLFormElement){
  const d=new FormData(form);
  return {phone:formText(d,'phone'),description:formText(d,'description'),lensType:formText(d,'lensType'),frame:formText(d,'frame'),internalNotes:formText(d,'internalNotes'),whatsappConsent:d.has('consent')};
}
export function OrdersManager(){
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const [customerQuery,setCustomerQuery]=useState('');
  const [selected,setSelected]=useState('');
  const [version,refresh]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [creation,setCreation]=useState(false);
  const listing=useResource<Summary>('/admin/orders?'+(query?query+'&':'')+'page='+page,version);
  const customers=useResource<{customers:{id:string;name:string;email:string}[]}>(customerQuery.length>=2?'/admin/orders/customers?q='+encodeURIComponent(customerQuery):'');
  const details=useResource<Detail>(selected?'/admin/orders/'+selected:'',version);
  const statuses=listing?.data?.statuses||[];
  async function act(action:()=>Promise<void>){
    if(busy)return;setBusy(true);setError('');
    try{await action();refresh(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function add(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const form=e.currentTarget;const values={...fields(form),customerId:formText(new FormData(form),'customerId')};
    void act(async()=>{const result=await request<{order:{id:string}}>('/admin/orders','POST',values);setCreation(false);setSelected(result.order.id);});
  }
  const d=details?.data;
  return <div className="commerce-panel">
    <h3>Órdenes de compra</h3>
    {error&&<p role="alert">{error}</p>}
    <div className="commerce-actions"><button type="button" disabled={busy} onClick={()=>{setCreation(!creation);setSelected('');}}> {creation?'Cerrar formulario':'Nueva orden'}</button><button type="button" disabled={busy} onClick={()=>refresh(v=>v+1)}>Actualizar</button></div>
    {creation&&<form onSubmit={e=>{e.preventDefault();setCustomerQuery(formText(new FormData(e.currentTarget),'customer'));}}>
      <label>Buscar cliente por nombre o correo<input name="customer" required minLength={2} maxLength={100}/></label><button type="submit">Buscar cliente</button>
    </form>}
    {creation&&customerQuery&&<form onSubmit={add}><fieldset disabled={busy}>
      {customers?.error&&<p role="alert">{customers.error}</p>}
      <label>Cliente registrado<select name="customerId" required><option value="">Selecciona un cliente</option>{customers?.data?.customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.email}</option>)}</select></label>
      {customers?.data?.customers.length===0&&<p>No se encontraron clientes.</p>}
      <OrderFields/><button disabled={!customers?.data?.customers.length}>Registrar orden</button>
    </fieldset></form>}
    {!creation&&d&&<section className="account-card" aria-label="Detalle de la orden">
      <h4>Orden N.º {d.order.number} · {d.order.customer_name}</h4>
      <p>{label(statuses,d.order.status)} · {formatDate(d.order.created_at)}</p>
      <form key={d.order.id+':'+d.order.updated_at} onSubmit={e=>{e.preventDefault();const values=fields(e.currentTarget);void act(async()=>{await request('/admin/orders/'+selected,'PATCH',values);});}}>
        <fieldset disabled={busy||['delivered','cancelled'].includes(d.order.status)}><OrderFields order={d.order}/><button>Guardar datos</button></fieldset>
      </form>
      <form key={d.order.status} onSubmit={e=>{e.preventDefault();const status=formText(new FormData(e.currentTarget),'status');if(!status||!confirm('¿Confirmas el cambio a «'+label(statuses,status)+'»?'))return;void act(async()=>{await request('/admin/orders/'+selected,'PATCH',{status});});}}>
        {listing?.data?.transitions.some(t=>t.source===d.order.status)&&<><label>Cambiar estado<select name="status" required><option value="">Selecciona el nuevo estado</option>{listing.data.transitions.filter(t=>t.source===d.order.status).map(t=><option key={t.target} value={t.target}>{label(statuses,t.target)}</option>)}</select></label><button disabled={busy}>Confirmar cambio</button></>}
      </form>
      {d.notification&&<><h4>Aviso de retiro</h4>{!d.whatsappConfigured&&<p>Envío automático desactivado: falta configurar WhatsApp Business.</p>}<p>{notice[d.notification.status]} · {d.notification.recipient} · {d.notification.attempts} intento(s)</p>{d.notification.error_code&&<p>Resultado: {d.notification.error_code}</p>}
        {d.whatsappConfigured&&d.order.status==='ready'&&d.order.whatsapp_consent&&d.notification.status==='failed'&&d.notification.retryable&&d.notification.attempts<5&&<button type="button" disabled={busy} onClick={()=>{if(confirm('¿Reintentar el aviso rechazado?'))void act(async()=>{await request('/admin/orders/'+selected+'/retry-notification','POST');});}}>Reintentar aviso</button>}<ul>{d.attempts.map(a=><li key={a.attempt}>{formatDate(a.recorded_at)} · {notice[a.outcome]}{a.code?' · '+a.code:''}</li>)}</ul></>}
      <h4>Historial</h4><ul>{d.history.map(h=><li key={h.id}>{formatDate(h.created_at)} · {h.kind==='edit'?'Datos actualizados':label(statuses,h.status)}</li>)}</ul>
    </section>}
    {details?.error&&<p role="alert">{details.error}</p>}
    <form onSubmit={e=>{e.preventDefault();const params=new URLSearchParams();for(const [k,v] of new FormData(e.currentTarget))if(String(v).trim())params.set(k,String(v).trim());setQuery(params.toString());setPage(1);}}>
      <div className="commerce-grid"><label>Buscar orden o cliente<input name="q" maxLength={100}/></label><label>Estado<select name="status"><option value="">Todos</option>{statuses.map(s=><option key={s.code} value={s.code}>{s.label}</option>)}</select></label><label>Desde<input name="from" type="date"/></label><label>Hasta<input name="to" type="date"/></label></div><button>Aplicar filtros</button>
    </form>
    {listing?.error?<p role="alert">{listing.error}</p>:!listing?.data?<p role="status">Cargando órdenes…</p>:<>
      <p>{statuses.filter(s=>['registered','preparing','processing','ready'].includes(s.code)).map(s=>s.label+': '+(listing.data?.counts.find(c=>c.status===s.code)?.total||0)).join(' · ')}</p>
      <div className="account-table"><table><thead><tr><th>Orden</th><th>Cliente</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{listing.data.orders.map(o=><tr key={o.id}><td><button className="account-link" onClick={()=>{setCreation(false);setSelected(o.id);}}>Ver N.º {o.number}</button></td><td>{o.customer_name}</td><td>{label(statuses,o.status)}</td><td>{formatDate(o.created_at)}</td></tr>)}</tbody></table></div>
      {listing.data.orders.length===0&&<p>No hay órdenes para estos filtros.</p>}
      <div className="commerce-actions"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page}</span><button type="button" disabled={!listing.data.more} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div>
    </>}
  </div>;
}
export function MyOrders(){
  const [version,refresh]=useState(0);
  const result=useResource<Summary>('/orders',version);
  return <section className="account-card commerce-panel" aria-label="Mis lentes"><h2>Mis lentes</h2>
    {result?.error?<><p role="alert">{result.error}</p><button onClick={()=>refresh(v=>v+1)}>Reintentar</button></>:!result?.data?<p role="status">Cargando tus órdenes…</p>:result.data.orders.length===0?<p>Aún no tienes órdenes de lentes.</p>:result.data.orders.map(o=><details key={o.id} className="account-inquiry"><summary>Orden N.º {o.number} · {label(result.data!.statuses,o.status)}</summary>
      <p>{o.description}{o.lens_type?' · '+o.lens_type:''}{o.frame?' · '+o.frame:''}</p><p>Registrada: {formatDate(o.created_at)}</p>{o.status==='ready'&&o.available_at&&<p>Disponible desde: {formatDate(o.available_at)}</p>}
      <ol className="commerce-timeline">{result.data!.statuses.filter(s=>s.code!=='cancelled'||o.status==='cancelled').map(s=>{const h=o.history?.find(h=>h.status===s.code);return <li key={s.code} aria-current={o.status===s.code?'step':undefined}><strong>{s.label}</strong> · {o.status===s.code?'Actual':h?'Completado':o.status==='cancelled'?'No realizado':'Pendiente'}{h?' · '+formatDate(h.created_at):''}</li>;})}</ol>
    </details>)}
  </section>;
}
