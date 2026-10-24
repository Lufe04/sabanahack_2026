"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { MapaLotesLazy } from "./mapa-lotes-lazy";
import type { FeatureCollectionRecorridos } from "./capa-recorridos";
import { ESCALAS, pintarCampo, type CampoCalor, type VariableCalor } from "@/lib/viz/calor";
import { LeyendaCalor } from "@/components/viz/leyenda-calor";
import { navesDe } from "@/lib/bloque/plano";
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
  campos?: Record<VariableCalor, CampoCalor>;
};

type Capa = VariableCalor | "riesgo";
const CAPAS: { valor: Capa; etiqueta: string }[] = [
  { valor: "sanidad", etiqueta: "Plantas afectadas" },
  { valor: "riesgo", etiqueta: "Riesgo de brote" },
  { valor: "temperatura", etiqueta: "Temperatura" },
  { valor: "humedadAire", etiqueta: "Humedad del aire" },
  { valor: "humedadSuelo", etiqueta: "Humedad del suelo" },
];

const RIESGO = [
  { hasta: 20, color: "#0ca30c", etiqueta: "Bajo" },
  { hasta: 40, color: "#fab219", etiqueta: "Moderado" },
  { hasta: 60, color: "#ec835a", etiqueta: "Alto" },
  { hasta: Infinity, color: "#d03b3b", etiqueta: "Crítico" },
];

const M_POR_GRADO = 111_320;
const sinSuscripcion = () => () => {};

/** Líneas entre naves de un invernadero, en coordenadas [lat, lng]. */
function lineasNaves(poligono: [number, number][]): [number, number][][] {
  const lats = poligono.map((p) => p[0]);
  const lngs = poligono.map((p) => p[1]);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lngMin = Math.min(...lngs);
  const mLng = M_POR_GRADO * Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
  return navesDe(poligono)
    .slice(1)
    .map((n) => {
      const lng = lngMin + n.x0M / mLng;
      return [[latMin, lng], [latMax, lng]];
    });
}

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
  const enNavegador = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  const naves = useMemo(() => Object.fromEntries(bloques.map((b) => [b.id, lineasNaves(b.poligono)])), [bloques]);

  // Texto de cada bloque: el valor promedio de la variable elegida
  const colores = useMemo(() => {
    const r: Record<string, { color: string; texto: string }> = {};
    for (const b of bloques) {
      if (capa === "riesgo") {
        r[b.id] = { color: RIESGO.find((e) => b.indiceRiesgo < e.hasta)!.color, texto: `${b.indiceRiesgo} %` };
      } else {
        const v = capa === "sanidad" ? b.pctAfectadas : b[capa];
        const e = ESCALAS[capa];
        r[b.id] = { color: "#ffffff", texto: v === null ? "—" : `${v.toLocaleString("es-CO", { maximumFractionDigits: capa === "temperatura" || capa === "sanidad" ? 1 : 0 })}${e.unidad === "°C" ? "°" : " %"}` };
      }
    }
    return r;
  }, [bloques, capa]);

  // Calor continuo dentro de cada invernadero, con la misma escala para toda la finca
  const imagenes = useMemo(() => {
    if (!enNavegador || capa === "riesgo") return undefined;
    const escala = ESCALAS[capa];
    const r: Record<string, string> = {};
    for (const b of bloques) {
      const campo = b.campos?.[capa];
      if (!campo) continue;
      r[b.id] = pintarCampo(campo, escala, campo.cols * 6, campo.filas * 6, { alfa: capa === "sanidad" ? 1 : 0.95 }).toDataURL();
    }
    return r;
  }, [bloques, capa, enNavegador]);

  const escala = capa === "riesgo" ? null : ESCALAS[capa];

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
      <MapaLotesLazy lotes={bloques} centro={centro} alto={alto} compacto colores={colores} imagenes={imagenes} naves={naves} recorridos={recorridos} />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 text-xs text-muted-foreground">
        {escala ? (
          <LeyendaCalor escala={escala} fuente="Misma escala para toda la finca" />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {RIESGO.map((p) => (
              <span key={p.etiqueta} className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />{p.etiqueta}</span>
            ))}
          </div>
        )}
        <span>Cada bloque es un invernadero; las líneas blancas separan sus naves · clic en un bloque para ver su plano</span>
      </div>
    </div>
  );
}
