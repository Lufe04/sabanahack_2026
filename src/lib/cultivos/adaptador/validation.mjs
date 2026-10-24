import { validateRouteGeometry,validateDisplayPosition } from './geometry.mjs';
import { createHash } from 'node:crypto';
export class ApiError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail=message=>{throw new ApiError(400,message);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str=(s,max=200)=>typeof s==='string'&&s.length>0&&s.length<=max;
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const date=s=>str(s,50)&&/(Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s));
function location(l){
  if(l==null)return;
  if(!finite(l.latitude,-90,90)||!finite(l.longitude,-180,180)||!date(l.fix_at)||!(l.accuracy_m==null||finite(l.accuracy_m,0,1e7)))fail('Ubicación inválida');
}
function context(c){
  if(c==null)return;
  if(!uuid.test(c.inspection_id)||!uuid.test(c.plan_id)||!str(c.lot_id,80)||!(c.waypoint_id==null||uuid.test(c.waypoint_id)))fail('Contexto del recorrido inválido');
  location(c.location);
  if(c.display_position!=null){if(c.navigation_mode!=='timed_simulation')fail('Posición de mapa no declarada como simulación');try{validateDisplayPosition(c.display_position);}catch(e){fail(e.message);}}
}
export function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function validate(input){
  if(!input||Array.isArray(input)||typeof input!=='object'||!uuid.test(input.id)||!date(input.captured_at))fail('ID o fecha inválidos');
  const e=structuredClone(input);let photo=null;const encoded=e.photo_base64;delete e.photo_base64;
  if(encoded!=null){
    if(typeof encoded!=='string'||encoded.length>2666668||encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('Foto base64 inválida');
    photo=Buffer.from(encoded,'base64');
    if(photo.length<4||photo.length>2_000_000||photo[0]!==255||photo[1]!==216||photo.at(-2)!==255||photo.at(-1)!==217)fail('Se requiere JPEG de hasta 2 MB');
  }
  e.type??='observation';let lot=null;
  if(e.type==='observation'){
    if(!str(e.mission)||!str(e.model_version,100)||!e.scores||Object.keys(e.scores).length!==4)fail('Observación inválida');
    let sum=0;for(const label of ['alternaria','botrytis','sana','trips']){const v=e.scores[label];if(!finite(v,0,1))fail('Puntuaciones inválidas');sum+=v;}
    if(Math.abs(sum-1)>.03)fail('Las puntuaciones deben sumar aproximadamente 1');
    if(e.alert==null&&e.schema_version==null)e.alert=true; // Compatibilidad con capturas anteriores.
    if(typeof e.alert!=='boolean'||!['automatic','manual','periodic','route_reference'].includes(e.capture_mode))fail('Modo o alerta inválidos');
    if(e.alert&&!photo)fail('Una alerta debe incluir foto');
    if(['manual','route_reference'].includes(e.capture_mode)&&!photo)fail('Falta foto solicitada');
    if(e.capture_mode==='periodic'&&photo)fail('Una lectura periódica lleva valores sin foto');
    if(photo&&e.photo_mime!=='image/jpeg')fail('Tipo de foto inválido');
    context(e.route_context);location(e.location);lot=e.route_context?.lot_id??null;
    if(e.route_context?.navigation_mode==='timed_simulation'){
      e.simulated=true;e.simulation_scope='route_progress_only';
      if(e.location!=null||e.route_context.location!=null)fail('La posición simulada no debe llevar coordenadas inventadas');
    }
    if(e.schema_version===2&&!lot)fail('Falta lote del recorrido');
  }else if(e.type==='route_snapshot'){
    if(photo)fail('La referencia fotográfica va en una observación, no en el estado del recorrido');
    const r=e.route;
    if(!r||!uuid.test(r.id)||!uuid.test(r.plan_id)||!str(r.lot_id,80)||!str(r.name)||!date(r.updated_at)||!Number.isSafeInteger(r.revision)||r.revision<1)fail('Recorrido inválido');
    if(!['recording','ready','active','paused','charging','completed'].includes(r.phase)||!Array.isArray(r.waypoints)||r.waypoints.length>1000||!Number.isInteger(r.completed)||r.completed<0||r.completed>r.waypoints.length)fail('Progreso inválido');
    if(r.phase==='completed'&&(r.completed!==r.waypoints.length||!r.waypoints.length))fail('Recorrido incompleto');
    if(r.phase!=='recording'&&!r.waypoints.length)fail('Plan sin puntos');
    const sim=r.navigation_mode==='timed_simulation';
    if(sim){
      if(r.simulated!==true||!Number.isInteger(r.simulation_point_seconds)||r.simulation_point_seconds<5||r.simulation_point_seconds>600)fail('Configuración de simulación inválida');
      e.simulated=true;e.simulation_scope='route_progress_only';
    }
    const ids=new Set();for(const p of r.waypoints){
      const virtual=sim&&p.source==='timed_simulation'&&p.reference_event_id==null;
      if(!uuid.test(p.id)||ids.has(p.id)||(!virtual&&!uuid.test(p.reference_event_id)))fail('Punto inválido');
      if(virtual&&p.location!=null)fail('Un punto virtual no lleva coordenadas');
      ids.add(p.id);location(p.location);
    }
    try{validateRouteGeometry(r);}catch(error){fail(error.message);}
    lot=r.lot_id;
  }else fail('Tipo de registro desconocido');
  if(e.simulated!=null&&typeof e.simulated!=='boolean')fail('Marca de simulación inválida');
  if(e.schema_version!=null&&e.schema_version!==2)fail('Versión de contrato no admitida');
  const hash=createHash('sha256').update(stable(e)).update(photo??Buffer.alloc(0)).digest('hex');
  return {event:e,photo,hash,lot};
}
