import { toGeoJSON } from './geometry.mjs';
import { ApiError } from './validation.mjs';
// Integración: `tablaLotes` apunta al catálogo real del dashboard (`lotes`), como recomienda
// el paso 4 del README del adaptador. Por defecto conserva `cultivos_lotes` para sus pruebas.
export function makeRepository(pool,{tablaLotes='cultivos_lotes'}={}){
 if(!/^[a-z_]+$/.test(tablaLotes))throw new Error('Tabla de lotes inválida');
 return {
 async save({event:e,photo,hash,lot}){
  const c=await pool.connect();try{
   await c.query('BEGIN');
   if(lot){const found=await c.query(`SELECT id FROM ${tablaLotes} WHERE id=$1`,[lot]);if(!found.rows.length)throw new ApiError(422,'Lote no registrado por el técnico');}
   const inserted=await c.query(`INSERT INTO cultivos_registros(id,tipo,lote_id,capturado_en,alerta,puntuaciones,datos,foto,data_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING RETURNING id`,
    [e.id,e.type,lot,e.captured_at,e.alert??false,e.scores??null,e,photo,hash]);
   if(!inserted.rows.length){
    const old=await c.query('SELECT data_hash FROM cultivos_registros WHERE id=$1',[e.id]);
    if(old.rows[0]?.data_hash!==hash)throw new ApiError(409,'El UUID ya existe con otro contenido');
   }else if(e.type==='route_snapshot'){
    const r=e.route;
    await c.query(`INSERT INTO cultivos_recorridos(inspection_id,plan_id,lote_id,revision,fase,completados,total,datos,actualizado_en)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(inspection_id) DO UPDATE SET
     revision=EXCLUDED.revision,fase=EXCLUDED.fase,completados=EXCLUDED.completados,total=EXCLUDED.total,
     datos=EXCLUDED.datos,actualizado_en=EXCLUDED.actualizado_en,recibido_en=now()
     WHERE cultivos_recorridos.revision<EXCLUDED.revision`,
     [r.id,r.plan_id,r.lot_id,r.revision,r.phase,r.completed,r.waypoints.length,r,r.updated_at]);
   }
   await c.query('COMMIT');return {id:e.id,status:'stored',new:inserted.rows.length===1};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 },
 async list(after='0',lot=null){
  const q=await pool.query(`SELECT seq::text,id,tipo,lote_id,capturado_en,alerta,puntuaciones,datos,COALESCE((datos->>'simulated')::boolean,false) AS simulado,(foto IS NOT NULL) AS tiene_foto
   FROM cultivos_registros WHERE seq>$1::bigint AND ($2::text IS NULL OR lote_id=$2) ORDER BY cultivos_registros.seq LIMIT 100`,[after,lot]); // Corrección: `ORDER BY seq` ordenaba el alias de texto (1,10,11,…,2) y rompía el cursor.
  return {registros:q.rows,siguiente:q.rows.at(-1)?.seq??after};
 },
 async mapRoutes(lot=null){
  const routes=await pool.query('SELECT datos FROM cultivos_recorridos WHERE ($1::text IS NULL OR lote_id=$1) ORDER BY actualizado_en DESC LIMIT 500',[lot]);
  const observations=await pool.query(`SELECT DISTINCT ON(datos->'route_context'->>'inspection_id',datos->'route_context'->>'waypoint_id') datos,(foto IS NOT NULL) AS photo_available
   FROM cultivos_registros WHERE tipo='observation' AND ($1::text IS NULL OR lote_id=$1) AND datos->'route_context'->>'waypoint_id' IS NOT NULL
   ORDER BY datos->'route_context'->>'inspection_id',datos->'route_context'->>'waypoint_id',capturado_en DESC,seq DESC`,[lot]);
  return toGeoJSON(routes.rows,observations.rows);
 },
 async photo(id){const q=await pool.query('SELECT foto FROM cultivos_registros WHERE id=$1',[id]);return q.rows[0]?.foto??null;}
};}
