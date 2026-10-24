import Link from "next/link";
import { Route } from "lucide-react";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { DistintivoSimulado, FaseRecorrido, Progreso } from "@/components/dashboard/fase-recorrido";
import { MapaLotesLazy } from "@/components/dashboard/mapa-lotes-lazy";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRecorridos, type Origen, type RecorridoFila } from "@/lib/queries/cultivos";
import { getLotesEstado } from "@/lib/queries/lotes";
import { geojsonRecorridos } from "@/lib/cultivos/servicio";
import { FINCA } from "@/lib/simulador/finca";
import { fmtFecha } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function TablaRecorridos({ filas }: { filas: RecorridoFila[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Revisión</TableHead>
          <TableHead>Lote</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Progreso</TableHead>
          <TableHead className="text-right">Lecturas</TableHead>
          <TableHead className="text-right">Alertas</TableHead>
          <TableHead className="text-right">Actualizada</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((r) => (
          <TableRow key={r.inspectionId}>
            <TableCell>
              <Link href={`/recorridos/${r.inspectionId}`} className="font-medium hover:underline">{r.nombre ?? r.inspectionId.slice(0, 8)}</Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>plan {r.planId.slice(0, 8)}</span>
                {r.simulado ? <DistintivoSimulado compacto /> : null}
                {!r.conGeometria ? <span>sin posiciones para el mapa</span> : null}
              </div>
            </TableCell>
            <TableCell><Link href={`/lotes/${r.loteId}`} className="hover:underline">{r.loteId}</Link></TableCell>
            <TableCell><FaseRecorrido fase={r.fase} /></TableCell>
            <TableCell><Progreso completados={r.completados} total={r.total} /></TableCell>
            <TableCell className="text-right tabular-nums">{r.lecturas}</TableCell>
            <TableCell className="text-right tabular-nums">{r.alertas || <span className="text-muted-foreground">0</span>}</TableCell>
            <TableCell className="text-right text-sm text-muted-foreground">{fmtFecha(r.actualizadoEn, "d MMM, HH:mm")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const ORIGENES: { valor: "" | Origen; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todas" },
  { valor: "real", etiqueta: "Reales" },
  { valor: "demo", etiqueta: "Demos simuladas" },
];

export default async function Recorridos({ searchParams }: { searchParams: Promise<{ lote?: string; origen?: string }> }) {
  const q = await searchParams;
  const origen = q.origen === "real" || q.origen === "demo" ? q.origen : undefined;
  const [recorridos, lotes, geojson] = await Promise.all([getRecorridos({ lote: q.lote || undefined, origen }), getLotesEstado(), geojsonRecorridos(q.lote || null)]);
  const reales = recorridos.filter((r) => !r.simulado);
  const demos = recorridos.filter((r) => r.simulado);

  return (
    <>
      <Encabezado
        titulo="Recorridos de inspección"
        descripcion="Revisiones registradas por la app. Completo significa que se revisaron todos los puntos definidos, no toda la superficie del lote."
        acciones={
          <div className="flex flex-wrap gap-1.5">
            {ORIGENES.map((o) => (
              <Link
                key={o.valor}
                href={o.valor ? `/recorridos?origen=${o.valor}` : "/recorridos"}
                className={cn("rounded-full border px-2.5 py-1 text-xs", (origen ?? "") === o.valor ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {o.etiqueta}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Revisiones reales" valor={reales.length} detalle={`${reales.filter((r) => r.fase === "completed").length} completas`} />
        <Kpi etiqueta="Puntos revisados reales" valor={reales.reduce((a, r) => a + r.completados, 0)} detalle={`de ${reales.reduce((a, r) => a + r.total, 0)} definidos`} />
        <Kpi etiqueta="Demos simuladas" valor={demos.length} detalle={`${demos.filter((r) => r.fase === "completed").length} completas`} />
        <Kpi etiqueta="Puntos de demo" valor={demos.reduce((a, r) => a + r.completados, 0)} detalle={`de ${demos.reduce((a, r) => a + r.total, 0)} · avance por temporizador`} />
      </div>

      <Seccion titulo="Rutas sobre la finca" descripcion="Trayectorias y puntos que envía la app, sobre el mismo mapa satelital. Se actualiza cada 10 segundos." className="mt-4">
        {geojson.features.length ? (
          <MapaLotesLazy lotes={lotes} centro={FINCA.centro} alto={440} compacto interactivo={false} recorridos={{ inicial: geojson, url: `/recorridos/geojson${q.lote ? `?lote=${q.lote}` : ""}` }} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Ningún recorrido trae posiciones para el mapa todavía. Las demos creadas en la app 0.2.2, después de importar los contornos, sí las traen.</p>
        )}
      </Seccion>

      {!origen || origen === "real" ? (
        <Seccion titulo={`Revisiones reales · ${reales.length}`} descripcion="Recorridos con avance confirmado por el operador en campo." className="mt-4">
          {reales.length ? <TablaRecorridos filas={reales} /> : <Vacio texto="Aún no llega ninguna revisión real." />}
        </Seccion>
      ) : null}
      {!origen || origen === "demo" ? (
        <Seccion titulo={<span className="flex items-center gap-2">Demos simuladas · {demos.length} <DistintivoSimulado /></span>} descripcion="El avance entre puntos lo marca un temporizador; las puntuaciones y fotos vienen de la cámara real." className="mt-4">
          {demos.length ? <TablaRecorridos filas={demos} /> : <Vacio texto="Aún no llega ninguna demo." />}
        </Seccion>
      ) : null}
    </>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
      <Route className="size-6" />
      {texto}
    </div>
  );
}
