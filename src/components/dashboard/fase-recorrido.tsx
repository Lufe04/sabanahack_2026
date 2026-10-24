import { CheckCircle2, CirclePause, BatteryCharging, Footprints, Circle, PencilLine, Timer } from "lucide-react";
import { faseLegible, type TonoFase } from "@/lib/cultivos/clases";

const ESTILO: Record<TonoFase, { Icono: typeof Circle; color: string }> = {
  registrando: { Icono: PencilLine, color: "var(--muted-foreground)" },
  listo: { Icono: Circle, color: "var(--muted-foreground)" },
  revision: { Icono: Footprints, color: "var(--series-1)" },
  pausado: { Icono: CirclePause, color: "var(--status-serious)" },
  carga: { Icono: BatteryCharging, color: "var(--status-serious)" },
  completo: { Icono: CheckCircle2, color: "var(--status-good-text)" },
};

export function FaseRecorrido({ fase }: { fase: string | null }) {
  const { etiqueta, tono } = faseLegible(fase);
  const { Icono, color } = ESTILO[tono];
  return (
    <span className="inline-flex items-center gap-1 text-sm" style={{ color }}>
      <Icono className="size-3.5" />
      {etiqueta}
    </span>
  );
}

export function Progreso({ completados, total }: { completados: number; total: number }) {
  const pct = total ? Math.min(100, (100 * completados) / total) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-[var(--series-1)]" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{completados}/{total}</span>
    </div>
  );
}

/** Distintivo obligatorio para la demo: el avance es simulado, las lecturas son de la cámara real. */
export function DistintivoSimulado({ compacto = false }: { compacto?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-warning)] bg-[color-mix(in_oklab,var(--status-warning)_14%,transparent)] px-2 py-0.5 text-[11px] font-medium text-foreground">
      <Timer className="size-3" />
      {compacto ? "Demo simulada" : "Recorrido simulado · cámara real"}
    </span>
  );
}
