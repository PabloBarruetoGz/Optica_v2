import { useRef, useState, type FormEvent } from 'react';
import { addDays, formatDate, formatHours, formText, localDay, request, today, useResource, weekOf } from '../lib/commerce';
import './commerce.css';

type Slot={id:string;starts_at:string;ends_at:string};
type Booking={id:string;name:string;phone:string;email:string|null;status:'confirmed'|'cancelled'};
type ManagedSlot=Slot&{state:'draft'|'published'|'blocked';bookings:Booking[]};
type History={action:string;created_at:string;starts_at:string};
const weekdays=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
function WeekPicker({week,change,past=false}:{week:string;change:(week:string)=>void;past?:boolean}){
  return <div className="commerce-actions">
    <button type="button" disabled={!past&&week<=weekOf(today())} onClick={()=>change(addDays(week,-7))}>Semana anterior</button>
    <label>Semana del <input type="date" value={week} min={past?undefined:weekOf(today())}
      onChange={e=>{if(e.target.value)change(weekOf(e.target.value));}}/></label>
    <button type="button" onClick={()=>change(addDays(week,7))}>Semana siguiente</button>
  </div>;
}
export function AdvisoryBooking({customer}:{customer?:{name:string;email:string}}={}){
  const [week,setWeek]=useState(()=>weekOf(today()));
  const [version,refresh]=useState(0);
  const [selected,select]=useState<Slot>();
  const [draft,setDraft]=useState<{slotId:string;requestId:string;name:string;phone:string;email:string}>();
  const [saved,setSaved]=useState<Slot>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const sending=useRef(false);
  const [day,setDay]=useState('');
  const result=useResource<{slots:Slot[];nextDay:string|null}>('/advisories/availability?week='+week,version);
  const days=Array.from(new Set(result?.data?.slots.map(s=>localDay(s.starts_at))));
  const activeDay=days.includes(day)?day:days[0];
  function changeWeek(w:string){if(!busy){setWeek(w);setDay('');select(undefined);setDraft(undefined);setError('');}}
  function review(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!selected)return;
    const d=new FormData(e.currentTarget);
    setDraft({slotId:selected.id,requestId:crypto.randomUUID(),name:formText(d,'name'),phone:formText(d,'phone'),email:formText(d,'email')});setError('');
  }
  async function book(){
    if(!draft||sending.current)return;
    sending.current=true;setBusy(true);setError('');
    try{const r=await request<{booking:Slot}>('/advisories/bookings','POST',draft);setSaved(r.booking);setDraft(undefined);refresh(n=>n+1);}
    catch(error){setError((error as Error).message);}
    finally{sending.current=false;setBusy(false);}
  }
  return <section id="agenda-asesoria" className="commerce-booking commerce-panel" aria-labelledby="advisory-title">
    <h2 id="advisory-title">Agenda tu asesoría de imagen</h2>
    <p>Elige un horario disponible. Todas las horas corresponden a Chile continental.</p>
    {saved?<div role="status" className="commerce-confirmation"><h3>Reserva confirmada</h3><p>{formatDate(saved.starts_at)} a {formatHours(saved.ends_at)}</p><p>Código: <strong>{saved.id}</strong></p><button type="button" onClick={()=>{setSaved(undefined);select(undefined);}}>Hacer otra reserva</button></div>:<>
    <WeekPicker week={week} change={changeWeek}/>
    {result?.error?<><p role="alert">{result.error}</p><button type="button" onClick={()=>refresh(v=>v+1)}>Reintentar</button></>:!result?.data?<p role="status">Cargando horarios…</p>:result.data.slots.length===0?<div className="commerce-confirmation"><p>No quedan horas disponibles esta semana.</p>{result.data.nextDay&&<button type="button" onClick={()=>changeWeek(weekOf(result.data!.nextDay!))}>Ver próxima disponibilidad · {dayLabel(result.data.nextDay)}</button>}</div>:
      <><h3>1. Elige un día</h3><div className="commerce-actions">{days.map(d=><button key={d} type="button" disabled={busy} aria-pressed={activeDay===d} onClick={()=>{setDay(d);select(undefined);setDraft(undefined);setError('');}}>{dayLabel(d)}</button>)}</div>
      <h3>2. Elige una hora</h3><div className="commerce-actions">{result.data.slots.filter(s=>localDay(s.starts_at)===activeDay).map(s=><button key={s.id} type="button" disabled={busy} aria-pressed={s.id===selected?.id} onClick={()=>{select(s);setDraft(undefined);setError('');}}>{formatHours(s.starts_at)}–{formatHours(s.ends_at)}</button>)}</div></>}
    {selected&&<p><strong>Hora elegida:</strong> {formatDate(selected.starts_at)} a {formatHours(selected.ends_at)}</p>}
    {selected&&(draft?<div className="commerce-confirmation"><h3>Revisa tu reserva</h3><p>{draft.name} · {draft.phone}{draft.email?' · '+draft.email:''}</p><div className="commerce-actions"><button type="button" disabled={busy} onClick={()=>void book()}>{busy?'Confirmando…':'Confirmar reserva'}</button><button type="button" disabled={busy} onClick={()=>setDraft(undefined)}>Editar datos</button></div></div>:<form onSubmit={review} key={selected.id}>
      <h3>3. Completa tus datos</h3><div className="commerce-grid"><label>Nombre completo<input defaultValue={customer?.name} name="name" autoComplete="name" required minLength={2} maxLength={150}/></label><label>Teléfono chileno<input type="tel" name="phone" autoComplete="tel" required placeholder="+56 9 1234 5678" maxLength={25}/></label><label>Correo (opcional)<input defaultValue={customer?.email} type="email" name="email" autoComplete="email" maxLength={254}/></label></div>
      <p>Usaremos estos datos para gestionar tu asesoría.</p><button type="submit">Revisar reserva</button>
    </form>)}
    {error&&<p role="alert">{error} <button type="button" disabled={busy} onClick={()=>{refresh(n=>n+1);setDraft(undefined);select(undefined);setError('');}}>Volver a horarios</button></p>}
    </>}
  </section>;
}
const dayLabel=(day:string)=>new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
const clockMinutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
const clockLabel=(n:number)=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
type BlockInput={date:string;time:string;end:string;duration:number;publish:boolean};
function BlockBuilder({week,busy,save}:{week:string;busy:boolean;save:(body:BlockInput)=>Promise<void>}){
  const [date,setDate]=useState(()=>week<today()?today():week);
  const [time,setTime]=useState('09:00');
  const [end,setEnd]=useState('11:00');
  const [duration,setDuration]=useState(30);
  const start=clockMinutes(time), span=clockMinutes(end)-start;
  const valid=Boolean(time&&end&&duration>=10&&duration<=180&&Number.isInteger(duration)&&span>=duration&&span%duration===0);
  const count=valid?span/duration:0;
  return <form className="advisory-builder" onSubmit={e=>{
    e.preventDefault();if(!valid||busy)return;
    const publish=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='publish';
    void save({date,time,end,duration,publish});
  }}>
    <h4>Crear horarios de atención</h4><p>Un bloque es un tramo de atención. Por ejemplo, de 09:00 a 11:00 con sesiones de 30 minutos se crean 4 horas individuales.</p>
    <fieldset disabled={busy}>
      <div className="commerce-grid">
        <label>1. Día<input type="date" value={date} onChange={e=>setDate(e.target.value)} min={week<today()?today():week} max={addDays(week,6)} required/></label>
        <label>2. Desde<input type="time" value={time} onChange={e=>setTime(e.target.value)} required/></label>
        <label>Hasta<input type="time" value={end} onChange={e=>setEnd(e.target.value)} required/></label>
        <label>3. Minutos por cita<input type="number" value={duration||''} onChange={e=>setDuration(Number(e.target.value))} min={10} max={180} required/></label>
      </div>
      <div className="commerce-confirmation" aria-live="polite">{valid?<><strong>Vista previa: {count} {count===1?'cupo':'cupos'}</strong><ul className="advisory-preview">{Array.from({length:count},(_,i)=><li key={i}>{clockLabel(start+i*duration)}–{clockLabel(start+(i+1)*duration)}</li>)}</ul></>:<p>La hora final debe ser posterior al inicio y dejar sesiones completas de la duración indicada.</p>}</div>
      <div className="commerce-actions"><button type="submit" value="draft" className="account-secondary" disabled={!valid}>Guardar borrador</button><button type="submit" value="publish" disabled={!valid}>Crear y publicar cupos</button></div>
    </fieldset>
  </form>;
}
const statuses={draft:'No publicado',published:'Disponible',blocked:'Bloqueado'};
const actions:Record<string,string>={confirmed:'Confirmada',cancelled:'Cancelada',rescheduled:'Reprogramada'};
export function AgendaManager(){
  const [week,setWeek]=useState(()=>weekOf(today()));
  const [version,refresh]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [historyId,setHistory]=useState('');
  const [moveId,setMove]=useState('');
  const [moveWeek,setMoveWeek]=useState(week);
  const result=useResource<{slots:ManagedSlot[]}>('/admin/agenda?week='+week,version);
  const destinations=useResource<{slots:Slot[]}>(moveId?'/advisories/availability?week='+moveWeek:'',version);
  const history=useResource<{history:History[]}>(historyId?'/admin/agenda/bookings/'+historyId:'',version);
  async function act(method:string,path:string,body:unknown,ok:string){
    if(busy)return;setBusy(true);setError('');setMessage('');
    try{await request(path,method,body);refresh(v=>v+1);setMessage(ok);setMove('');}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="commerce-panel"><h3>Agenda semanal</h3><p>Zona horaria: Chile continental. Solo los cupos publicados se muestran a los clientes.</p>
    <WeekPicker past week={week} change={w=>{setWeek(w);setHistory('');setMove('');}}/>
    <BlockBuilder key={week} week={week} busy={busy} save={async(body)=>{
      setBusy(true);setError('');setMessage('');
      try {
        const {count}=await request<{count:number}>('/admin/agenda/slots','POST',body);
        refresh(v=>v+1);setMessage(`${count} cupos ${body.publish?'publicados: los clientes ya pueden reservar.':'guardados como borrador. Usa «Publicar semana» cuando estén listos.'}`);
      } catch(e) {setError((e as Error).message);}
      finally {setBusy(false);}
    }}/>
    <div className="commerce-actions"><button type="button" disabled={busy||!result?.data?.slots.some(s=>s.state==='draft'&&Date.parse(s.starts_at)>Date.now())} onClick={()=>{if(confirm('¿Publicar los cupos en borrador de esta semana?'))void act('POST','/admin/agenda/publish',{week},'Disponibilidad semanal actualizada.');}}>Publicar semana</button><button type="button" onClick={()=>refresh(v=>v+1)}>Actualizar</button></div>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {result?.error?<p role="alert">{result.error}</p>:!result?.data?<p role="status">Cargando agenda…</p>:<div className="commerce-week">{weekdays.map((day,i)=>{
      const date=addDays(week,i), slots=result.data!.slots.filter(s=>localDay(s.starts_at)===date);
      return <section key={date}><h4>{day} {date.slice(-2)}</h4>{!slots.length&&<p>Sin cupos</p>}
        {slots.map(s=>{const active=s.bookings.find(b=>b.status==='confirmed');const future=Date.parse(s.starts_at)>Date.now();
          return <div className="commerce-slot" key={s.id}><strong>{formatHours(s.starts_at)}–{formatHours(s.ends_at)}</strong><p><span className={`advisory-state advisory-state-${active?'reserved':s.state}`}>{active?'Reservado':statuses[s.state]}</span></p>
            {future&&!active&&<button type="button" disabled={busy} onClick={()=>void act('PATCH','/admin/agenda/slots/'+s.id,{state:s.state==='blocked'?'draft':'blocked'},'Cupo actualizado.')}>{s.state==='blocked'?'Desbloquear':'Bloquear'}</button>}
            {s.bookings.map(b=><details key={b.id}><summary>{b.name} · {b.status==='confirmed'?'Confirmada':'Cancelada'}</summary><p><a href={'tel:'+b.phone}>{b.phone}</a>{b.email&&<> · <a href={'mailto:'+b.email}>{b.email}</a></>}</p>
              <button type="button" onClick={()=>setHistory(historyId===b.id?'':b.id)}>Historial</button>
              {historyId===b.id&&(history?.error?<p role="alert">{history.error}</p>:history?.data?<ul>{history.data.history.map((h,i)=><li key={i}>{actions[h.action]} · {formatDate(h.starts_at)} (registro {formatDate(h.created_at)})</li>)}</ul>:<p role="status">Cargando historial…</p>)}
              {b.status==='confirmed'&&future&&<><button type="button" disabled={busy} onClick={()=>{if(confirm('¿Cancelar la asesoría? El cupo volverá a quedar libre.'))void act('PATCH','/admin/agenda/bookings/'+b.id,{action:'cancel'},'Cita cancelada. No se envió un aviso automático.');}}>Cancelar cita</button><button type="button" disabled={busy} onClick={()=>{setMoveWeek(week);setMove(b.id);}}>Reprogramar</button></>}
            </details>)}
          </div>;
        })}
      </section>;
    })}</div>}
    {moveId&&<section aria-label="Reprogramar reserva"><h4>Selecciona el nuevo horario</h4><WeekPicker week={moveWeek} change={setMoveWeek}/>
      {destinations?.error&&<p role="alert">{destinations.error}</p>}
      {destinations?.data?.slots.length===0&&<p>Sin cupos libres.</p>}
      <form onSubmit={e=>{e.preventDefault();const slotId=formText(new FormData(e.currentTarget),'slot');if(confirm('¿Confirmas la nueva hora de la asesoría?'))void act('PATCH','/admin/agenda/bookings/'+moveId,{action:'reschedule',slotId},'Cita reprogramada. No se envió un aviso automático.');}}><label>Nuevo cupo<select name="slot" required><option value="">Selecciona un horario</option>{destinations?.data?.slots.map(s=><option value={s.id} key={s.id}>{formatDate(s.starts_at)}</option>)}</select></label><button disabled={busy||!destinations?.data?.slots.length}>Confirmar reprogramación</button><button type="button" disabled={busy} onClick={()=>setMove('')}>Cerrar</button></form>
    </section>}
  </div>;
}
