import { CheckCircle2, CirclePause, BatteryCharging, Footprints, Circle } from "lucide-react";
import { faseLegible } from "@/lib/queries/cultivos";

const ESTILO = {
  listo: { Icono: Circle, color: "var(--muted-foreground)" },
  revision: { Icono: Footprints, color: "var(--series-1)" },
  pausado: { Icono: CirclePause, color: "var(--status-serious)" },
  carga: { Icono: BatteryCharging, color: "var(--status-serious)" },
  completo: { Icono: CheckCircle2, color: "var(--status-good-text)" },
} as const;

export function FaseRecorrido({ fase, completa }: { fase: string | null; completa: boolean }) {
  const { etiqueta, tono } = faseLegible(fase, completa);
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
