import Link from "next/link";
import { CloudRain, Thermometer, Droplets } from "lucide-react";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { RiesgoBadge, AmenazaBadge, SueloBadge } from "@/components/dashboard/badges";
import { MapaLotesLazy } from "@/components/dashboard/mapa-lotes-lazy";
import { ListaAcciones } from "@/components/dashboard/acciones";
import { SerieTiempo } from "@/components/charts/serie-tiempo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getEventos, getLotesEstado, getSerieDiariaFinca } from "@/lib/queries/lotes";
import { getSensoresEstado } from "@/lib/queries/sensores";
import { generarRecomendaciones, amenazaPrincipal, estadoSuelo } from "@/lib/recomendaciones";
import { FINCA } from "@/lib/simulador/finca";
import { geojsonRecorridos } from "@/lib/cultivos/servicio";
import { fmtFecha, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Hoy() {
  const [lotes, serie, abiertos, sensores, rutas] = await Promise.all([
    getLotesEstado(),
    getSerieDiariaFinca(60),
    getEventos({ soloAbiertos: true }),
    getSensoresEstado(),
    geojsonRecorridos(null),
  ]);
  const acciones = generarRecomendaciones(lotes, abiertos, sensores);
  const urgentes = acciones.filter((a) => a.prioridad === "alta").length;
  const enAlerta = lotes.filter((l) => l.indiceRiesgo >= 40 || l.eventosActivos > 0);
  const sensoresCaidos = sensores.filter((s) => s.estado !== "ok").length;
  const hoy = lotes[0];
  const lluvia = Math.max(...lotes.map((l) => l.lluviaMm ?? 0));
  const humedadProm = lotes.reduce((a, l) => a + (l.humedadAireProm ?? 0), 0) / Math.max(1, lotes.length);
  const semanas = agruparPorSemana(serie);
  const lotesOrdenados = [...lotes].sort((a, b) => b.indiceRiesgo - a.indiceRiesgo);

  return (
    <>
      <Encabezado
        titulo={`Hoy, ${fmtFecha(hoy?.fecha ?? new Date().toISOString(), "EEEE d 'de' MMMM")}`}
        descripcion={`${FINCA.nombre} · ${FINCA.municipio} · ${lotes.length} lotes, ${fmtNum(lotes.reduce((a, l) => a + l.hectareas, 0), 1)} ha`}
        acciones={
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Thermometer className="size-4" />{fmtNum(hoy?.tempMin, 0)}° a {fmtNum(hoy?.tempMax, 0)}°</span>
            <span className="inline-flex items-center gap-1"><Droplets className="size-4" />{fmtNum(humedadProm, 0)} % humedad</span>
            <span className="inline-flex items-center gap-1"><CloudRain className="size-4" />{lluvia > 0 ? `${fmtNum(lluvia, 1)} mm de lluvia` : "sin lluvia"}</span>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Lotes en alerta" valor={enAlerta.length} detalle={enAlerta.length ? enAlerta.map((l) => l.nombre).join(", ") : "ningún lote en riesgo alto"} tono={enAlerta.length ? "malo" : "bueno"} />
        <Kpi etiqueta="Brotes abiertos" valor={abiertos.length} detalle={`${abiertos.filter((e) => e.estado === "activo").length} activos, ${abiertos.filter((e) => e.estado === "controlado").length} en control`} />
        <Kpi etiqueta="Acciones para hoy" valor={acciones.length} detalle={urgentes ? `${urgentes} urgentes` : "ninguna urgente"} tono={urgentes ? "malo" : "neutro"} />
        <Kpi etiqueta="Sensores" valor={`${sensores.length - sensoresCaidos}/${sensores.length}`} detalle={sensoresCaidos ? `${sensoresCaidos} por revisar` : "todos reportando"} tono={sensoresCaidos ? "malo" : "bueno"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Seccion titulo="Qué hacer hoy" descripcion="Acciones derivadas del riesgo, los brotes abiertos, el suelo y el estado de los equipos." className="lg:col-span-3">
          <ListaAcciones acciones={acciones} limite={8} />
        </Seccion>
        <Seccion titulo="Mapa de la finca" descripcion="Color y número según el riesgo de hoy; 🐛 marca brotes abiertos. Clic en un lote para ver el detalle." className="lg:col-span-2">
          <MapaLotesLazy lotes={lotes} centro={FINCA.centro} alto={420} compacto recorridos={{ inicial: rutas, url: "/recorridos/geojson" }} />
        </Seccion>
      </div>

      <Seccion titulo="Estado de los lotes" descripcion="Un vistazo por lote: riesgo, qué plaga amenaza, cómo está el suelo y si tiene brotes abiertos." className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lote</TableHead>
              <TableHead>Riesgo hoy</TableHead>
              <TableHead>Amenaza principal</TableHead>
              <TableHead>Suelo</TableHead>
              <TableHead className="text-right">Brotes abiertos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotesOrdenados.map((l) => {
              const amenaza = amenazaPrincipal(l);
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link href={`/lotes/${l.id}`} className="font-medium hover:underline">{l.id} · {l.nombre}</Link>
                    <div className="text-xs text-muted-foreground">{l.variedad} · {fmtNum(l.hectareas, 1)} ha · drenaje {l.drenaje}</div>
                  </TableCell>
                  <TableCell><RiesgoBadge indice={l.indiceRiesgo} /></TableCell>
                  <TableCell>{amenaza ? <AmenazaBadge plaga={amenaza.plaga} riesgo={amenaza.riesgo} /> : "—"}</TableCell>
                  <TableCell><SueloBadge estado={estadoSuelo(l.humedadSueloProm)} valor={l.humedadSueloProm} /></TableCell>
                  <TableCell className="text-right tabular-nums">{l.eventosActivos || <span className="text-muted-foreground">0</span>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Seccion>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Riesgo de brote en la finca" descripcion="Promedio y lote más expuesto, últimos 60 días. Sobre 40 conviene inspeccionar.">
          <SerieTiempo
            datos={serie}
            series={[
              { clave: "riesgoProm", nombre: "Promedio", color: "var(--series-1)" },
              { clave: "riesgoMax", nombre: "Lote más expuesto", color: "var(--series-2)", punteada: true },
            ]}
            dominioY={[0, 100]}
            lineaRef={{ y: 40, etiqueta: "inspeccionar" }}
          />
        </Seccion>
        <Seccion titulo="Brotes nuevos por semana" descripcion="Cuántos brotes empezaron cada semana en toda la finca.">
          <SerieTiempo datos={semanas} series={[{ clave: "brotes", nombre: "Brotes", color: "var(--series-1)" }]} claveX="semana" tipo="barra" />
        </Seccion>
      </div>
    </>
  );
}

function agruparPorSemana(serie: { fecha: string; brotes: number }[]) {
  const mapa = new Map<string, number>();
  for (const p of serie) {
    const d = new Date(p.fecha + "T00:00:00");
    const lunes = new Date(d);
    lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const clave = lunes.toISOString().slice(0, 10);
    mapa.set(clave, (mapa.get(clave) ?? 0) + p.brotes);
  }
  return [...mapa.entries()].map(([semana, brotes]) => ({ semana, brotes }));
}
