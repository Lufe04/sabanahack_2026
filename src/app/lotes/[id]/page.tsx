import { notFound } from "next/navigation";
import Link from "next/link";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { RiesgoBadge, SueloBadge } from "@/components/dashboard/badges";
import { ListaAcciones } from "@/components/dashboard/acciones";
import { generarRecomendaciones, estadoSuelo } from "@/lib/recomendaciones";
import { ENFERMEDADES_LISTA, PARAMS_ENFERMEDAD } from "@/lib/simulador/enfermedades";
import { COLOR_ENFERMEDAD, NOMBRE_ENFERMEDAD, nivelRiesgo, COLOR_RIESGO } from "@/lib/viz/palette";
import { getSensoresEstado } from "@/lib/queries/sensores";
import { geojsonRecorridos } from "@/lib/cultivos/servicio";
import { getCapturas, getRecorridos, getResumenCapturas } from "@/lib/queries/cultivos";
import { Puntuacion4 } from "@/components/dashboard/puntuaciones";
import { DistintivoSimulado, FaseRecorrido, Progreso } from "@/components/dashboard/fase-recorrido";
import { MapaLotesLazy } from "@/components/dashboard/mapa-lotes-lazy";
import { TablaEventos } from "@/components/dashboard/tabla-eventos";
import { SerieTiempo } from "@/components/charts/serie-tiempo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getEventos,
  getLecturasRecientesLote,
  getLotesEstado,
  getSerieDiariaLote,
} from "@/lib/queries/lotes";
import { getRankingLotes } from "@/lib/queries/analitica";
import { COLOR_SENSOR } from "@/lib/viz/palette";
import { fmtFecha, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DetalleLote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lotes = await getLotesEstado();
  const lote = lotes.find((l) => l.id === id);
  if (!lote) notFound();

  const [serie, eventos, lecturas, ranking, sensores, rutas, capturas, resumenRobot, recorridos] = await Promise.all([
    getSerieDiariaLote(id, 90),
    getEventos({ loteId: id }),
    getLecturasRecientesLote(id, 48),
    getRankingLotes(),
    getSensoresEstado(),
    geojsonRecorridos(id),
    getCapturas({ lote: id }, 20),
    getResumenCapturas({ lote: id }),
    getRecorridos({ lote: id }),
  ]);
  const acciones = generarRecomendaciones([lote], eventos.filter((e) => e.estado !== "cerrado"), sensores.filter((s) => s.loteId === id));
  const stats = ranking.find((r) => r.loteId === id);
  const posicion = ranking.findIndex((r) => r.loteId === id) + 1;

  const crudas = pivotarLecturas(lecturas);

  return (
    <>
      <Encabezado
        titulo={
          <span className="flex items-center gap-3">
            {lote.id} · {lote.nombre} <RiesgoBadge indice={lote.indiceRiesgo} />
          </span>
        }
        descripcion={`${lote.variedad} · ${fmtNum(lote.hectareas, 2)} ha · drenaje ${lote.drenaje} · sembrado ${fmtFecha(lote.fechaSiembra, "MMMM yyyy")}`}
        acciones={<Link href="/lotes" className="text-sm text-muted-foreground underline">Todos los lotes</Link>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi etiqueta="Humedad del suelo" valor={fmtNum(lote.humedadSueloProm, 0)} unidad="%" detalle={<SueloBadge estado={estadoSuelo(lote.humedadSueloProm)} valor={null} />} />
        <Kpi etiqueta="Humedad del aire" valor={fmtNum(lote.humedadAireProm, 0)} unidad="%" detalle={`${fmtNum(lote.horasHumedadAlta, 0)} h sobre 85 %`} />
        <Kpi etiqueta="Capturas reales del robot" valor={fmtNum(resumenRobot.lecturasReales)} detalle={resumenRobot.ultima ? `última: ${fmtFecha(resumenRobot.ultima, "d MMM, HH:mm")}` : "todavía sin capturas"} />
        <Kpi etiqueta="Brotes abiertos" valor={lote.eventosActivos} detalle={`${stats?.brotes ?? 0} en total`} />
        <Kpi etiqueta="Cada cuánto se enferma" valor={stats?.diasEntreBrotes ? fmtNum(stats.diasEntreBrotes, 0) : "—"} unidad={stats?.diasEntreBrotes ? "días" : undefined} detalle="promedio entre brotes" />
        <Kpi etiqueta="Ranking de incidencia" valor={`#${posicion}`} detalle={`de ${ranking.length} lotes · ${fmtNum(stats?.brotesPorHa, 1)} brotes/ha`} tono={posicion <= 2 ? "malo" : "neutro"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Seccion titulo="Riesgo por plaga hoy" descripcion="Probabilidad estimada de brote en los próximos 7 días, según el clima de los últimos 5 días.">
          <ul className="space-y-3">
            {ENFERMEDADES_LISTA.map((e) => {
              const r = lote.riesgoPorPlaga?.[e] ?? 0;
              const nivel = nivelRiesgo(r);
              return (
                <li key={e}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full" style={{ background: COLOR_ENFERMEDAD[e] }} />{NOMBRE_ENFERMEDAD[e]}</span>
                    <span className="text-xs font-medium tabular-nums" style={{ color: nivel === "bajo" ? "var(--muted-foreground)" : COLOR_RIESGO[nivel] }}>{r} %</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, r)}%`, background: COLOR_ENFERMEDAD[e] }} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{PARAMS_ENFERMEDAD[e].prefiereSeco ? "Sube con aire seco y calor" : `Sube con más de ${PARAMS_ENFERMEDAD[e].horasHumedadMin} h de humedad alta`}</p>
                </li>
              );
            })}
          </ul>
        </Seccion>
        <Seccion titulo="Qué hacer en este lote" descripcion="Acciones recomendadas con base en el riesgo, los brotes y el suelo." className="lg:col-span-2">
          <ListaAcciones acciones={acciones} />
        </Seccion>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Seccion titulo="Recorridos del robot" descripcion="Rutas y puntos que envía la app del robot sobre este lote. Se actualiza cada 10 segundos.">
          <MapaLotesLazy
            lotes={[lote]}
            centro={{ lat: lote.centroLat, lng: lote.centroLng }}
            zoom={19}
            alto={300}
            interactivo={false}
            recorridos={{ inicial: rutas, url: `/recorridos/geojson?lote=${id}` }}
          />
        </Seccion>
        <Seccion titulo="Riesgo de brote" descripcion="Últimos 90 días. Los brotes aparecen cuando el riesgo se sostiene alto varios días." className="lg:col-span-2">
          <SerieTiempo
            datos={serie}
            series={[
              { clave: "indiceRiesgo", nombre: "Riesgo", color: "var(--series-1)" },
              { clave: "eventosActivos", nombre: "Brotes abiertos", color: "var(--series-2)" },
            ]}
            tipo="area"
            formatoX="fecha"
            dominioY={[0, 100]}
            lineaRef={{ y: 40, etiqueta: "inspeccionar" }}
            alto={300}
          />
        </Seccion>
      </div>

      <Tabs defaultValue="sensores" className="mt-4">
        <TabsList>
          <TabsTrigger value="sensores">Sensores</TabsTrigger>
          <TabsTrigger value="robot">Robot</TabsTrigger>
          <TabsTrigger value="enfermedades">Brotes</TabsTrigger>
        </TabsList>

        <TabsContent value="sensores" className="mt-3 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Seccion titulo="Humedad del suelo" descripcion="Promedio diario, 90 días.">
              <SerieTiempo datos={serie} series={[{ clave: "humedadSueloProm", nombre: "Humedad del suelo", color: COLOR_SENSOR.humedad_suelo, unidad: "%" }]} tipo="area" formatoX="fecha" dominioY={[0, 70]} lineaRef={{ y: 54, etiqueta: "encharcado" }} />
            </Seccion>
            <Seccion titulo="Horas de humedad alta" descripcion="Horas al día con humedad del aire sobre 85 %.">
              <SerieTiempo datos={serie} series={[{ clave: "horasHumedadAlta", nombre: "Horas > 85 %", color: COLOR_SENSOR.humedad_aire, unidad: "h" }]} tipo="barra" formatoX="fecha" dominioY={[0, 24]} />
            </Seccion>
            <Seccion titulo="Temperatura" descripcion="Mínima, promedio y máxima diaria.">
              <SerieTiempo
                datos={serie}
                series={[
                  { clave: "tempMax", nombre: "Máxima", color: "var(--series-2)", unidad: "°C" },
                  { clave: "tempProm", nombre: "Promedio", color: "var(--series-1)", unidad: "°C" },
                  { clave: "tempMin", nombre: "Mínima", color: "var(--series-3)", unidad: "°C" },
                ]}
                formatoX="fecha"
              />
            </Seccion>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Seccion titulo="Suelo, últimas 48 h" descripcion="Lecturas crudas cada 30 min, por sensor.">
              <SerieTiempo datos={crudas.suelo.datos} series={crudas.suelo.series} claveX="ts" formatoX="fechaHora" dominioY={["auto", "auto"]} />
            </Seccion>
            <Seccion titulo="Aire, últimas 48 h" descripcion="Humedad relativa del aire.">
              <SerieTiempo datos={crudas.aire.datos} series={crudas.aire.series} claveX="ts" formatoX="fechaHora" dominioY={[30, 100]} lineaRef={{ y: 85, etiqueta: "umbral hongos" }} />
            </Seccion>
            <Seccion titulo="Temperatura, últimas 48 h" descripcion="Lecturas crudas cada 30 min.">
              <SerieTiempo datos={crudas.temp.datos} series={crudas.temp.series} claveX="ts" formatoX="fechaHora" dominioY={["auto", "auto"]} />
            </Seccion>
          </div>
        </TabsContent>

        <TabsContent value="robot" className="mt-3 space-y-4">
          <Seccion titulo="Últimas capturas del robot" descripcion="Lecturas reales de la cámara en este lote. Puntuaciones ×100; no son probabilidades ni porcentaje de área enferma.">
            {capturas.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Puntuaciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {capturas.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/capturas/${c.id}`} className="hover:underline">{fmtFecha(c.capturadoEn, "d MMM, HH:mm:ss")}</Link>
                        {c.simulado ? <div className="mt-1"><DistintivoSimulado compacto /></div> : null}
                      </TableCell>
                      <TableCell className="text-sm">{c.alerta ? <span className="font-medium text-[var(--status-critical)]">Alerta con foto</span> : c.tieneFoto ? "Con foto" : "Periódica"}</TableCell>
                      <TableCell><Puntuacion4 p={c.puntuaciones} compacto /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">El robot todavía no ha enviado capturas de este lote.</p>
            )}
          </Seccion>
          <Seccion titulo="Revisiones del robot en este lote">
            {recorridos.length ? (
              <ul className="divide-y divide-border text-sm">
                {recorridos.map((r) => (
                  <li key={r.inspectionId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-2">
                      <Link href={`/recorridos/${r.inspectionId}`} className="font-medium hover:underline">{r.nombre ?? r.inspectionId.slice(0, 8)}</Link>
                      {r.simulado ? <DistintivoSimulado compacto /> : null}
                    </span>
                    <span className="flex items-center gap-4"><FaseRecorrido fase={r.fase} /><Progreso completados={r.completados} total={r.total} /></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay revisiones del robot en este lote.</p>
            )}
          </Seccion>
        </TabsContent>

        <TabsContent value="enfermedades" className="mt-3">
          <Seccion titulo="Historial de brotes" descripcion={stats?.diasDeteccionProm !== null && stats ? `Se detectan en promedio ${fmtNum(stats.diasDeteccionProm, 1)} días después de iniciar.` : undefined}>
            <TablaEventos eventos={eventos} conLote={false} vacio="Este lote no ha tenido brotes." />
          </Seccion>
        </TabsContent>
      </Tabs>
    </>
  );
}

type LecturaCruda = { sensorId: string; tipo: string; ts: Date; valor: number };

function pivotarLecturas(lecturas: LecturaCruda[]) {
  const construir = (tipo: string, color: string, unidad: string) => {
    const sensores = [...new Set(lecturas.filter((l) => l.tipo === tipo).map((l) => l.sensorId))].sort();
    const porTs = new Map<string, Record<string, unknown>>();
    for (const l of lecturas) {
      if (l.tipo !== tipo) continue;
      const k = l.ts.toISOString();
      const fila = porTs.get(k) ?? { ts: k };
      fila[l.sensorId] = l.valor;
      porTs.set(k, fila);
    }
    const colores = [color, "var(--series-7)"];
    return {
      datos: [...porTs.values()],
      series: sensores.map((s, i) => ({ clave: s, nombre: s, color: colores[i % colores.length], unidad })),
    };
  };
  return {
    suelo: construir("humedad_suelo", COLOR_SENSOR.humedad_suelo, "%"),
    aire: construir("humedad_aire", COLOR_SENSOR.humedad_aire, "%"),
    temp: construir("temperatura", COLOR_SENSOR.temperatura, "°C"),
  };
}
