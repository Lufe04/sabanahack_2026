import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  etiqueta: string;
  valor: ReactNode;
  unidad?: string;
  detalle?: ReactNode;
  tono?: "neutro" | "bueno" | "malo";
};

/** Stat tile: el número es la gráfica. */
export function Kpi({ etiqueta, valor, unidad, detalle, tono = "neutro" }: Props) {
  return (
    <Card className="gap-1 px-4 py-3">
      <div className="text-xs text-muted-foreground">{etiqueta}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight">{valor}</span>
        {unidad ? <span className="text-sm text-muted-foreground">{unidad}</span> : null}
      </div>
      {detalle ? (
        <div
          className={cn(
            "text-xs",
            tono === "bueno" && "text-[var(--status-good-text)]",
            tono === "malo" && "text-[var(--status-critical)]",
            tono === "neutro" && "text-muted-foreground",
          )}
        >
          {detalle}
        </div>
      ) : null}
    </Card>
  );
}
