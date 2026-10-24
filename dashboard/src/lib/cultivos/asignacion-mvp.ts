/**
 * ASIGNACIÓN FIJA DEL MVP (quemada en código).
 *
 * La app del robot todavía no envía el bloque ni la cama de cada captura: los registros
 * llegan sin `route_context`, y lo único que identifica la planta es el texto de
 * `mission` ("arandanos-prueba-01 | planta <uuid>"). Para que el dashboard muestre cada
 * captura completa, aquí se le asigna:
 *
 * - Bloque: el que traiga la app; si no trae, BLOQUE_POR_DEFECTO.
 * - Nave, cama y planta: derivadas del identificador de planta de la misión (o del UUID del
 *   registro si no hay), de forma determinista: la misma planta cae siempre en el mismo tag.
 *
 * La asignación se guarda en `datos.asignacion_mvp`, separada del contenido original de la
 * app, y nunca se mezcla con la huella `data_hash`: los reintentos de la app siguen siendo
 * idempotentes. Cuando la app envíe bloque y cama reales, se usan esos y esto deja de actuar.
 */
import { LOTES } from "@/lib/simulador/finca";
import { marcoDe, naveDeCama, tagPlanta } from "@/lib/bloque/plano";

/** Bloque donde se ubican las capturas que llegan sin bloque. Misión "arandanos-prueba-01" → B01. */
export const BLOQUE_POR_DEFECTO = "B01";

/** Los bloques se llamaban L01 a L10: los códigos viejos se traducen a B01 a B10. */
export function normalizarBloque(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const m = id.trim().match(/^[LB](\d{2})$/i);
  return m ? `B${m[1]}` : id;
}

export type AsignacionMvp = {
  bloque: string;
  nave: number;
  cama: number;
  posicion: number;
  tag: string;
  /** Identificador de planta que envió la app en `mission`, si lo hubo. */
  plantaApp: string | null;
  /** Qué parte se asignó aquí y qué parte vino de la app. */
  origen: { bloque: "app" | "mvp"; cama: "app" | "mvp" };
  fuente: "asignacion_fija_mvp";
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

export function asignar(evento: Record<string, unknown>): AsignacionMvp {
  const ctx = (evento.route_context ?? {}) as Record<string, unknown>;
  const loteApp = normalizarBloque(ctx.lot_id) ?? normalizarBloque(evento.lot_id);
  const lote = LOTES.find((l) => l.id === loteApp) ?? LOTES.find((l) => l.id === BLOQUE_POR_DEFECTO)!;
  const { nCamas, plantasPorCama } = marcoDe(lote.poligono);

  const mision = typeof evento.mission === "string" ? evento.mission : "";
  const plantaApp = mision.match(/planta\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] ?? null;

  // Si algún día la app envía cama y posición, se respetan.
  const camaApp = n(ctx.bed ?? ctx.cama ?? evento.bed ?? evento.cama);
  const posApp = n(ctx.plant_position ?? ctx.posicion ?? evento.plant_position ?? evento.posicion);
  const semilla = hash(`${lote.id}:${plantaApp ?? String(evento.id)}`);
  const cama = camaApp && camaApp <= nCamas ? camaApp : (semilla % nCamas) + 1;
  const posicion = posApp && posApp <= plantasPorCama ? posApp : (Math.floor(semilla / nCamas) % plantasPorCama) + 1;

  return {
    bloque: lote.id,
    nave: naveDeCama(cama),
    cama,
    posicion,
    tag: tagPlanta(lote.id, cama, posicion),
    plantaApp,
    origen: { bloque: loteApp ? "app" : "mvp", cama: camaApp && posApp ? "app" : "mvp" },
    fuente: "asignacion_fija_mvp",
  };
}
