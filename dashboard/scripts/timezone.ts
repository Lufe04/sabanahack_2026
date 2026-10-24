/**
 * Fija la zona horaria de la base de datos en America/Bogota para que
 * current_date y date_trunc usen el día de Colombia, también vía pooler.
 * Uso: npm run db:timezone (o db:timezone:prod contra Neon)
 */
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";

export async function fijarZonaHoraria() {
  const db = getDb();
  await db.execute(sql`DO $$ BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone = %L', current_database(), 'America/Bogota');
  END $$;`);
}

if (process.argv[1]?.endsWith("timezone.ts")) {
  fijarZonaHoraria()
    .then(() => console.log("Zona horaria de la base: America/Bogota"))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
