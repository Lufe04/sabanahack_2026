import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

let _db: Db | null = null;
let _pool: Pool | null = null;

const esLocal = (url: string) => url.includes("localhost") || url.includes("127.0.0.1");

/**
 * Conexión perezosa: no se abre en tiempo de build, solo cuando una ruta la
 * necesita. Funciona igual contra Postgres local (Docker) y Neon en Vercel.
 *
 * La zona horaria (America/Bogota) se fija a nivel de base de datos con
 * `npm run db:timezone`, porque el pooler de Neon no conserva un SET de sesión.
 */
export function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está definida");
    _pool = new Pool({
      // Verificación completa del certificado, explícita (evita el aviso de pg sobre sslmode=require)
      connectionString: esLocal(url) ? url : url.replace(/sslmode=(require|prefer|verify-ca)/, "sslmode=verify-full"),
      max: esLocal(url) ? 5 : 3,
      idleTimeoutMillis: 10_000,
      ssl: esLocal(url) ? undefined : { rejectUnauthorized: true },
    });
    // En Vercel (Fluid Compute) cierra conexiones ociosas antes de suspender la función.
    if (process.env.VERCEL) attachDatabasePool(_pool);
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
