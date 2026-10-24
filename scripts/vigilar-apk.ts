/**
 * Vigila la base y muestra cada evento nuevo que envía la APK.
 * Uso: npx dotenv -e .env.production.local -- tsx scripts/vigilar-apk.ts [minutos]
 * Termina al recibir el primer lote de eventos o al cumplirse el tiempo.
 */
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";

const minutos = Number(process.argv[2] ?? 15);
const hora = (d: string) => new Date(d).toLocaleTimeString("es-CO", { timeZone: "America/Bogota" });

(async () => {
  const db = getDb();
  const inicio = await db.execute(sql`SELECT coalesce(max(seq), 0)::int AS seq FROM cultivos_registros`);
  let ultimo = (inicio.rows[0] as { seq: number }).seq;
  console.log(`Vigilando desde el registro ${ultimo}, durante ${minutos} min…`);
  const fin = Date.now() + minutos * 60_000;
  while (Date.now() < fin) {
    const r = await db.execute(sql`
      SELECT seq::int, tipo, lote_id, alerta, (foto IS NOT NULL) AS foto, capturado_en::text AS capturado,
             datos->>'capture_mode' AS modo, datos->'route'->>'phase' AS fase,
             datos->'route'->>'completed' AS completados, jsonb_array_length(coalesce(datos->'route'->'waypoints','[]')) AS total,
             puntuaciones, coalesce((datos->>'simulated')::boolean, false) AS simulado
      FROM cultivos_registros WHERE seq > ${ultimo} ORDER BY seq`);
    if (r.rows.length) {
      for (const e of r.rows as Record<string, unknown>[]) {
        const p = e.puntuaciones as Record<string, number> | null;
        const detalle = e.tipo === "route_snapshot"
          ? `estado del recorrido: ${e.fase}, ${e.completados}/${e.total} puntos`
          : `${e.modo}${e.alerta ? " · ALERTA" : ""}${e.foto ? " · con foto" : ""} · ${p ? Object.entries(p).map(([k, v]) => `${k} ${Math.round(v * 100)}`).join(", ") : "sin puntuaciones"}`;
        console.log(`#${e.seq} ${hora(String(e.capturado))} · ${e.lote_id ?? "sin lote"} · ${e.simulado ? "demo" : "real"} · ${detalle}`);
        ultimo = Number(e.seq);
      }
      await new Promise((ok) => setTimeout(ok, 15_000)); // recoger el resto del envío
      const resto = await db.execute(sql`SELECT count(*)::int AS n FROM cultivos_registros WHERE seq > ${ultimo}`);
      console.log(`…y ${(resto.rows[0] as { n: number }).n} eventos más en los 15 s siguientes.`);
      break;
    }
    await new Promise((ok) => setTimeout(ok, 5_000));
  }
  if (Date.now() >= fin) console.log("No llegó ningún evento en ese tiempo.");
  await closeDb();
})();
