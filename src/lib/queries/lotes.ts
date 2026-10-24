import { sql, eq, and, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Enfermedad, EstadoEvento } from "@/db/schema";

const { lotes, resumenDiarioLote, eventosEnfermedad, lecturas, sensores } = schema;

/** El driver devuelve timestamptz como texto; lo normalizamos a ISO 8601 en UTC. */
export const iso = (col: ReturnType<typeof sql.raw>) => sql`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export type LoteEstado = {
  id: string;
  nombre: string;
  variedad: string;
  hectareas: number;
  drenaje: string;
  fechaSiembra: string;
  poligono: [number, number][];
  centroLat: number;
  centroLng: number;
  fecha: string | null;
  indiceRiesgo: number;
  riesgoPorPlaga: Record<Enfermedad, number> | null;
  humedadSueloProm: number | null;
  humedadAireProm: number | null;
  tempProm: number | null;
  horasHumedadAlta: number | null;
  eventosActivos: number;
  brotes90d: number;
  lluviaMm: number | null;
  tempMin: number | null;
  tempMax: number | null;
};

/** Todos los lotes con su último resumen diario y riesgo actual. */
export async function getLotesEstado(): Promise<LoteEstado[]> {
  const db = getDb();
  const res = await db.execute(sql`
    WITH ultimo AS (
      SELECT DISTINCT ON (lote_id) *
      FROM resumen_diario_lote
      ORDER BY lote_id, fecha DESC
    ),
    activos AS (
      SELECT lote_id, count(*)::int AS n
      FROM eventos_enfermedad WHERE estado <> 'cerrado'
      GROUP BY lote_id
    ),
    recientes AS (
      SELECT lote_id, count(*)::int AS n
      FROM eventos_enfermedad WHERE fecha_inicio >= current_date - 90
      GROUP BY lote_id
    )
    SELECT l.id, l.nombre, l.variedad, l.hectareas, l.drenaje,
           l.fecha_siembra::text AS "fechaSiembra", l.poligono,
           l.centro_lat AS "centroLat", l.centro_lng AS "centroLng",
           u.fecha::text AS fecha,
           coalesce(u.indice_riesgo, 0) AS "indiceRiesgo",
           u.riesgo_por_plaga AS "riesgoPorPlaga",
           u.humedad_suelo_prom AS "humedadSueloProm",
           u.humedad_aire_prom AS "humedadAireProm",
           u.temp_prom AS "tempProm",
           u.horas_humedad_alta AS "horasHumedadAlta",
           coalesce(a.n, 0) AS "eventosActivos",
           coalesce(r.n, 0) AS "brotes90d",
           u.lluvia_mm AS "lluviaMm", u.temp_min AS "tempMin", u.temp_max AS "tempMax"
    FROM lotes l
    LEFT JOIN ultimo u ON u.lote_id = l.id
    LEFT JOIN activos a ON a.lote_id = l.id
    LEFT JOIN recientes r ON r.lote_id = l.id
    ORDER BY l.id
  `);
  return res.rows as LoteEstado[];
}

export async function getLote(id: string) {
  const db = getDb();
  return db.query.lotes.findFirst({ where: eq(lotes.id, id) });
}

export type PuntoDiario = {
  fecha: string;
  humedadSueloProm: number | null;
  humedadAireProm: number | null;
  tempProm: number | null;
  tempMin: number | null;
  tempMax: number | null;
  horasHumedadAlta: number | null;
  lluviaMm: number | null;
  indiceRiesgo: number;
  eventosActivos: number;
};

/** Serie diaria de un lote para los últimos `dias` días. */
export async function getSerieDiariaLote(loteId: string, dias = 90): Promise<PuntoDiario[]> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT fecha::text AS fecha,
           humedad_suelo_prom AS "humedadSueloProm",
           humedad_aire_prom AS "humedadAireProm",
           temp_prom AS "tempProm", temp_min AS "tempMin", temp_max AS "tempMax",
           horas_humedad_alta AS "horasHumedadAlta",
           lluvia_mm AS "lluviaMm", indice_riesgo AS "indiceRiesgo",
           eventos_activos AS "eventosActivos"
    FROM resumen_diario_lote
    WHERE lote_id = ${loteId} AND fecha >= current_date - ${dias}::int
    ORDER BY fecha
  `);
  return res.rows as PuntoDiario[];
}

/** Riesgo promedio de la finca y brotes nuevos por día, últimos `dias` días. */
export async function getSerieDiariaFinca(dias = 60) {
  const db = getDb();
  const res = await db.execute(sql`
    WITH r AS (
      SELECT fecha, round(avg(indice_riesgo)::numeric, 1)::float AS "riesgoProm",
             max(indice_riesgo)::float AS "riesgoMax",
             round(avg(horas_humedad_alta)::numeric, 1)::float AS "horasHumedadAlta",
             round(avg(lluvia_mm)::numeric, 1)::float AS "lluviaMm"
      FROM resumen_diario_lote
      WHERE fecha >= current_date - ${dias}::int
      GROUP BY fecha
    ),
    b AS (
      SELECT fecha_inicio AS fecha, count(*)::int AS brotes
      FROM eventos_enfermedad
      WHERE fecha_inicio >= current_date - ${dias}::int
      GROUP BY fecha_inicio
    )
    SELECT r.fecha::text AS fecha, r."riesgoProm", r."riesgoMax", r."horasHumedadAlta", r."lluviaMm",
           coalesce(b.brotes, 0) AS brotes
    FROM r LEFT JOIN b ON b.fecha = r.fecha
    ORDER BY r.fecha
  `);
  return res.rows as {
    fecha: string;
    riesgoProm: number;
    riesgoMax: number;
    horasHumedadAlta: number;
    lluviaMm: number;
    brotes: number;
  }[];
}

export type EventoFila = {
  id: number;
  loteId: string;
  loteNombre: string;
  enfermedad: Enfermedad;
  fechaInicio: string;
  fechaDeteccion: string | null;
  fechaFin: string | null;
  severidadMax: number;
  areaAfectadaPct: number;
  origen: "robot" | "inspeccion";
  estado: EstadoEvento;
  tratamiento: string | null;
  diasDeteccion: number | null;
};

export async function getEventos(opts: { loteId?: string; soloAbiertos?: boolean; limite?: number } = {}) {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT e.id, e.lote_id AS "loteId", l.nombre AS "loteNombre", e.enfermedad,
           e.fecha_inicio::text AS "fechaInicio", e.fecha_deteccion::text AS "fechaDeteccion",
           e.fecha_fin::text AS "fechaFin", e.severidad_max AS "severidadMax",
           e.area_afectada_pct AS "areaAfectadaPct", e.origen, e.estado, e.tratamiento,
           (e.fecha_deteccion - e.fecha_inicio) AS "diasDeteccion"
    FROM eventos_enfermedad e JOIN lotes l ON l.id = e.lote_id
    WHERE 1 = 1
      ${opts.loteId ? sql`AND e.lote_id = ${opts.loteId}` : sql``}
      ${opts.soloAbiertos ? sql`AND e.estado <> 'cerrado'` : sql``}
    ORDER BY (e.estado <> 'cerrado') DESC, e.severidad_max DESC, e.fecha_inicio DESC
    ${opts.limite ? sql`LIMIT ${opts.limite}` : sql``}
  `);
  return res.rows as EventoFila[];
}

/** Lecturas crudas de un lote en las últimas `horas` horas, por sensor. */
export async function getLecturasRecientesLote(loteId: string, horas = 48) {
  const db = getDb();
  const filas = await db
    .select({
      sensorId: lecturas.sensorId,
      tipo: sensores.tipo,
      ts: lecturas.ts,
      valor: lecturas.valor,
    })
    .from(lecturas)
    .innerJoin(sensores, eq(sensores.id, lecturas.sensorId))
    .where(
      and(
        eq(sensores.loteId, loteId),
        gte(lecturas.ts, sql`now() - make_interval(hours => ${horas})`),
        lte(lecturas.ts, sql`now()`),
      ),
    )
    .orderBy(lecturas.ts);
  return filas;
}

export { eventosEnfermedad, resumenDiarioLote };
