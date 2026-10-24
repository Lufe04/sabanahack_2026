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
