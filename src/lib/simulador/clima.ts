import { Rng, clamp } from "./rng";

/** Probabilidad diaria de lluvia por mes (0 = enero). Régimen bimodal andino. */
const P_LLUVIA_MES = [0.25, 0.3, 0.45, 0.65, 0.65, 0.45, 0.4, 0.35, 0.45, 0.7, 0.65, 0.35];

export type ClimaDia = {
  fecha: string;
  lluviaMm: number;
  tempProm: number;
  tempMin: number;
  tempMax: number;
  /** 24 valores horarios (hora local 0..23). */
  tempHora: number[];
  humedadHora: number[];
  radiacionHora: number[];
  horasHumedadAlta: number;
  humedadProm: number;
};

/**
 * Genera el clima de un día en la sabana de Bogotá: frío, húmedo,
 * con amplitud térmica alta en días despejados y baja en días lluviosos.
 */
export function generarClimaDia(fecha: Date, rng: Rng, anomaliaPrevia: number): ClimaDia {
  const mes = fecha.getUTCMonth();
  const pLluvia = P_LLUVIA_MES[mes];
  const llueve = rng.chance(pLluvia);
  let lluviaMm = 0;
  if (llueve) {
    lluviaMm = rng.exp(7);
    if (rng.chance(0.12)) lluviaMm += rng.uniform(10, 25); // aguacero
  }
  lluviaMm = Math.round(lluviaMm * 10) / 10;

  // Anomalía térmica con persistencia (rachas frías o cálidas)
  const anomalia = anomaliaPrevia * 0.6 + rng.normal(0, 0.9);
  const tempProm = 13.4 + anomalia - (llueve ? 0.8 : 0);
  const amplitud = llueve ? rng.uniform(4.5, 7) : rng.uniform(8, 12);

  const tempHora: number[] = [];
  const humedadHora: number[] = [];
  const radiacionHora: number[] = [];
  const nubosidad = llueve ? rng.uniform(0.55, 0.9) : rng.uniform(0.05, 0.45);

  for (let h = 0; h < 24; h++) {
    // Mínimo ~5 am, máximo ~2 pm
    const fase = Math.sin((2 * Math.PI * (h - 9.5)) / 24);
    const t = tempProm + (amplitud / 2) * fase + rng.normal(0, 0.25);
    tempHora.push(t);

    // Radiación solo de día (6 a 18), atenuada por nubes
    let rad = 0;
    if (h >= 6 && h <= 18) {
      rad = 950 * Math.sin((Math.PI * (h - 6)) / 12) * (1 - 0.75 * nubosidad);
      rad = Math.max(0, rad + rng.normal(0, 25));
    }
    radiacionHora.push(rad);

    // Humedad relativa inversa a la temperatura; noches saturadas
    const humBase = llueve ? 88 : 80;
    const humAmp = llueve ? 10 : 26;
    const hum = humBase - (humAmp / 2) * fase + rng.normal(0, 1.5);
    humedadHora.push(clamp(hum, 35, 100));
  }

  const horasHumedadAlta = humedadHora.filter((x) => x > 85).length;
  return {
    fecha: fecha.toISOString().slice(0, 10),
    lluviaMm,
    tempProm: prom(tempHora),
    tempMin: Math.min(...tempHora),
    tempMax: Math.max(...tempHora),
    tempHora,
    humedadHora,
    radiacionHora,
    horasHumedadAlta,
    humedadProm: prom(humedadHora),
  };
}

export function prom(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Interpola el valor horario a una fracción de hora (0..24). */
export function valorEnHora(serie: number[], horaDecimal: number): number {
  const h0 = Math.floor(horaDecimal) % 24;
  const h1 = (h0 + 1) % 24;
  const t = horaDecimal - Math.floor(horaDecimal);
  return serie[h0] + (serie[h1] - serie[h0]) * t;
}
