import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import type { Puntuaciones } from "@/db/schema";

/**
 * Consultas de las pantallas Capturas y Recorridos sobre las tablas del adaptador 0.2.2.
 * El payload completo de la APK vive en `datos` (JSONB); aquí se leen sus campos.
 */

export { CLASES, type Clase } from "@/lib/cultivos/clases";

/** Origen del recorrido: real (operador en campo) o demo con avance simulado por tiempo. */
export type Origen = "real" | "demo";

export type FiltrosCapturas = {
  lote?: string;
  revision?: string; // inspection_id
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
    ${f.revision ? sql`AND ${INSPECCION} = ${f.revision}` : sql``}
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
  c.datos->>'name' AS "recorridoNombre",
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
  recorridoNombre: string | null;
  /** Ubicación en el bloque: la app aún no la envía, la completa la asignación fija del MVP. */
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
    LEFT JOIN cultivos_recorridos c ON c.inspection_id::text = ${INSPECCION}
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
           count(DISTINCT ${INSPECCION}) FILTER (WHERE NOT ${SIMULADO})::int AS "revisionesReales",
           count(DISTINCT ${INSPECCION}) FILTER (WHERE ${SIMULADO})::int AS "revisionesDemo",
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
    revisionesReales: number;
    revisionesDemo: number;
    ultima: string | null;
  };
}

export async function getCaptura(id: string): Promise<CapturaFila | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await getDb().execute(sql`
    SELECT ${COLUMNAS_CAPTURA}
    FROM cultivos_registros r
    LEFT JOIN cultivos_recorridos c ON c.inspection_id::text = ${INSPECCION}
    WHERE r.id = ${id} AND r.tipo = 'observation'
  `);
  return (res.rows[0] ?? null) as CapturaFila | null;
}

export async function getFoto(id: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await getDb().execute(sql`SELECT foto FROM cultivos_registros WHERE id = ${id} AND foto IS NOT NULL`);
  return r.rows.length ? (r.rows[0] as { foto: Buffer }).foto : null;
}

export type RecorridoFila = {
  inspectionId: string;
  planId: string;
  loteId: string;
  nombre: string | null;
  fase: string;
  completados: number;
  total: number;
  revision: number;
  actualizadoEn: string;
  simulado: boolean;
  segundosPorPunto: number | null;
  conGeometria: boolean;
  lecturas: number;
  alertas: number;
};

const COLUMNAS_RECORRIDO = sql`
  c.inspection_id AS "inspectionId", c.plan_id AS "planId", c.lote_id AS "loteId",
  c.datos->>'name' AS nombre, c.fase, c.completados, c.total, c.revision::int AS revision,
  ${iso("c.actualizado_en")} AS "actualizadoEn",
  COALESCE((c.datos->>'simulated')::boolean, false) AS simulado,
  (c.datos->>'simulation_point_seconds')::int AS "segundosPorPunto",
  EXISTS (SELECT 1 FROM jsonb_array_elements(c.datos->'waypoints') w WHERE w ? 'display_position' AND w->'display_position' <> 'null'::jsonb) AS "conGeometria",
  (SELECT count(*) FROM cultivos_registros r WHERE r.tipo = 'observation' AND ${INSPECCION} = c.inspection_id::text)::int AS lecturas,
  (SELECT count(*) FROM cultivos_registros r WHERE r.alerta AND ${INSPECCION} = c.inspection_id::text)::int AS alertas
`;

export async function getRecorridos(f: { lote?: string; origen?: Origen } = {}): Promise<RecorridoFila[]> {
  const res = await getDb().execute(sql`
    SELECT ${COLUMNAS_RECORRIDO}
    FROM cultivos_recorridos c
    WHERE TRUE
      ${f.lote ? sql`AND c.lote_id = ${f.lote}` : sql``}
      ${f.origen === "demo" ? sql`AND COALESCE((c.datos->>'simulated')::boolean, false)` : f.origen === "real" ? sql`AND NOT COALESCE((c.datos->>'simulated')::boolean, false)` : sql``}
    ORDER BY c.actualizado_en DESC
  `);
  return res.rows as RecorridoFila[];
}

export async function getRecorrido(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await getDb().execute(sql`
    SELECT ${COLUMNAS_RECORRIDO}, c.datos->'waypoints' AS puntos,
           (SELECT count(*) FROM cultivos_recorridos o WHERE o.plan_id = c.plan_id)::int AS "revisionesDelPlan",
           (SELECT count(*) FROM cultivos_registros r WHERE r.tipo = 'route_snapshot' AND r.datos->'route'->>'id' = c.inspection_id::text)::int AS "versionesRecibidas"
    FROM cultivos_recorridos c WHERE c.inspection_id = ${id}
  `);
  return (res.rows[0] ?? null) as (RecorridoFila & { puntos: unknown[]; revisionesDelPlan: number; versionesRecibidas: number }) | null;
}

/** Revisiones que aparecen en el filtro de Capturas. */
export async function getOpcionesRevision() {
  const res = await getDb().execute(sql`
    SELECT DISTINCT ${INSPECCION} AS id, coalesce(c.datos->>'name', left(${INSPECCION}, 8)) AS nombre
    FROM cultivos_registros r
    LEFT JOIN cultivos_recorridos c ON c.inspection_id::text = ${INSPECCION}
    WHERE r.tipo = 'observation' AND ${INSPECCION} IS NOT NULL
    ORDER BY 2
  `);
  return res.rows as { id: string; nombre: string }[];
}

/** Punto de un recorrido. `lat/lng` es GPS medido; nunca se usa la posición simulada como GPS. */
export type PuntoRecorrido = {
  id: string;
  orden: number;
  nombre: string | null;
  completado: boolean;
  revisadoEn: string | null;
  virtual: boolean;
  lat: number | null;
  lng: number | null;
  precisionM: number | null;
};

/**
 * Normaliza los puntos de un `route_snapshot`. El avance es secuencial: los primeros
 * `completados` puntos están revisados, igual que en el feed GeoJSON del adaptador.
 */
export function normalizarPuntos(puntos: unknown[] | null, completados: number): PuntoRecorrido[] {
  return (puntos ?? []).map((p, i) => {
    const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    const loc = (o.location && typeof o.location === "object" ? o.location : null) as Record<string, unknown> | null;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const lat = loc ? n(loc.latitude) : null;
    const lng = loc ? n(loc.longitude) : null;
    return {
      id: String(o.id ?? i),
      orden: i + 1,
      nombre: typeof o.label === "string" ? o.label : null,
      completado: i < completados,
      revisadoEn: typeof o.reviewed_at === "string" ? o.reviewed_at : null,
      virtual: o.source === "timed_simulation",
      lat: lat !== null && lng !== null ? lat : null,
      lng: lat !== null && lng !== null ? lng : null,
      precisionM: loc ? n(loc.accuracy_m) : null,
    };
  });
}

export { faseLegible, type TonoFase } from "@/lib/cultivos/clases";

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
