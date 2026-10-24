"use client";

import type { ReactNode } from "react";

export function TooltipCaja({ titulo, children }: { titulo?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {titulo ? <div className="mb-1 font-medium text-foreground">{titulo}</div> : null}
      <div className="space-y-0.5 text-muted-foreground">{children}</div>
    </div>
  );
}

export function TooltipFila({ color, nombre, valor }: { color?: string; nombre: string; valor: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {color ? <span className="inline-block size-2 rounded-full" style={{ background: color }} /> : null}
      <span className="flex-1">{nombre}</span>
      <span className="font-medium tabular-nums text-foreground">{valor}</span>
    </div>
  );
}
