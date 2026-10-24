import { test,before,after,beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { handlers } from '../cultivos/http.mjs';
import { makeRepository } from '../cultivos/repository.mjs';
let pg,api,repo,jpeg;
const keys=()=>({ingest:'test-ingest',read:'test-read'});
function obs(photo=false){return {id:randomUUID(),schema_version:2,type:'observation',captured_at:'2026-10-24T15:00:00Z',mission:'Lote norte',model_version:'experimental-v5',scores:{alternaria:.02,botrytis:.03,sana:.93,trips:.02},alert:false,capture_mode:photo?'manual':'periodic',photo_mime:photo?'image/jpeg':null,photo_base64:photo?jpeg.toString('base64'):null,route_context:{inspection_id:randomUUID(),plan_id:randomUUID(),lot_id:'L01',waypoint_id:randomUUID(),location:null},location:null};}
function req(body,key='test-ingest'){return new Request('https://example.test/api/events',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});}
before(async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE??'@electric-sql/pglite');pg=new PGlite();await pg.exec(await readFile(new URL('../001_cultivos.sql',import.meta.url),'utf8'));
 const pool={query:(...args)=>pg.query(...args),connect:async()=>({query:(...args)=>pg.query(...args),release(){}})};
 repo=makeRepository(pool);api=handlers(async()=>repo,keys);jpeg=await readFile(new URL('./pixel.jpg',import.meta.url));
});
after(async()=>{await pg.close();});
beforeEach(async()=>{await pg.exec("DELETE FROM cultivos_registros;DELETE FROM cultivos_recorridos;DELETE FROM cultivos_lotes;INSERT INTO cultivos_lotes VALUES('L01','Norte');");});
test('POST + retry stores one photo with all four scores and matching ACK',async()=>{
 const event=obs(true);event.alert=true;event.scores={alternaria:.04,botrytis:.91,sana:.02,trips:.03};
 let response=await api.POST(req(event));assert.equal(response.status,201);assert.deepEqual(await response.json(),{id:event.id,status:'stored',new:true});
 response=await api.POST(req(event));assert.equal(response.status,200);assert.equal((await response.json()).new,false);
 const rows=await repo.list();assert.equal(rows.registros.length,1);assert.deepEqual(rows.registros[0].puntuaciones,event.scores);assert.equal(rows.registros[0].tiene_foto,true);assert.deepEqual(Buffer.from(await repo.photo(event.id)),jpeg);
});
test('periodic healthy observation has scores and no photo',async()=>{
 const event=obs();assert.equal((await api.POST(req(event))).status,201);assert.equal(await repo.photo(event.id),null);const {registros}=await repo.list();assert.equal(registros[0].puntuaciones.sana,.93);assert.equal(registros[0].alerta,false);
});
test('unknown lot is 422 and is not stored',async()=>{
 const event=obs();event.route_context.lot_id='L99';assert.equal((await api.POST(req(event))).status,422);assert.equal((await repo.list()).registros.length,0);
});
test('same UUID with changed scores returns 409 without overwriting',async()=>{
 const e=obs();await api.POST(req(e));e.scores={alternaria:.9,botrytis:.03,sana:.05,trips:.02};assert.equal((await api.POST(req(e))).status,409);assert.equal((await repo.list()).registros[0].puntuaciones.sana,.93);
});
test('older route snapshot cannot roll progress back after newer revision',async()=>{
 const r={id:randomUUID(),plan_id:randomUUID(),lot_id:'L01',name:'Ruta',updated_at:'2026-10-24T15:00:00Z',revision:5,phase:'paused',completed:1,waypoints:[{id:randomUUID(),reference_event_id:randomUUID(),location:null},{id:randomUUID(),reference_event_id:randomUUID(),location:null}]};
 const event={id:randomUUID(),schema_version:2,type:'route_snapshot',captured_at:r.updated_at,route:r};assert.equal((await api.POST(req(event))).status,201);
 const older=structuredClone(event);older.id=randomUUID();older.route.revision=4;older.route.completed=0;assert.equal((await api.POST(req(older))).status,201);
 const {rows}=await pg.query('SELECT revision,completados FROM cultivos_recorridos');assert.equal(Number(rows[0].revision),5);assert.equal(rows[0].completados,1);
});
test('auth required for ingestion, listing, and photo; no writes on invalid token',async()=>{
 assert.equal((await api.POST(req(obs(),'bad'))).status,401);assert.equal((await api.GET(new Request('https://example.test/api/events'))).status,401);assert.equal((await api.PHOTO(new Request('https://example.test/api/events'),randomUUID())).status,401);assert.equal((await repo.list()).registros.length,0);
});
test('invalid scores, missing alert photo, missing route, and malformed JSON are rejected',async()=>{
 for(const mutate of [e=>e.scores.sana=99,e=>e.alert=true,e=>e.route_context=null,e=>e.scores.sana=.2]){const e=obs();mutate(e);assert.equal((await api.POST(req(e))).status,400);}
 const r=new Request('https://example.test/api/events',{method:'POST',headers:{Authorization:'Bearer test-ingest','Content-Type':'application/json'},body:'{'});assert.equal((await api.POST(r)).status,400);
});
test('body limit rejects oversized JSON before database write',async()=>{
 const r=new Request('https://example.test/api/events',{method:'POST',headers:{Authorization:'Bearer test-ingest','Content-Type':'application/json'},body:' '.repeat(3_500_001)});assert.equal((await api.POST(r)).status,413);assert.equal((await repo.list()).registros.length,0);
});
test('legacy capture can sync after APK migration with no invented lot',async()=>{
 const e=obs(true);delete e.schema_version;delete e.type;delete e.alert;delete e.route_context;assert.equal((await api.POST(req(e))).status,201);const row=(await repo.list()).registros[0];assert.equal(row.lote_id,null);assert.equal(row.alerta,true);
});

test('serialized Android reference, readings and progress are accepted by receiver',async()=>{
 const fixtures=JSON.parse(await readFile(process.env.ANDROID_FIXTURES??new URL('./android-fixtures.json',import.meta.url),'utf8'));assert.ok(fixtures.length>=5);
 for(const event of fixtures){const response=await api.POST(req(event));assert.equal(response.status,201,JSON.stringify(await response.json()));}
 const observations=(await repo.list()).registros.filter(r=>r.tipo==='observation');assert.ok(observations.some(r=>r.tiene_foto));assert.ok(observations.some(r=>!r.tiene_foto));
 const {rows}=await pg.query('SELECT fase,completados,total FROM cultivos_recorridos');assert.equal(rows[0].fase,'completed');assert.equal(rows[0].completados,rows[0].total);
});

test('timed demo accepts virtual points and marks progress as simulated',async()=>{
 const r={id:randomUUID(),plan_id:randomUUID(),lot_id:'L01',name:'Demo',updated_at:'2026-10-24T15:00:00Z',revision:1,phase:'ready',completed:0,navigation_mode:'timed_simulation',simulated:true,simulation_point_seconds:20,waypoints:[{id:randomUUID(),source:'timed_simulation',reference_event_id:null,location:null}]};
 const event={id:randomUUID(),schema_version:2,type:'route_snapshot',captured_at:r.updated_at,route:r};assert.equal((await api.POST(req(event))).status,201);assert.equal((await repo.list()).registros[0].simulado,true);
 const e=obs();e.route_context.navigation_mode='timed_simulation';assert.equal((await api.POST(req(e))).status,201);const stored=(await repo.list()).registros.at(-1);assert.equal(stored.simulado,true);assert.equal(stored.datos.simulation_scope,'route_progress_only');assert.equal(stored.puntuaciones.sana,.93);
});
test('virtual references are rejected outside simulation; fake current coordinates rejected',async()=>{
 const r={id:randomUUID(),plan_id:randomUUID(),lot_id:'L01',name:'Demo',updated_at:'2026-10-24T15:00:00Z',revision:1,phase:'ready',completed:0,waypoints:[{id:randomUUID(),source:'timed_simulation',reference_event_id:null,location:null}]};
 assert.equal((await api.POST(req({id:randomUUID(),type:'route_snapshot',captured_at:r.updated_at,route:r}))).status,400);
 const e=obs();e.route_context.navigation_mode='timed_simulation';e.location={latitude:5,longitude:-73,accuracy_m:10,fix_at:e.captured_at};assert.equal((await api.POST(req(e))).status,400);
});
test('serialized Android timed demo is accepted with real-style photos and explicit simulated navigation',async()=>{
 const fixtures=JSON.parse(await readFile(new URL('./android-simulation-fixtures.json',import.meta.url),'utf8'));
 for(const e of fixtures){const response=await api.POST(req(e));assert.equal(response.status,201,JSON.stringify(await response.json()));}
 const records=(await repo.list()).registros;assert.ok(records.every(r=>r.simulado));const readings=records.filter(r=>r.tipo==='observation');assert.ok(readings.some(r=>r.tiene_foto&&r.alerta));assert.ok(readings.some(r=>!r.tiene_foto&&!r.alerta));assert.ok(readings.every(r=>Object.keys(r.puntuaciones).length===4));
 const {rows}=await pg.query('SELECT fase,completados,total FROM cultivos_recorridos');assert.equal(rows[0].fase,'completed');assert.equal(rows[0].total,2);assert.equal(rows[0].completados,2);
});

async function mappedFixtures(){const wire=JSON.parse(await readFile(new URL('./android-mapped-fixtures.json',import.meta.url),'utf8'));await pg.query("INSERT INTO cultivos_lotes VALUES('L02','Sur') ON CONFLICT(id) DO NOTHING");return wire;}
async function saveMapped(){const wire=await mappedFixtures();for(const e of wire){const response=await api.POST(req(e));assert.equal(response.status,201,JSON.stringify(await response.json()));}return wire;}
test('mapped Android routes produce GeoJSON for two actual catalogue lots with progress and four scores',async()=>{
 await saveMapped();const request=new Request('https://example.test/api/recorridos',{headers:{Authorization:'Bearer test-read'}});const response=await api.MAP(request);assert.equal(response.status,200);const fc=await response.json();assert.equal(fc.type,'FeatureCollection');assert.equal(fc.features.length,16);
 assert.deepEqual([...new Set(fc.features.map(f=>f.properties.lot_id))].sort(),['L01','L02']);assert.equal(fc.features.filter(f=>f.properties.kind==='position').length,2);
 const points=fc.features.filter(f=>f.properties.kind==='waypoint');assert.equal(points.length,10);assert.ok(points.every(p=>p.geometry.coordinates[0]<-70&&p.geometry.coordinates[1]>4));assert.ok(points.some(p=>p.properties.status==='reviewed'));assert.equal(points.find(p=>p.properties.scores)?.properties.scores.sana,.9300000071525574);
});
test('map endpoint is authenticated and supports filtering by lot',async()=>{
 await saveMapped();assert.equal((await api.MAP(new Request('https://example.test/api/recorridos'))).status,401);const response=await api.MAP(new Request('https://example.test/api/recorridos?lote=L02',{headers:{Authorization:'Bearer test-read'}}));assert.ok((await response.json()).features.every(f=>f.properties.lot_id==='L02'));
});
test('out of lot points, crossing path, and real-GPS misuse are rejected',async()=>{
 const wire=await mappedFixtures(),base=wire.filter(e=>e.type==='route_snapshot'&&e.route.lot_id==='L01').at(-1);
 for(const mutate of [e=>e.route.waypoints[0].display_position.latitude+=1,e=>e.route.display_path.coordinates[1][1]+=1,e=>e.route.lot_boundary.coordinates[0][1][1]=99]){const e=structuredClone(base);e.id=randomUUID();mutate(e);assert.equal((await api.POST(req(e))).status,400);}
 const reading=wire.find(e=>e.type==='observation');const e=structuredClone(reading);e.id=randomUUID();e.location={...e.route_context.display_position,accuracy_m:1,fix_at:e.captured_at};assert.equal((await api.POST(req(e))).status,400);
});
test('latest observation photo and scores are attached to the correct map waypoint',async()=>{
 const wire=await saveMapped(),old=wire.find(e=>e.type==='observation');const event=obs(true);event.captured_at=new Date(Date.parse(old.captured_at)+1000).toISOString();event.route_context=old.route_context;event.scores={alternaria:.04,botrytis:.91,sana:.02,trips:.03};event.alert=true;
 assert.equal((await api.POST(req(event))).status,201);const fc=await repo.mapRoutes('L01');const point=fc.features.find(f=>f.properties.kind==='waypoint'&&f.properties.waypoint_id===old.route_context.waypoint_id);assert.equal(point.properties.observation_id,event.id);assert.equal(point.properties.photo_available,true);assert.equal(point.properties.scores.botrytis,.91);
});
test('concave boundary rejects straight shortcut outside the lot',async()=>{
 const {validateRouteGeometry}=await import('../cultivos/geometry.mjs');const point=(x,y)=>({id:randomUUID(),display_position:{longitude:x,latitude:y,source:'simulated_within_lot'}});
 const r={navigation_mode:'timed_simulation',simulated:true,lot_boundary:{type:'Polygon',coordinates:[[[0,0],[3,0],[3,3],[2,3],[2,1],[1,1],[1,3],[0,3],[0,0]]]},waypoints:[point(.5,2.5),point(2.5,2.5)],display_path:{type:'LineString',coordinates:[[.5,2.5],[2.5,2.5]]}};
 assert.throws(()=>validateRouteGeometry(r),/fuera del lote/);r.display_path.coordinates=[[.5,2.5],[1,1],[2,1],[2.5,2.5]];assert.doesNotThrow(()=>validateRouteGeometry(r));
});
