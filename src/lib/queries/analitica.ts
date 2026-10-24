import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import type { Enfermedad } from "@/db/schema";

export type RankingLote = {
  loteId: string;
  nombre: string;
  variedad: string;
  drenaje: string;
  hectareas: number;
  brotes: number;
  brotesPorHa: number;
  severidadProm: number;
  areaAfectadaProm: number;
  diasEnfermo: number;
  diasEntreBrotes: number | null;
  diasDeteccionProm: number | null;
};

/** Ranking de lotes: cuánto, qué tan grave y cada cuánto se enferman. */
export async function getRankingLotes(): Promise<RankingLote[]> {
  const db = getDb();
  const res = await db.execute(sql`
    WITH ev AS (
      SELECT e.*,
             coalesce(e.fecha_fin, current_date) - e.fecha_inicio AS duracion,
             e.fecha_inicio - lag(e.fecha_inicio) OVER (PARTITION BY e.lote_id ORDER BY e.fecha_inicio) AS gap
      FROM eventos_enfermedad e
    ),
    agg AS (
      SELECT lote_id,
             count(*)::int AS brotes,
             avg(severidad_max)::float AS "severidadProm",
             avg(area_afectada_pct)::float AS "areaAfectadaProm",
             sum(duracion)::int AS "diasEnfermo",
             avg(gap)::float AS "diasEntreBrotes",
             avg(fecha_deteccion - fecha_inicio)::float AS "diasDeteccionProm"
      FROM ev GROUP BY lote_id
    )
    SELECT l.id AS "loteId", l.nombre, l.variedad, l.drenaje, l.hectareas,
           coalesce(a.brotes, 0) AS brotes,
           round((coalesce(a.brotes, 0) / l.hectareas)::numeric, 2)::float AS "brotesPorHa",
           round(coalesce(a."severidadProm", 0)::numeric, 2)::float AS "severidadProm",
           round(coalesce(a."areaAfectadaProm", 0)::numeric, 1)::float AS "areaAfectadaProm",
           coalesce(a."diasEnfermo", 0) AS "diasEnfermo",
           round(a."diasEntreBrotes"::numeric, 1)::float AS "diasEntreBrotes",
           round(a."diasDeteccionProm"::numeric, 1)::float AS "diasDeteccionProm"
    FROM lotes l LEFT JOIN agg a ON a.lote_id = l.id
    ORDER BY brotes DESC, "severidadProm" DESC
  `);
  return res.rows as RankingLote[];
}

/** Matriz lote × enfermedad (conteo de brotes). */
export async function getMatrizLoteEnfermedad() {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT lote_id AS "loteId", enfermedad, count(*)::int AS n
    FROM eventos_enfermedad GROUP BY lote_id, enfermedad
  `);
  return res.rows as { loteId: string; enfermedad: Enfermedad; n: number }[];
}

/** Matriz lote × mes (conteo de brotes). */
export async function getMatrizLoteMes() {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT lote_id AS "loteId", to_char(fecha_inicio, 'YYYY-MM') AS mes, count(*)::int AS n
    FROM eventos_enfermedad GROUP BY lote_id, mes ORDER BY mes
  `);
  return res.rows as { loteId: string; mes: string; n: number }[];
}

/** Brotes por mes y enfermedad (para barras apiladas). */
export async function getBrotesPorMes() {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT to_char(fecha_inicio, 'YYYY-MM') AS mes, enfermedad, count(*)::int AS n
    FROM eventos_enfermedad GROUP BY mes, enfermedad ORDER BY mes
  `);
  return res.rows as { mes: string; enfermedad: Enfermedad; n: number }[];
}

export type ResumenEnfermedad = {
  enfermedad: Enfermedad;
  brotes: number;
  severidadProm: number;
  duracionProm: number;
  areaProm: number;
  lotesAfectados: number;
  pctDron: number;
};

export async function getResumenEnfermedades(): Promise<ResumenEnfermedad[]> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT enfermedad,
           count(*)::int AS brotes,
           round(avg(severidad_max)::numeric, 1)::float AS "severidadProm",
           round(avg(coalesce(fecha_fin, current_date) - fecha_inicio)::numeric, 0)::float AS "duracionProm",
           round(avg(area_afectada_pct)::numeric, 1)::float AS "areaProm",
           count(DISTINCT lote_id)::int AS "lotesAfectados",
           round(100.0 * sum((origen = 'dron')::int) / count(*), 0)::float AS "pctDron"
    FROM eventos_enfermedad GROUP BY enfermedad ORDER BY brotes DESC
  `);
  return res.rows as ResumenEnfermedad[];
}

export type TasaPorCondicion = {
  rango: string;
  orden: number;
  loteDias: number;
  brotes: number;
  tasaPor100: number;
  porPlaga: Record<Enfermedad, number>;
};

/**
 * ¿Cómo cambia la probabilidad de brote con el ambiente?
 * Para cada lote-día toma el promedio de los 5 días previos de la variable
 * y lo cruza con los brotes que empezaron ese día, por plaga.
 * Devuelve brotes por cada 100 lote-días.
 */
export async function getTasaBrotePorCondicion(variable: "horas_humedad_alta" | "temp_prom"): Promise<TasaPorCondicion[]> {
  const db = getDb();
  const col = sql.raw(variable);
  const bucket =
    variable === "horas_humedad_alta"
      ? sql`CASE WHEN v < 9 THEN '< 9 h' WHEN v < 12 THEN '9–12 h' WHEN v < 15 THEN '12–15 h' WHEN v < 18 THEN '15–18 h' ELSE '≥ 18 h' END`
      : sql`CASE WHEN v < 12 THEN '< 12 °C' WHEN v < 13 THEN '12–13 °C' WHEN v < 14 THEN '13–14 °C' WHEN v < 15 THEN '14–15 °C' ELSE '≥ 15 °C' END`;
  const orden =
    variable === "horas_humedad_alta"
      ? sql`CASE WHEN v < 9 THEN 1 WHEN v < 12 THEN 2 WHEN v < 15 THEN 3 WHEN v < 18 THEN 4 ELSE 5 END`
      : sql`CASE WHEN v < 12 THEN 1 WHEN v < 13 THEN 2 WHEN v < 14 THEN 3 WHEN v < 15 THEN 4 ELSE 5 END`;
  const res = await db.execute(sql`
    WITH base AS (
      SELECT r.lote_id, r.fecha,
             avg(${col}) OVER (PARTITION BY r.lote_id ORDER BY r.fecha ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS v
      FROM resumen_diario_lote r
    ),
    b AS (
      SELECT ${bucket} AS rango, ${orden} AS orden, base.lote_id, base.fecha FROM base
    ),
    conteo AS (
      SELECT b.rango, b.orden, count(*)::int AS lote_dias,
             sum((SELECT count(*) FROM eventos_enfermedad e WHERE e.lote_id = b.lote_id AND e.fecha_inicio = b.fecha))::int AS brotes,
             sum((SELECT count(*) FROM eventos_enfermedad e WHERE e.lote_id = b.lote_id AND e.fecha_inicio = b.fecha AND e.enfermedad = 'trips'))::int AS trips,
             sum((SELECT count(*) FROM eventos_enfermedad e WHERE e.lote_id = b.lote_id AND e.fecha_inicio = b.fecha AND e.enfermedad = 'botrytis'))::int AS botrytis,
             sum((SELECT count(*) FROM eventos_enfermedad e WHERE e.lote_id = b.lote_id AND e.fecha_inicio = b.fecha AND e.enfermedad = 'alternaria'))::int AS alternaria
      FROM b GROUP BY b.rango, b.orden
    )
    SELECT rango, orden, lote_dias AS "loteDias", brotes,
           round(100.0 * brotes / lote_dias, 2)::float AS "tasaPor100",
           json_build_object(
             'trips', round(100.0 * trips / lote_dias, 2),
             'botrytis', round(100.0 * botrytis / lote_dias, 2),
             'alternaria', round(100.0 * alternaria / lote_dias, 2)
           ) AS "porPlaga"
    FROM conteo ORDER BY orden
  `);
  return res.rows as TasaPorCondicion[];
}

export async function getBrotesPorDrenaje() {
  const db = getDb();
  const res = await db.execute(sql`
    WITH por_lote AS (
      SELECT l.id, l.drenaje, l.hectareas,
             (SELECT count(*) FROM eventos_enfermedad e WHERE e.lote_id = l.id) AS brotes
      FROM lotes l
    )
    SELECT drenaje, count(*)::int AS lotes, sum(brotes)::int AS brotes,
           round((sum(brotes) / sum(hectareas))::numeric, 2)::float AS "brotesPorHa"
    FROM por_lote
    GROUP BY drenaje
    ORDER BY CASE drenaje WHEN 'bueno' THEN 1 WHEN 'regular' THEN 2 ELSE 3 END
  `);
  return res.rows as { drenaje: string; lotes: number; brotes: number; brotesPorHa: number }[];
}

export type KpisGenerales = {
  lotes: number;
  hectareas: number;
  eventosAbiertos: number;
  brotes30d: number;
  brotes30dPrev: number;
  riesgoProm: number;
  lotesRiesgoAlto: number;
  sensoresActivos: number;
  sensoresCaidos: number;
  vuelos7d: number;
  ndviProm: number | null;
  pctDeteccionDron: number;
  diasDeteccionProm: number | null;
};

export async function getKpis(): Promise<KpisGenerales> {
  const db = getDb();
  const res = await db.execute(sql`
    WITH ultimo AS (
      SELECT DISTINCT ON (lote_id) lote_id, indice_riesgo
      FROM resumen_diario_lote ORDER BY lote_id, fecha DESC
    ),
    ult_lectura AS (
      SELECT s.id, s.activo, max(le.ts) AS ts
      FROM sensores s LEFT JOIN lecturas le ON le.sensor_id = s.id AND le.ts <= now()
      GROUP BY s.id, s.activo
    ),
    ndvi AS (
      SELECT DISTINCT ON (lote_id) lote_id, ndvi FROM vuelos_dron WHERE fecha <= now() ORDER BY lote_id, fecha DESC
    )
    SELECT
      (SELECT count(*)::int FROM lotes) AS lotes,
      (SELECT round(sum(hectareas)::numeric, 1)::float FROM lotes) AS hectareas,
      (SELECT count(*)::int FROM eventos_enfermedad WHERE estado <> 'cerrado') AS "eventosAbiertos",
      (SELECT count(*)::int FROM eventos_enfermedad WHERE fecha_inicio >= current_date - 30) AS "brotes30d",
      (SELECT count(*)::int FROM eventos_enfermedad WHERE fecha_inicio >= current_date - 60 AND fecha_inicio < current_date - 30) AS "brotes30dPrev",
      (SELECT round(avg(indice_riesgo)::numeric, 0)::float FROM ultimo) AS "riesgoProm",
      (SELECT count(*)::int FROM ultimo WHERE indice_riesgo >= 40) AS "lotesRiesgoAlto",
      (SELECT count(*)::int FROM ult_lectura WHERE ts >= now() - interval '6 hours') AS "sensoresActivos",
      (SELECT count(*)::int FROM ult_lectura WHERE ts IS NULL OR ts < now() - interval '6 hours') AS "sensoresCaidos",
      (SELECT count(*)::int FROM vuelos_dron WHERE fecha >= now() - interval '7 days' AND fecha <= now()) AS "vuelos7d",
      (SELECT round(avg(ndvi)::numeric, 2)::float FROM ndvi) AS "ndviProm",
      (SELECT coalesce(round(100.0 * sum((origen = 'dron')::int) / nullif(count(*), 0), 0), 0)::float FROM eventos_enfermedad) AS "pctDeteccionDron",
      (SELECT round(avg(fecha_deteccion - fecha_inicio)::numeric, 1)::float FROM eventos_enfermedad) AS "diasDeteccionProm"
  `);
  return res.rows[0] as KpisGenerales;
}
