import type { Enfermedad } from "@/db/schema";
import type { LoteEstado, EventoFila } from "@/lib/queries/lotes";
import type { SensorEstado } from "@/lib/queries/sensores";
import { PARAMS_ENFERMEDAD, ENFERMEDADES_LISTA } from "@/lib/simulador/enfermedades";

export type Prioridad = "alta" | "media" | "baja";
export type TipoAccion = "inspeccion" | "tratamiento" | "riego" | "drenaje" | "sensor" | "aplicacion";

export type Recomendacion = {
  id: string;
  prioridad: Prioridad;
  tipo: TipoAccion;
  loteId: string | null;
  loteNombre: string | null;
  titulo: string;
  detalle: string;
  plaga?: Enfermedad;
};

/** Plaga con mayor riesgo en el lote hoy. */
export function amenazaPrincipal(l: Pick<LoteEstado, "riesgoPorPlaga">): { plaga: Enfermedad; riesgo: number } | null {
  if (!l.riesgoPorPlaga) return null;
  let mejor: { plaga: Enfermedad; riesgo: number } | null = null;
  for (const e of ENFERMEDADES_LISTA) {
    const r = l.riesgoPorPlaga[e] ?? 0;
    if (!mejor || r > mejor.riesgo) mejor = { plaga: e, riesgo: r };
  }
  return mejor;
}

export type EstadoSuelo = "seco" | "ok" | "humedo" | "encharcado";
export function estadoSuelo(h: number | null | undefined): EstadoSuelo {
  if (h === null || h === undefined) return "ok";
  if (h < 30) return "seco";
  if (h < 46) return "ok";
  if (h < 54) return "humedo";
  return "encharcado";
}

const ORDEN: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };

/**
 * Reglas agronómicas simples que convierten el estado de la finca en una lista
 * de acciones para hoy. Son heurísticas explícitas, fáciles de ajustar con el agrónomo.
 */
export function generarRecomendaciones(
  lotes: LoteEstado[],
  eventosAbiertos: EventoFila[],
  sensores: SensorEstado[],
): Recomendacion[] {
  const recs: Recomendacion[] = [];
  const llovioHoy = lotes.some((l) => (l.lluviaMm ?? 0) > 5);

  if (llovioHoy) {
    recs.push({
      id: "clima-lluvia",
      prioridad: "media",
      tipo: "aplicacion",
      loteId: null,
      loteNombre: null,
      titulo: "Evitar aplicaciones foliares hoy",
      detalle: "Hubo lluvia hoy en la finca. El producto se lava y la humedad del follaje favorece hongos: priorizar poda sanitaria y revisión en campo.",
    });
  }

  for (const l of lotes) {
    const abiertos = eventosAbiertos.filter((e) => e.loteId === l.id);
    const amenaza = amenazaPrincipal(l);

    // Riesgo alto sin brote conocido de esa plaga: inspeccionar y prevenir
    if (amenaza && amenaza.riesgo >= 30 && !abiertos.some((e) => e.enfermedad === amenaza.plaga)) {
      const p = PARAMS_ENFERMEDAD[amenaza.plaga];
      const causa =
        amenaza.plaga === "trips"
          ? "racha seca y cálida"
          : `${Math.round(l.horasHumedadAlta ?? 0)} h de humedad del aire sobre 85 % en el día`;
      recs.push({
        id: `riesgo-${l.id}-${amenaza.plaga}`,
        prioridad: amenaza.riesgo >= 50 ? "alta" : "media",
        tipo: "inspeccion",
        loteId: l.id,
        loteNombre: l.nombre,
        plaga: amenaza.plaga,
        titulo: `Inspeccionar ${l.nombre} por ${p.nombre}`,
        detalle: `Riesgo ${amenaza.riesgo} % por ${causa}. Buscar: ${p.sintomas.toLowerCase()}. Preventivo: ${p.preventivo.toLowerCase()}.`,
      });
    }

    // Brotes abiertos: seguimiento
    for (const e of abiertos) {
      const p = PARAMS_ENFERMEDAD[e.enfermedad];
      recs.push({
        id: `brote-${e.id}`,
        prioridad: e.estado === "activo" || e.severidadMax >= 4 ? "alta" : "media",
        tipo: "tratamiento",
        loteId: l.id,
        loteNombre: l.nombre,
        plaga: e.enfermedad,
        titulo: `${e.estado === "activo" ? "Tratar" : "Dar seguimiento a"} ${p.nombre} en ${l.nombre}`,
        detalle: `Brote ${e.estado} desde el ${e.fechaInicio}, severidad ${e.severidadMax} de 5, ${e.areaAfectadaPct.toFixed(1)} % del bloque. ${e.tratamiento ?? p.tratamiento}.`,
      });
    }

    // Suelo
    const suelo = estadoSuelo(l.humedadSueloProm);
    if (suelo === "seco") {
      recs.push({
        id: `riego-${l.id}`,
        prioridad: "media",
        tipo: "riego",
        loteId: l.id,
        loteNombre: l.nombre,
        titulo: `Programar riego en ${l.nombre}`,
        detalle: `Humedad del suelo en ${Math.round(l.humedadSueloProm ?? 0)} %, por debajo del 30 %. El estrés hídrico baja el vigor y abre la puerta a trips.`,
      });
    } else if (suelo === "encharcado") {
      recs.push({
        id: `drenaje-${l.id}`,
        prioridad: "media",
        tipo: "drenaje",
        loteId: l.id,
        loteNombre: l.nombre,
        titulo: `Revisar drenaje en ${l.nombre}`,
        detalle: `Humedad del suelo en ${Math.round(l.humedadSueloProm ?? 0)} %. Suspender riego y revisar canales; el encharcamiento sostiene la humedad del follaje y los hongos.`,
      });
    }
  }

  for (const s of sensores.filter((x) => x.estado !== "ok")) {
    recs.push({
      id: `sensor-${s.id}`,
      prioridad: s.estado === "caido" ? "media" : "baja",
      tipo: "sensor",
      loteId: s.loteId,
      loteNombre: s.loteNombre,
      titulo: `Revisar sensor ${s.id} en ${s.loteNombre}`,
      detalle: s.estado === "caido" ? "No reporta hace más de 6 horas. Revisar batería, conectividad o daño físico." : "Reporta de forma intermitente en las últimas 24 horas.",
    });
  }

  return recs.sort((a, b) => ORDEN[a.prioridad] - ORDEN[b.prioridad]);
}
