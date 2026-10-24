/**
 * Plano de un bloque: camas, pasillos y plantas con tag, más capas de mapa de calor.
 *
 * Todo es determinista (misma entrada, mismo plano) y se calcula en el servidor.
 * La finca es simulada: la sanidad por planta se deriva de los brotes abiertos del
 * bloque, y el microclima se interpola desde la posición de sus sensores.
 *
 * Jerarquía: el BLOQUE es el invernadero; cada NAVE (un túnel de 9 m) encierra 3 CAMAS;
 * cada cama tiene sus PLANTAS. Marco típico de arándano en la sabana: camas de 1,2 m con
 * pasillos de 1,8 m (3 m entre centros) y plantas cada 0,75 m sobre la cama.
 */
import { Rng } from "@/lib/simulador/rng";
import type { Enfermedad } from "@/db/schema";

export const MARCO = {
  entreCamasM: 3.0,
  anchoCamaM: 1.2,
  entrePlantasM: 0.75,
  cabeceraM: 4, // calle de servicio al norte y al sur
  bordeM: 2.5, // margen este y oeste
  camasPorNave: 3, // nave de 9 m
};

const M_POR_GRADO_LAT = 111_320;

export const PLAGAS_PLANO: Enfermedad[] = ["trips", "botrytis", "alternaria"];

export type Cama = { numero: number; nave: number; xM: number; plantas: number };

/** Nave del invernadero: franja que encierra varias camas contiguas. */
export type Nave = { numero: number; x0M: number; x1M: number; camaDesde: number; camaHasta: number };

export type SensorPlano = { id: string; tipo: string; xM: number; yM: number; valor: number | null; unidad: string };

export type Campo = { cols: number; filas: number; valores: number[]; min: number; max: number; unidad: string; fuente: string };

export type PuntoRobot = {
  xM: number;
  yM: number;
  etiqueta: string;
  /** "captura": una lectura del robot ubicada en su planta. */
  estado: string;
  scores: Record<string, number> | null;
  observationId: string | null;
  fecha: string | null;
  alerta?: boolean;
  tag?: string;
};

export type Plano = {
  bloqueId: string;
  anchoM: number;
  altoM: number;
  naves: Nave[];
  camas: Cama[];
  y0M: number;
  /** Afectación por planta, 0 (sana) a 100, en orden cama por cama, de sur a norte. */
  afectacion: number[];
  /** Plaga dominante por planta: 0 ninguna, 1 trips, 2 botrytis, 3 alternaria. */
  plaga: number[];
  campos: { sanidad: Campo; temperatura: Campo; humedadAire: Campo; humedadSuelo: Campo };
  sensores: SensorPlano[];
  robot: PuntoRobot[];
  resumen: PlanoResumen;
};

export type PlanoResumen = {
  plantas: number;
  afectadas: number;
  pctAfectadas: number;
  severas: number;
  porPlaga: Record<Enfermedad, number>;
};

export type BrotePlano = { id: number; enfermedad: Enfermedad; severidadMax: number; areaAfectadaPct: number; estado: string };

export type EntradaPlano = {
  bloque: { id: string; poligono: [number, number][]; drenaje: string };
  brotes: BrotePlano[];
  clima: { temperatura: number | null; humedadAire: number | null; horasHumedadAlta: number | null };
  sensores: { id: string; tipo: string; unidad: string; valor: number | null }[];
  robot?: { lat: number; lng: number; etiqueta: string; estado: string; scores: Record<string, number> | null; observationId: string | null; fecha: string | null }[];
  /** Capturas del robot ubicadas en una planta (cama y posición). */
  capturas?: { cama: number; posicion: number; tag: string; scores: Record<string, number> | null; observationId: string; fecha: string; alerta: boolean }[];
};

/** Umbrales de afectación para clasificar cada planta. */
export const UMBRAL = { leve: 15, moderada: 40, severa: 70 };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Ruido suave y determinista (suma de ondas) para variar el microclima dentro del bloque. */
function ruidoSuave(semilla: number) {
  const rng = new Rng(semilla);
  const ondas = Array.from({ length: 4 }, () => ({ kx: rng.uniform(0.02, 0.07), ky: rng.uniform(0.02, 0.07), f: rng.uniform(0, Math.PI * 2), a: rng.uniform(0.3, 1) }));
  const norma = ondas.reduce((s, o) => s + o.a, 0);
  return (x: number, y: number) => ondas.reduce((s, o) => s + o.a * Math.sin(o.kx * x + o.ky * y + o.f), 0) / norma;
}

function dimensiones(poligono: [number, number][]) {
  const lats = poligono.map((p) => p[0]);
  const lngs = poligono.map((p) => p[1]);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lngMin = Math.min(...lngs);
  const lngMax = Math.max(...lngs);
  const mLng = M_POR_GRADO_LAT * Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
  return {
    anchoM: (lngMax - lngMin) * mLng,
    altoM: (latMax - latMin) * M_POR_GRADO_LAT,
    aLocal: (lat: number, lng: number) => ({ xM: (lng - lngMin) * mLng, yM: (lat - latMin) * M_POR_GRADO_LAT }),
  };
}

/** Posición fija de cada sensor dentro del bloque (estación central y dos sondas de suelo). */
function posicionSensor(id: string, anchoM: number, altoM: number) {
  if (/-HS-1$/.test(id)) return { xM: anchoM * 0.3, yM: altoM * 0.32 };
  if (/-HS-2$/.test(id)) return { xM: anchoM * 0.7, yM: altoM * 0.68 };
  if (/-RA-/.test(id)) return { xM: anchoM * 0.53, yM: altoM * 0.5 };
  return { xM: anchoM * 0.5, yM: altoM * 0.5 }; // humedad del aire y temperatura: estación central
}

/** Camas y plantas de un bloque según su contorno y el marco de plantación. */
export function marcoDe(poligono: [number, number][]) {
  const { anchoM, altoM } = dimensiones(poligono);
  const nCamas = Math.max(1, Math.floor((anchoM - 2 * MARCO.bordeM) / MARCO.entreCamasM));
  const plantasPorCama = Math.max(1, Math.floor((altoM - 2 * MARCO.cabeceraM) / MARCO.entrePlantasM));
  const x0M = (anchoM - (nCamas - 1) * MARCO.entreCamasM) / 2;
  const y0M = (altoM - (plantasPorCama - 1) * MARCO.entrePlantasM) / 2;
  return { anchoM, altoM, nCamas, plantasPorCama, x0M, y0M };
}

/** Número de nave de una cama (las camas se cuentan de oeste a este). */
export const naveDeCama = (cama: number) => Math.ceil(cama / MARCO.camasPorNave);

/** Naves de un bloque, con sus límites en metros desde el borde oeste. */
export function navesDe(poligono: [number, number][]): Nave[] {
  const { nCamas, x0M, anchoM } = marcoDe(poligono);
  const naves: Nave[] = [];
  for (let desde = 1; desde <= nCamas; desde += MARCO.camasPorNave) {
    const hasta = Math.min(nCamas, desde + MARCO.camasPorNave - 1);
    const numero = naves.length + 1;
    const izq = x0M + (desde - 1) * MARCO.entreCamasM - MARCO.entreCamasM / 2;
    const der = x0M + (hasta - 1) * MARCO.entreCamasM + MARCO.entreCamasM / 2;
    naves.push({ numero, x0M: Math.max(0, numero === 1 ? 0 : izq), x1M: Math.min(anchoM, hasta === nCamas ? anchoM : der), camaDesde: desde, camaHasta: hasta });
  }
  return naves;
}

export function construirPlano(e: EntradaPlano): Plano {
  const { anchoM, altoM, aLocal } = dimensiones(e.bloque.poligono);
  const semilla = hash(e.bloque.id);

  // --- Camas y plantas ---
  const { nCamas, plantasPorCama, x0M: x0, y0M } = marcoDe(e.bloque.poligono);
  const camas: Cama[] = Array.from({ length: nCamas }, (_, i) => ({ numero: i + 1, nave: naveDeCama(i + 1), xM: x0 + i * MARCO.entreCamasM, plantas: plantasPorCama }));
  const naves = navesDe(e.bloque.poligono);

  // --- Focos de cada brote ---
  const malDrenaje = e.bloque.drenaje === "malo" ? 1 : e.bloque.drenaje === "regular" ? 0.5 : 0;
  type Foco = { plaga: number; x: number; y: number; rx: number; ry: number; peso: number };
  const focos: Foco[] = [];
  for (const b of e.brotes) {
    const factor = b.estado === "activo" ? 1 : b.estado === "controlado" ? 0.6 : 0.25;
    const rng = new Rng(hash(`${e.bloque.id}:${b.id}`));
    const n = 1 + rng.int(0, 2);
    const areaFoco = (anchoM * altoM * (b.areaAfectadaPct / 100) * Math.max(0.35, factor)) / n;
    for (let k = 0; k < n; k++) {
      const esTrips = b.enfermedad === "trips";
      // Trips entra por los bordes y se extiende a lo largo de la cama; los hongos se
      // concentran en la parte baja (sur) cuando el drenaje es malo.
      const x = esTrips ? (rng.chance(0.5) ? rng.uniform(0.05, 0.25) : rng.uniform(0.75, 0.95)) * anchoM : rng.uniform(0.15, 0.85) * anchoM;
      const yRel = esTrips ? rng.uniform(0.15, 0.85) : Math.max(0.08, Math.min(0.92, rng.uniform(0.15, 0.85) - malDrenaje * rng.uniform(0, 0.35)));
      const elong = esTrips ? 2.6 : rng.uniform(0.8, 1.3);
      const r = Math.sqrt(areaFoco / (Math.PI * elong));
      focos.push({ plaga: PLAGAS_PLANO.indexOf(b.enfermedad) + 1, x, y: yRel * altoM, rx: r * 1.15, ry: r * elong * 1.15, peso: (b.severidadMax / 5) * factor });
    }
  }

  const afectacion: number[] = [];
  const plaga: number[] = [];
  const ruidoPlanta = new Rng(semilla ^ 0x9e3779b9);
  const porPlaga = { trips: 0, botrytis: 0, alternaria: 0 } as Record<Enfermedad, number>;
  let afectadas = 0;
  let severas = 0;
  for (const c of camas) {
    for (let j = 0; j < c.plantas; j++) {
      const y = y0M + j * MARCO.entrePlantasM;
      let mejor = 0;
      let cual = 0;
      for (const f of focos) {
        const d2 = ((c.xM - f.x) / f.rx) ** 2 + ((y - f.y) / f.ry) ** 2;
        if (d2 > 4) continue;
        const v = f.peso * Math.exp(-d2 * 1.1);
        if (v > mejor) {
          mejor = v;
          cual = f.plaga;
        }
      }
      // Variación planta a planta: no todas las plantas del foco están igual de afectadas
      const valor = Math.round(Math.max(0, Math.min(100, mejor * 100 * ruidoPlanta.uniform(0.7, 1.25))));
      afectacion.push(valor);
      plaga.push(valor >= UMBRAL.leve ? cual : 0);
      if (valor >= UMBRAL.leve) {
        afectadas++;
        porPlaga[PLAGAS_PLANO[cual - 1]]++;
      }
      if (valor >= UMBRAL.severa) severas++;
    }
  }

  // --- Sensores y microclima ---
  const sensores: SensorPlano[] = e.sensores.map((s) => ({ ...s, ...posicionSensor(s.id, anchoM, altoM) }));
  const cols = 28;
  const filas = Math.max(8, Math.round((cols * altoM) / anchoM));
  const rTemp = ruidoSuave(semilla + 1);
  const rHum = ruidoSuave(semilla + 2);
  const rSuelo = ruidoSuave(semilla + 3);
  const temp0 = e.clima.temperatura ?? 13;
  const hum0 = e.clima.humedadAire ?? 85;
  const sondas = sensores.filter((s) => s.tipo === "humedad_suelo" && s.valor !== null);
  const suelo0 = sondas.length ? sondas.reduce((a, s) => a + (s.valor ?? 0), 0) / sondas.length : 40;

  const celda = (fn: (x: number, y: number) => number, unidad: string, fuente: string, decimales = 1): Campo => {
    const valores: number[] = [];
    for (let fy = 0; fy < filas; fy++) {
      for (let fx = 0; fx < cols; fx++) {
        const x = ((fx + 0.5) / cols) * anchoM;
        const y = ((fy + 0.5) / filas) * altoM;
        valores.push(Math.round(fn(x, y) * 10 ** decimales) / 10 ** decimales);
      }
    }
    return { cols, filas, valores, min: Math.min(...valores), max: Math.max(...valores), unidad, fuente };
  };

  // Temperatura: el borde sur (más expuesto al sol de la tarde) es un poco más cálido;
  // las zonas húmedas son algo más frías.
  const temperatura = celda(
    (x, y) => temp0 + 0.6 * (0.5 - y / altoM) + 0.45 * rTemp(x, y) - 0.4 * malDrenaje * Math.exp(-((y / altoM) ** 2) * 6),
    "°C",
    "Estación central del bloque + microclima simulado",
  );
  // Humedad del aire: más alta en la parte baja si el drenaje es malo y en el centro del dosel.
  const humedadAire = celda(
    (x, y) => Math.min(100, hum0 + 4 * malDrenaje * Math.exp(-((y / altoM) ** 2) * 5) + 1.5 * (1 - Math.abs(x / anchoM - 0.5) * 2) + 1.8 * rHum(x, y)),
    "%",
    "Estación central del bloque + microclima simulado",
    0,
  );
  // Humedad del suelo: interpolada (IDW) desde las sondas, con la parte baja más húmeda.
  const humedadSuelo = celda(
    (x, y) => {
      let num = 0;
      let den = 0;
      for (const s of sondas) {
        const w = 1 / ((x - s.xM) ** 2 + (y - s.yM) ** 2 + 25);
        num += w * (s.valor ?? suelo0);
        den += w;
      }
      const base = den ? num / den : suelo0;
      return Math.max(10, Math.min(70, base + 5 * malDrenaje * (0.5 - y / altoM) + 1.5 * rSuelo(x, y)));
    },
    "%",
    `Interpolada desde ${sondas.length} sondas de suelo`,
    0,
  );

  // Sanidad como campo continuo: afectación promedio de las plantas de cada celda,
  // suavizada para que el foco se lea como mancha y no como rayas de camas.
  const sanidad = (() => {
    const sc = 40;
    const sf = Math.max(10, Math.round((sc * altoM) / anchoM));
    const suma = new Float64Array(sc * sf);
    const cuenta = new Float64Array(sc * sf);
    let k = 0;
    for (const c of camas) {
      const fx = Math.min(sc - 1, Math.floor((c.xM / anchoM) * sc));
      for (let j = 0; j < c.plantas; j++, k++) {
        const fy = Math.min(sf - 1, Math.floor(((y0M + j * MARCO.entrePlantasM) / altoM) * sf));
        suma[fy * sc + fx] += afectacion[k];
        cuenta[fy * sc + fx]++;
      }
    }
    let v: number[] = Array.from(suma, (x, i) => (cuenta[i] ? x / cuenta[i] : 0));
    for (let pasada = 0; pasada < 2; pasada++) {
      const w: number[] = new Array(v.length).fill(0);
      for (let y = 0; y < sf; y++) {
        for (let x = 0; x < sc; x++) {
          let acc = 0;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= sc || yy >= sf) continue;
              const peso = dx === 0 && dy === 0 ? 2 : 1;
              acc += v[yy * sc + xx] * peso;
              n += peso;
            }
          }
          w[y * sc + x] = acc / n;
        }
      }
      v = w;
    }
    const valores = v.map((x) => Math.round(x * 10) / 10);
    return { cols: sc, filas: sf, valores, min: 0, max: Math.max(...valores), unidad: "%", fuente: "Afectación de las plantas, suavizada" } satisfies Campo;
  })();

  const robot: PuntoRobot[] = (e.robot ?? []).map((p) => ({ ...aLocal(p.lat, p.lng), etiqueta: p.etiqueta, estado: p.estado, scores: p.scores, observationId: p.observationId, fecha: p.fecha }));
  for (const c of e.capturas ?? []) {
    const cama = camas[c.cama - 1];
    if (!cama || c.posicion < 1 || c.posicion > cama.plantas) continue;
    robot.push({
      xM: cama.xM,
      yM: y0M + (c.posicion - 1) * MARCO.entrePlantasM,
      etiqueta: c.tag,
      estado: "captura",
      scores: c.scores,
      observationId: c.observationId,
      fecha: c.fecha,
      alerta: c.alerta,
      tag: c.tag,
    });
  }

  const plantas = afectacion.length;
  return {
    bloqueId: e.bloque.id,
    anchoM,
    altoM,
    naves,
    camas,
    y0M,
    afectacion,
    plaga,
    campos: { sanidad, temperatura, humedadAire, humedadSuelo },
    sensores,
    robot,
    resumen: { plantas, afectadas, pctAfectadas: plantas ? Math.round((1000 * afectadas) / plantas) / 10 : 0, severas, porPlaga },
  };
}

/** Tag legible de una planta: bloque, nave, cama y posición sobre la cama (de sur a norte). */
export function tagPlanta(bloqueId: string, cama: number, posicion: number) {
  return `${bloqueId}-N${String(naveDeCama(cama)).padStart(2, "0")}-C${String(cama).padStart(2, "0")}-P${String(posicion).padStart(3, "0")}`;
}
