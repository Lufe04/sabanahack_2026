import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import type { Enfermedad } from "@/db/schema";

/** Precio de referencia en finca (COP por kg). Supuesto del MVP, ajustable. */
export const PRECIO_COP_KG = 14000;

export type BrotePeriodo = {
  id: number;
  loteId: string;
  loteNombre: string;
  enfermedad: Enfermedad;
  fechaInicio: string;
  fechaFin: string | null;
  severidadMax: number;
  areaAfectadaPct: number;
  estado: string;
};

/** Brotes que tocan el período, para la línea de tiempo. */
export async function getBrotesPeriodo(dias: number): Promise<BrotePeriodo[]> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT e.id, e.lote_id AS "loteId", l.nombre AS "loteNombre", e.enfermedad,
           e.fecha_inicio::text AS "fechaInicio", e.fecha_fin::text AS "fechaFin",
           e.severidad_max AS "severidadMax", e.area_afectada_pct AS "areaAfectadaPct", e.estado
    FROM eventos_enfermedad e JOIN lotes l ON l.id = e.lote_id
    WHERE coalesce(e.fecha_fin, current_date) >= current_date - ${dias}::int
    ORDER BY e.lote_id, e.fecha_inicio
  `);
  return res.rows as BrotePeriodo[];
}

/** Cuántos lotes tenían al menos un brote abierto cada día, por plaga. */
export async function getLotesEnfermosPorDia(dias: number) {
  const db = getDb();
  const res = await db.execute(sql`
    WITH d AS (
      SELECT generate_series(current_date - ${dias}::int, current_date, interval '1 day')::date AS fecha
    )
    SELECT d.fecha::text AS fecha,
           count(DISTINCT e.lote_id) FILTER (WHERE e.enfermedad = 'trips')::int AS trips,
           count(DISTINCT e.lote_id) FILTER (WHERE e.enfermedad = 'botrytis')::int AS botrytis,
           count(DISTINCT e.lote_id) FILTER (WHERE e.enfermedad = 'alternaria')::int AS alternaria,
           count(DISTINCT e.lote_id)::int AS total
    FROM d LEFT JOIN eventos_enfermedad e
      ON e.fecha_inicio <= d.fecha AND coalesce(e.fecha_fin, current_date) >= d.fecha
    GROUP BY d.fecha ORDER BY d.fecha
  `);
  return res.rows as { fecha: string; trips: number; botrytis: number; alternaria: number; total: number }[];
}

export type ProduccionLote = {
  loteId: string;
  nombre: string;
  hectareas: number;
  kgCosechados: number;
  kgDescartados: number;
  pctPerdida: number;
  kgDescartadosPrev: number;
  pctPerdidaPrev: number;
  brotes: number;
  brotesPrev: number;
  diasEnfermo: number;
  diasEnfermoPrev: number;
  plagaPrincipal: Enfermedad | null;
};

/** Producción y pérdidas por lote en el período, comparadas con el período anterior de igual longitud. */
export async function getProduccionPorLote(dias: number): Promise<ProduccionLote[]> {
  const db = getDb();
  const res = await db.execute(sql`
    WITH act AS (
      SELECT lote_id, sum(kg_cosechados)::float AS kg, sum(kg_descartados)::float AS desc_
      FROM cosechas WHERE semana >= current_date - ${dias}::int GROUP BY lote_id
    ),
    prev AS (
      SELECT lote_id, sum(kg_cosechados)::float AS kg, sum(kg_descartados)::float AS desc_
      FROM cosechas WHERE semana >= current_date - ${dias * 2}::int AND semana < current_date - ${dias}::int GROUP BY lote_id
    ),
    ev_act AS (
      SELECT lote_id, count(*)::int AS n,
             sum(least(coalesce(fecha_fin, current_date), current_date) - greatest(fecha_inicio, current_date - ${dias}::int))::int AS dias
      FROM eventos_enfermedad WHERE coalesce(fecha_fin, current_date) >= current_date - ${dias}::int GROUP BY lote_id
    ),
    ev_prev AS (
      SELECT lote_id, count(*)::int AS n,
             sum(least(coalesce(fecha_fin, current_date), current_date - ${dias}::int) - greatest(fecha_inicio, current_date - ${dias * 2}::int))::int AS dias
      FROM eventos_enfermedad
      WHERE coalesce(fecha_fin, current_date) >= current_date - ${dias * 2}::int AND fecha_inicio < current_date - ${dias}::int
      GROUP BY lote_id
    ),
    plaga AS (
      SELECT DISTINCT ON (lote_id) lote_id, plaga_principal
      FROM (
        SELECT lote_id, plaga_principal, sum(kg_descartados) AS kg
        FROM cosechas WHERE semana >= current_date - ${dias}::int AND plaga_principal IS NOT NULL
        GROUP BY lote_id, plaga_principal
      ) x ORDER BY lote_id, kg DESC
    )
    SELECT l.id AS "loteId", l.nombre, l.hectareas,
           round(coalesce(a.kg, 0)::numeric, 0)::float AS "kgCosechados",
           round(coalesce(a.desc_, 0)::numeric, 0)::float AS "kgDescartados",
           round((100 * coalesce(a.desc_, 0) / nullif(coalesce(a.kg, 0) + coalesce(a.desc_, 0), 0))::numeric, 1)::float AS "pctPerdida",
           round(coalesce(p.desc_, 0)::numeric, 0)::float AS "kgDescartadosPrev",
           round((100 * coalesce(p.desc_, 0) / nullif(coalesce(p.kg, 0) + coalesce(p.desc_, 0), 0))::numeric, 1)::float AS "pctPerdidaPrev",
           coalesce(ea.n, 0) AS brotes, coalesce(ep.n, 0) AS "brotesPrev",
           coalesce(ea.dias, 0) AS "diasEnfermo", coalesce(ep.dias, 0) AS "diasEnfermoPrev",
           pl.plaga_principal AS "plagaPrincipal"
    FROM lotes l
    LEFT JOIN act a ON a.lote_id = l.id
    LEFT JOIN prev p ON p.lote_id = l.id
    LEFT JOIN ev_act ea ON ea.lote_id = l.id
    LEFT JOIN ev_prev ep ON ep.lote_id = l.id
    LEFT JOIN plaga pl ON pl.lote_id = l.id
    ORDER BY "kgDescartados" DESC
  `);
  return res.rows as ProduccionLote[];
}

/** Kilos cosechados y descartados por semana en toda la finca, con el descarte desglosado por plaga. */
export async function getProduccionSemanal(dias: number) {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT semana::text AS semana,
           round(sum(kg_cosechados)::numeric, 0)::float AS "kgCosechados",
           round(sum(kg_descartados)::numeric, 0)::float AS "kgDescartados",
           round(sum(kg_descartados) FILTER (WHERE plaga_principal = 'trips')::numeric, 0)::float AS trips,
           round(sum(kg_descartados) FILTER (WHERE plaga_principal = 'botrytis')::numeric, 0)::float AS botrytis,
           round(sum(kg_descartados) FILTER (WHERE plaga_principal = 'alternaria')::numeric, 0)::float AS alternaria,
           round(sum(kg_descartados) FILTER (WHERE plaga_principal IS NULL)::numeric, 0)::float AS otros
    FROM cosechas WHERE semana >= current_date - ${dias}::int
    GROUP BY semana ORDER BY semana
  `);
  return res.rows as { semana: string; kgCosechados: number; kgDescartados: number; trips: number; botrytis: number; alternaria: number; otros: number }[];
}

/** Pérdidas por mes y lote (kg descartados) para el heatmap. */
export async function getPerdidasLoteMes(dias: number) {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT lote_id AS "loteId", to_char(semana, 'YYYY-MM') AS mes, round(sum(kg_descartados)::numeric, 0)::int AS kg
    FROM cosechas WHERE semana >= current_date - ${dias}::int
    GROUP BY lote_id, mes ORDER BY mes
  `);
  return res.rows as { loteId: string; mes: string; kg: number }[];
}
