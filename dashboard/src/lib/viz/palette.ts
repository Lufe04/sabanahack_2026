import type { Enfermedad, TipoSensor } from "@/db/schema";

/**
 * Colores por rol, siguiendo el método de dataviz: categórico para identidad,
 * secuencial para magnitud, estado para riesgo. Los valores viven en CSS
 * (globals.css) para que cambien con el tema; aquí solo se referencian.
 */
export const serie = (n: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) => `var(--series-${n})`;

/** Cada plaga tiene un color fijo: nunca se reasigna al filtrar. */
export const COLOR_ENFERMEDAD: Record<Enfermedad, string> = {
  botrytis: serie(1),
  trips: serie(2),
  alternaria: serie(3),
};

export const NOMBRE_ENFERMEDAD: Record<Enfermedad, string> = {
  trips: "Trips",
  botrytis: "Botrytis",
  alternaria: "Alternaria",
};

export const COLOR_SENSOR: Record<TipoSensor, string> = {
  humedad_suelo: serie(1),
  humedad_aire: serie(3),
  temperatura: serie(2),
  radiacion: serie(4),
  ph_suelo: serie(7),
};

export const NOMBRE_SENSOR: Record<TipoSensor, string> = {
  humedad_suelo: "Humedad del suelo",
  humedad_aire: "Humedad del aire",
  temperatura: "Temperatura",
  radiacion: "Radiación solar",
  ph_suelo: "pH del suelo",
};

export type NivelRiesgo = "bajo" | "moderado" | "alto" | "critico";

export function nivelRiesgo(indice: number): NivelRiesgo {
  if (indice >= 60) return "critico";
  if (indice >= 40) return "alto";
  if (indice >= 20) return "moderado";
  return "bajo";
}

export const ETIQUETA_RIESGO: Record<NivelRiesgo, string> = {
  bajo: "Bajo",
  moderado: "Moderado",
  alto: "Alto",
  critico: "Crítico",
};

/** Colores de estado: reservados para riesgo, nunca para series. */
export const COLOR_RIESGO: Record<NivelRiesgo, string> = {
  bajo: "var(--status-good)",
  moderado: "var(--status-warning)",
  alto: "var(--status-serious)",
  critico: "var(--status-critical)",
};

export const ETIQUETA_SEVERIDAD = ["", "Leve", "Baja", "Media", "Alta", "Crítica"];

/** Rampa secuencial azul (claro = cerca de cero). */
export const RAMPA_SECUENCIAL = [
  "var(--seq-100)",
  "var(--seq-200)",
  "var(--seq-300)",
  "var(--seq-400)",
  "var(--seq-500)",
  "var(--seq-600)",
  "var(--seq-700)",
];

export function pasoSecuencial(valor: number, max: number): string {
  if (max <= 0 || valor <= 0) return "var(--viz-empty)";
  const i = Math.min(RAMPA_SECUENCIAL.length - 1, Math.floor((valor / max) * RAMPA_SECUENCIAL.length));
  return RAMPA_SECUENCIAL[i];
}
