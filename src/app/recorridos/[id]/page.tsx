import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { FaseRecorrido, Progreso } from "@/components/dashboard/fase-recorrido";
import { MapaPuntosLazy } from "@/components/dashboard/mapa-puntos-lazy";
import { Puntuacion4 } from "@/components/dashboard/puntuaciones";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCapturas, getRecorrido, normalizarPuntos } from "@/lib/queries/cultivos";
import { fmtFecha, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DetalleRecorrido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getRecorrido(id);
  if (!r) notFound();
  const [lecturas] = await Promise.all([getCapturas({ revision: id }, 100)]);
  const puntos = normalizarPuntos(r.puntos);
  const conGps = puntos.filter((p) => p.lat !== null && p.lng !== null);
  const todosConGps = puntos.length > 0 && conGps.length === puntos.length;
  const porPunto = new Map<string, number>();
  for (const l of lecturas) if (l.waypointId) porPunto.set(l.waypointId, (porPunto.get(l.waypointId) ?? 0) + 1);
  const siguiente = puntos.find((p) => !p.completado);

  return (
    <>
      <Encabezado
        titulo={r.nombre ?? "Revisión"}
        descripcion={`Lote ${r.loteId ?? "—"} · plan ${r.planId ?? "—"} · actualizada ${fmtFecha(r.actualizadoEn, "d MMM, HH:mm")}`}
        acciones={<Link href="/recorridos" className="text-sm text-muted-foreground underline">Todos los recorridos</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Estado" valor={<FaseRecorrido fase={r.fase} completa={r.completa} />} detalle={`versión ${r.revision} recibida`} />
        <Kpi etiqueta="Puntos revisados" valor={`${r.completados}/${r.total}`} detalle={<Progreso completados={r.completados} total={r.total} />} />
        <Kpi etiqueta="Siguiente pendiente" valor={siguiente ? `#${siguiente.orden}` : "—"} detalle={siguiente?.nombre ?? (r.completa ? "revisión completa" : "sin datos")} />
        <Kpi etiqueta="Lecturas recibidas" valor={lecturas.length} detalle={`${lecturas.filter((l) => l.alerta).length} alertas · ${r.revisionesDelPlan} revisiones del mismo plan`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Seccion
          titulo="Puntos del plan"
          descripcion={todosConGps ? "Posiciones GPS reportadas por el teléfono; el círculo claro es su precisión." : "Algunos puntos no tienen GPS, así que se muestra el orden sin escala. No se inventan coordenadas."}
          className="lg:col-span-3"
        >
          {conGps.length ? (
            <MapaPuntosLazy puntos={conGps.map((p) => ({ id: p.id, orden: p.orden, lat: p.lat!, lng: p.lng!, precisionM: p.precisionM, completado: p.completado, etiqueta: p.nombre ?? `Punto ${p.orden}` }))} />
          ) : null}
          {!todosConGps ? (
            <ol className="mt-3 flex flex-wrap items-center gap-2">
              {puntos.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className={`flex size-8 items-center justify-center rounded-full border text-xs font-medium ${p.completado ? "border-[var(--status-good)] bg-[var(--status-good)] text-white" : "border-border"}`}>{p.orden}</span>
                  {i < puntos.length - 1 ? <span className="h-px w-5 bg-border" /> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </Seccion>
        <Seccion titulo="Estado por punto" className="lg:col-span-2">
          <ul className="divide-y divide-border text-sm">
            {puntos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <span className="inline-flex items-center gap-2">
                  {p.completado ? <CheckCircle2 className="size-4 text-[var(--status-good-text)]" /> : <Circle className="size-4 text-muted-foreground" />}
                  <span className="font-medium">#{p.orden}</span>
                  <span className="text-muted-foreground">{p.nombre ?? ""}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {porPunto.get(p.id) ?? 0} lecturas · {p.lat !== null ? (p.precisionM ? `GPS ±${fmtNum(p.precisionM, 0)} m` : "GPS") : "sin GPS"}
                </span>
              </li>
            ))}
          </ul>
        </Seccion>
      </div>

      <Seccion titulo="Lecturas de esta revisión" descripcion="Cada lectura analiza el encuadre de la cámara cada 10 segundos. Varias lecturas pueden ser de la misma planta." className="mt-4">
        {lecturas.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Punto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Puntuaciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lecturas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap"><Link href={`/capturas/${l.id}`} className="hover:underline">{fmtFecha(l.capturadoEn, "d MMM, HH:mm:ss")}</Link></TableCell>
                  <TableCell>{puntos.find((p) => p.id === l.waypointId)?.orden ? `#${puntos.find((p) => p.id === l.waypointId)!.orden}` : "—"}</TableCell>
                  <TableCell className="text-sm">{l.alerta ? <span className="font-medium text-[var(--status-critical)]">Alerta</span> : l.tieneFoto ? "Con foto" : "Periódica"}</TableCell>
                  <TableCell><Puntuacion4 p={l.puntuaciones} compacto /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Esta revisión todavía no tiene lecturas.</p>
        )}
      </Seccion>
    </>
  );
}
