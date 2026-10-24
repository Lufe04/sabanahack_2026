import Link from "next/link";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { RiesgoBadge } from "@/components/dashboard/badges";
import { MapaLotesLazy } from "@/components/dashboard/mapa-lotes-lazy";
import { Card } from "@/components/ui/card";
import { getLotesEstado } from "@/lib/queries/lotes";
import { FINCA } from "@/lib/simulador/finca";
import { fmtNum, fmtPct, fmtFecha } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Lotes() {
  const lotes = await getLotesEstado();
  return (
    <>
      <Encabezado titulo="Lotes" descripcion={`${lotes.length} lotes · ${fmtNum(lotes.reduce((a, l) => a + l.hectareas, 0), 1)} ha en total`} />
      <Seccion titulo="Mapa de la finca" descripcion="Clic en un lote para abrir su detalle.">
        <MapaLotesLazy lotes={lotes} centro={FINCA.centro} alto={420} />
      </Seccion>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lotes.map((l) => (
          <Link key={l.id} href={`/lotes/${l.id}`}>
            <Card className="h-full gap-2 px-4 py-3 transition-colors hover:bg-accent/40">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{l.id} · {l.nombre}</div>
                  <div className="text-xs text-muted-foreground">{l.variedad} · {fmtNum(l.hectareas, 2)} ha · drenaje {l.drenaje}</div>
                </div>
                <RiesgoBadge indice={l.indiceRiesgo} />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-muted-foreground">Hum. suelo</dt><dd className="tabular-nums">{fmtPct(l.humedadSueloProm, 0)}</dd></div>
                <div><dt className="text-muted-foreground">Brotes abiertos</dt><dd className="tabular-nums">{l.eventosActivos}</dd></div>
                <div><dt className="text-muted-foreground">Brotes 90 d</dt><dd className="tabular-nums">{l.brotes90d}</dd></div>
              </dl>
              <div className="text-[11px] text-muted-foreground">Sembrado {fmtFecha(l.fechaSiembra, "MMM yyyy")}</div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
