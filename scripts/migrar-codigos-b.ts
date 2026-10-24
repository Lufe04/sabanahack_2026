/**
 * Migración única: los bloques pasan de L01–L10 a B01–B10.
 * - Datos reales del robot (cultivos_*): cambia lote_id y el lot_id guardado en `datos`.
 *   No toca `data_hash`, así que los reintentos de la app siguen siendo idempotentes.
 * - Recalcula bloque, cama y planta de las capturas (tags B01-C..-P...).
 * La simulación se regenera aparte con `db:seed` (usa los códigos nuevos de finca.ts).
 */
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { completarObservaciones } from "../src/lib/cultivos/completar";

const aB = (col: string) => sql.raw(`'B' || substr(${col}, 2)`);

(async () => {
  const db = getDb();
  const antes = await db.execute(sql`SELECT count(*)::int n FROM cultivos_registros`);
  const r1 = await db.execute(sql`UPDATE cultivos_registros SET lote_id = ${aB("lote_id")} WHERE lote_id ~ '^L[0-9]{2}$'`);
  const r2 = await db.execute(sql`UPDATE cultivos_recorridos SET lote_id = ${aB("lote_id")}, datos = jsonb_set(datos, '{lot_id}', to_jsonb(${aB("lote_id")})) WHERE lote_id ~ '^L[0-9]{2}$'`);
  await db.execute(sql`UPDATE cultivos_registros SET datos = jsonb_set(datos, '{route_context,lot_id}', to_jsonb('B' || substr(datos->'route_context'->>'lot_id', 2))) WHERE datos->'route_context'->>'lot_id' ~ '^L[0-9]{2}$'`);
  await db.execute(sql`UPDATE cultivos_registros SET datos = jsonb_set(datos, '{route,lot_id}', to_jsonb('B' || substr(datos->'route'->>'lot_id', 2))) WHERE datos->'route'->>'lot_id' ~ '^L[0-9]{2}$'`);
  await db.execute(sql`UPDATE cultivos_intentos SET lote_id = ${aB("lote_id")} WHERE lote_id ~ '^L[0-9]{2}$'`);
  const n = await completarObservaciones();
  const despues = await db.execute(sql`SELECT count(*)::int n FROM cultivos_registros`);
  console.log(`Registros: ${(antes.rows[0] as { n: number }).n} antes / ${(despues.rows[0] as { n: number }).n} después · bloque cambiado en ${r1.rowCount} registros y ${r2.rowCount} recorridos · ${n} capturas con su tag recalculado`);
  await closeDb();
})();
