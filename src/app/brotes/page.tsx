import Link from "next/link";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { TablaEventos } from "@/components/dashboard/tabla-eventos";
import { Kpi } from "@/components/dashboard/kpi";
import { getEventos, getLotesEstado } from "@/lib/queries/lotes";
import { ENFERMEDADES, ESTADOS_EVENTO, type Enfermedad, type EstadoEvento } from "@/db/schema";
import { NOMBRE_ENFERMEDAD, COLOR_ENFERMEDAD } from "@/lib/viz/palette";
import { PARAMS_ENFERMEDAD } from "@/lib/simulador/enfermedades";
import { cn } from "@/lib/utils";
import { fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

type Busqueda = { lote?: string; plaga?: string; estado?: string };

function Chip({ activo, href, color, children }: { activo: boolean; href: string; color?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors", activo ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")}
    >
      {color ? <span className="inline-block size-2 rounded-full" style={{ background: color }} /> : null}
      {children}
    </Link>
  );
}

export default async function Brotes({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const q = await searchParams;
  const [todos, lotes] = await Promise.all([getEventos(), getLotesEstado()]);
  const filtrados = todos.filter(
    (e) => (!q.lote || e.loteId === q.lote) && (!q.plaga || e.enfermedad === q.plaga) && (!q.estado || e.estado === q.estado),
  );
  const enlace = (cambio: Partial<Busqueda>) => {
    const p = new URLSearchParams();
    const n = { ...q, ...cambio };
    for (const [k, v] of Object.entries(n)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/brotes?${s}` : "/brotes";
  };
  const abiertos = filtrados.filter((e) => e.estado !== "cerrado").length;
  const diasDet = filtrados.filter((e) => e.diasDeteccion !== null);
  const promDet = diasDet.length ? diasDet.reduce((a, e) => a + (e.diasDeteccion ?? 0), 0) / diasDet.length : null;
  const ESTADO_ETIQUETA: Record<EstadoEvento, string> = { activo: "Activos", controlado: "En control", cerrado: "Cerrados" };

  return (
    <>
      <Encabezado titulo="Brotes" descripcion="Bitácora de plagas y enfermedades: cuándo aparecieron, quién las detectó y cómo se trataron." />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Kpi etiqueta="Brotes" valor={filtrados.length} detalle="con los filtros actuales" />
        <Kpi etiqueta="Abiertos" valor={abiertos} detalle="activos o en control" tono={abiertos ? "malo" : "bueno"} />
        <Kpi etiqueta="Días hasta detectar" valor={fmtNum(promDet, 1)} detalle="promedio desde que inicia el brote" />
      </div>

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Plaga</span>
          <Chip activo={!q.plaga} href={enlace({ plaga: undefined })}>Todas</Chip>
          {ENFERMEDADES.map((e) => (
            <Chip key={e} activo={q.plaga === e} href={enlace({ plaga: e })} color={COLOR_ENFERMEDAD[e]}>{NOMBRE_ENFERMEDAD[e]}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Estado</span>
          <Chip activo={!q.estado} href={enlace({ estado: undefined })}>Todos</Chip>
          {ESTADOS_EVENTO.map((e) => (
            <Chip key={e} activo={q.estado === e} href={enlace({ estado: e })}>{ESTADO_ETIQUETA[e]}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Lote</span>
          <Chip activo={!q.lote} href={enlace({ lote: undefined })}>Todos</Chip>
          {lotes.map((l) => (
            <Chip key={l.id} activo={q.lote === l.id} href={enlace({ lote: l.id })}>{l.id}</Chip>
          ))}
        </div>
      </div>

      <Seccion titulo={`${filtrados.length} brotes`}>
        <TablaEventos eventos={filtrados} vacio="No hay brotes con esos filtros." />
      </Seccion>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {ENFERMEDADES.map((e) => {
          const p = PARAMS_ENFERMEDAD[e as Enfermedad];
          return (
            <Seccion key={e} titulo={<span className="inline-flex items-center gap-2"><span className="inline-block size-2.5 rounded-full" style={{ background: COLOR_ENFERMEDAD[e] }} />{p.nombre}</span>} descripcion={p.tipo === "plaga" ? "Plaga (insecto)" : "Enfermedad (hongo)"}>
              <dl className="space-y-2 text-xs">
                <div><dt className="font-medium">Síntomas</dt><dd className="text-muted-foreground">{p.sintomas}</dd></div>
                <div><dt className="font-medium">Condiciones que lo favorecen</dt><dd className="text-muted-foreground">{p.prefiereSeco ? "Rachas secas y cálidas" : `Más de ${p.horasHumedadMin} h diarias con humedad del aire sobre 85 %`}, temperatura entre {p.tempOpt[0]} y {p.tempOpt[1]} °C.</dd></div>
                <div><dt className="font-medium">Prevención</dt><dd className="text-muted-foreground">{p.preventivo}</dd></div>
                <div><dt className="font-medium">Tratamiento</dt><dd className="text-muted-foreground">{p.tratamiento}</dd></div>
              </dl>
            </Seccion>
          );
        })}
      </div>
    </>
  );
}
