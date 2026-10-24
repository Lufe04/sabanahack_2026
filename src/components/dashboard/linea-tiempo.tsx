import Link from "next/link";
import type { BrotePeriodo } from "@/lib/queries/historial";
import { COLOR_ENFERMEDAD, NOMBRE_ENFERMEDAD } from "@/lib/viz/palette";
import { fmtFecha } from "@/lib/format";
import { ENFERMEDADES } from "@/db/schema";

type Props = {
  brotes: BrotePeriodo[];
  lotes: { id: string; nombre: string }[];
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
};

const dia = (s: string) => Math.floor(new Date(s + "T00:00:00Z").getTime() / 86400_000);

/** Línea de tiempo tipo Gantt: una fila por lote, una barra por brote. */
export function LineaTiempoBrotes({ brotes, lotes, desde, hasta }: Props) {
  const d0 = dia(desde);
  const d1 = dia(hasta);
  const total = Math.max(1, d1 - d0);
  const pct = (s: string) => ((Math.min(Math.max(dia(s), d0), d1) - d0) / total) * 100;

  // Marcas de mes
  const marcas: { pct: number; etiqueta: string }[] = [];
  const cursor = new Date(desde + "T00:00:00Z");
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (dia(cursor.toISOString().slice(0, 10)) < d1) {
    const iso = cursor.toISOString().slice(0, 10);
    marcas.push({ pct: pct(iso), etiqueta: fmtFecha(iso, "MMM") });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return (
    <div>
      <div className="relative ml-28 h-5 text-[10px] text-muted-foreground">
        {marcas.map((m) => (
          <span key={m.etiqueta + m.pct} className="absolute -translate-x-1/2 capitalize" style={{ left: `${m.pct}%` }}>{m.etiqueta}</span>
        ))}
      </div>
      <div className="space-y-1">
        {lotes.map((l) => {
          const filas = brotes.filter((b) => b.loteId === l.id);
          return (
            <div key={l.id} className="flex items-center gap-2">
              <Link href={`/lotes/${l.id}`} className="w-26 shrink-0 truncate text-xs hover:underline">
                <span className="font-medium">{l.id}</span> <span className="text-muted-foreground">{l.nombre}</span>
              </Link>
              <div className="relative h-6 flex-1 rounded bg-muted/50">
                {marcas.map((m) => (
                  <span key={m.pct} className="absolute inset-y-0 w-px bg-border" style={{ left: `${m.pct}%` }} />
                ))}
                {filas.map((b) => {
                  const izq = pct(b.fechaInicio);
                  const der = pct(b.fechaFin ?? hasta);
                  const ancho = Math.max(0.8, der - izq);
                  return (
                    <span
                      key={b.id}
                      title={`${NOMBRE_ENFERMEDAD[b.enfermedad]} · ${fmtFecha(b.fechaInicio)} a ${b.fechaFin ? fmtFecha(b.fechaFin) : "hoy"} · severidad ${b.severidadMax}/5 · ${b.areaAfectadaPct.toFixed(1)} % del lote`}
                      className="absolute inset-y-1 rounded-sm ring-2 ring-[var(--viz-surface)]"
                      style={{
                        left: `${izq}%`,
                        width: `${ancho}%`,
                        background: COLOR_ENFERMEDAD[b.enfermedad],
                        opacity: 0.55 + 0.09 * b.severidadMax,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="ml-28 mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        {ENFERMEDADES.map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: COLOR_ENFERMEDAD[e] }} />{NOMBRE_ENFERMEDAD[e]}</span>
        ))}
        <span>Más opaco = más severo</span>
      </div>
    </div>
  );
}
