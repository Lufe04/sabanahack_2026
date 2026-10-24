"use client";

import { useMemo, useState } from "react";
import { MapaLotesLazy } from "./mapa-lotes-lazy";
import type { FeatureCollectionRecorridos } from "./capa-recorridos";
import { cn } from "@/lib/utils";

export type DatoBloque = {
  id: string;
  nombre: string;
  poligono: [number, number][];
  indiceRiesgo: number;
  eventosActivos: number;
  pctAfectadas: number;
  temperatura: number | null;
  humedadAire: number | null;
  humedadSuelo: number | null;
};

type Capa = "sanidad" | "riesgo" | "temperatura" | "humedadAire" | "humedadSuelo";
const CAPAS: { valor: Capa; etiqueta: string }[] = [
  { valor: "sanidad", etiqueta: "Plantas afectadas" },
  { valor: "riesgo", etiqueta: "Riesgo de brote" },
  { valor: "temperatura", etiqueta: "Temperatura" },
  { valor: "humedadAire", etiqueta: "Humedad del aire" },
  { valor: "humedadSuelo", etiqueta: "Humedad del suelo" },
];

/** Estado (bueno → crítico) para afectación y riesgo; rampas de un tono para el clima. */
const ESTADOS = [
  { hasta: 1, color: "#0ca30c", etiqueta: "Sin afectación" },
  { hasta: 5, color: "#fab219", etiqueta: "Leve" },
  { hasta: 10, color: "#ec835a", etiqueta: "Moderada" },
  { hasta: Infinity, color: "#d03b3b", etiqueta: "Alta" },
];
const RIESGO = [
  { hasta: 20, color: "#0ca30c", etiqueta: "Bajo" },
  { hasta: 40, color: "#fab219", etiqueta: "Moderado" },
  { hasta: 60, color: "#ec835a", etiqueta: "Alto" },
  { hasta: Infinity, color: "#d03b3b", etiqueta: "Crítico" },
];
const RAMPAS: Record<"temperatura" | "humedadAire" | "humedadSuelo", string[]> = {
  temperatura: ["#ffedd5", "#fdbe85", "#ed7834", "#b5430b"],
  humedadAire: ["#cde2fb", "#6da7ec", "#256abf", "#0d366b"],
  humedadSuelo: ["#d6f0e5", "#78c8aa", "#1b8c67", "#09523c"],
};
const UNIDAD = { temperatura: "°C", humedadAire: "%", humedadSuelo: "%" };

export function MapaFinca({
  bloques,
  centro,
  alto = 460,
  recorridos,
  capaInicial = "sanidad",
}: {
  bloques: DatoBloque[];
  centro: { lat: number; lng: number };
  alto?: number;
  recorridos?: { inicial: FeatureCollectionRecorridos; url: string };
  capaInicial?: Capa;
}) {
  const [capa, setCapa] = useState<Capa>(capaInicial);

  const { colores, leyenda } = useMemo(() => {
    const colores: Record<string, { color: string; texto: string }> = {};
    if (capa === "sanidad" || capa === "riesgo") {
      const escala = capa === "sanidad" ? ESTADOS : RIESGO;
      for (const b of bloques) {
        const v = capa === "sanidad" ? b.pctAfectadas : b.indiceRiesgo;
        const paso = escala.find((e) => v < e.hasta)!;
        colores[b.id] = { color: paso.color, texto: capa === "sanidad" ? `${v.toLocaleString("es-CO")} %` : `${v} %` };
      }
      return { colores, leyenda: { tipo: "estado" as const, pasos: escala } };
    }
    const vals = bloques.map((b) => b[capa]).filter((v): v is number => v !== null);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const rampa = RAMPAS[capa];
    for (const b of bloques) {
      const v = b[capa];
      if (v === null) continue;
      const t = max > min ? (v - min) / (max - min) : 0.5;
      colores[b.id] = { color: rampa[Math.min(rampa.length - 1, Math.floor(t * rampa.length))], texto: `${v.toFixed(capa === "temperatura" ? 1 : 0)}${UNIDAD[capa]}` };
    }
    return { colores, leyenda: { tipo: "rampa" as const, rampa, min, max, unidad: UNIDAD[capa], decimales: capa === "temperatura" ? 1 : 0 } };
  }, [bloques, capa]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Variable del mapa">
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
      <MapaLotesLazy lotes={bloques} centro={centro} alto={alto} compacto colores={colores} recorridos={recorridos} />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {leyenda.tipo === "estado" ? (
          leyenda.pasos.map((p) => (
            <span key={p.etiqueta} className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />{p.etiqueta}</span>
          ))
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="tabular-nums">{leyenda.min.toFixed(leyenda.decimales)}{leyenda.unidad}</span>
            <span className="inline-block h-2.5 w-32 rounded-full" style={{ background: `linear-gradient(90deg, ${leyenda.rampa.join(",")})` }} />
            <span className="tabular-nums">{leyenda.max.toFixed(leyenda.decimales)}{leyenda.unidad}</span>
            <span>· lectura actual de los sensores de cada bloque</span>
          </span>
        )}
        <span>· clic en un bloque para ver su plano</span>
      </div>
    </div>
  );
}
