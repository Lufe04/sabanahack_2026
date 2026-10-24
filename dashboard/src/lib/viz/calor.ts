/**
 * Mapas de calor: escalas de color y renderizado suave de un campo en una cuadrícula.
 * Sin dependencias del servidor: se usa en el navegador (plano del bloque y mapa de la finca).
 *
 * Las escalas tienen dominios fijos con sentido agronómico, para que un 2 % de diferencia
 * no se pinte como si fuera enorme y para que dos bloques se puedan comparar.
 */

export type VariableCalor = "sanidad" | "temperatura" | "humedadAire" | "humedadSuelo";

type Parada = { v: number; c: [number, number, number, number] }; // r, g, b, alfa 0..1

export type EscalaCalor = {
  variable: VariableCalor;
  titulo: string;
  unidad: string;
  paradas: Parada[];
  /** Valores para las marcas de la leyenda. */
  marcas: number[];
  /** Rótulos opcionales bajo la leyenda (por ejemplo seco / adecuado / encharcado). */
  rotulos?: { v: number; texto: string }[];
  /** Niveles para las curvas de nivel. */
  niveles: number[];
  decimales: number;
};

export const ESCALAS: Record<VariableCalor, EscalaCalor> = {
  // Afectación de plantas: transparente donde está sano, amarillo → rojo oscuro en el foco.
  sanidad: {
    variable: "sanidad",
    titulo: "Afectación de las plantas",
    unidad: "%",
    paradas: [
      { v: 0, c: [255, 255, 204, 0] },
      { v: 6, c: [255, 237, 160, 0] },
      { v: 15, c: [254, 217, 118, 0.6] },
      { v: 30, c: [253, 141, 60, 0.78] },
      { v: 50, c: [227, 26, 28, 0.88] },
      { v: 75, c: [128, 0, 38, 0.95] },
    ],
    marcas: [0, 15, 30, 50, 75],
    rotulos: [
      { v: 15, texto: "leve" },
      { v: 40, texto: "moderada" },
      { v: 70, texto: "severa" },
    ],
    niveles: [15, 40, 70],
    decimales: 0,
  },
  // Temperatura del aire en la sabana: frío nocturno a mediodía cálido.
  temperatura: {
    variable: "temperatura",
    titulo: "Temperatura del aire",
    unidad: "°C",
    paradas: [
      { v: 4, c: [69, 117, 180, 1] },
      { v: 9, c: [145, 191, 219, 1] },
      { v: 13, c: [254, 224, 144, 1] },
      { v: 17, c: [252, 141, 89, 1] },
      { v: 22, c: [215, 48, 39, 1] },
    ],
    marcas: [4, 9, 13, 17, 22],
    rotulos: [
      { v: 6, texto: "riesgo de helada" },
      { v: 19, texto: "favorece trips" },
    ],
    niveles: [6, 8, 10, 12, 14, 16, 18, 20],
    decimales: 1,
  },
  // Humedad del aire: sobre 85 % sostenido favorece Botrytis y Alternaria.
  humedadAire: {
    variable: "humedadAire",
    titulo: "Humedad del aire",
    unidad: "%",
    paradas: [
      { v: 50, c: [247, 251, 255, 1] },
      { v: 70, c: [198, 219, 239, 1] },
      { v: 80, c: [107, 174, 214, 1] },
      { v: 88, c: [33, 113, 181, 1] },
      { v: 96, c: [8, 48, 107, 1] },
    ],
    marcas: [50, 70, 80, 88, 96],
    rotulos: [{ v: 88, texto: "riesgo de hongos" }],
    niveles: [70, 75, 80, 85, 90, 95],
    decimales: 0,
  },
  // Humedad del suelo: divergente alrededor del rango adecuado (30–46 %).
  humedadSuelo: {
    variable: "humedadSuelo",
    titulo: "Humedad del suelo",
    unidad: "%",
    paradas: [
      { v: 18, c: [140, 81, 10, 1] },
      { v: 28, c: [216, 179, 101, 1] },
      { v: 38, c: [245, 240, 225, 1] },
      { v: 50, c: [90, 180, 172, 1] },
      { v: 62, c: [1, 102, 94, 1] },
    ],
    marcas: [18, 28, 38, 50, 62],
    rotulos: [
      { v: 22, texto: "seco" },
      { v: 38, texto: "adecuado" },
      { v: 58, texto: "encharcado" },
    ],
    niveles: [30, 46, 54],
    decimales: 0,
  },
};

export function colorEn(escala: EscalaCalor, v: number): [number, number, number, number] {
  const p = escala.paradas;
  if (v <= p[0].v) return p[0].c;
  if (v >= p[p.length - 1].v) return p[p.length - 1].c;
  let i = 0;
  while (i < p.length - 2 && v > p[i + 1].v) i++;
  const t = (v - p[i].v) / (p[i + 1].v - p[i].v);
  return [0, 1, 2, 3].map((k) => p[i].c[k] + (p[i + 1].c[k] - p[i].c[k]) * t) as [number, number, number, number];
}

export function gradienteCss(escala: EscalaCalor): string {
  const a = escala.paradas[0].v;
  const b = escala.paradas[escala.paradas.length - 1].v;
  return `linear-gradient(90deg, ${escala.paradas
    .map((p) => `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${Math.max(p.c[3], escala.variable === "sanidad" ? 0.15 : 1)}) ${(((p.v - a) / (b - a)) * 100).toFixed(1)}%`)
    .join(", ")})`;
}

export type CampoCalor = { cols: number; filas: number; valores: number[] };

/** Valor interpolado (bilineal) en coordenadas de celda; fy = 0 es el sur. */
function muestra(c: CampoCalor, fx: number, fy: number) {
  const x = Math.max(0, Math.min(c.cols - 1, fx - 0.5));
  const y = Math.max(0, Math.min(c.filas - 1, fy - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(c.cols - 1, x0 + 1);
  const y1 = Math.min(c.filas - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const v = (xx: number, yy: number) => c.valores[yy * c.cols + xx];
  // Suavizado tipo smoothstep para que no se noten las celdas
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  return (v(x0, y0) * (1 - sx) + v(x1, y0) * sx) * (1 - sy) + (v(x0, y1) * (1 - sx) + v(x1, y1) * sx) * sy;
}

/**
 * Pinta un campo en un canvas de `ancho` × `alto` píxeles, con el norte arriba.
 * Interpola entre celdas y, si se pide, dibuja curvas de nivel finas.
 */
export function pintarCampo(campo: CampoCalor, escala: EscalaCalor, ancho: number, alto: number, opciones: { curvas?: boolean; alfa?: number } = {}) {
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.max(2, Math.round(ancho));
  lienzo.height = Math.max(2, Math.round(alto));
  const ctx = lienzo.getContext("2d")!;
  const img = ctx.createImageData(lienzo.width, lienzo.height);
  const alfa = opciones.alfa ?? 1;
  const valores = new Float32Array(lienzo.width * lienzo.height);
  for (let py = 0; py < lienzo.height; py++) {
    const fy = ((lienzo.height - 1 - py + 0.5) / lienzo.height) * campo.filas;
    for (let px = 0; px < lienzo.width; px++) {
      const fx = ((px + 0.5) / lienzo.width) * campo.cols;
      const v = muestra(campo, fx, fy);
      valores[py * lienzo.width + px] = v;
      const [r, g, b, a] = colorEn(escala, v);
      const i = (py * lienzo.width + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(a * 255 * alfa);
    }
  }
  ctx.putImageData(img, 0, 0);

  // Curvas de nivel: borde entre píxeles que cruzan un nivel
  if (opciones.curvas) {
    const borde = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    for (const nivel of escala.niveles) {
      for (let py = 1; py < lienzo.height - 1; py++) {
        for (let px = 1; px < lienzo.width - 1; px++) {
          const k = py * lienzo.width + px;
          const a = valores[k] >= nivel;
          if (a !== valores[k + 1] >= nivel || a !== valores[k + lienzo.width] >= nivel) {
            const i = k * 4;
            borde.data[i] = Math.round(borde.data[i] * 0.45 + 255 * 0.55);
            borde.data[i + 1] = Math.round(borde.data[i + 1] * 0.45 + 255 * 0.55);
            borde.data[i + 2] = Math.round(borde.data[i + 2] * 0.45 + 255 * 0.55);
            borde.data[i + 3] = Math.max(borde.data[i + 3], escala.variable === "sanidad" ? 200 : 255);
          }
        }
      }
    }
    ctx.putImageData(borde, 0, 0);
  }
  return lienzo;
}
