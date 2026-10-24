import { timingSafeEqual } from 'node:crypto';
import { ApiError,validate } from './validation.mjs';
function authorized(request,key){
 const provided=request.headers.get('authorization')?.replace(/^Bearer /,'')??request.headers.get('x-api-key')??'';
 if(!key)return false;const a=Buffer.from(provided),b=Buffer.from(key);return a.length===b.length&&timingSafeEqual(a,b);
}
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function handlers(getRepository,keys=()=>({ingest:process.env.INGEST_API_KEY,read:process.env.DASHBOARD_READ_API_KEY})){
 const handle=async(job)=>{try{return await job();}catch(e){return json({error:e instanceof ApiError?e.message:'Error al almacenar; conserva el registro y reintenta'},e instanceof ApiError?e.status:500);}};
 return {
 POST:request=>handle(async()=>{
  if(!keys().ingest)return json({error:'Receptor sin configurar'},503);
  if(!authorized(request,keys().ingest))return json({error:'No autorizado'},401);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new ApiError(415,'Se requiere JSON');
  const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'Falta cuerpo');
  let size=0,chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>3_500_000){await reader.cancel();throw new ApiError(413,'Máximo 3.5 MB');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'JSON inválido');}
  const payload=validate(body),repo=await getRepository(),ack=await repo.save(payload);return json(ack,ack.new?201:200);
 }),
 GET:request=>handle(async()=>{
  // Sólo servidor a servidor. Para navegador, integrar aquí la sesión real del dashboard.
  if(!authorized(request,keys().read))return json({error:'No autorizado'},401);
  const params=new URL(request.url).searchParams,after=params.get('after')??'0',lot=params.get('lote');
  if(!/^\d{1,18}$/.test(after))throw new ApiError(400,'Cursor inválido');
  return json(await (await getRepository()).list(after,lot));
 }),
 MAP:request=>handle(async()=>{
  if(!authorized(request,keys().read))return json({error:'No autorizado'},401);
  const lot=new URL(request.url).searchParams.get('lote');return json(await (await getRepository()).mapRoutes(lot));
 }),
 PHOTO:(request,id)=>handle(async()=>{
  if(!authorized(request,keys().read))return json({error:'No autorizado'},401);
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new ApiError(400,'ID inválido');
  const data=await (await getRepository()).photo(id);if(!data)return json({error:'Sin foto'},404);
  return new Response(new Uint8Array(data),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 })
 };
}
