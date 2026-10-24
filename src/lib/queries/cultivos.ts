import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import type { Puntuaciones } from "@/db/schema";

/** Clases del modelo en el orden que usa la APK. */
export const CLASES = ["alternaria", "botrytis", "sana", "trips"] as const;
export type Clase = (typeof CLASES)[number];

export type FiltrosCapturas = {
  lote?: string;
  revision?: string; // inspection_id
  desde?: string; // YYYY-MM-DD, hora de Colombia
  hasta?: string;
  alerta?: "si" | "no";
};

export type CapturaFila = {
  id: string;
  capturadoEn: string;
  loteId: string | null;
  inspectionId: string | null;
  planId: string | null;
  waypointId: string | null;
  modelo: string | null;
  puntuaciones: Puntuaciones | null;
  alerta: boolean;
  modoCaptura: string | null;
  tieneFoto: boolean;
  revisionHumana: string;
  tipo: string;
  lat: number | null;
  lng: number | null;
  precisionM: number | null;
  recorridoNombre: string | null;
};

const iso = (c: string) => sql.raw(`to_char(${c} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

function where(f: FiltrosCapturas) {
  return sql`
    r.tipo <> 'route_snapshot'
    ${f.lote ? sql`AND r.lote_id = ${f.lote}` : sql``}
    ${f.revision ? sql`AND r.inspection_id = ${f.revision}` : sql``}
    ${f.desde ? sql`AND r.capturado_en >= ${f.desde}::date` : sql``}
    ${f.hasta ? sql`AND r.capturado_en < ${f.hasta}::date + 1` : sql``}
    ${f.alerta === "si" ? sql`AND r.alerta` : f.alerta === "no" ? sql`AND NOT r.alerta` : sql``}
  `;
}

export async function getCapturas(f: FiltrosCapturas, limite = 200): Promise<CapturaFila[]> {
  const res = await getDb().execute(sql`
    SELECT r.id, ${iso("r.capturado_en")} AS "capturadoEn", r.lote_id AS "loteId",
           r.inspection_id AS "inspectionId", r.plan_id AS "planId", r.waypoint_id AS "waypointId",
           r.modelo, r.puntuaciones, r.alerta, r.modo_captura AS "modoCaptura",
           (r.foto IS NOT NULL) AS "tieneFoto", r.revision_humana AS "revisionHumana", r.tipo,
           r.lat, r.lng, r.precision_m AS "precisionM", c.nombre AS "recorridoNombre"
    FROM cultivos_registros r
    LEFT JOIN cultivos_recorridos c ON c.inspection_id = r.inspection_id
    WHERE ${where(f)}
    ORDER BY r.capturado_en DESC
    LIMIT ${limite}
  `);
  return res.rows as CapturaFila[];
}

export async function getResumenCapturas(f: FiltrosCapturas) {
  const res = await getDb().execute(sql`
    SELECT count(*)::int AS lecturas,
           count(*) FILTER (WHERE r.alerta)::int AS alertas,
           count(*) FILTER (WHERE r.foto IS NOT NULL)::int AS "conFoto",
           count(DISTINCT r.inspection_id)::int AS revisiones,
           count(*) FILTER (WHERE r.alerta AND r.revision_humana = 'pendiente')::int AS "alertasPendientes",
           ${iso("max(r.capturado_en)")} AS ultima
    FROM cultivos_registros r WHERE ${where(f)}
  `);
  return res.rows[0] as { lecturas: number; alertas: number; conFoto: number; revisiones: number; alertasPendientes: number; ultima: string | null };
}

export async function getCaptura(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await getDb().execute(sql`
    SELECT r.id, ${iso("r.capturado_en")} AS "capturadoEn", ${iso("r.recibido_en")} AS "recibidoEn",
           r.lote_id AS "loteId", r.inspection_id AS "inspectionId", r.plan_id AS "planId", r.waypoint_id AS "waypointId",
           r.modelo, r.puntuaciones, r.alerta, r.modo_captura AS "modoCaptura", r.tipo, r.schema_version AS "schemaVersion",
           (r.foto IS NOT NULL) AS "tieneFoto", r.foto_nombre AS "fotoNombre", r.foto_bytes AS "fotoBytes",
           r.revision_humana AS "revisionHumana", ${iso("r.revisado_en")} AS "revisadoEn",
           r.lat, r.lng, r.precision_m AS "precisionM", r.datos, c.nombre AS "recorridoNombre"
    FROM cultivos_registros r
    LEFT JOIN cultivos_recorridos c ON c.inspection_id = r.inspection_id
    WHERE r.id = ${id}
  `);
  return (res.rows[0] ?? null) as (CapturaFila & { recibidoEn: string; schemaVersion: number | null; fotoNombre: string | null; fotoBytes: number | null; revisadoEn: string | null; datos: Record<string, unknown> }) | null;
}

export async function getFoto(id: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await getDb().execute(sql`SELECT foto FROM cultivos_registros WHERE id = ${id} AND foto IS NOT NULL`);
  return r.rows.length ? (r.rows[0] as { foto: Buffer }).foto : null;
}

export type RecorridoFila = {
  inspectionId: string;
  planId: string | null;
  loteId: string | null;
  nombre: string | null;
  fase: string | null;
  completados: number;
  total: number;
  completa: boolean;
  revision: number;
  actualizadoEn: string;
  lecturas: number;
  alertas: number;
};

export async function getRecorridos(lote?: string): Promise<RecorridoFila[]> {
  const res = await getDb().execute(sql`
    SELECT c.inspection_id AS "inspectionId", c.plan_id AS "planId", c.lote_id AS "loteId", c.nombre, c.fase,
           c.completados, c.total, c.completa, c.revision, ${iso("c.actualizado_en")} AS "actualizadoEn",
           (SELECT count(*) FROM cultivos_registros r WHERE r.inspection_id = c.inspection_id AND r.tipo <> 'route_snapshot')::int AS lecturas,
           (SELECT count(*) FROM cultivos_registros r WHERE r.inspection_id = c.inspection_id AND r.alerta)::int AS alertas
    FROM cultivos_recorridos c
    ${lote ? sql`WHERE c.lote_id = ${lote}` : sql``}
    ORDER BY c.actualizado_en DESC
  `);
  return res.rows as RecorridoFila[];
}

export async function getRecorrido(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await getDb().execute(sql`
    SELECT c.inspection_id AS "inspectionId", c.plan_id AS "planId", c.lote_id AS "loteId", c.nombre, c.fase,
           c.completados, c.total, c.completa, c.revision, ${iso("c.actualizado_en")} AS "actualizadoEn", c.puntos, c.datos,
           (SELECT count(*) FROM cultivos_recorridos o WHERE o.plan_id = c.plan_id)::int AS "revisionesDelPlan"
    FROM cultivos_recorridos c WHERE c.inspection_id = ${id}
  `);
  return (res.rows[0] ?? null) as (Omit<RecorridoFila, "lecturas" | "alertas"> & { puntos: unknown[]; datos: Record<string, unknown>; revisionesDelPlan: number }) | null;
}

/** Revisiones que aparecen en el filtro. */
export async function getOpcionesRevision() {
  const res = await getDb().execute(sql`
    SELECT DISTINCT r.inspection_id AS id, coalesce(c.nombre, left(r.inspection_id::text, 8)) AS nombre
    FROM cultivos_registros r LEFT JOIN cultivos_recorridos c ON c.inspection_id = r.inspection_id
    WHERE r.inspection_id IS NOT NULL ORDER BY 2
  `);
  return res.rows as { id: string; nombre: string }[];
}

/** Punto de un recorrido normalizado; nunca inventa coordenadas. */
export type PuntoRecorrido = {
  id: string;
  orden: number;
  nombre: string | null;
  completado: boolean;
  lat: number | null;
  lng: number | null;
  precisionM: number | null;
};

export function normalizarPuntos(puntos: unknown[]): PuntoRecorrido[] {
  return puntos.map((p, i) => {
    const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    const loc = (o.location && typeof o.location === "object" ? o.location : o) as Record<string, unknown>;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const lat = n(loc.lat ?? loc.latitude);
    const lng = n(loc.lng ?? loc.lon ?? loc.longitude);
    const estado = String(o.status ?? o.state ?? "").toLowerCase();
    return {
      id: String(o.id ?? i),
      orden: n(o.order ?? o.index ?? o.position) ?? i + 1,
      nombre: typeof o.name === "string" ? o.name : typeof o.label === "string" ? o.label : null,
      completado: o.completed === true || o.done === true || o.reviewed === true || ["completed", "complete", "done", "reviewed", "revisado", "completo"].includes(estado),
      lat: lat !== null && lng !== null ? lat : null,
      lng: lat !== null && lng !== null ? lng : null,
      precisionM: n(loc.accuracy_m ?? loc.accuracy ?? loc.precision_m ?? loc.precision),
    };
  }).sort((a, b) => a.orden - b.orden);
}

/** Estados de una revisión tal como los muestra el dashboard. */
export function faseLegible(fase: string | null, completa: boolean): { etiqueta: string; tono: "listo" | "revision" | "pausado" | "carga" | "completo" } {
  if (completa) return { etiqueta: "Completo", tono: "completo" };
  const f = (fase ?? "").toLowerCase();
  if (/(charg|carga)/.test(f)) return { etiqueta: "En carga", tono: "carga" };
  if (/(paus)/.test(f)) return { etiqueta: "Pausado", tono: "pausado" };
  if (/(progress|review|revisi|running|active|activo)/.test(f)) return { etiqueta: "En revisión", tono: "revision" };
  if (/(complet|done)/.test(f)) return { etiqueta: "Completo", tono: "completo" };
  return { etiqueta: "Listo", tono: "listo" };
}
