import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { asignar } from "./asignacion-mvp";

/**
 * Completa una observación guardada con su bloque, cama y planta (asignación del MVP).
 * No toca `data_hash`, así que la idempotencia del receptor no cambia.
 * Devuelve cuántas filas actualizó.
 */
export async function completarObservaciones(filtro: { id?: string; soloIncompletas?: boolean } = {}) {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT id, datos FROM cultivos_registros
    WHERE tipo = 'observation'
      ${filtro.id ? sql`AND id = ${filtro.id}` : sql``}
      ${filtro.soloIncompletas ? sql`AND NOT (datos ? 'asignacion_mvp')` : sql``}
  `);
  let n = 0;
  for (const fila of res.rows as { id: string; datos: Record<string, unknown> }[]) {
    const a = asignar(fila.datos);
    await db.execute(sql`
      UPDATE cultivos_registros
      SET lote_id = coalesce(lote_id, ${a.bloque}),
          datos = datos || jsonb_build_object('asignacion_mvp', ${JSON.stringify(a)}::jsonb)
      WHERE id = ${fila.id}
    `);
    n++;
  }
  return n;
}
