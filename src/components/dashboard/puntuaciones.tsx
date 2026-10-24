import type { Puntuaciones } from "@/db/schema";
import { CLASES, type Clase } from "@/lib/cultivos/clases";
import { cn } from "@/lib/utils";

export const NOMBRE_CLASE: Record<Clase, string> = { alternaria: "Alternaria", botrytis: "Botrytis", sana: "Sana", trips: "Trips" };
export const COLOR_CLASE: Record<Clase, string> = {
  alternaria: "var(--series-3)",
  botrytis: "var(--series-1)",
  sana: "var(--series-7)",
  trips: "var(--series-2)",
};

/** Las cuatro puntuaciones del modelo, mostradas ×100. No son probabilidades calibradas. */
export function Puntuacion4({ p, compacto = false }: { p: Puntuaciones | null; compacto?: boolean }) {
  if (!p) return <span className="text-xs text-muted-foreground">Sin puntuaciones</span>;
  const max = CLASES.reduce((a, c) => ((p[c] ?? 0) > (p[a] ?? 0) ? c : a), CLASES[0]);
  return (
    <div className={cn("grid gap-1", compacto ? "w-44" : "w-full")}>
      {CLASES.map((c) => {
        const v = Math.round((p[c] ?? 0) * 100);
        return (
          <div key={c} className="flex items-center gap-2 text-xs">
            <span className={cn("w-16 shrink-0", c === max ? "font-medium text-foreground" : "text-muted-foreground")}>{NOMBRE_CLASE[c]}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(1, v)}%`, background: COLOR_CLASE[c] }} />
            </span>
            <span className={cn("w-7 text-right tabular-nums", c === max ? "font-medium text-foreground" : "text-muted-foreground")}>{v}</span>
          </div>
        );
      })}
    </div>
  );
}
