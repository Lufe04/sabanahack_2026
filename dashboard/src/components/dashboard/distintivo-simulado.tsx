import { Timer } from "lucide-react";

/** Marca las lecturas de una demo: el avance es simulado, las puntuaciones son de la cámara real. */
export function DistintivoSimulado({ compacto = false }: { compacto?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-warning)] bg-[color-mix(in_oklab,var(--status-warning)_14%,transparent)] px-2 py-0.5 text-[11px] font-medium text-foreground">
      <Timer className="size-3" />
      {compacto ? "Demo" : "Demo · cámara real"}
    </span>
  );
}
