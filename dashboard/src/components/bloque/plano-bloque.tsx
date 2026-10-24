"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Minus, Plus, Maximize2, Bot, Radio } from "lucide-react";
import type { Plano } from "@/lib/bloque/plano";
import { ESCALAS, pintarCampo, type CampoCalor } from "@/lib/viz/calor";
import { LeyendaCalor } from "@/components/viz/leyenda-calor";
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
    ? { suelo: "#3a4232", cama: "#1f1d1b", sana: "#6fae5f", leve: "#fab219", moderada: "#ec835a", severa: "#e04848", texto: "#f2f0ea", tenue: "#b7b3a8", robot: "#9aa8ff", borde: "#141413" }
    : { suelo: "#c7cfae", cama: "#4a4540", sana: "#3f8a3a", leve: "#f2a900", moderada: "#e2733f", severa: "#c62f2f", texto: "#1f1d1a", tenue: "#5e5a52", robot: "#2f45b8", borde: "#ffffff" };
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

  const escala = ESCALAS[capa];

  // Con filtro de plaga, el campo de sanidad se recalcula solo con esa plaga
  const campoActivo: CampoCalor & { unidad: string; fuente: string } = useMemo(() => {
    const base = plano.campos[capa];
    if (capa !== "sanidad" || !filtroPlaga) return base;
    const objetivoPlaga = PLAGAS.indexOf(filtroPlaga as (typeof PLAGAS)[number]) + 1;
    const { cols, filas } = base;
    const suma = new Float64Array(cols * filas);
    const cuenta = new Float64Array(cols * filas);
    let k = 0;
    for (const c of plano.camas) {
      const fx = Math.min(cols - 1, Math.floor((c.xM / plano.anchoM) * cols));
      for (let j = 0; j < c.plantas; j++, k++) {
        const fy = Math.min(filas - 1, Math.floor(((plano.y0M + j * 0.75) / plano.altoM) * filas));
        suma[fy * cols + fx] += plano.plaga[k] === objetivoPlaga ? plano.afectacion[k] : 0;
        cuenta[fy * cols + fx]++;
      }
    }
    let v = Array.from(suma, (x, i) => (cuenta[i] ? x / cuenta[i] : 0));
    for (let pasada = 0; pasada < 2; pasada++) {
      v = v.map((_, i) => {
        const x = i % cols;
        const y = Math.floor(i / cols);
        let acc = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= cols || yy >= filas) continue;
            const w = dx || dy ? 1 : 2;
            acc += v[yy * cols + xx] * w;
            n += w;
          }
        return acc / n;
      });
    }
    return { ...base, valores: v };
  }, [plano, capa, filtroPlaga]);

  // Imagen suave del campo (interpolada, con curvas de nivel); se crea una vez por capa
  const imagenCampo = useMemo(() => {
    if (!enNavegador) return null;
    const escalaPx = Math.max(6, Math.round(560 / campoActivo.cols));
    return pintarCampo(campoActivo, escala, campoActivo.cols * escalaPx, campoActivo.filas * escalaPx, { curvas: true });
  }, [campoActivo, escala, enNavegador]);

  const valorCampo = useCallback((xM: number, yM: number) => {
    const c = campoActivo;
    const fx = Math.min(c.cols - 1, Math.max(0, Math.floor((xM / plano.anchoM) * c.cols)));
    const fy = Math.min(c.filas - 1, Math.max(0, Math.floor((yM / plano.altoM) * c.filas)));
    return c.valores[fy * c.cols + fx];
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
    if (!pal) return;
    ctx.clearRect(0, 0, tam.w, tam.h);

    const o = aPantalla(vista, 0, plano.altoM);
    const W = plano.anchoM * vista.k;
    const H = plano.altoM * vista.k;

    // Calles entre camas (cubierta vegetal) y borde del bloque
    ctx.fillStyle = pal.suelo;
    ctx.fillRect(o.x, o.y, W, H);

    // Naves del invernadero: tono alterno muy suave para leer cada túnel
    plano.naves.forEach((n) => {
      if (n.numero % 2) return;
      const a = aPantalla(vista, n.x0M, plano.altoM);
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(a.x, a.y, (n.x1M - n.x0M) * vista.k, H);
    });

    // Camas con cobertura plástica; a poca distancia se leen como hileras verdes de follaje
    const anchoCama = 1.2 * vista.k;
    const largo = (plano.camas[0]?.plantas ?? 1) * 0.75 * vista.k;
    const lejos = vista.k < 5;
    for (const c of plano.camas) {
      const p = aPantalla(vista, c.xM, plano.y0M - 0.375 + c.plantas * 0.75);
      ctx.fillStyle = lejos ? pal.sana : pal.cama;
      const r = Math.min(anchoCama / 2, 6);
      ctx.beginPath();
      ctx.roundRect(p.x - anchoCama / 2, p.y, anchoCama, largo, r);
      ctx.fill();
    }

    // Plantas (solo cuando ya se distinguen)
    const radio = Math.max(0.6, Math.min(0.34 * vista.k, 10));
    const visibleX = (x: number) => x > -20 && x < tam.w + 20;
    const visibleY = (y: number) => y > -20 && y < tam.h + 20;
    const colorPorPlanta = capa === "sanidad" && vista.k >= 12;
    if (!lejos) {
      plano.camas.forEach((c, ci) => {
        const px = aPantalla(vista, c.xM, 0).x;
        if (!visibleX(px)) return;
        for (let j = 0; j < c.plantas; j++) {
          const py = aPantalla(vista, 0, plano.y0M + j * 0.75).y;
          if (!visibleY(py)) continue;
          const idx = inicioCama[ci] + j;
          const v = plano.afectacion[idx];
          const nombre = plano.plaga[idx] ? PLAGAS[plano.plaga[idx] - 1] : null;
          const afectada = v >= UMBRAL.leve && (!filtroPlaga || nombre === filtroPlaga);
          ctx.fillStyle = colorPorPlanta && afectada ? pal[nivel(v) as "leve" | "moderada" | "severa"] : pal.sana;
          ctx.beginPath();
          ctx.arc(px, py, radio, 0, Math.PI * 2);
          ctx.fill();
          if (radio > 4) {
            // brillo del follaje
            ctx.fillStyle = "rgba(255,255,255,0.16)";
            ctx.beginPath();
            ctx.arc(px - radio * 0.3, py - radio * 0.3, radio * 0.45, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    }

    // Mapa de calor encima: suave y con curvas de nivel. Al acercarse en Sanidad se
    // atenúa para que se vea el color de cada planta.
    if (imagenCampo) {
      ctx.save();
      ctx.globalAlpha = capa === "sanidad" ? (colorPorPlanta ? 0.35 : 1) : lejos ? 0.92 : 0.7;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imagenCampo, o.x, o.y, W, H);
      ctx.restore();
    }

    // Estructura: canales entre naves y borde del invernadero
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = vista.k > 8 ? 2 : 1.2;
    for (const n of plano.naves.slice(1)) {
      const a = aPantalla(vista, n.x0M, plano.altoM);
      ctx.beginPath();
      ctx.moveTo(a.x, o.y);
      ctx.lineTo(a.x, o.y + H);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(o.x, o.y, W, H);

    // Número de cada nave en la cabecera norte
    const anchoNave = 9 * vista.k;
    if (anchoNave > 16) {
      ctx.font = `600 ${Math.min(12, anchoNave * 0.28)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const n of plano.naves) {
        const cx = aPantalla(vista, (n.x0M + n.x1M) / 2, 0).x;
        const cy = Math.max(o.y + 10, 12);
        const texto = anchoNave > 60 ? `Nave ${n.numero}` : `N${n.numero}`;
        const w = ctx.measureText(texto).width + 10;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.beginPath();
        ctx.roundRect(cx - w / 2, cy - 9, w, 18, 9);
        ctx.fill();
        ctx.fillStyle = "#1f1d1a";
        ctx.fillText(texto, cx, cy + 0.5);
      }
    }

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
    if (pasoCama > 22) {
      ctx.font = `600 ${Math.min(13, pasoCama * 0.4)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = pal.texto;
      for (const c of plano.camas) {
        const p = aPantalla(vista, c.xM, 1.8); // cabecera sur: el norte lo ocupan las naves
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
          const texto = pasoCama > 90 ? `${plano.bloqueId}-N${String(c.nave).padStart(2, "0")}-C${String(c.numero).padStart(2, "0")}-P${String(j + 1).padStart(3, "0")}` : `P${String(j + 1).padStart(3, "0")}`;
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.strokeText(texto, px, py);
          ctx.fillStyle = v >= UMBRAL.leve && capa === "sanidad" ? "#7a1010" : "#1f1d1a";
          ctx.fillText(texto, px, py);
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
  }, [vista, tam, plano, capa, filtroPlaga, verRobot, verSensores, imagenCampo, hover, fijo, inicioCama, aPantalla, enfocado, objetivo, pal]);

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
          <label className="inline-flex cursor-pointer items-center gap-1.5"><input id="plano-robot" type="checkbox" checked={verRobot} onChange={(e) => setVerRobot(e.target.checked)} /><Bot className="size-3.5" />Capturas del robot ({plano.robot.length})</label>
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
          aria-label={`Plano del bloque ${plano.bloqueId}: ${plano.naves.length} naves, ${plano.camas.length} camas y ${plano.resumen.plantas} plantas`}
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
                <div className="font-mono font-medium">{plano.bloqueId}-N{String(plano.camas[infoPlanta.cama - 1].nave).padStart(2, "0")}-C{String(infoPlanta.cama).padStart(2, "0")}-P{String(infoPlanta.pos).padStart(3, "0")}</div>
                <div className="text-muted-foreground">Bloque {plano.bloqueId} · nave {plano.camas[infoPlanta.cama - 1].nave} · cama {infoPlanta.cama} · planta {infoPlanta.pos}</div>
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
                  <div className="mt-1">{escala.titulo}: <span className="font-medium">{valorCampo(plano.camas[infoPlanta.cama - 1].xM, plano.y0M + (infoPlanta.pos - 1) * 0.75)?.toFixed(escala.decimales)} {escala.unidad}</span></div>
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
        <LeyendaCalor escala={escala} subtitulo={capa === "sanidad" && filtroPlaga ? NOMBRE_PLAGA[filtroPlaga] : undefined} fuente={campoActivo.fuente}>
          {capa === "sanidad" && pal ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {NIVELES.map((n) => (
                <span key={n.clave} className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: pal[n.clave as keyof Paleta] }} />
                  {n.etiqueta} <span className="tabular-nums text-foreground">{conteos[n.clave as keyof typeof conteos].toLocaleString("es-CO")}</span>
                </span>
              ))}
            </div>
          ) : null}
        </LeyendaCalor>
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
