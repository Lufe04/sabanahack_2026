"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Minus, Plus, Maximize2, Bot, Radio } from "lucide-react";
import type { Plano, Campo } from "@/lib/bloque/plano";
import { cn } from "@/lib/utils";

type Capa = "sanidad" | "temperatura" | "humedadAire" | "humedadSuelo";
const CAPAS: { valor: Capa; etiqueta: string }[] = [
  { valor: "sanidad", etiqueta: "Sanidad" },
  { valor: "temperatura", etiqueta: "Temperatura" },
  { valor: "humedadAire", etiqueta: "Humedad del aire" },
  { valor: "humedadSuelo", etiqueta: "Humedad del suelo" },
];
const PLAGAS = ["trips", "botrytis", "alternaria"] as const;
const NOMBRE_PLAGA: Record<string, string> = { trips: "Trips", botrytis: "Botrytis", alternaria: "Alternaria" };

const UMBRAL = { leve: 15, moderada: 40, severa: 70 };
const NIVELES = [
  { clave: "sana", etiqueta: "Sana", desde: 0 },
  { clave: "leve", etiqueta: "Leve", desde: UMBRAL.leve },
  { clave: "moderada", etiqueta: "Moderada", desde: UMBRAL.moderada },
  { clave: "severa", etiqueta: "Severa", desde: UMBRAL.severa },
] as const;

/** Rampas secuenciales de un solo tono (claro = valor bajo). */
const RAMPAS: Record<Exclude<Capa, "sanidad">, [number, number, number][]> = {
  temperatura: [[255, 237, 213], [253, 190, 133], [237, 120, 52], [181, 67, 11]],
  humedadAire: [[205, 226, 251], [109, 167, 236], [37, 106, 191], [13, 54, 107]],
  humedadSuelo: [[214, 240, 229], [120, 200, 170], [27, 140, 103], [9, 82, 60]],
};

function colorRampa(rampa: [number, number, number][], t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (rampa.length - 1);
  const i = Math.min(rampa.length - 2, Math.floor(x));
  const f = x - i;
  return [0, 1, 2].map((c) => Math.round(rampa[i][c] + (rampa[i + 1][c] - rampa[i][c]) * f)) as [number, number, number];
}

function nivel(v: number) {
  if (v >= UMBRAL.severa) return "severa";
  if (v >= UMBRAL.moderada) return "moderada";
  if (v >= UMBRAL.leve) return "leve";
  return "sana";
}

type Paleta = { suelo: string; cama: string; sana: string; leve: string; moderada: string; severa: string; texto: string; tenue: string; robot: string; borde: string };
function leerPaleta(): Paleta {
  const oscuro = document.documentElement.classList.contains("dark");
  return oscuro
    ? { suelo: "#2a2622", cama: "#3b342c", sana: "#5f9a58", leve: "#fab219", moderada: "#ec835a", severa: "#e04848", texto: "#f2f0ea", tenue: "#a9a59b", robot: "#8fa0f0", borde: "#1a1a19" }
    : { suelo: "#d9cdb8", cama: "#b89f7c", sana: "#4f7f47", leve: "#f2a900", moderada: "#e2733f", severa: "#c62f2f", texto: "#1f1d1a", tenue: "#6b665d", robot: "#2f45b8", borde: "#ffffff" };
}

const suscribirNada = () => () => {};

type Vista = { k: number; tx: number; ty: number };
type Seleccion = { tipo: "planta"; cama: number; pos: number; idx: number } | { tipo: "robot"; i: number } | null;

export function PlanoBloque({ plano, enfocar }: { plano: Plano; enfocar?: string | null }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [capa, setCapa] = useState<Capa>("sanidad");
  const [filtroPlaga, setFiltroPlaga] = useState<string | null>(null);
  const [verRobot, setVerRobot] = useState(true);
  const [verSensores, setVerSensores] = useState(true);
  const [vista, setVista] = useState<Vista | null>(null);
  const [tam, setTam] = useState({ w: 800, h: 520 });
  const [hover, setHover] = useState<Seleccion>(null);
  const [fijo, setFijo] = useState<Seleccion>(null);
  const [enfocado, setEnfocado] = useState(false);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const arrastre = useRef<{ x: number; y: number; tx: number; ty: number; movio: boolean } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  // Paleta y tipo de puntero solo existen en el navegador. En el servidor (y durante la
  // hidratación) se usa null/false para que el HTML coincida; luego React vuelve a dibujar.
  const enNavegador = useSyncExternalStore(suscribirNada, () => true, () => false);
  const pal = enNavegador ? leerPaleta() : null;
  const esTactil = enNavegador && (window.matchMedia?.("(pointer: coarse)").matches ?? false);

  // Índice de inicio de cada cama dentro del arreglo plano de plantas
  const inicioCama = useMemo(() => {
    const r: number[] = [];
    let acc = 0;
    for (const c of plano.camas) {
      r.push(acc);
      acc += c.plantas;
    }
    return r;
  }, [plano]);

  // Capturas del robot por planta (cama:posición), para la ficha de cada planta
  const capturaDe = useMemo(() => {
    const m = new Map<string, number>();
    plano.robot.forEach((r, i) => {
      if (r.estado !== "captura" || !r.tag) return;
      const [, c, p] = r.tag.match(/-C(\d+)-P(\d+)$/) ?? [];
      if (c) m.set(`${Number(c)}:${Number(p)}`, i);
    });
    return m;
  }, [plano]);

  // Planta a enfocar al abrir (desde un enlace de Capturas)
  const objetivo = useMemo(() => {
    const m = enfocar?.match(/-C(\d+)-P(\d+)$/);
    if (!m) return null;
    const cama = Number(m[1]);
    const pos = Number(m[2]);
    const c = plano.camas[cama - 1];
    if (!c || pos < 1 || pos > c.plantas) return null;
    let idx = 0;
    for (let i = 0; i < cama - 1; i++) idx += plano.camas[i].plantas;
    return { cama, pos, idx: idx + pos - 1, xM: c.xM, yM: plano.y0M + (pos - 1) * 0.75 };
  }, [enfocar, plano]);

  const encuadre = useCallback((w: number, h: number): Vista => {
    const k = Math.min((w - 40) / plano.anchoM, (h - 40) / plano.altoM);
    return { k, tx: (w - plano.anchoM * k) / 2, ty: (h - plano.altoM * k) / 2 };
  }, [plano]);

  // Tamaño responsivo
  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.max(380, Math.min(640, Math.round(w * 0.62)));
      setTam({ w, h });
      setVista((v) => {
        if (v) return v;
        if (objetivo) {
          const k = 26; // cerca, con los tags visibles
          return { k, tx: w / 2 - objetivo.xM * k, ty: h / 2 - (plano.altoM - objetivo.yM) * k };
        }
        return encuadre(w, h);
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [encuadre, objetivo, plano]);

  const aPantalla = useCallback((v: Vista, xM: number, yM: number) => ({ x: v.tx + xM * v.k, y: v.ty + (plano.altoM - yM) * v.k }), [plano]);
  const aMundo = useCallback((v: Vista, x: number, y: number) => ({ xM: (x - v.tx) / v.k, yM: plano.altoM - (y - v.ty) / v.k }), [plano]);

  const campoActivo: Campo | null = capa === "sanidad" ? null : plano.campos[capa];

  // Imagen del campo de calor (una celda por píxel; el navegador la suaviza al escalar)
  const imagenCampo = useMemo(() => {
    if (!campoActivo || typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = campoActivo.cols;
    c.height = campoActivo.filas;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(c.width, c.height);
    const rango = Math.max(0.001, campoActivo.max - campoActivo.min);
    for (let fy = 0; fy < campoActivo.filas; fy++) {
      for (let fx = 0; fx < campoActivo.cols; fx++) {
        const v = campoActivo.valores[fy * campoActivo.cols + fx];
        const [r, g, b] = colorRampa(RAMPAS[capa as Exclude<Capa, "sanidad">], (v - campoActivo.min) / rango);
        const p = ((campoActivo.filas - 1 - fy) * campoActivo.cols + fx) * 4; // norte arriba
        img.data[p] = r;
        img.data[p + 1] = g;
        img.data[p + 2] = b;
        img.data[p + 3] = 235;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }, [campoActivo, capa]);

  const valorCampo = useCallback((xM: number, yM: number) => {
    if (!campoActivo) return null;
    const fx = Math.min(campoActivo.cols - 1, Math.max(0, Math.floor((xM / plano.anchoM) * campoActivo.cols)));
    const fy = Math.min(campoActivo.filas - 1, Math.max(0, Math.floor((yM / plano.altoM) * campoActivo.filas)));
    return campoActivo.valores[fy * campoActivo.cols + fx];
  }, [campoActivo, plano]);

  // --- Dibujo ---
  useEffect(() => {
    const cv = lienzo.current;
    if (!cv || !vista) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = tam.w * dpr;
    cv.height = tam.h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pal = leerPaleta();
    ctx.clearRect(0, 0, tam.w, tam.h);

    const o = aPantalla(vista, 0, plano.altoM);
    const W = plano.anchoM * vista.k;
    const H = plano.altoM * vista.k;

    // Pasillos y cabeceras (suelo)
    ctx.fillStyle = pal.suelo;
    ctx.fillRect(o.x, o.y, W, H);
    if (imagenCampo) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imagenCampo, o.x, o.y, W, H);
    }

    // Camas
    const anchoCama = 1.2 * vista.k;
    const largo = (plano.camas[0]?.plantas ?? 1) * 0.75 * vista.k;
    for (const c of plano.camas) {
      const p = aPantalla(vista, c.xM, plano.y0M - 0.375 + c.plantas * 0.75);
      ctx.fillStyle = imagenCampo ? "rgba(60,45,30,0.18)" : pal.cama;
      ctx.fillRect(p.x - anchoCama / 2, p.y, anchoCama, largo);
    }

    // Plantas
    const radio = Math.max(0.6, Math.min(0.32 * vista.k, 9));
    const visibleX = (x: number) => x > -20 && x < tam.w + 20;
    const visibleY = (y: number) => y > -20 && y < tam.h + 20;
    plano.camas.forEach((c, ci) => {
      const px = aPantalla(vista, c.xM, 0).x;
      if (!visibleX(px)) return;
      for (let j = 0; j < c.plantas; j++) {
        const py = aPantalla(vista, 0, plano.y0M + j * 0.75).y;
        if (!visibleY(py)) continue;
        const idx = inicioCama[ci] + j;
        const v = plano.afectacion[idx];
        const pl = plano.plaga[idx];
        let color: string;
        if (capa === "sanidad") {
          const nombre = pl ? PLAGAS[pl - 1] : null;
          const filtrada = filtroPlaga && nombre !== filtroPlaga;
          color = filtrada || v < UMBRAL.leve ? pal.sana : pal[nivel(v) as "leve" | "moderada" | "severa"];
          ctx.globalAlpha = filtrada && v >= UMBRAL.leve ? 0.35 : 1;
        } else {
          color = "rgba(30,60,30,0.55)";
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = color;
        if (radio < 1.2) {
          ctx.fillRect(px - radio, py - radio, radio * 2, radio * 2);
        } else {
          ctx.beginPath();
          ctx.arc(px, py, radio, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    ctx.globalAlpha = 1;

    // Selección
    const sel = fijo ?? hover ?? (!enfocado && objetivo ? { tipo: "planta" as const, cama: objetivo.cama, pos: objetivo.pos, idx: objetivo.idx } : null);
    if (sel?.tipo === "planta") {
      const c = plano.camas[sel.cama - 1];
      const p = aPantalla(vista, c.xM, plano.y0M + (sel.pos - 1) * 0.75);
      ctx.strokeStyle = pal.texto;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(radio + 3, 6), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Números de cama (norte) y tags de planta al acercarse
    ctx.textBaseline = "middle";
    const pasoCama = 3 * vista.k;
    if (pasoCama > 14) {
      ctx.font = `600 ${Math.min(13, pasoCama * 0.45)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = pal.texto;
      for (const c of plano.camas) {
        const p = aPantalla(vista, c.xM, plano.altoM - 1.6);
        if (visibleX(p.x)) ctx.fillText(`C${c.numero}`, p.x, p.y);
      }
    }
    const pasoPlanta = 0.75 * vista.k;
    if (pasoPlanta > 13) {
      ctx.font = `${Math.min(11, pasoPlanta * 0.5)}px ui-monospace, SFMono-Regular, monospace`;
      ctx.textAlign = "left";
      plano.camas.forEach((c, ci) => {
        const px = aPantalla(vista, c.xM, 0).x + radio + 3;
        if (!visibleX(px)) return;
        for (let j = 0; j < c.plantas; j++) {
          const py = aPantalla(vista, 0, plano.y0M + j * 0.75).y;
          if (!visibleY(py)) continue;
          const v = plano.afectacion[inicioCama[ci] + j];
          ctx.fillStyle = v >= UMBRAL.leve && capa === "sanidad" ? pal.texto : pal.tenue;
          ctx.fillText(pasoCama > 90 ? `${plano.bloqueId}-C${String(c.numero).padStart(2, "0")}-P${String(j + 1).padStart(3, "0")}` : `P${String(j + 1).padStart(3, "0")}`, px, py);
        }
      });
    }

    // Sensores
    if (verSensores) {
      for (const s of plano.sensores) {
        const p = aPantalla(vista, s.xM, s.yM);
        ctx.fillStyle = pal.borde;
        ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
        ctx.fillStyle = pal.texto;
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      }
    }

    // Puntos del robot
    if (verRobot) {
      plano.robot.forEach((r, i) => {
        const p = aPantalla(vista, r.xM, r.yM);
        const s = (fijo?.tipo === "robot" && fijo.i === i) || (hover?.tipo === "robot" && hover.i === i) ? 9 : 7;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = pal.borde;
        ctx.fillRect(-s - 2, -s - 2, (s + 2) * 2, (s + 2) * 2);
        ctx.fillStyle = r.estado === "captura" ? (r.alerta ? pal.severa : pal.robot) : r.estado === "pending" ? "#9ca3af" : pal.robot;
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.restore();
      });
    }

    // Norte y escala
    ctx.fillStyle = pal.texto;
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N ↑", tam.w - 24, 18);
    const metros = [1, 2, 5, 10, 20, 50].find((m) => m * vista.k > 60) ?? 50;
    const largoEscala = metros * vista.k;
    ctx.fillRect(14, tam.h - 16, largoEscala, 3);
    ctx.textAlign = "left";
    ctx.fillText(`${metros} m`, 14, tam.h - 26);
  }, [vista, tam, plano, capa, filtroPlaga, verRobot, verSensores, imagenCampo, hover, fijo, inicioCama, aPantalla, enfocado, objetivo]);

  // --- Interacción ---
  const buscar = useCallback((x: number, y: number): Seleccion => {
    if (!vista) return null;
    if (verRobot) {
      const i = plano.robot.findIndex((r) => {
        const p = aPantalla(vista, r.xM, r.yM);
        return Math.hypot(p.x - x, p.y - y) < 12;
      });
      if (i >= 0) return { tipo: "robot", i };
    }
    const { xM, yM } = aMundo(vista, x, y);
    const ci = Math.round((xM - (plano.camas[0]?.xM ?? 0)) / 3);
    const c = plano.camas[ci];
    if (!c || Math.abs(xM - c.xM) > 1.1) return null;
    const j = Math.round((yM - plano.y0M) / 0.75);
    if (j < 0 || j >= c.plantas) return null;
    return { tipo: "planta", cama: c.numero, pos: j + 1, idx: inicioCama[ci] + j };
  }, [vista, plano, verRobot, aPantalla, aMundo, inicioCama]);

  const zoom = useCallback((factor: number, cx?: number, cy?: number) => {
    setVista((v) => {
      if (!v) return v;
      const minK = encuadre(tam.w, tam.h).k * 0.8;
      const k = Math.max(minK, Math.min(80, v.k * factor));
      const x = cx ?? tam.w / 2;
      const y = cy ?? tam.h / 2;
      return { k, tx: x - ((x - v.tx) * k) / v.k, ty: y - ((y - v.ty) * k) / v.k };
    });
  }, [encuadre, tam]);

  useEffect(() => {
    const cv = lienzo.current;
    if (!cv) return;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    cv.addEventListener("wheel", rueda, { passive: false });
    return () => cv.removeEventListener("wheel", rueda);
  }, [zoom]);

  const pos = (e: React.PointerEvent) => {
    const r = lienzo.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const selInicial: Seleccion = !enfocado && objetivo ? { tipo: "planta", cama: objetivo.cama, pos: objetivo.pos, idx: objetivo.idx } : null;
  const sel = fijo ?? hover ?? selInicial;
  const infoPlanta = sel?.tipo === "planta" ? sel : null;
  const infoRobot = sel?.tipo === "robot" ? plano.robot[sel.i] : null;
  const conteos = useMemo(() => {
    const c = { sana: 0, leve: 0, moderada: 0, severa: 0 };
    plano.afectacion.forEach((v, i) => {
      const nombre = plano.plaga[i] ? PLAGAS[plano.plaga[i] - 1] : null;
      if (filtroPlaga && nombre !== filtroPlaga && v >= UMBRAL.leve) return void c.sana++;
      c[nivel(v) as keyof typeof c]++;
    });
    return c;
  }, [plano, filtroPlaga]);


  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Capa del mapa de calor">
          {CAPAS.map((c) => (
            <button
              key={c.valor}
              type="button"
              role="tab"
              aria-selected={capa === c.valor}
              onClick={() => setCapa(c.valor)}
              className={cn("rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors", capa === c.valor ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}
            >
              {c.etiqueta}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-1.5"><input id="plano-robot" type="checkbox" checked={verRobot} onChange={(e) => setVerRobot(e.target.checked)} /><Bot className="size-3.5" />Robot ({plano.robot.filter((r) => r.estado === "captura").length} capturas{plano.robot.some((r) => r.estado !== "captura") ? ` · ${plano.robot.filter((r) => r.estado !== "captura").length} puntos de ruta` : ""})</label>
          <label className="inline-flex cursor-pointer items-center gap-1.5"><input id="plano-sensores" type="checkbox" checked={verSensores} onChange={(e) => setVerSensores(e.target.checked)} /><Radio className="size-3.5" />Sensores</label>
        </div>
      </div>

      {capa === "sanidad" ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Plaga:</span>
          {[null, ...PLAGAS].map((p) => (
            <button key={p ?? "todas"} type="button" onClick={() => setFiltroPlaga(p)} className={cn("rounded-full border px-2.5 py-0.5", filtroPlaga === p ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")}>
              {p ? `${NOMBRE_PLAGA[p]} · ${plano.resumen.porPlaga[p]}` : "Todas"}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={contenedor} className="relative w-full overflow-hidden rounded-md border border-border bg-[var(--viz-empty)]" style={{ height: tam.h }}>
        <canvas
          ref={lienzo}
          style={{ width: tam.w, height: tam.h, touchAction: "none", cursor: arrastrando ? "grabbing" : "crosshair" }}
          aria-label={`Plano del bloque ${plano.bloqueId}: ${plano.camas.length} camas y ${plano.resumen.plantas} plantas`}
          role="img"
          onPointerDown={(e) => {
            if (!vista) return;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            const p = pos(e);
            arrastre.current = { x: p.x, y: p.y, tx: vista.tx, ty: vista.ty, movio: false };
          }}
          onPointerMove={(e) => {
            const p = pos(e);
            setMouse(p);
            const a = arrastre.current;
            if (a) {
              const dx = p.x - a.x;
              const dy = p.y - a.y;
              if (Math.abs(dx) + Math.abs(dy) > 3) a.movio = true;
              if (a.movio) {
                setArrastrando(true);
                setVista((v) => (v ? { ...v, tx: a.tx + dx, ty: a.ty + dy } : v));
              }
              return;
            }
            setHover(buscar(p.x, p.y));
          }}
          onPointerUp={(e) => {
            const a = arrastre.current;
            arrastre.current = null;
            setArrastrando(false);
            if (a && !a.movio) {
              setFijo(buscar(pos(e).x, pos(e).y));
              setEnfocado(true);
            }
          }}
          onPointerLeave={() => {
            setHover(null);
            setMouse(null);
          }}
          onDoubleClick={(e) => zoom(2, pos(e as unknown as React.PointerEvent).x, pos(e as unknown as React.PointerEvent).y)}
        />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          <button type="button" aria-label="Acercar" onClick={() => zoom(1.6)} className="flex size-8 items-center justify-center rounded-md border border-border bg-background shadow-sm hover:bg-muted"><Plus className="size-4" /></button>
          <button type="button" aria-label="Alejar" onClick={() => zoom(1 / 1.6)} className="flex size-8 items-center justify-center rounded-md border border-border bg-background shadow-sm hover:bg-muted"><Minus className="size-4" /></button>
          <button type="button" aria-label="Ver todo el bloque" onClick={() => setVista(encuadre(tam.w, tam.h))} className="flex size-8 items-center justify-center rounded-md border border-border bg-background shadow-sm hover:bg-muted"><Maximize2 className="size-4" /></button>
        </div>
        {(infoPlanta || infoRobot) && (fijo || mouse || selInicial) ? (
          <div
            className="pointer-events-none absolute z-10 max-w-64 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
            style={fijo || (selInicial && !hover) ? { right: 8, top: 8 } : { left: Math.min((mouse?.x ?? 0) + 14, tam.w - 260), top: Math.min((mouse?.y ?? 0) + 14, tam.h - 120) }}
          >
            {infoPlanta ? (
              <>
                <div className="font-mono font-medium">{plano.bloqueId}-C{String(infoPlanta.cama).padStart(2, "0")}-P{String(infoPlanta.pos).padStart(3, "0")}</div>
                <div className="text-muted-foreground">Cama {infoPlanta.cama} · planta {infoPlanta.pos} de sur a norte</div>
                {(() => {
                  const i = capturaDe.get(`${infoPlanta.cama}:${infoPlanta.pos}`);
                  const r = i !== undefined ? plano.robot[i] : null;
                  return r?.scores ? (
                    <div className="mt-1 rounded bg-muted px-2 py-1">
                      <div className="font-medium">Última captura del robot{r.alerta ? " · alerta" : ""}</div>
                      <div className="grid grid-cols-2 gap-x-3">
                        {Object.entries(r.scores).map(([k, v]) => <span key={k}>{NOMBRE_PLAGA[k] ?? "Sana"} {Math.round(v * 100)}</span>)}
                      </div>
                    </div>
                  ) : null;
                })()}
                {capa === "sanidad" ? (
                  plano.afectacion[infoPlanta.idx] >= UMBRAL.leve ? (
                    <div className="mt-1">
                      <span className="text-muted-foreground">Sanidad simulada: </span><span className="font-medium">{NOMBRE_PLAGA[PLAGAS[plano.plaga[infoPlanta.idx] - 1]]}</span> · afectación {NIVELES.find((n) => n.clave === nivel(plano.afectacion[infoPlanta.idx]))?.etiqueta.toLowerCase()} ({plano.afectacion[infoPlanta.idx]} %)
                    </div>
                  ) : (
                    <div className="mt-1"><span className="text-muted-foreground">Sanidad simulada: </span>sana</div>
                  )
                ) : (
                  <div className="mt-1">{CAPAS.find((c) => c.valor === capa)?.etiqueta}: <span className="font-medium">{valorCampo(plano.camas[infoPlanta.cama - 1].xM, plano.y0M + (infoPlanta.pos - 1) * 0.75)} {campoActivo?.unidad}</span></div>
                )}
              </>
            ) : infoRobot ? (
              <>
                <div className="font-medium">{infoRobot.etiqueta}</div>
                <div className="text-muted-foreground">
                  {infoRobot.estado === "captura" ? `Captura del robot${infoRobot.alerta ? " · alerta" : ""}. Ubicación asignada en el MVP: la app aún no envía bloque y cama.` : "Posición asignada por la app, no GPS medido"}
                </div>
                {infoRobot.scores ? (
                  <div className="mt-1 grid grid-cols-2 gap-x-3">
                    {Object.entries(infoRobot.scores).map(([k, v]) => <span key={k}>{NOMBRE_PLAGA[k] ?? "Sana"} {Math.round(v * 100)}</span>)}
                  </div>
                ) : (
                  <div className="mt-1">Sin lecturas todavía</div>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        {capa === "sanidad" && pal ? (
          <div className="flex flex-wrap items-center gap-3">
            {NIVELES.map((n) => (
              <span key={n.clave} className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full" style={{ background: pal[n.clave as keyof Paleta] }} />
                {n.etiqueta} <span className="tabular-nums text-foreground">{conteos[n.clave as keyof typeof conteos].toLocaleString("es-CO")}</span>
              </span>
            ))}
          </div>
        ) : campoActivo ? (
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{campoActivo.min}{campoActivo.unidad}</span>
            <span
              className="inline-block h-2.5 w-36 rounded-full"
              style={{ background: `linear-gradient(90deg, ${RAMPAS[capa as Exclude<Capa, "sanidad">].map((c) => `rgb(${c.join(",")})`).join(",")})` }}
            />
            <span className="tabular-nums">{campoActivo.max}{campoActivo.unidad}</span>
            <span>· {campoActivo.fuente}</span>
          </div>
        ) : null}
        <span>{esTactil ? "Usa + y − para acercar, arrastra para moverte y toca una planta para ver su tag." : "Rueda o doble clic para acercar · arrastra para moverte · clic para fijar una planta"}</span>
      </div>
      {sel?.tipo === "planta" && capturaDe.has(`${sel.cama}:${sel.pos}`) && plano.robot[capturaDe.get(`${sel.cama}:${sel.pos}`)!].observationId ? (
        <Link href={`/capturas/${plano.robot[capturaDe.get(`${sel.cama}:${sel.pos}`)!].observationId}`} className="mr-3 text-xs underline">Ver la captura de esta planta</Link>
      ) : null}
      {fijo?.tipo === "robot" && plano.robot[fijo.i]?.observationId ? (
        <Link href={`/capturas/${plano.robot[fijo.i].observationId}`} className="text-xs underline">Ver la última lectura del robot en ese punto</Link>
      ) : null}
    </div>
  );
}
