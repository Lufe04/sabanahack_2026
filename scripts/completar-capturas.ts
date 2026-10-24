/**
 * Completa con bloque, cama y planta las capturas que ya están en la base (asignación del MVP).
 * Uso: npx dotenv -e .env.local -- tsx scripts/completar-capturas.ts [--todas]
 */
import { completarObservaciones } from "../src/lib/cultivos/completar";
import { closeDb } from "../src/db";
(async () => {
  const n = await completarObservaciones({ soloIncompletas: !process.argv.includes("--todas") });
  console.log(`Capturas completadas: ${n}`);
  await closeDb();
})();
