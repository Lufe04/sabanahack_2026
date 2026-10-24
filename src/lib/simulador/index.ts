import type { NuevaCosecha, NuevaLectura, NuevoEvento, NuevoLote, NuevoResumenDiario, NuevoSensor } from "@/db/schema";
import { Rng } from "./rng";
import { LOTES, construirSensores, FINCA } from "./finca";
import {
  estadoInicial,
  simularDia,
  eventosAFilas,
  fechaLocal,
  isoFecha,
  type EstadoSimulacion,
  type VueloConDetecciones,
  type OpcionesSimulacion,
} from "./motor";

export { FINCA, LOTES, construirSensores, simularDia, eventosAFilas, fechaLocal, isoFecha };
export { Rng } from "./rng";
export type { OpcionesSimulacion };
export const SENSORES_CAIDOS_DEFAULT = (dias: number) => ({ "L06-HA-1": dias - 9, "L03-HS-2": dias - 2 });
export * from "./enfermedades";
export type { EstadoSimulacion, VueloConDetecciones };

export type Historial = {
  inicio: Date;
  lotes: NuevoLote[];
  sensores: NuevoSensor[];
  lecturas: NuevaLectura[];
  vuelos: VueloConDetecciones[];
  eventos: NuevoEvento[];
  resumen: NuevoResumenDiario[];
  cosechas: NuevaCosecha[];
  estado: EstadoSimulacion;
};

export type OpcionesHistorial = {
  dias?: number;
  seed?: number;
  intervaloLecturasMin?: number;
  /** Fecha final (hoy). Por defecto, la fecha actual. */
  hasta?: Date;
  /** Si es false no genera lecturas, útil para calibrar rápido. */
  conLecturas?: boolean;
};

/** Genera `dias` días de historia terminando en `hasta` (inclusive). */
export function generarHistorial(opts: OpcionesHistorial = {}): Historial {
  const dias = opts.dias ?? 180;
  const seed = opts.seed ?? 7;
  const hasta = opts.hasta ?? new Date();
  const conLecturas = opts.conLecturas ?? true;
  const intervalo = opts.intervaloLecturasMin ?? 30;

  // "Hoy" en hora de Colombia, no en UTC
  const hoyLocal = new Date(hasta.getTime() + FINCA.offsetUtcHoras * 3600_000);
  const inicio = new Date(Date.UTC(hoyLocal.getUTCFullYear(), hoyLocal.getUTCMonth(), hoyLocal.getUTCDate()));
  inicio.setUTCDate(inicio.getUTCDate() - (dias - 1));

  const rng = new Rng(seed);
  const lotes = LOTES;
  const sensores = construirSensores(isoFecha(fechaLocal(inicio, -30)));
  const estado = estadoInicial(lotes, rng, inicio);

  const opciones: OpcionesSimulacion = {
    intervaloLecturasMin: conLecturas ? intervalo : 24 * 60 * 10, // sin lecturas
    sensoresCaidos: SENSORES_CAIDOS_DEFAULT(dias),
  };

  const lecturas: NuevaLectura[] = [];
  const vuelos: VueloConDetecciones[] = [];
  const resumen: NuevoResumenDiario[] = [];
  const cosechas: NuevaCosecha[] = [];

  for (let d = 0; d < dias; d++) {
    const salida = simularDia(estado, inicio, lotes, sensores, rng, opciones);
    if (conLecturas) lecturas.push(...salida.lecturas);
    vuelos.push(...salida.vuelos);
    resumen.push(...salida.resumen);
    cosechas.push(...salida.cosechas);
  }

  const eventos = eventosAFilas(estado.eventos, dias - 1, inicio);
  return { inicio, lotes, sensores, lecturas, vuelos, eventos, resumen, cosechas, estado };
}
