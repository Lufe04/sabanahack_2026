"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Map, BarChart3, Radio, Leaf, Bug, History } from "lucide-react";
import { cn } from "@/lib/utils";

const enlaces = [
  { href: "/", etiqueta: "Hoy", Icono: Sun },
  { href: "/lotes", etiqueta: "Lotes", Icono: Map },
  { href: "/brotes", etiqueta: "Brotes", Icono: Bug },
  { href: "/historial", etiqueta: "Historial", Icono: History },
  { href: "/analitica", etiqueta: "Analítica", Icono: BarChart3 },
  { href: "/sensores", etiqueta: "Sensores", Icono: Radio },
];

export function Nav({ finca }: { finca: string }) {
  const ruta = usePathname();
  return (
    <>
      <aside className="hidden w-56 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Leaf className="size-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Arándanos</div>
            <div className="text-xs text-muted-foreground">{finca}</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {enlaces.map(({ href, etiqueta, Icono }) => {
            const activo = href === "/" ? ruta === "/" : ruta.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                  activo ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icono className="size-4" />
                {etiqueta}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-4 py-3 text-[11px] text-muted-foreground">Datos simulados · MVP</div>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-background md:hidden">
        {enlaces.map(({ href, etiqueta, Icono }) => {
          const activo = href === "/" ? ruta === "/" : ruta.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", activo ? "text-foreground" : "text-muted-foreground")}
            >
              <Icono className="size-4" />
              {etiqueta}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
