/**
 * Migración única: quita el dron de la simulación (ahora el dato viene de un robot con cámara).
 * - Elimina las tablas simuladas vuelos_dron y detecciones, y la columna ndvi del resumen.
 * - Cambia el origen de los brotes de 'dron' a 'robot' recreando la tabla simulada de brotes.
 * Solo toca tablas de la simulación; las tablas cultivos_* (datos reales de la APK) no se tocan.
 * Después: drizzle-kit push y db:seed para regenerar la simulación.
 */
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";

(async () => {
  const db = getDb();
  const antes = await db.execute(sql`SELECT (SELECT count(*) FROM cultivos_registros)::int AS reales`);
  await db.execute(sql`DROP TABLE IF EXISTS detecciones, vuelos_dron`);
  await db.execute(sql`ALTER TABLE resumen_diario_lote DROP COLUMN IF EXISTS ndvi`);
  await db.execute(sql`DROP TABLE IF EXISTS eventos_enfermedad`);
  await db.execute(sql`DROP TYPE IF EXISTS origen_evento`);
  const despues = await db.execute(sql`SELECT (SELECT count(*) FROM cultivos_registros)::int AS reales`);
  console.log("Simulación sin dron. Registros reales de la APK antes/después:", (antes.rows[0] as { reales: number }).reales, "/", (despues.rows[0] as { reales: number }).reales);
  await closeDb();
})();
