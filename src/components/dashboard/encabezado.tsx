import type { ReactNode } from "react";

export function Encabezado({ titulo, descripcion, acciones }: { titulo: ReactNode; descripcion?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion ? <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p> : null}
      </div>
      {acciones}
    </div>
  );
}

export function Seccion({ titulo, descripcion, children, className = "" }: { titulo: ReactNode; descripcion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-card p-4 ${className}`}>
      <div className="mb-3">
        <h2 className="text-sm font-medium">{titulo}</h2>
        {descripcion ? <p className="text-xs text-muted-foreground">{descripcion}</p> : null}
      </div>
      {children}
    </section>
  );
}
