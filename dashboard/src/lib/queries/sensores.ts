import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { iso } from "./lotes";
import type { TipoSensor } from "@/db/schema";

export type SensorEstado = {
  id: string;
  loteId: string;
  loteNombre: string;
  tipo: TipoSensor;
  unidad: string;
  activo: boolean;
  ultimaLectura: string | null;
  ultimoValor: number | null;
  prom24h: number | null;
  min24h: number | null;
  max24h: number | null;
  lecturas24h: number;
  estado: "ok" | "intermitente" | "caido";
};

export async function getSensoresEstado(): Promise<SensorEstado[]> {
  const db = getDb();
  const res = await db.execute(sql`
    WITH ult AS (
      SELECT DISTINCT ON (sensor_id) sensor_id, ts, valor
      FROM lecturas WHERE ts <= now()
      ORDER BY sensor_id, ts DESC
    ),
    d AS (
      SELECT sensor_id, avg(valor)::float AS prom, min(valor)::float AS mn, max(valor)::float AS mx, count(*)::int AS n
      FROM lecturas WHERE ts > now() - interval '24 hours' AND ts <= now()
      GROUP BY sensor_id
    )
    SELECT s.id, s.lote_id AS "loteId", l.nombre AS "loteNombre", s.tipo, s.unidad, s.activo,
           ${iso(sql.raw("u.ts"))} AS "ultimaLectura", u.valor AS "ultimoValor",
           round(d.prom::numeric, 1)::float AS "prom24h", d.mn AS "min24h", d.mx AS "max24h",
           coalesce(d.n, 0) AS "lecturas24h",
           CASE
             WHEN u.ts IS NULL OR u.ts < now() - interval '6 hours' THEN 'caido'
             WHEN coalesce(d.n, 0) < 40 THEN 'intermitente'
             ELSE 'ok'
           END AS estado
    FROM sensores s
    JOIN lotes l ON l.id = s.lote_id
    LEFT JOIN ult u ON u.sensor_id = s.id
    LEFT JOIN d ON d.sensor_id = s.id
    ORDER BY s.lote_id, s.tipo, s.id
  `);
  return res.rows as SensorEstado[];
}

/** Promedio horario por tipo de sensor en toda la finca, últimas `horas` horas. */
export async function getSerieHorariaFinca(horas = 72) {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT ${iso(sql.raw("date_trunc('hour', le.ts)"))} AS hora, s.tipo,
           round(avg(le.valor)::numeric, 1)::float AS valor
    FROM lecturas le JOIN sensores s ON s.id = le.sensor_id
    WHERE le.ts > now() - make_interval(hours => ${horas}) AND le.ts <= now()
    GROUP BY date_trunc('hour', le.ts), s.tipo ORDER BY 1
  `);
  return res.rows as { hora: string; tipo: TipoSensor; valor: number }[];
}
