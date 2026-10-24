/**
 * Migración única al esquema del adaptador 0.2.2: recrea cultivos_registros y
 * cultivos_recorridos SOLO si están vacías. Si hay una sola fila, no toca nada.
 * Después, `drizzle-kit push` crea las tablas con el esquema nuevo.
 */
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";

(async () => {
  const db = getDb();
  const r = await db.execute(sql`
    SELECT (SELECT count(*) FROM cultivos_registros)::int AS registros,
           (SELECT count(*) FROM cultivos_recorridos)::int AS recorridos,
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cultivos_registros' AND column_name = 'data_hash') AS ya_migrada
  `);
  const { registros, recorridos, ya_migrada } = r.rows[0] as { registros: number; recorridos: number; ya_migrada: boolean };
  if (ya_migrada) {
    console.log("Ya tiene el esquema 0.2.2; no se hace nada.");
  } else if (registros + recorridos > 0) {
    console.error(`Hay ${registros} registros y ${recorridos} recorridos: no se borra nada. Migrar los datos a mano.`);
    process.exitCode = 1;
  } else {
    await db.execute(sql`DROP TABLE cultivos_registros, cultivos_recorridos`);
    console.log("Tablas vacías eliminadas; ahora corre drizzle-kit push.");
  }
  await closeDb();
})();
