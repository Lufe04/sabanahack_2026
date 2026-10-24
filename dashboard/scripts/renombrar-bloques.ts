// Los agricultores identifican los bloques solo por número: "Bloque N".
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(
    "UPDATE lotes SET nombre = 'Bloque ' || substr(id, 2)::int RETURNING id, nombre",
  );
  console.table(r.rows.sort((a, b) => a.id.localeCompare(b.id)));
  await pool.end();
}

main();
