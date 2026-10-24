import Link from "next/link";
import { EtiquetaCaptura } from "@/components/dashboard/etiqueta-captura";
import { notFound } from "next/navigation";
import { Siren } from "lucide-react";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Puntuacion4 } from "@/components/dashboard/puntuaciones";
import { DistintivoSimulado } from "@/components/dashboard/fase-recorrido";
import { getCaptura } from "@/lib/queries/cultivos";
import { fmtFecha, fmtNum } from "@/lib/format";
import { marcarRevision } from "../acciones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";


export default async function DetalleCaptura({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCaptura(id);
  if (!c) notFound();

  const filas: [string, React.ReactNode][] = [
    ["Capturada", fmtFecha(c.capturadoEn, "d 'de' MMMM yyyy, HH:mm:ss")],
    ["Recibida", fmtFecha(c.recibidoEn, "d MMM, HH:mm:ss")],
    ["Bloque", c.loteId ? <Link href={`/bloques/${c.loteId}`} className="underline">{c.loteId}</Link> : "Sin bloque (captura antigua)"],
    ["Nave", c.nave ?? "—"],
    ["Cama", c.cama ?? "—"],
    ["Planta", c.tag ? <Link href={`/bloques/${c.loteId}?planta=${c.tag}`} className="font-mono underline">{c.tag}</Link> : "—"],
    ["Misión", c.mision ?? "—"],
    ["Revisión", c.inspectionId ? <Link href={`/recorridos/${c.inspectionId}`} className="underline">{c.recorridoNombre ?? c.inspectionId}</Link> : "—"],
    ["Punto del plan", c.waypointId ?? "—"],
    ["Modelo", c.modelo ?? "—"],
    ["Tipo", <EtiquetaCaptura key="tipo" alerta={c.alerta} modo={c.modoCaptura} />],
    ["Ubicación GPS", c.lat !== null && c.lng !== null ? `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}${c.precisionM ? ` · ±${fmtNum(c.precisionM, 0)} m` : ""}` : c.simulado ? "No aplica: posición simulada en la demo" : "Sin GPS"],
    ["UUID", <code key="id" className="text-xs">{c.id}</code>],
  ];

  return (
    <>
      <Encabezado
        titulo={<span className="flex items-center gap-3">{c.alerta ? <><Siren className="size-5 text-[var(--status-critical)]" />Alerta del modelo</> : "Captura de campo"}</span>}
        descripcion={<span className="flex flex-wrap items-center gap-2">{`${c.loteId ?? "Sin lote"} · ${fmtFecha(c.capturadoEn, "d MMM yyyy, HH:mm")}`}{c.simulado ? <DistintivoSimulado /> : null}</span>}
        acciones={<Link href="/capturas" className="text-sm text-muted-foreground underline">Todas las capturas</Link>}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Seccion titulo="Foto del cuadro analizado" descripcion="Las puntuaciones corresponden a este mismo cuadro." className="lg:col-span-3">
          {c.tieneFoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/capturas/${c.id}/foto`} alt="Cuadro analizado por el modelo" className="w-full rounded-md object-contain" />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Esta lectura no trae foto. Las lecturas periódicas solo envían puntuaciones.</p>
          )}
        </Seccion>
        <div className="space-y-4 lg:col-span-2">
          <Seccion titulo="Puntuaciones del modelo" descripcion="Salidas del modelo ×100. No están calibradas como probabilidad y una Sana alta no prueba que la planta esté sana.">
            <Puntuacion4 p={c.puntuaciones} />
          </Seccion>
          <Seccion titulo="Revisión humana" descripcion="La decisión del agrónomo después de mirar la foto.">
            <form action={marcarRevision} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={c.id} />
              {([
                ["confirmada", "Confirmar problema"],
                ["descartada", "Descartar"],
                ["pendiente", "Dejar pendiente"],
              ] as const).map(([estado, texto]) => (
                <button
                  key={estado}
                  type="submit"
                  name="estado"
                  value={estado}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm",
                    c.revisionHumana === estado ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
                  )}
                >
                  {texto}
                </button>
              ))}
            </form>
            {c.revisadoEn ? <p className="mt-2 text-xs text-muted-foreground">Marcada el {fmtFecha(c.revisadoEn, "d MMM, HH:mm")}</p> : null}
          </Seccion>
          <Seccion titulo="Datos de la captura">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {filas.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
            {c.origenBloque === "mvp" || c.origenCama === "mvp" ? (
              <p className="mt-3 text-xs text-muted-foreground">
                La app todavía no envía {c.origenBloque === "mvp" ? "el bloque, la nave ni la cama" : "la nave ni la cama"}: en este MVP se asignan de forma fija en el código
                {c.plantaApp ? `, a partir del identificador de planta que sí envía (${c.plantaApp.slice(0, 8)}…)` : ""}. La misma planta cae siempre en el mismo tag.
              </p>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">La cámara del robot no mide severidad ni área afectada: estas puntuaciones describen el encuadre completo.</p>
          </Seccion>
        </div>
      </div>
    </>
  );
}
