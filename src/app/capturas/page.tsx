import Link from "next/link";
import { Camera, Siren } from "lucide-react";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { Puntuacion4 } from "@/components/dashboard/puntuaciones";
import { DistintivoSimulado } from "@/components/dashboard/fase-recorrido";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCapturas, getOpcionesRevision, getResumenCapturas, type FiltrosCapturas } from "@/lib/queries/cultivos";
import { getLotesEstado } from "@/lib/queries/lotes";
import { fmtFecha, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

const MODO: Record<string, string> = { periodic: "Periódica", automatic: "Alerta automática", manual: "Foto manual", route_reference: "Referencia de punto" };
const REVISION: Record<string, { etiqueta: string; color: string }> = {
  pendiente: { etiqueta: "Sin revisar", color: "var(--muted-foreground)" },
  confirmada: { etiqueta: "Confirmada", color: "var(--status-critical)" },
  descartada: { etiqueta: "Descartada", color: "var(--status-good-text)" },
};

export default async function Capturas({ searchParams }: { searchParams: Promise<FiltrosCapturas> }) {
  const q = await searchParams;
  const filtros: FiltrosCapturas = {
    lote: q.lote || undefined,
    revision: q.revision || undefined,
    desde: /^\d{4}-\d{2}-\d{2}$/.test(q.desde ?? "") ? q.desde : undefined,
    hasta: /^\d{4}-\d{2}-\d{2}$/.test(q.hasta ?? "") ? q.hasta : undefined,
    alerta: q.alerta === "si" || q.alerta === "no" ? q.alerta : undefined,
    origen: q.origen === "real" || q.origen === "demo" ? q.origen : undefined,
  };
  const [capturas, resumen, lotes, revisiones] = await Promise.all([getCapturas(filtros), getResumenCapturas(filtros), getLotesEstado(), getOpcionesRevision()]);
  const hayFiltros = Object.values(filtros).some(Boolean);

  return (
    <>
      <Encabezado
        titulo="Capturas de campo"
        descripcion="Lecturas reales que envía la app Cultivos a bordo desde el teléfono. Estos datos no se mezclan con la simulación."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Lecturas reales" valor={fmtNum(resumen.lecturasReales)} detalle={`${fmtNum(resumen.lecturasDemo)} más en demos simuladas`} />
        <Kpi etiqueta="Alertas reales" valor={resumen.alertasReales} detalle={`${resumen.alertasDemo} más en demos · ${resumen.alertasPendientes} sin revisar en total`} tono={resumen.alertasPendientes ? "malo" : "neutro"} />
        <Kpi etiqueta="Revisiones reales" valor={resumen.revisionesReales} detalle={`${resumen.revisionesDemo} demos simuladas`} />
        <Kpi etiqueta="Con foto" valor={resumen.conFoto} detalle={resumen.ultima ? `última lectura: ${fmtFecha(resumen.ultima, "d MMM, HH:mm")}` : "aún no llega ninguna lectura"} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Las demos avanzan por temporizador, pero sus puntuaciones y fotos sí vienen de la cámara. Por eso se cuentan aparte y nunca se suman con las revisiones reales.</p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 text-sm">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Lote</span>
          <select id="f-lote" name="lote" defaultValue={filtros.lote ?? ""} className="h-9 rounded-md border border-border bg-background px-2">
            <option value="">Todos</option>
            {lotes.map((l) => <option key={l.id} value={l.id}>{l.id} · {l.nombre}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Revisión</span>
          <select id="f-revision" name="revision" defaultValue={filtros.revision ?? ""} className="h-9 max-w-56 rounded-md border border-border bg-background px-2">
            <option value="">Todas</option>
            {revisiones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Desde</span>
          <input id="f-desde" type="date" name="desde" defaultValue={filtros.desde ?? ""} className="h-9 rounded-md border border-border bg-background px-2" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Hasta</span>
          <input id="f-hasta" type="date" name="hasta" defaultValue={filtros.hasta ?? ""} className="h-9 rounded-md border border-border bg-background px-2" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Alerta</span>
          <select id="f-alerta" name="alerta" defaultValue={filtros.alerta ?? ""} className="h-9 rounded-md border border-border bg-background px-2">
            <option value="">Todas</option>
            <option value="si">Solo alertas</option>
            <option value="no">Sin alerta</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Origen</span>
          <select id="f-origen" name="origen" defaultValue={filtros.origen ?? ""} className="h-9 rounded-md border border-border bg-background px-2">
            <option value="">Real y demo</option>
            <option value="real">Solo revisiones reales</option>
            <option value="demo">Solo demos simuladas</option>
          </select>
        </label>
        <button type="submit" className="h-9 rounded-md bg-primary px-3 font-medium text-primary-foreground">Filtrar</button>
        {hayFiltros ? <Link href="/capturas" className="h-9 px-1 leading-9 text-muted-foreground underline">Quitar filtros</Link> : null}
      </form>

      <Seccion
        titulo={capturas.length === 200 ? "Las 200 lecturas más recientes" : `${capturas.length} lecturas`}
        descripcion="Puntuaciones del modelo experimental ×100. No son probabilidades ni porcentaje de área enferma: una lectura analiza el encuadre completo, no una planta."
        className="mt-4"
      >
        {capturas.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Lote y revisión</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Puntuaciones</TableHead>
                <TableHead>Foto</TableHead>
                <TableHead>Revisión humana</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {capturas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/capturas/${c.id}`} className="font-medium hover:underline">{fmtFecha(c.capturadoEn, "d MMM, HH:mm:ss")}</Link>
                    <div className="text-[11px] text-muted-foreground">{c.modelo ?? "modelo desconocido"}</div>
                  </TableCell>
                  <TableCell>
                    {c.loteId ? <Link href={`/lotes/${c.loteId}`} className="hover:underline">{c.loteId}</Link> : <span className="text-muted-foreground">Sin lote</span>}
                    {c.inspectionId ? (
                      <div className="text-[11px]"><Link href={`/recorridos/${c.inspectionId}`} className="text-muted-foreground hover:underline">{c.recorridoNombre ?? c.mision ?? c.inspectionId.slice(0, 8)}</Link></div>
                    ) : null}
                    {c.simulado ? <div className="mt-1"><DistintivoSimulado compacto /></div> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.alerta ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--status-critical)]"><Siren className="size-3.5" />Alerta</span>
                    ) : (
                      <span className="text-sm">{c.antigua ? "Captura antigua" : MODO[c.modoCaptura ?? ""] ?? c.modoCaptura ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell><Puntuacion4 p={c.puntuaciones} compacto /></TableCell>
                  <TableCell>
                    {c.tieneFoto ? (
                      <Link href={`/capturas/${c.id}`} aria-label="Ver foto">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/capturas/${c.id}/foto`} alt="Foto de la captura" loading="lazy" className="h-12 w-16 rounded object-cover" />
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: REVISION[c.revisionHumana]?.color }}>{REVISION[c.revisionHumana]?.etiqueta ?? c.revisionHumana}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Camera className="size-6" />
            {hayFiltros ? "No hay lecturas con esos filtros." : "Aún no llegan lecturas de la app. Configura el Receptor de la APK con la URL base de este dashboard terminada en /api."}
          </div>
        )}
      </Seccion>
    </>
  );
}
