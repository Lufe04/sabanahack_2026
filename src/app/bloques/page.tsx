import Link from "next/link";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { RiesgoBadge, SueloBadge } from "@/components/dashboard/badges";
import { MapaFinca } from "@/components/dashboard/mapa-finca";
import { Card } from "@/components/ui/card";
import { getLotesEstado } from "@/lib/queries/lotes";
import { getSanidadFinca } from "@/lib/bloque/datos";
import { estadoSuelo } from "@/lib/recomendaciones";
import { NOMBRE_ENFERMEDAD } from "@/lib/viz/palette";
import { FINCA } from "@/lib/simulador/finca";
import { fmtNum, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Bloques() {
  const lotes = await getLotesEstado();
  const sanidad = await getSanidadFinca(lotes);
  const san = new Map(sanidad.map((s) => [s.loteId, s]));

  return (
    <>
      <Encabezado titulo="Bloques" descripcion={`${lotes.length} bloques · ${fmtNum(lotes.reduce((a, l) => a + l.hectareas, 0), 1)} ha · ${sanidad.reduce((a, s) => a + s.plantas, 0).toLocaleString("es-CO")} plantas`} />
      <Seccion titulo="Mapa de la finca" descripcion="Clic en un bloque para abrir su plano con camas, pasillos y plantas.">
        <MapaFinca
          bloques={lotes.map((l) => ({
            id: l.id,
            nombre: l.nombre,
            poligono: l.poligono,
            indiceRiesgo: l.indiceRiesgo,
            eventosActivos: l.eventosActivos,
            pctAfectadas: san.get(l.id)?.pctAfectadas ?? 0,
            temperatura: san.get(l.id)?.temperatura ?? null,
            humedadAire: san.get(l.id)?.humedadAire ?? null,
            humedadSuelo: san.get(l.id)?.humedadSuelo ?? null,
            campos: san.get(l.id)?.campos,
          }))}
          centro={FINCA.centro}
          alto={440}
        />
      </Seccion>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {lotes.map((l) => {
          const s = san.get(l.id);
          const pct = s?.pctAfectadas ?? 0;
          return (
            <Link key={l.id} href={`/bloques/${l.id}`}>
              <Card className="h-full gap-2 px-4 py-3 transition-colors hover:bg-accent/40">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{l.id} · {l.nombre}</div>
                    <div className="text-xs text-muted-foreground">{l.variedad} · {fmtNum(l.hectareas, 2)} ha</div>
                  </div>
                  <RiesgoBadge indice={l.indiceRiesgo} conValor={false} />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={cn("text-2xl font-semibold tracking-tight", pct >= 5 && "text-[var(--status-critical)]")}>{fmtPct(pct, 1)}</span>
                  <span className="text-xs text-muted-foreground">plantas afectadas</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {s?.plagaPrincipal ? `${NOMBRE_ENFERMEDAD[s.plagaPrincipal]} · ` : ""}
                  {l.eventosActivos ? `${l.eventosActivos} brote${l.eventosActivos > 1 ? "s" : ""} abierto${l.eventosActivos > 1 ? "s" : ""}` : "sin brotes abiertos"}
                </div>
                <SueloBadge estado={estadoSuelo(l.humedadSueloProm)} valor={l.humedadSueloProm} />
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
