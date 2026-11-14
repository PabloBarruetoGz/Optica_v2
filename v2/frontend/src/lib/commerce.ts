import { useEffect, useState } from 'react';

export async function request<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
  const response=await fetch('/api'+path,{method,signal,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error||'No se pudo completar la operación.');
  return data;
}
export function useResource<T>(path:string,version=0){
  const key=path+'|'+version;
  const [result,setResult]=useState<{key:string;data?:T;error?:string}>();
  useEffect(()=>{
    if(!path)return;
    const controller=new AbortController();
    request<T>(path,'GET',undefined,controller.signal).then(data=>{if(!controller.signal.aborted)setResult({key,data});})
    .catch(error=>{if(!controller.signal.aborted)setResult({key,error:error.message});});
    return ()=>controller.abort();
  },[path,key]);
  return result?.key===key?result:undefined;
}
export const chile='America/Santiago';
const display=new Intl.DateTimeFormat('es-CL',{timeZone:chile,dateStyle:'medium',timeStyle:'short'});
const hours=new Intl.DateTimeFormat('es-CL',{timeZone:chile,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export const formatDate=(s:string)=>display.format(new Date(s));
export const formatHours=(s:string)=>hours.format(new Date(s));
export function addDays(day:string,n:number){
  const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
}
export function weekOf(day:string){return addDays(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));}
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:chile,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const localDay=(s:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:chile,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
export function formText(values:FormData,key:string){return String(values.get(key)||'').trim();}
