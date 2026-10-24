import { AlertTriangle, CheckCircle2, Flame, ShieldAlert, Plane, ClipboardList, WifiOff, Activity, Droplets, Waves, Sun } from "lucide-react";
import type { EstadoSuelo } from "@/lib/recomendaciones";
import { Badge } from "@/components/ui/badge";
import type { Enfermedad, EstadoEvento } from "@/db/schema";
import { COLOR_ENFERMEDAD, NOMBRE_ENFERMEDAD, COLOR_RIESGO, ETIQUETA_RIESGO, nivelRiesgo } from "@/lib/viz/palette";

/** Riesgo: color de estado + icono + etiqueta. Nunca color solo. */
export function RiesgoBadge({ indice, conValor = true }: { indice: number; conValor?: boolean }) {
  const nivel = nivelRiesgo(indice);
  const Icono = nivel === "bajo" ? CheckCircle2 : nivel === "moderado" ? AlertTriangle : nivel === "alto" ? ShieldAlert : Flame;
  return (
    <Badge variant="outline" className="gap-1 border-transparent px-1.5 font-medium" style={{ color: COLOR_RIESGO[nivel], background: `color-mix(in oklab, ${COLOR_RIESGO[nivel]} 14%, transparent)` }}>
      <Icono className="size-3" />
      {ETIQUETA_RIESGO[nivel]}
      {conValor ? <span className="tabular-nums opacity-80">{indice}</span> : null}
    </Badge>
  );
}

export function EnfermedadBadge({ enfermedad }: { enfermedad: Enfermedad }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="inline-block size-2.5 rounded-full" style={{ background: COLOR_ENFERMEDAD[enfermedad] }} />
      {NOMBRE_ENFERMEDAD[enfermedad]}
    </span>
  );
}

export function EstadoEventoBadge({ estado }: { estado: EstadoEvento }) {
  if (estado === "activo") return <Badge variant="destructive" className="gap-1"><Activity className="size-3" />Activo</Badge>;
  if (estado === "controlado") return <Badge variant="secondary" className="gap-1"><ShieldAlert className="size-3" />Controlado</Badge>;
  return <Badge variant="outline" className="gap-1 text-muted-foreground"><CheckCircle2 className="size-3" />Cerrado</Badge>;
}

export function OrigenBadge({ origen }: { origen: "dron" | "inspeccion" }) {
  return origen === "dron" ? (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Plane className="size-3" />Dron</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ClipboardList className="size-3" />Campo / trampas</span>
  );
}

/** Amenaza principal del lote: plaga con mayor riesgo hoy. */
export function AmenazaBadge({ plaga, riesgo }: { plaga: Enfermedad; riesgo: number }) {
  const nivel = nivelRiesgo(riesgo);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="inline-block size-2.5 rounded-full" style={{ background: COLOR_ENFERMEDAD[plaga] }} />
      <span>{NOMBRE_ENFERMEDAD[plaga]}</span>
      <span className="text-xs font-medium tabular-nums" style={{ color: nivel === "bajo" ? "var(--muted-foreground)" : COLOR_RIESGO[nivel] }}>{riesgo} %</span>
    </span>
  );
}

const SUELO: Record<EstadoSuelo, { etiqueta: string; color: string; Icono: typeof Droplets }> = {
  seco: { etiqueta: "Seco", color: "var(--status-serious)", Icono: Sun },
  ok: { etiqueta: "Adecuado", color: "var(--status-good-text)", Icono: CheckCircle2 },
  humedo: { etiqueta: "Húmedo", color: "var(--status-warning)", Icono: Droplets },
  encharcado: { etiqueta: "Encharcado", color: "var(--status-critical)", Icono: Waves },
};

export function SueloBadge({ estado, valor }: { estado: EstadoSuelo; valor: number | null }) {
  const { etiqueta, color, Icono } = SUELO[estado];
  return (
    <span className="inline-flex items-center gap-1 text-sm" style={{ color: estado === "ok" ? undefined : color }}>
      <Icono className="size-3.5" style={{ color }} />
      {etiqueta}
      {valor !== null ? <span className="text-xs text-muted-foreground tabular-nums">{Math.round(valor)} %</span> : null}
    </span>
  );
}

export function SensorEstadoBadge({ estado }: { estado: "ok" | "intermitente" | "caido" }) {
  if (estado === "ok") return <Badge variant="outline" className="gap-1 border-transparent" style={{ color: "var(--status-good-text)" }}><CheckCircle2 className="size-3" />OK</Badge>;
  if (estado === "intermitente") return <Badge variant="outline" className="gap-1 border-transparent" style={{ color: "var(--status-serious)" }}><AlertTriangle className="size-3" />Intermitente</Badge>;
  return <Badge variant="outline" className="gap-1 border-transparent" style={{ color: "var(--status-critical)" }}><WifiOff className="size-3" />Caído</Badge>;
}

export function Severidad({ nivel }: { nivel: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Severidad ${nivel} de 5`} aria-label={`Severidad ${nivel} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="inline-block h-2.5 w-1.5 rounded-xs" style={{ background: i <= nivel ? "var(--foreground)" : "var(--viz-empty)" }} />
      ))}
    </span>
  );
}
