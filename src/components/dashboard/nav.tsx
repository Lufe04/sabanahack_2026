"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Map, BarChart3, Radio, Leaf, Bug, History, Camera, Route, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Menú ordenado por cómo decide una agrónoma: primero el estado de la finca hoy,
 * luego lo que ve el robot, después el análisis y al final los equipos.
 * La finca es simulada y nunca se mezcla con los datos reales del robot.
 */
const grupos = [
  {
    titulo: "Finca · simulación",
    enlaces: [
      { href: "/", etiqueta: "Hoy", Icono: Sun },
      { href: "/bloques", etiqueta: "Bloques", Icono: Map },
      { href: "/brotes", etiqueta: "Brotes", Icono: Bug },
    ],
  },
  {
    titulo: "Robot · datos reales",
    enlaces: [
      { href: "/capturas", etiqueta: "Capturas", Icono: Camera },
      { href: "/recorridos", etiqueta: "Recorridos", Icono: Route },
    ],
  },
  {
    titulo: "Análisis",
    enlaces: [
      { href: "/historial", etiqueta: "Pérdidas", Icono: History },
      { href: "/analitica", etiqueta: "Patrones", Icono: BarChart3 },
    ],
  },
  {
    titulo: "Equipos",
    enlaces: [
      { href: "/sensores", etiqueta: "Sensores", Icono: Radio },
      { href: "/conexion", etiqueta: "Conexión del robot", Icono: Wifi },
    ],
  },
];
const todos = grupos.flatMap((g) => g.enlaces);
const esActivo = (ruta: string, href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));

function Enlace({ href, etiqueta, Icono, activo }: { href: string; etiqueta: string; Icono: typeof Sun; activo: boolean }) {
  return (
    <Link
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
}

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
          {grupos.map((g, i) => (
            <div key={g.titulo} className="contents">
              <div className={cn("px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", i ? "pt-4" : "pt-2")}>{g.titulo}</div>
              {g.enlaces.map((e) => <Enlace key={e.href} {...e} activo={esActivo(ruta, e.href)} />)}
            </div>
          ))}
        </nav>
        <div className="mt-auto px-4 py-3 text-[11px] text-muted-foreground">MVP · la simulación nunca se mezcla con las capturas reales</div>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-border bg-background md:hidden">
        {todos.map(({ href, etiqueta, Icono }) => {
          const activo = href === "/" ? ruta === "/" : ruta.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn("flex min-w-16 flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", activo ? "text-foreground" : "text-muted-foreground")}
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
