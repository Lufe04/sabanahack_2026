import Link from "next/link";
import { EtiquetaCaptura } from "@/components/dashboard/etiqueta-captura";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { DistintivoSimulado, FaseRecorrido, Progreso } from "@/components/dashboard/fase-recorrido";
import { MapaLotesLazy } from "@/components/dashboard/mapa-lotes-lazy";
import { MapaPuntosLazy } from "@/components/dashboard/mapa-puntos-lazy";
import { Puntuacion4 } from "@/components/dashboard/puntuaciones";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCapturas, getRecorrido, normalizarPuntos } from "@/lib/queries/cultivos";
import { getLotesEstado } from "@/lib/queries/lotes";
import { geojsonRecorridos } from "@/lib/cultivos/servicio";
import { fmtFecha, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DetalleRecorrido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getRecorrido(id);
  if (!r) notFound();
  const [lecturas, lotes, geojson] = await Promise.all([getCapturas({ revision: id }, 200), getLotesEstado(), geojsonRecorridos(r.loteId, id)]);
  const lote = lotes.find((l) => l.id === r.loteId);
  const puntos = normalizarPuntos(r.puntos, r.completados);
  const conGps = puntos.filter((p) => p.lat !== null && p.lng !== null);
  const todosConGps = puntos.length > 0 && conGps.length === puntos.length;
  const porPunto = new Map<string, number>();
  for (const l of lecturas) if (l.waypointId) porPunto.set(l.waypointId, (porPunto.get(l.waypointId) ?? 0) + 1);
  const actual = r.fase === "completed" ? null : puntos[r.completados] ?? null;
  const ordenDe = new Map(puntos.map((p) => [p.id, p.orden]));

  return (
    <>
      <Encabezado
        titulo={<span className="flex flex-wrap items-center gap-3">{r.nombre ?? "Revisión"}{r.simulado ? <DistintivoSimulado /> : null}</span>}
        descripcion={`Bloque ${r.loteId}${lote ? ` · ${lote.nombre}` : ""} · actualizada ${fmtFecha(r.actualizadoEn, "d MMM, HH:mm:ss")}`}
        acciones={<Link href="/recorridos" className="text-sm text-muted-foreground underline">Todos los recorridos</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Estado" valor={<FaseRecorrido fase={r.fase} />} detalle={`versión ${r.revision} · ${r.versionesRecibidas} estados recibidos`} />
        <Kpi etiqueta="Puntos revisados" valor={`${r.completados}/${r.total}`} detalle={<Progreso completados={r.completados} total={r.total} />} />
        <Kpi
          etiqueta={r.simulado ? "Punto asignado ahora" : "Siguiente pendiente"}
          valor={actual ? `#${actual.orden}` : "—"}
          detalle={actual ? (actual.nombre ?? (r.simulado && r.segundosPorPunto ? `${r.segundosPorPunto} s por punto` : "")) : "revisión completa"}
        />
        <Kpi etiqueta="Lecturas de la cámara" valor={lecturas.length} detalle={`${lecturas.filter((l) => l.alerta).length} alertas · ${r.revisionesDelPlan} revisiones del mismo plan`} />
      </div>

      {r.simulado ? (
        <p className="mt-3 max-w-3xl text-xs text-muted-foreground">
          En esta demo el avance entre puntos lo marca un temporizador y las posiciones del mapa se generan dentro del contorno del bloque. No son GPS medido ni plantas identificadas. Las puntuaciones y fotos sí son del cuadro que analizó la cámara.
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Seccion
          titulo="Ruta en el mapa"
          descripcion={
            geojson.features.length
              ? "Trayectoria y puntos que envía la app, sobre el fondo satelital. Se actualiza cada 10 segundos."
              : todosConGps
                ? "Posiciones GPS medidas por el teléfono; el círculo claro es su precisión."
                : "Esta revisión no trae posiciones para el mapa, así que se muestra el orden sin escala. No se inventan coordenadas."
          }
          className="lg:col-span-3"
        >
          {geojson.features.length && lote ? (
            <MapaLotesLazy
              lotes={[lote]}
              centro={{ lat: lote.centroLat, lng: lote.centroLng }}
              zoom={19}
              alto={380}
              interactivo={false}
              compacto
              recorridos={{ inicial: geojson, url: `/recorridos/geojson?lote=${r.loteId}&inspeccion=${id}`, encuadrar: true }}
            />
          ) : conGps.length ? (
            <MapaPuntosLazy puntos={conGps.map((p) => ({ id: p.id, orden: p.orden, lat: p.lat!, lng: p.lng!, precisionM: p.precisionM, completado: p.completado, etiqueta: p.nombre ?? `Punto ${p.orden}` }))} />
          ) : null}
          {!geojson.features.length && !todosConGps ? (
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
                  {p.completado ? (
                    <CheckCircle2 className="size-4 text-[var(--status-good-text)]" />
                  ) : actual?.id === p.id ? (
                    <CircleDot className="size-4 text-[var(--series-1)]" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">#{p.orden}</span>
                  <span className="text-muted-foreground">{p.nombre ?? ""}</span>
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  {porPunto.get(p.id) ?? 0} lecturas
                  {p.revisadoEn ? ` · revisado ${fmtFecha(p.revisadoEn, "HH:mm:ss")}` : ""}
                  {" · "}
                  {p.lat !== null ? (p.precisionM ? `GPS ±${fmtNum(p.precisionM, 0)} m` : "GPS") : p.virtual ? "punto virtual" : "sin GPS"}
                </span>
              </li>
            ))}
          </ul>
        </Seccion>
      </div>

      <Seccion titulo="Lecturas de esta revisión" descripcion="La cámara analiza el encuadre cada 10 segundos. Varias lecturas pueden ser de la misma planta, así que no se cuentan como plantas." className="mt-4">
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
                  <TableCell>{l.waypointId && ordenDe.has(l.waypointId) ? `#${ordenDe.get(l.waypointId)}` : "—"}</TableCell>
                  <TableCell><EtiquetaCaptura alerta={l.alerta} modo={l.modoCaptura} /></TableCell>
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
