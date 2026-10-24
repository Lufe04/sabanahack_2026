import type {
  Drenaje,
  Enfermedad,
  NuevaCosecha,
  NuevaLectura,
  NuevoEvento,
  NuevoLote,
  NuevoResumenDiario,
  NuevoSensor,
} from "@/db/schema";
import { Rng, clamp, round, lerp } from "./rng";
import { FINCA } from "./finca";
import { generarClimaDia, valorEnHora, prom, type ClimaDia } from "./clima";
import {
  ENFERMEDADES_LISTA,
  PARAMS_ENFERMEDAD,
  favorabilidad,
  hazard,
  indiceRiesgo,
  riesgoPorPlaga,
} from "./enfermedades";

// ---------- Tipos del motor ----------

export type EventoSim = {
  clave: number;
  loteId: string;
  enfermedad: Enfermedad;
  fechaInicio: string;
  diaInicio: number;
  duracion: number;
  severidadMax: number;
  areaMax: number;
  fechaDeteccion: string | null;
  origen: "robot" | "inspeccion" | null;
  tratado: boolean;
};

export type EstadoLote = {
  humedadSuelo: number;
  humedadSueloAyer: number;
  favor5d: Record<Enfermedad, number[]>;
  /** Día en que el robot vuelve a recorrer el lote. */
  proximaRondaDia: number;
};

export type EstadoSimulacion = {
  /** Fecha del día 0 (YYYY-MM-DD). */
  inicio: string;
  dia: number;
  anomaliaTermica: number;
  lotes: Record<string, EstadoLote>;
  eventos: EventoSim[];
  contadorEventos: number;
};

export type SalidaDia = {
  fecha: string;
  clima: ClimaDia;
  lecturas: NuevaLectura[];
  resumen: NuevoResumenDiario[];
  cosechas: NuevaCosecha[];
};

/** Rendimiento anual esperado por variedad en plena producción (kg/ha). */
const RENDIMIENTO_KG_HA: Record<string, number> = {
  Biloxi: 10000,
  Legacy: 9000,
  Sharpblue: 8000,
  Emerald: 9500,
  Ventura: 11000,
};

/** Factor por edad del cultivo: entra en plena producción a los 3 años. */
function factorEdad(fechaSiembra: string, fecha: Date): number {
  const anios = (fecha.getTime() - new Date(fechaSiembra + "T00:00:00Z").getTime()) / (365.25 * 86400_000);
  return clamp(0.35 + anios * 0.22, 0.35, 1);
}

/** Estacionalidad de la cosecha en la sabana: pico hacia agosto-octubre, valle en febrero-abril. */
function factorEstacional(fecha: Date): number {
  const diaAnio = (fecha.getTime() - Date.UTC(fecha.getUTCFullYear(), 0, 1)) / 86400_000;
  return 1 + 0.3 * Math.sin((2 * Math.PI * (diaAnio - 150)) / 365);
}

export type OpcionesSimulacion = {
  intervaloLecturasMin: number;
  /** Sensores que dejan de reportar a partir de cierto día (simula fallas). */
  sensoresCaidos?: Record<string, number>;
};

const PARAMS_SUELO: Record<Drenaje, { infiltracion: number; capacidad: number; retencion: number; etFactor: number }> = {
  bueno: { infiltracion: 0.35, capacidad: 42, retencion: 0.3, etFactor: 1.0 },
  regular: { infiltracion: 0.45, capacidad: 48, retencion: 0.55, etFactor: 0.9 },
  malo: { infiltracion: 0.6, capacidad: 55, retencion: 0.75, etFactor: 0.75 },
};

// ---------- Utilidades de fecha ----------

export function fechaLocal(inicio: Date, dia: number): Date {
  const d = new Date(inicio);
  d.setUTCDate(d.getUTCDate() + dia);
  return d;
}

export function isoFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Timestamp UTC para una hora local de Colombia (UTC-5). */
export function tsLocal(fecha: Date, horaDecimal: number): Date {
  const ms = Date.UTC(
    fecha.getUTCFullYear(),
    fecha.getUTCMonth(),
    fecha.getUTCDate(),
    0,
    0,
    0,
  );
  return new Date(ms + (horaDecimal - FINCA.offsetUtcHoras) * 3600_000);
}

// ---------- Estado inicial ----------

export function estadoInicial(lotes: NuevoLote[], rng: Rng, inicio: Date): EstadoSimulacion {
  const estadoLotes: Record<string, EstadoLote> = {};
  for (const lote of lotes) {
    const favor5d = {} as Record<Enfermedad, number[]>;
    for (const e of ENFERMEDADES_LISTA) favor5d[e] = [];
    estadoLotes[lote.id] = {
      humedadSuelo: rng.uniform(32, 40),
      humedadSueloAyer: 36,
      favor5d,
      proximaRondaDia: rng.int(0, 3),
    };
  }
  return { inicio: isoFecha(inicio), dia: 0, anomaliaTermica: 0, lotes: estadoLotes, eventos: [], contadorEventos: 0 };
}

// ---------- Curvas de un brote ----------

/** Intensidad relativa (0..1) del brote en el día t de su vida. Sube rápido y baja lento. */
function intensidad(ev: EventoSim, dia: number): number {
  const t = dia - ev.diaInicio;
  if (t < 0 || t > ev.duracion) return 0;
  const pico = ev.duracion * 0.4;
  if (t <= pico) return clamp(t / pico, 0.05, 1);
  const bajada = (t - pico) / (ev.duracion - pico);
  return clamp(1 - 0.75 * bajada, 0.1, 1);
}

function severidadActual(ev: EventoSim, dia: number): number {
  return clamp(Math.round(ev.severidadMax * intensidad(ev, dia)), 1, 5);
}

function areaActual(ev: EventoSim, dia: number): number {
  return ev.areaMax * intensidad(ev, dia);
}

function activo(ev: EventoSim, dia: number): boolean {
  return dia >= ev.diaInicio && dia <= ev.diaInicio + ev.duracion;
}

/** Al detectar un brote se aplica tratamiento: acorta la duración y limita la severidad. */
function aplicarTratamiento(ev: EventoSim, dia: number) {
  if (ev.tratado) return;
  ev.tratado = true;
  const transcurrido = dia - ev.diaInicio;
  const restante = ev.duracion - transcurrido;
  ev.duracion = transcurrido + Math.max(4, Math.round(restante * 0.6));
  const sevAhora = severidadActual(ev, dia);
  ev.severidadMax = Math.min(ev.severidadMax, sevAhora + 1);
}

// ---------- Paso de un día ----------

export function simularDia(
  estado: EstadoSimulacion,
  inicio: Date,
  lotes: NuevoLote[],
  sensores: NuevoSensor[],
  rng: Rng,
  opciones: OpcionesSimulacion,
): SalidaDia {
  const dia = estado.dia;
  const fecha = fechaLocal(inicio, dia);
  const fechaIso = isoFecha(fecha);
  const clima = generarClimaDia(fecha, rng, estado.anomaliaTermica);
  // Ruido de sensores con generador aparte: así la calibración sin lecturas
  // produce exactamente los mismos brotes y rondas que la carga completa.
  const rngS = rng.fork();
  estado.anomaliaTermica = clima.tempProm - 13.4;

  const lecturas: NuevaLectura[] = [];
  const resumen: NuevoResumenDiario[] = [];
  const cosechas: NuevaCosecha[] = [];
  const esLunes = fecha.getUTCDay() === 1;

  for (const lote of lotes) {
    const el = estado.lotes[lote.id];
    const suelo = PARAMS_SUELO[lote.drenaje ?? "bueno"];

    // --- Balance hídrico del suelo ---
    el.humedadSueloAyer = el.humedadSuelo;
    let hs = el.humedadSuelo;
    hs += clima.lluviaMm * suelo.infiltracion;
    const radProm = prom(clima.radiacionHora);
    const et = (0.9 + 0.07 * (clima.tempProm - 13) + 0.0012 * radProm) * suelo.etFactor;
    hs -= Math.max(0.3, et);
    if (hs > suelo.capacidad) hs = suelo.capacidad + (hs - suelo.capacidad) * suelo.retencion;
    let riego = false;
    if (hs < 27) {
      hs += rng.uniform(7, 10);
      riego = true;
    }
    hs = clamp(hs + rng.normal(0, 0.4), 15, 70);
    el.humedadSuelo = hs;

    // --- Condiciones y riesgo ---
    const cond = { tempProm: clima.tempProm, horasHumedadAlta: clima.horasHumedadAlta, humedadSuelo: hs };
    const hazards: number[] = [];
    const hazardsPorPlaga = {} as Record<Enfermedad, number>;
    const activosLote = estado.eventos.filter((ev) => ev.loteId === lote.id && activo(ev, dia));

    for (const e of ENFERMEDADES_LISTA) {
      const hist = el.favor5d[e];
      hist.push(favorabilidad(e, cond));
      if (hist.length > 5) hist.shift();
      const favor5d = prom(hist);
      const h = hazard(e, favor5d, lote.variedad, lote.drenaje ?? "bueno");
      hazards.push(h);
      hazardsPorPlaga[e] = h;

      const yaActivo = activosLote.some((ev) => ev.enfermedad === e);
      if (!yaActivo && activosLote.length < 2 && rng.chance(1 - Math.exp(-h))) {
        const p = PARAMS_ENFERMEDAD[e];
        const ev: EventoSim = {
          clave: ++estado.contadorEventos,
          loteId: lote.id,
          enfermedad: e,
          fechaInicio: fechaIso,
          diaInicio: dia,
          duracion: rng.int(p.duracionDias[0], p.duracionDias[1]),
          severidadMax: rng.int(p.severidadMax[0], p.severidadMax[1]),
          areaMax: rng.uniform(p.areaMaxPct[0], p.areaMaxPct[1]),
          fechaDeteccion: null,
          origen: null,
          tratado: false,
        };
        estado.eventos.push(ev);
        activosLote.push(ev);
      }
    }

    // --- Inspección manual: detecta brotes que el robot no ha visto ---
    for (const ev of activosLote) {
      if (ev.fechaDeteccion) continue;
      const edad = dia - ev.diaInicio;
      const pCampo = PARAMS_ENFERMEDAD[ev.enfermedad].deteccionCampo + 0.05 * severidadActual(ev, dia);
      if (edad >= 5 && rng.chance(pCampo)) {
        ev.fechaDeteccion = fechaIso;
        ev.origen = "inspeccion";
        aplicarTratamiento(ev, dia);
      }
    }

    // --- Ronda del robot con cámara ---
    // El robot recorre el lote a la altura de la planta cada 2 a 4 días. Con lluvia
    // fuerte se pospone. Detecta un brote con probabilidad creciente según su severidad
    // y qué tan visible es la plaga para una cámara cercana.
    if (dia >= el.proximaRondaDia) {
      if (clima.lluviaMm > 15 && rng.chance(0.8)) {
        el.proximaRondaDia = dia + 1;
      } else {
        for (const ev of activosLote) {
          if (ev.fechaDeteccion) continue;
          const sev = severidadActual(ev, dia);
          const pDet = (0.35 + 0.12 * sev) * PARAMS_ENFERMEDAD[ev.enfermedad].visibilidadRobot;
          if (!rng.chance(pDet)) continue;
          ev.fechaDeteccion = fechaIso;
          ev.origen = "robot";
          aplicarTratamiento(ev, dia);
        }
        el.proximaRondaDia = dia + rng.int(2, 4);
      }
    }

    // --- Lecturas de sensores ---
    const offsetLote = lote.drenaje === "malo" ? 2.5 : lote.drenaje === "regular" ? 1 : 0;
    const offsetTemp = rngS.normal(0, 0.3);
    const pasos = Math.floor((24 * 60) / opciones.intervaloLecturasMin);
    const sensoresLote = sensores.filter((s) => s.loteId === lote.id);
    for (const s of sensoresLote) {
      const diaCaida = opciones.sensoresCaidos?.[s.id];
      if (diaCaida !== undefined && dia >= diaCaida) continue;
      const sectorOffset = s.id.endsWith("-2") ? 1.8 : -1.2;
      for (let i = 0; i < pasos; i++) {
        const hora = (i * opciones.intervaloLecturasMin) / 60;
        let valor: number;
        switch (s.tipo) {
          case "humedad_suelo": {
            const base = lerp(el.humedadSueloAyer, hs, hora / 24);
            const pulsoRiego = riego && hora >= 6 && hora < 9 ? 3 * (1 - (hora - 6) / 3) : 0;
            valor = base + sectorOffset + pulsoRiego + rngS.normal(0, 0.5);
            break;
          }
          case "humedad_aire":
            valor = clamp(valorEnHora(clima.humedadHora, hora) + offsetLote + rngS.normal(0, 1.2), 30, 100);
            break;
          case "temperatura":
            valor = valorEnHora(clima.tempHora, hora) + offsetTemp + rngS.normal(0, 0.2);
            break;
          case "radiacion":
            valor = Math.max(0, valorEnHora(clima.radiacionHora, hora) * (1 + rngS.normal(0, 0.04)));
            break;
          default:
            valor = 5.2 + rngS.normal(0, 0.05);
        }
        lecturas.push({ sensorId: s.id, ts: tsLocal(fecha, hora), valor: round(valor, 2) });
      }
    }

    // --- Cosecha semanal (los lunes se registra la semana anterior) ---
    if (esLunes && dia >= 7) {
      const kgPotencial =
        (lote.hectareas * (RENDIMIENTO_KG_HA[lote.variedad] ?? 9000) * factorEdad(lote.fechaSiembra, fecha) * factorEstacional(fecha)) / 52;
      // Pérdida por brotes de la semana: área afectada ponderada por severidad
      let perdida = 0;
      let peor: { e: Enfermedad; p: number } | null = null;
      for (const ev of activosLote) {
        const sev = severidadActual(ev, dia);
        const p = (areaActual(ev, dia) / 100) * (0.35 + 0.13 * sev);
        perdida += p;
        if (!peor || p > peor.p) peor = { e: ev.enfermedad, p };
      }
      perdida = clamp(perdida + rng.uniform(0.01, 0.04), 0.01, 0.65); // siempre hay algo de descarte
      const kgTotal = Math.max(0, kgPotencial * rng.normal(1, 0.08));
      const kgDescartados = round(kgTotal * perdida, 1);
      const semana = new Date(fecha);
      semana.setUTCDate(semana.getUTCDate() - 7);
      cosechas.push({
        loteId: lote.id,
        semana: isoFecha(semana),
        kgCosechados: round(kgTotal - kgDescartados, 1),
        kgDescartados,
        plagaPrincipal: peor && peor.p > 0.02 ? peor.e : null,
      });
    }

    // --- Resumen diario ---
    resumen.push({
      loteId: lote.id,
      fecha: fechaIso,
      humedadSueloProm: round(hs, 1),
      humedadAireProm: round(clima.humedadProm + offsetLote, 1),
      tempProm: round(clima.tempProm, 1),
      tempMin: round(clima.tempMin, 1),
      tempMax: round(clima.tempMax, 1),
      horasHumedadAlta: clima.horasHumedadAlta,
      lluviaMm: clima.lluviaMm,
      eventosActivos: activosLote.filter((ev) => ev.fechaDeteccion).length,
      indiceRiesgo: indiceRiesgo(hazards),
      riesgoPorPlaga: riesgoPorPlaga(hazardsPorPlaga),
    });
  }

  estado.dia += 1;
  return { fecha: fechaIso, clima, lecturas, resumen, cosechas };
}

// ---------- Conversión de eventos a filas ----------

export function eventosAFilas(eventos: EventoSim[], diaHoy: number, inicio: Date): NuevoEvento[] {
  return eventos
    .filter((ev) => ev.fechaDeteccion !== null)
    .map((ev) => {
      const diaFin = ev.diaInicio + ev.duracion;
      const terminado = diaFin < diaHoy;
      const pico = ev.diaInicio + ev.duracion * 0.4;
      let estado: "activo" | "controlado" | "cerrado";
      if (terminado) estado = "cerrado";
      else if (ev.tratado && diaHoy > pico) estado = "controlado";
      else estado = "activo";
      return {
        loteId: ev.loteId,
        enfermedad: ev.enfermedad,
        fechaInicio: ev.fechaInicio,
        fechaDeteccion: ev.fechaDeteccion,
        fechaFin: terminado ? isoFecha(fechaLocal(inicio, diaFin)) : null,
        severidadMax: ev.severidadMax,
        areaAfectadaPct: round(ev.areaMax, 2),
        origen: ev.origen ?? "inspeccion",
        estado,
        tratamiento: ev.tratado ? PARAMS_ENFERMEDAD[ev.enfermedad].tratamiento : null,
        claveSim: ev.clave,
      };
    });
}
