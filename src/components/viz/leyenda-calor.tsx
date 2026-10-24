import type { ReactNode } from "react";
import { gradienteCss, type EscalaCalor } from "@/lib/viz/calor";

/** Leyenda de un mapa de calor: barra de color, marcas numéricas y rótulos agronómicos. */
export function LeyendaCalor({ escala, subtitulo, fuente, children }: { escala: EscalaCalor; subtitulo?: string; fuente?: string; children?: ReactNode }) {
  const a = escala.paradas[0].v;
  const z = escala.paradas[escala.paradas.length - 1].v;
  const pos = (v: number) => `${((v - a) / (z - a)) * 100}%`;
  return (
    <div className="w-full max-w-lg">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium text-foreground">{escala.titulo}{subtitulo ? ` · ${subtitulo}` : ""}</span>
        {fuente ? <span className="text-[11px]">{fuente}</span> : null}
      </div>
      <div className="px-4">
        <div className="h-2.5 w-full rounded-full ring-1 ring-border" style={{ background: gradienteCss(escala) }} />
        <div className="relative mt-1 h-4 tabular-nums">
          {escala.marcas.map((m) => (
            <span key={m} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(m) }}>{m}{escala.unidad}</span>
          ))}
        </div>
        {escala.rotulos ? (
          <div className="relative h-4 text-[10px] uppercase tracking-wide">
            {escala.rotulos.map((r) => (
              <span key={r.texto} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(r.v) }}>{r.texto}</span>
            ))}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
