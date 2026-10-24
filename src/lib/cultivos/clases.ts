/** Clases del modelo en el orden que usa la APK. Seguro para el navegador (sin base de datos). */
export const CLASES = ["alternaria", "botrytis", "sana", "trips"] as const;
export type Clase = (typeof CLASES)[number];

export type TonoFase = "registrando" | "listo" | "revision" | "pausado" | "carga" | "completo";

/** Fases que envía la APK (validation.mjs) en el lenguaje del dashboard. */
export function faseLegible(fase: string | null): { etiqueta: string; tono: TonoFase } {
  switch (fase) {
    case "recording":
      return { etiqueta: "Registrando puntos", tono: "registrando" };
    case "active":
      return { etiqueta: "En revisión", tono: "revision" };
    case "paused":
      return { etiqueta: "Pausado", tono: "pausado" };
    case "charging":
      return { etiqueta: "En carga", tono: "carga" };
    case "completed":
      return { etiqueta: "Completo", tono: "completo" };
    default:
      return { etiqueta: "Listo", tono: "listo" };
  }
}

export type EtiquetaCaptura = { texto: string; alerta: boolean };

/**
 * Etiqueta de una lectura de la app, calculada solo con `alert` y `capture_mode`.
 * No depende de que haya foto ni lote, así que vale igual para los registros ya guardados.
 * - alert: true                         → Alerta
 * - alert: false + manual               → Foto manual
 * - alert: false + route_reference      → Referencia de punto
 * - alert: false + periodic (o el resto) → Normal
 */
export function etiquetaCaptura(alerta: boolean | null | undefined, modo: string | null | undefined): EtiquetaCaptura {
  if (alerta === true) return { texto: "Alerta", alerta: true };
  if (modo === "manual") return { texto: "Foto manual", alerta: false };
  if (modo === "route_reference") return { texto: "Referencia de punto", alerta: false };
  return { texto: "Normal", alerta: false };
}
