import Link from "next/link";
import { Search, Syringe, Droplets, Waves, Radio, CloudRain } from "lucide-react";
import type { Recomendacion, TipoAccion, Prioridad } from "@/lib/recomendaciones";
import { cn } from "@/lib/utils";

const ICONO: Record<TipoAccion, typeof Search> = {
  inspeccion: Search,
  tratamiento: Syringe,
  riego: Droplets,
  drenaje: Waves,
  sensor: Radio,
  aplicacion: CloudRain,
};

const PRIORIDAD: Record<Prioridad, { etiqueta: string; clase: string }> = {
  alta: { etiqueta: "Urgente", clase: "bg-[var(--status-critical)] text-white" },
  media: { etiqueta: "Hoy", clase: "bg-[var(--status-warning)] text-black" },
  baja: { etiqueta: "Esta semana", clase: "bg-muted text-muted-foreground" },
};

export function ListaAcciones({ acciones, limite }: { acciones: Recomendacion[]; limite?: number }) {
  const visibles = limite ? acciones.slice(0, limite) : acciones;
  if (!visibles.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin acciones pendientes. La finca está en orden.</p>;
  }
  return (
    <ol className="divide-y divide-border">
      {visibles.map((a) => {
        const Icono = ICONO[a.tipo];
        const p = PRIORIDAD[a.prioridad];
        return (
          <li key={a.id} className="flex gap-3 py-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <Icono className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", p.clase)}>{p.etiqueta}</span>
                {a.loteId ? (
                  <Link href={`/lotes/${a.loteId}`} className="text-sm font-medium hover:underline">{a.titulo}</Link>
                ) : (
                  <span className="text-sm font-medium">{a.titulo}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{a.detalle}</p>
            </div>
          </li>
        );
      })}
      {limite && acciones.length > limite ? (
        <li className="pt-2 text-xs text-muted-foreground">y {acciones.length - limite} acciones más de menor prioridad.</li>
      ) : null}
    </ol>
  );
}
