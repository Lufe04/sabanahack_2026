/**
 * Genera el historial simulado y lo carga en la base de datos.
 * Uso: npm run db:seed  (requiere DATABASE_URL, ver .env.local)
 */
import { sql } from "drizzle-orm";
import { getDb, closeDb, schema } from "../src/db";
import { generarHistorial } from "../src/lib/simulador";

const LOTE = 4000;

async function insertarEnLotes<T>(nombre: string, filas: T[], fn: (b: T[]) => Promise<unknown>) {
  const t0 = Date.now();
  for (let i = 0; i < filas.length; i += LOTE) {
    await fn(filas.slice(i, i + LOTE));
    if (filas.length > LOTE * 5 && (i / LOTE) % 10 === 0) {
      process.stdout.write(`\r  ${nombre}: ${Math.min(i + LOTE, filas.length)}/${filas.length}`);
    }
  }
  console.log(`\r  ${nombre}: ${filas.length} filas en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

async function main() {
  const dias = Number(process.env.SEED_DIAS ?? 180);
  const seed = Number(process.env.SEED ?? 7);
  console.log(`Generando ${dias} días de historial (seed ${seed})...`);
  const h = generarHistorial({ dias, seed });
  console.log(
    `  ${h.lotes.length} lotes, ${h.sensores.length} sensores, ${h.lecturas.length} lecturas, ${h.vuelos.length} vuelos, ${h.eventos.length} eventos`,
  );

  const db = getDb();
  console.log("Limpiando tablas...");
  await db.execute(sql`TRUNCATE TABLE
    ${schema.resumenDiarioLote}, ${schema.cosechas}, ${schema.detecciones}, ${schema.eventosEnfermedad},
    ${schema.vuelosDron}, ${schema.lecturas}, ${schema.sensores}, ${schema.lotes}
    RESTART IDENTITY CASCADE`);

  console.log("Insertando...");
  await db.execute(sql`TRUNCATE TABLE ${schema.estadoSimulador}`);
  await db.insert(schema.lotes).values(h.lotes);
  await db.insert(schema.sensores).values(h.sensores);
  await insertarEnLotes("lecturas", h.lecturas, (b) => db.insert(schema.lecturas).values(b));

  // Vuelos: necesitamos los ids para las detecciones
  const vuelosInsertados = await db
    .insert(schema.vuelosDron)
    .values(h.vuelos.map((v) => v.vuelo))
    .returning({ id: schema.vuelosDron.id });
  const detecciones = h.vuelos.flatMap((v, i) =>
    v.detecciones.map((d) => ({ ...d, vueloId: vuelosInsertados[i].id })),
  );
  console.log(`  vuelos: ${vuelosInsertados.length} filas`);
  if (detecciones.length) await db.insert(schema.detecciones).values(detecciones);
  console.log(`  detecciones: ${detecciones.length} filas`);

  if (h.eventos.length) await db.insert(schema.eventosEnfermedad).values(h.eventos);
  console.log(`  eventos: ${h.eventos.length} filas`);
  await insertarEnLotes("resumen diario", h.resumen, (b) => db.insert(schema.resumenDiarioLote).values(b));
  await db.insert(schema.cosechas).values(h.cosechas);
  console.log(`  cosechas: ${h.cosechas.length} filas`);
  await db.insert(schema.estadoSimulador).values({ id: 1, estado: h.estado });
  console.log("  estado del simulador guardado");

  await closeDb();
  console.log("Listo.");
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
