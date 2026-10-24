import type { Drenaje, NuevoLote, NuevoSensor, TipoSensor } from "@/db/schema";

/**
 * Finca ficticia sobre terreno agrícola real en Tocancipá, Cundinamarca
 * (sabana de Bogotá, ~2.600 msnm). 10 lotes en una grilla de 5 x 2.
 */
export const FINCA = {
  nombre: "Finca Los Arrayanes",
  municipio: "Tocancipá, Cundinamarca",
  altitudMsnm: 2600,
  centro: { lat: 4.9903, lng: -73.8967 },
  zonaHoraria: "America/Bogota",
  offsetUtcHoras: -5,
};

const LAT0 = 4.9893;
const LNG0 = -73.8993;
const M_POR_GRADO_LAT = 111_320;
const M_POR_GRADO_LNG = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

const ANCHOS_M = [105, 120, 110, 125, 100]; // columnas
const ALTOS_M = [95, 110]; // filas
const PASILLO_M = 8;

type DefLote = {
  id: string;
  nombre: string;
  variedad: string;
  fechaSiembra: string;
  drenaje: Drenaje;
};

const DEFINICIONES: DefLote[] = [
  { id: "L01", nombre: "Arrayán", variedad: "Biloxi", fechaSiembra: "2022-03-15", drenaje: "bueno" },
  { id: "L02", nombre: "Mortiño", variedad: "Biloxi", fechaSiembra: "2022-03-15", drenaje: "bueno" },
  { id: "L03", nombre: "Sauce", variedad: "Legacy", fechaSiembra: "2021-09-01", drenaje: "regular" },
  { id: "L04", nombre: "Roble", variedad: "Legacy", fechaSiembra: "2021-09-01", drenaje: "malo" },
  { id: "L05", nombre: "Aliso", variedad: "Sharpblue", fechaSiembra: "2023-01-20", drenaje: "bueno" },
  { id: "L06", nombre: "Cedro", variedad: "Emerald", fechaSiembra: "2023-01-20", drenaje: "regular" },
  { id: "L07", nombre: "Laurel", variedad: "Biloxi", fechaSiembra: "2020-06-10", drenaje: "bueno" },
  { id: "L08", nombre: "Encenillo", variedad: "Ventura", fechaSiembra: "2022-10-05", drenaje: "malo" },
  { id: "L09", nombre: "Chicalá", variedad: "Legacy", fechaSiembra: "2023-06-01", drenaje: "bueno" },
  { id: "L10", nombre: "Guayacán", variedad: "Emerald", fechaSiembra: "2021-02-14", drenaje: "regular" },
];

function construirLotes(): NuevoLote[] {
  const lotes: NuevoLote[] = [];
  let i = 0;
  let yM = 0;
  for (let fila = 0; fila < ALTOS_M.length; fila++) {
    let xM = 0;
    for (let col = 0; col < ANCHOS_M.length; col++) {
      const def = DEFINICIONES[i++];
      const w = ANCHOS_M[col];
      const h = ALTOS_M[fila];
      const lat = (m: number) => LAT0 + m / M_POR_GRADO_LAT;
      const lng = (m: number) => LNG0 + m / M_POR_GRADO_LNG;
      const poligono: [number, number][] = [
        [lat(yM), lng(xM)],
        [lat(yM), lng(xM + w)],
        [lat(yM + h), lng(xM + w)],
        [lat(yM + h), lng(xM)],
      ];
      lotes.push({
        ...def,
        hectareas: Math.round((w * h) / 100) / 100,
        poligono,
        centroLat: lat(yM + h / 2),
        centroLng: lng(xM + w / 2),
      });
      xM += w + PASILLO_M;
    }
    yM += ALTOS_M[fila] + PASILLO_M;
  }
  return lotes;
}

export const LOTES: NuevoLote[] = construirLotes();

const UNIDADES: Record<TipoSensor, string> = {
  humedad_suelo: "%",
  humedad_aire: "%",
  temperatura: "°C",
  radiacion: "W/m²",
  ph_suelo: "pH",
};

const CODIGO: Record<TipoSensor, string> = {
  humedad_suelo: "HS",
  humedad_aire: "HA",
  temperatura: "TE",
  radiacion: "RA",
  ph_suelo: "PH",
};

/** Lotes con estación de radiación solar (una por sector de la finca). */
const LOTES_CON_RADIACION = new Set(["L01", "L05", "L09"]);

export function construirSensores(fechaInstalacion: string): NuevoSensor[] {
  const sensores: NuevoSensor[] = [];
  const agregar = (loteId: string, tipo: TipoSensor, n: number) => {
    sensores.push({
      id: `${loteId}-${CODIGO[tipo]}-${n}`,
      loteId,
      tipo,
      unidad: UNIDADES[tipo],
      instaladoEn: fechaInstalacion,
      activo: true,
    });
  };
  for (const lote of LOTES) {
    agregar(lote.id, "humedad_suelo", 1);
    agregar(lote.id, "humedad_suelo", 2);
    agregar(lote.id, "humedad_aire", 1);
    agregar(lote.id, "temperatura", 1);
    if (LOTES_CON_RADIACION.has(lote.id)) agregar(lote.id, "radiacion", 1);
  }
  return sensores;
}

/** Punto aleatorio dentro del rectángulo del lote. */
export function puntoEnLote(
  poligono: [number, number][],
  u: number,
  v: number,
): { lat: number; lng: number } {
  const lats = poligono.map((p) => p[0]);
  const lngs = poligono.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return { lat: minLat + (maxLat - minLat) * u, lng: minLng + (maxLng - minLng) * v };
}
