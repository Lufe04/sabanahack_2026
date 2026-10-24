import Link from "next/link";
import { CloudRain, Thermometer, Droplets } from "lucide-react";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { RiesgoBadge, AmenazaBadge, SueloBadge } from "@/components/dashboard/badges";
import { ListaAcciones } from "@/components/dashboard/acciones";
import { MapaFinca } from "@/components/dashboard/mapa-finca";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getEventos, getLotesEstado } from "@/lib/queries/lotes";
import { getSensoresEstado } from "@/lib/queries/sensores";
import { getResumenCapturas } from "@/lib/queries/cultivos";
import { getSanidadFinca } from "@/lib/bloque/datos";
import { generarRecomendaciones, amenazaPrincipal, estadoSuelo } from "@/lib/recomendaciones";
import { geojsonRecorridos } from "@/lib/cultivos/servicio";
import { FINCA } from "@/lib/simulador/finca";
import { fmtFecha, fmtNum, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Hoy() {
  const lotes = await getLotesEstado();
  const [abiertos, sensores, rutas, sanidad, robot] = await Promise.all([
    getEventos({ soloAbiertos: true }),
    getSensoresEstado(),
    geojsonRecorridos(null),
    getSanidadFinca(lotes),
    getResumenCapturas({}),
  ]);
  const acciones = generarRecomendaciones(lotes, abiertos, sensores);
  const urgentes = acciones.filter((a) => a.prioridad === "alta").length;
  const san = new Map(sanidad.map((s) => [s.loteId, s]));
  const plantas = sanidad.reduce((a, s) => a + s.plantas, 0);
  const afectadas = sanidad.reduce((a, s) => a + s.afectadas, 0);

  // Prioridad: plantas afectadas, brotes abiertos y riesgo de brote
  const prioridad = (id: string) => {
    const l = lotes.find((x) => x.id === id)!;
    return (san.get(id)?.pctAfectadas ?? 0) * 3 + l.eventosActivos * 10 + l.indiceRiesgo / 2;
  };
  const requierenAccion = lotes.filter((l) => l.indiceRiesgo >= 40 || l.eventosActivos > 0 || (san.get(l.id)?.pctAfectadas ?? 0) >= 5);
  const ordenados = [...lotes].sort((a, b) => prioridad(b.id) - prioridad(a.id));
  const hoy = lotes[0];
  const lluvia = Math.max(...lotes.map((l) => l.lluviaMm ?? 0));
  const humedadProm = lotes.reduce((a, l) => a + (l.humedadAireProm ?? 0), 0) / Math.max(1, lotes.length);

  return (
    <>
      <Encabezado
        titulo={`Hoy, ${fmtFecha(hoy?.fecha ?? new Date().toISOString(), "EEEE d 'de' MMMM")}`}
        descripcion={`${FINCA.nombre} · ${FINCA.municipio} · ${lotes.length} bloques, ${fmtNum(lotes.reduce((a, l) => a + l.hectareas, 0), 1)} ha`}
        acciones={
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Thermometer className="size-4" />{fmtNum(hoy?.tempMin, 0)}° a {fmtNum(hoy?.tempMax, 0)}°</span>
            <span className="inline-flex items-center gap-1"><Droplets className="size-4" />{fmtNum(humedadProm, 0)} % humedad</span>
            <span className="inline-flex items-center gap-1"><CloudRain className="size-4" />{lluvia > 0 ? `${fmtNum(lluvia, 1)} mm de lluvia` : "sin lluvia"}</span>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          etiqueta="Bloques que requieren acción"
          valor={requierenAccion.length}
          detalle={requierenAccion.length ? requierenAccion.map((l) => l.id).join(", ") : "ningún bloque en alerta"}
          tono={requierenAccion.length ? "malo" : "bueno"}
        />
        <Kpi etiqueta="Plantas afectadas" valor={fmtPct((100 * afectadas) / Math.max(1, plantas), 1)} detalle={`${afectadas.toLocaleString("es-CO")} de ${plantas.toLocaleString("es-CO")} plantas`} tono={afectadas ? "malo" : "bueno"} />
        <Kpi etiqueta="Brotes abiertos" valor={abiertos.length} detalle={`${abiertos.filter((e) => e.estado === "activo").length} activos · ${urgentes} acciones urgentes`} tono={abiertos.length ? "malo" : "bueno"} />
        <Kpi
          etiqueta="Alertas del robot sin revisar"
          valor={<Link href="/capturas?alerta=si" className="hover:underline">{robot.alertasPendientes}</Link>}
          detalle={robot.ultima ? `última lectura ${fmtFecha(robot.ultima, "d MMM, HH:mm")}` : "el robot no ha enviado lecturas"}
          tono={robot.alertasPendientes ? "malo" : "neutro"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Seccion titulo="Mapa de la finca" descripcion="Elige qué ver: plantas afectadas, riesgo de brote, temperatura o humedad en cada bloque.">
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
            }))}
            centro={FINCA.centro}
            recorridos={{ inicial: rutas, url: "/recorridos/geojson" }}
          />
        </Seccion>
        <Seccion titulo="Qué hacer hoy" descripcion="Ordenado por urgencia.">
          <ListaAcciones acciones={acciones} limite={6} />
        </Seccion>
      </div>

      <Seccion titulo="Bloques por prioridad" descripcion="Primero los que tienen más plantas afectadas, brotes abiertos o riesgo alto." className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bloque</TableHead>
              <TableHead className="text-right">Plantas afectadas</TableHead>
              <TableHead>Amenaza principal</TableHead>
              <TableHead>Riesgo hoy</TableHead>
              <TableHead>Suelo</TableHead>
              <TableHead className="text-right">Brotes abiertos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenados.map((l) => {
              const amenaza = amenazaPrincipal(l);
              const s = san.get(l.id);
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link href={`/bloques/${l.id}`} className="font-medium hover:underline">{l.id} · {l.nombre}</Link>
                    <div className="text-xs text-muted-foreground">{l.variedad} · drenaje {l.drenaje}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={s && s.pctAfectadas >= 5 ? "font-semibold text-[var(--status-critical)]" : undefined}>{fmtPct(s?.pctAfectadas ?? 0, 1)}</span>
                    {s?.severas ? <div className="text-[11px] text-muted-foreground">{s.severas} severas</div> : null}
                  </TableCell>
                  <TableCell>{amenaza ? <AmenazaBadge plaga={amenaza.plaga} riesgo={amenaza.riesgo} /> : "—"}</TableCell>
                  <TableCell><RiesgoBadge indice={l.indiceRiesgo} /></TableCell>
                  <TableCell><SueloBadge estado={estadoSuelo(l.humedadSueloProm)} valor={l.humedadSueloProm} /></TableCell>
                  <TableCell className="text-right tabular-nums">{l.eventosActivos || <span className="text-muted-foreground">0</span>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Seccion>
    </>
  );
}
