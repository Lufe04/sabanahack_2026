/** Clases del modelo en el orden que usa la APK. Seguro para el navegador (sin base de datos). */
export const CLASES = ["alternaria", "botrytis", "sana", "trips"] as const;
export type Clase = (typeof CLASES)[number];

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
