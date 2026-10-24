import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import type { Puntuaciones } from "@/db/schema";

/**
 * Consultas de la pantalla Capturas sobre las tablas del adaptador 0.2.2.
 * El payload completo de la APK vive en `datos` (JSONB); aquí se leen sus campos.
 */

export { CLASES, type Clase } from "@/lib/cultivos/clases";

/** Origen de una lectura: real (operador en campo) o demo con avance simulado por tiempo. */
export type Origen = "real" | "demo";

export type FiltrosCapturas = {
  lote?: string;
  desde?: string; // YYYY-MM-DD, hora de Colombia
  hasta?: string;
  alerta?: "si" | "no";
  origen?: Origen;
};

const iso = (c: string) => sql.raw(`to_char(${c} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
const SIMULADO = sql.raw(`COALESCE((r.datos->>'simulated')::boolean, false)`);
const INSPECCION = sql.raw(`r.datos->'route_context'->>'inspection_id'`);

function where(f: FiltrosCapturas): SQL {
  return sql`
    r.tipo = 'observation'
    ${f.lote ? sql`AND r.lote_id = ${f.lote}` : sql``}
    ${f.desde ? sql`AND r.capturado_en >= ${f.desde}::date` : sql``}
    ${f.hasta ? sql`AND r.capturado_en < ${f.hasta}::date + 1` : sql``}
    ${f.alerta === "si" ? sql`AND r.alerta` : f.alerta === "no" ? sql`AND NOT r.alerta` : sql``}
    ${f.origen === "demo" ? sql`AND ${SIMULADO}` : f.origen === "real" ? sql`AND NOT ${SIMULADO}` : sql``}
  `;
}

const COLUMNAS_CAPTURA = sql`
  r.id, ${iso("r.capturado_en")} AS "capturadoEn", ${iso("r.recibido_en")} AS "recibidoEn",
  r.lote_id AS "loteId", r.alerta, r.puntuaciones, (r.foto IS NOT NULL) AS "tieneFoto",
  r.revision_humana AS "revisionHumana", ${iso("r.revisado_en")} AS "revisadoEn",
  r.datos->>'model_version' AS modelo,
  r.datos->>'capture_mode' AS "modoCaptura",
  r.datos->>'mission' AS mision,
  (r.datos->>'schema_version') IS NULL AS antigua,
  ${SIMULADO} AS simulado,
  ${INSPECCION} AS "inspectionId",
  r.datos->'route_context'->>'plan_id' AS "planId",
  r.datos->'route_context'->>'waypoint_id' AS "waypointId",
  (coalesce(r.datos->'location', r.datos->'route_context'->'location')->>'latitude')::float AS lat,
  (coalesce(r.datos->'location', r.datos->'route_context'->'location')->>'longitude')::float AS lng,
  (coalesce(r.datos->'location', r.datos->'route_context'->'location')->>'accuracy_m')::float AS "precisionM",
  coalesce((r.datos->'asignacion_mvp'->>'nave')::int, ceil((r.datos->'asignacion_mvp'->>'cama')::numeric / 3)::int) AS nave,
  (r.datos->'asignacion_mvp'->>'cama')::int AS cama,
  (r.datos->'asignacion_mvp'->>'posicion')::int AS posicion,
  r.datos->'asignacion_mvp'->>'tag' AS tag,
  r.datos->'asignacion_mvp'->>'plantaApp' AS "plantaApp",
  coalesce(r.datos->'asignacion_mvp'->'origen'->>'bloque', 'app') AS "origenBloque",
  coalesce(r.datos->'asignacion_mvp'->'origen'->>'cama', 'app') AS "origenCama"
`;

export type CapturaFila = {
  id: string;
  capturadoEn: string;
  recibidoEn: string;
  loteId: string | null;
  alerta: boolean;
  puntuaciones: Puntuaciones | null;
  tieneFoto: boolean;
  revisionHumana: string;
  revisadoEn: string | null;
  modelo: string | null;
  modoCaptura: string | null;
  mision: string | null;
  antigua: boolean;
  simulado: boolean;
  inspectionId: string | null;
  planId: string | null;
  waypointId: string | null;
  lat: number | null;
  lng: number | null;
  precisionM: number | null;
  /** Ubicación en el bloque: la app aún no la envía, la completa la asignación fija del MVP. */
  nave: number | null;
  cama: number | null;
  posicion: number | null;
  tag: string | null;
  plantaApp: string | null;
  origenBloque: "app" | "mvp";
  origenCama: "app" | "mvp";
};

export async function getCapturas(f: FiltrosCapturas, limite = 200): Promise<CapturaFila[]> {
  const res = await getDb().execute(sql`
    SELECT ${COLUMNAS_CAPTURA}
    FROM cultivos_registros r
    WHERE ${where(f)}
    ORDER BY r.capturado_en DESC, r.seq DESC
    LIMIT ${limite}
  `);
  return res.rows as CapturaFila[];
}

/** Conteos separados: lo real nunca se suma con la demo simulada. */
export async function getResumenCapturas(f: FiltrosCapturas) {
  const res = await getDb().execute(sql`
    SELECT count(*) FILTER (WHERE NOT ${SIMULADO})::int AS "lecturasReales",
           count(*) FILTER (WHERE ${SIMULADO})::int AS "lecturasDemo",
           count(*) FILTER (WHERE r.alerta AND NOT ${SIMULADO})::int AS "alertasReales",
           count(*) FILTER (WHERE r.alerta AND ${SIMULADO})::int AS "alertasDemo",
           count(*) FILTER (WHERE r.alerta AND r.revision_humana = 'pendiente')::int AS "alertasPendientes",
           count(*) FILTER (WHERE r.foto IS NOT NULL)::int AS "conFoto",
           count(DISTINCT r.datos->'asignacion_mvp'->>'tag')::int AS plantas,
           ${iso("max(r.capturado_en)")} AS ultima
    FROM cultivos_registros r WHERE ${where(f)}
  `);
  return res.rows[0] as {
    lecturasReales: number;
    lecturasDemo: number;
    alertasReales: number;
    alertasDemo: number;
    alertasPendientes: number;
    conFoto: number;
    plantas: number;
    ultima: string | null;
  };
}

export async function getCaptura(id: string): Promise<CapturaFila | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await getDb().execute(sql`
    SELECT ${COLUMNAS_CAPTURA}
    FROM cultivos_registros r
    WHERE r.id = ${id} AND r.tipo = 'observation'
  `);
  return (res.rows[0] ?? null) as CapturaFila | null;
}

export async function getFoto(id: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await getDb().execute(sql`SELECT foto FROM cultivos_registros WHERE id = ${id} AND foto IS NOT NULL`);
  return r.rows.length ? (r.rows[0] as { foto: Buffer }).foto : null;
}

/** Última captura de cada planta de un bloque, para ubicarlas en el plano. */
export async function getCapturasPorPlanta(loteId: string) {
  const res = await getDb().execute(sql`
    SELECT DISTINCT ON (r.datos->'asignacion_mvp'->>'tag')
           r.id AS "observationId", ${iso("r.capturado_en")} AS fecha, r.alerta, r.puntuaciones AS scores,
           (r.datos->'asignacion_mvp'->>'cama')::int AS cama,
           (r.datos->'asignacion_mvp'->>'posicion')::int AS posicion,
           r.datos->'asignacion_mvp'->>'tag' AS tag
    FROM cultivos_registros r
    WHERE r.tipo = 'observation' AND r.lote_id = ${loteId} AND r.datos ? 'asignacion_mvp'
    ORDER BY r.datos->'asignacion_mvp'->>'tag', r.capturado_en DESC
  `);
  return res.rows as { observationId: string; fecha: string; alerta: boolean; scores: Record<string, number> | null; cama: number; posicion: number; tag: string }[];
}
