import type { Drenaje, Enfermedad } from "@/db/schema";
import { clamp } from "./rng";

export type ParamsPlaga = {
  nombre: string;
  tipo: "plaga" | "hongo";
  /** Rango de temperatura promedio diaria donde prospera. */
  tempOpt: [number, number];
  /** Hongos: horas con humedad del aire > 85 % necesarias para que haya riesgo. */
  horasHumedadMin: number;
  /** true si prospera con ambiente seco (trips) en vez de húmedo. */
  prefiereSeco: boolean;
  /** Tasa base diaria de aparición con condiciones neutras. */
  base: number;
  duracionDias: [number, number];
  severidadMax: [number, number];
  areaMaxPct: [number, number];
  /** Qué tan fácil lo ve el dron (1 = daño foliar evidente, 0.4 = daño sutil). */
  visibilidadDron: number;
  /** Probabilidad extra de hallarlo en inspección o trampas. */
  deteccionCampo: number;
  tratamiento: string;
  preventivo: string;
  sintomas: string;
};

export const PARAMS_ENFERMEDAD: Record<Enfermedad, ParamsPlaga> = {
  trips: {
    nombre: "Trips",
    tipo: "plaga",
    tempOpt: [14, 24],
    horasHumedadMin: 0,
    prefiereSeco: true,
    base: 0.009,
    duracionDias: [15, 40],
    severidadMax: [1, 4],
    areaMaxPct: [3, 20],
    visibilidadDron: 0.45,
    deteccionCampo: 0.2,
    tratamiento: "Trampas azules + control biológico (Orius, Beauveria) y spinosad en rotación",
    preventivo: "Revisar trampas azules y flores abiertas; eliminar malezas hospederas",
    sintomas: "Flores deformadas, bronceado en frutos y hojas nuevas rizadas",
  },
  botrytis: {
    nombre: "Botrytis",
    tipo: "hongo",
    tempOpt: [11, 19],
    horasHumedadMin: 10,
    prefiereSeco: false,
    base: 0.0065,
    duracionDias: [14, 30],
    severidadMax: [2, 5],
    areaMaxPct: [3, 22],
    visibilidadDron: 1,
    deteccionCampo: 0.1,
    tratamiento: "Poda sanitaria + fungicida biológico (Trichoderma) o botricida en rotación",
    preventivo: "Mejorar ventilación con poda, retirar fruto y flor caída, evitar riego foliar",
    sintomas: "Moho gris en flores y frutos, manchas pardas en ramas",
  },
  alternaria: {
    nombre: "Alternaria",
    tipo: "hongo",
    tempOpt: [13, 22],
    horasHumedadMin: 8,
    prefiereSeco: false,
    base: 0.006,
    duracionDias: [12, 28],
    severidadMax: [2, 4],
    areaMaxPct: [3, 18],
    visibilidadDron: 0.85,
    deteccionCampo: 0.1,
    tratamiento: "Retiro de fruto afectado + fungicida (azoxistrobina) rotado con cobre",
    preventivo: "Cosechar a tiempo, evitar heridas en fruto, manejar humedad del follaje",
    sintomas: "Manchas foliares con anillos concéntricos, pudrición blanda en fruto maduro",
  },
};

export const ENFERMEDADES_LISTA = Object.keys(PARAMS_ENFERMEDAD) as Enfermedad[];

/** Susceptibilidad relativa por variedad (1 = promedio). */
export const SUSCEPTIBILIDAD: Record<string, Partial<Record<Enfermedad, number>>> = {
  Biloxi: { alternaria: 1.3, trips: 1.0 },
  Legacy: { botrytis: 1.4 },
  Sharpblue: { trips: 1.3, botrytis: 0.9 },
  Emerald: { alternaria: 1.2, trips: 0.9 },
  Ventura: { botrytis: 1.2, trips: 1.2 },
};

/** El mal drenaje mantiene el microclima húmedo: favorece hongos, no a los trips. */
export const FACTOR_DRENAJE: Record<Drenaje, number> = { bueno: 1.0, regular: 1.2, malo: 1.55 };

export type CondicionesDia = {
  tempProm: number;
  horasHumedadAlta: number;
  humedadSuelo: number;
};

/** Qué tan favorables son las condiciones de un día para una plaga (0 a ~1.5). */
export function favorabilidad(e: Enfermedad, c: CondicionesDia): number {
  const p = PARAMS_ENFERMEDAD[e];
  const [tMin, tMax] = p.tempOpt;
  let fT: number;
  if (c.tempProm >= tMin && c.tempProm <= tMax) fT = 1;
  else {
    const d = c.tempProm < tMin ? tMin - c.tempProm : c.tempProm - tMax;
    fT = clamp(1 - d / 5, 0, 1);
  }
  if (p.prefiereSeco) {
    // Trips: explotan en rachas secas y cálidas
    const fS = clamp((15.5 - c.horasHumedadAlta) / 6, 0, 1.5);
    return fT * (0.1 + fS);
  }
  const fH = clamp((c.horasHumedadAlta - p.horasHumedadMin) / 8, 0, 1.5);
  return fT * (0.1 + fH);
}

/** Tasa de riesgo diaria (hazard) de que aparezca un brote nuevo. */
export function hazard(e: Enfermedad, favor5d: number, variedad: string, drenaje: Drenaje): number {
  const p = PARAMS_ENFERMEDAD[e];
  const susc = SUSCEPTIBILIDAD[variedad]?.[e] ?? 1;
  const fd = p.tipo === "hongo" ? FACTOR_DRENAJE[drenaje] : 1;
  return p.base * susc * fd * Math.pow(favor5d, 1.4) * 3.0;
}

/** Índice 0-100: probabilidad aproximada de al menos un brote en los próximos 7 días. */
export function indiceRiesgo(hazards: number[]): number {
  const total = hazards.reduce((a, b) => a + b, 0);
  return Math.round(100 * (1 - Math.exp(-7 * total)));
}

export function riesgoPorPlaga(hazards: Record<Enfermedad, number>): Record<Enfermedad, number> {
  const out = {} as Record<Enfermedad, number>;
  for (const e of ENFERMEDADES_LISTA) out[e] = Math.round(100 * (1 - Math.exp(-7 * hazards[e])));
  return out;
}
