import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

let _db: Db | null = null;
let _pool: Pool | null = null;

/**
 * Conexión perezosa: no se abre en tiempo de build, solo cuando
 * una ruta la necesita. Funciona igual contra Postgres local y Neon.
 */
export function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está definida");
    _pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
    });
    // Fechas (current_date, date_trunc) en hora de Colombia
    _pool.on("connect", (c) => void c.query("SET timezone = 'America/Bogota'"));
    _db = drizzle(_pool, { schema });
  }
  return _db;
}

export async function closeDb() {
  await _pool?.end();
  _pool = null;
  _db = null;
}

export { schema };
