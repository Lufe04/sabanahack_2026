import Link from "next/link";
import { notFound } from "next/navigation";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { RiesgoBadge, SueloBadge, AmenazaBadge } from "@/components/dashboard/badges";
import { ListaAcciones } from "@/components/dashboard/acciones";
import { TablaEventos } from "@/components/dashboard/tabla-eventos";
import { SerieTiempo } from "@/components/charts/serie-tiempo";
import { Puntuacion4 } from "@/components/dashboard/puntuaciones";
import { DistintivoSimulado, FaseRecorrido, Progreso } from "@/components/dashboard/fase-recorrido";
import { PlanoBloque } from "@/components/bloque/plano-bloque";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getEventos, getSerieDiariaLote } from "@/lib/queries/lotes";
import { getSensoresEstado } from "@/lib/queries/sensores";
import { getCapturas, getRecorridos, getResumenCapturas } from "@/lib/queries/cultivos";
import { getPlanoBloque } from "@/lib/bloque/datos";
import { generarRecomendaciones, estadoSuelo, amenazaPrincipal } from "@/lib/recomendaciones";
import { ENFERMEDADES_LISTA, PARAMS_ENFERMEDAD } from "@/lib/simulador/enfermedades";
import { COLOR_ENFERMEDAD, NOMBRE_ENFERMEDAD, nivelRiesgo, COLOR_RIESGO, COLOR_SENSOR } from "@/lib/viz/palette";
import { fmtFecha, fmtNum, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DetalleBloque({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ planta?: string }> }) {
  const { id } = await params;
  const { planta } = await searchParams;
  const datos = await getPlanoBloque(id);
  if (!datos) notFound();
  const { plano, lote } = datos;

  const [serie, eventos, sensores, capturas, resumenRobot, recorridos] = await Promise.all([
    getSerieDiariaLote(id, 30),
    getEventos({ loteId: id }),
    getSensoresEstado(),
    getCapturas({ lote: id }, 20),
    getResumenCapturas({ lote: id }),
    getRecorridos({ lote: id }),
  ]);
  const abiertos = eventos.filter((e) => e.estado !== "cerrado");
  const acciones = generarRecomendaciones([lote], abiertos, sensores.filter((s) => s.loteId === id));
  const amenaza = amenazaPrincipal(lote);
  const temp = plano.campos.temperatura;
  const r = plano.resumen;

  return (
    <>
      <Encabezado
        titulo={<span className="flex flex-wrap items-center gap-3">Bloque {lote.id} · {lote.nombre} <RiesgoBadge indice={lote.indiceRiesgo} /></span>}
        descripcion={`${lote.variedad} · ${fmtNum(lote.hectareas, 2)} ha · drenaje ${lote.drenaje} · ${plano.camas.length} camas · ${r.plantas.toLocaleString("es-CO")} plantas`}
        acciones={<Link href="/bloques" className="text-sm text-muted-foreground underline">Todos los bloques</Link>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Kpi
          etiqueta="Plantas afectadas"
          valor={fmtPct(r.pctAfectadas, 1)}
          detalle={`${r.afectadas.toLocaleString("es-CO")} de ${r.plantas.toLocaleString("es-CO")} · ${r.severas} severas`}
          tono={r.pctAfectadas >= 5 ? "malo" : r.afectadas ? "neutro" : "bueno"}
        />
        <Kpi etiqueta="Amenaza principal" valor={amenaza ? <AmenazaBadge plaga={amenaza.plaga} riesgo={amenaza.riesgo} /> : "—"} detalle="riesgo de brote en 7 días" />
        <Kpi etiqueta="Humedad del suelo" valor={fmtNum(lote.humedadSueloProm, 0)} unidad="%" detalle={<SueloBadge estado={estadoSuelo(lote.humedadSueloProm)} valor={null} />} />
        <Kpi etiqueta="Humedad del aire" valor={fmtNum(lote.humedadAireProm, 0)} unidad="%" detalle={`${fmtNum(lote.horasHumedadAlta, 0)} h hoy sobre 85 %`} tono={(lote.horasHumedadAlta ?? 0) >= 15 ? "malo" : "neutro"} />
        <Kpi etiqueta="Temperatura" valor={fmtNum(lote.tempMin, 0)} unidad={`° a ${fmtNum(lote.tempMax, 0)}°`} detalle={`ahora ${fmtNum(temp.min, 1)}–${fmtNum(temp.max, 1)} °C en el bloque`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Seccion
          titulo="Plano del bloque"
          descripcion="Cada punto es una planta con su tag. Acércate para ver los números de cama y de planta; cambia de capa para ver dónde está la enfermedad, el calor o la humedad."
        >
          <PlanoBloque plano={plano} enfocar={planta ?? null} />
        </Seccion>
        <div className="space-y-4">
          <Seccion titulo="Qué hacer en este bloque">
            <ListaAcciones acciones={acciones} limite={4} />
          </Seccion>
          <Seccion titulo="Riesgo por plaga" descripcion="Probabilidad de brote en los próximos 7 días según el clima de los últimos 5.">
            <ul className="space-y-3">
              {ENFERMEDADES_LISTA.map((e) => {
                const v = lote.riesgoPorPlaga?.[e] ?? 0;
                const nivel = nivelRiesgo(v);
                return (
                  <li key={e}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full" style={{ background: COLOR_ENFERMEDAD[e] }} />{NOMBRE_ENFERMEDAD[e]}</span>
                      <span className="text-xs font-medium tabular-nums" style={{ color: nivel === "bajo" ? "var(--muted-foreground)" : COLOR_RIESGO[nivel] }}>{v} %</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, v)}%`, background: COLOR_ENFERMEDAD[e] }} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{PARAMS_ENFERMEDAD[e].prefiereSeco ? "Sube con aire seco y calor" : `Sube con más de ${PARAMS_ENFERMEDAD[e].horasHumedadMin} h de humedad alta`}</p>
                  </li>
                );
              })}
            </ul>
          </Seccion>
        </div>
      </div>

      <Tabs defaultValue="condiciones" className="mt-4">
        <TabsList>
          <TabsTrigger value="condiciones">Condiciones</TabsTrigger>
          <TabsTrigger value="robot">Robot</TabsTrigger>
          <TabsTrigger value="brotes">Brotes ({abiertos.length} abiertos)</TabsTrigger>
        </TabsList>

        <TabsContent value="condiciones" className="mt-3">
          <div className="grid gap-4 lg:grid-cols-2">
            <Seccion titulo="Riesgo de brote" descripcion="Últimos 30 días. Sobre 40 conviene inspeccionar.">
              <SerieTiempo datos={serie} series={[{ clave: "indiceRiesgo", nombre: "Riesgo", color: "var(--series-1)" }]} tipo="area" dominioY={[0, 100]} lineaRef={{ y: 40, etiqueta: "inspeccionar" }} alto={200} />
            </Seccion>
            <Seccion titulo="Horas de humedad alta" descripcion="Horas al día con el aire sobre 85 %. Más de 10 h seguidas favorecen Botrytis.">
              <SerieTiempo datos={serie} series={[{ clave: "horasHumedadAlta", nombre: "Horas > 85 %", color: COLOR_SENSOR.humedad_aire, unidad: "h" }]} tipo="barra" dominioY={[0, 24]} lineaRef={{ y: 10, etiqueta: "riesgo Botrytis" }} alto={200} />
            </Seccion>
            <Seccion titulo="Humedad del suelo" descripcion="Promedio diario. Sobre 54 % el suelo está encharcado.">
              <SerieTiempo datos={serie} series={[{ clave: "humedadSueloProm", nombre: "Humedad del suelo", color: COLOR_SENSOR.humedad_suelo, unidad: "%" }]} tipo="area" dominioY={[0, 70]} lineaRef={{ y: 54, etiqueta: "encharcado" }} alto={200} />
            </Seccion>
            <Seccion titulo="Temperatura" descripcion="Mínima y máxima diaria.">
              <SerieTiempo
                datos={serie}
                series={[
                  { clave: "tempMax", nombre: "Máxima", color: "var(--series-2)", unidad: "°C" },
                  { clave: "tempMin", nombre: "Mínima", color: "var(--series-1)", unidad: "°C" },
                ]}
                alto={200}
              />
            </Seccion>
          </div>
        </TabsContent>

        <TabsContent value="robot" className="mt-3 space-y-4">
          <Seccion titulo="Últimas capturas del robot" descripcion={`${resumenRobot.lecturasReales} lecturas reales y ${resumenRobot.lecturasDemo} de demos en este bloque. Puntuaciones ×100; no son probabilidades.`}>
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
                  {capturas.slice(0, 10).map((c) => (
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
              <p className="py-6 text-center text-sm text-muted-foreground">El robot todavía no ha enviado capturas de este bloque.</p>
            )}
          </Seccion>
          {recorridos.length ? (
            <Seccion titulo="Revisiones del robot">
              <ul className="divide-y divide-border text-sm">
                {recorridos.map((rc) => (
                  <li key={rc.inspectionId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-2">
                      <Link href={`/recorridos/${rc.inspectionId}`} className="font-medium hover:underline">{rc.nombre ?? rc.inspectionId.slice(0, 8)}</Link>
                      {rc.simulado ? <DistintivoSimulado compacto /> : null}
                    </span>
                    <span className="flex items-center gap-4"><FaseRecorrido fase={rc.fase} /><Progreso completados={rc.completados} total={rc.total} /></span>
                  </li>
                ))}
              </ul>
            </Seccion>
          ) : null}
        </TabsContent>

        <TabsContent value="brotes" className="mt-3">
          <Seccion titulo="Brotes del bloque" descripcion="Abiertos primero. En el plano se ven los focos de los brotes abiertos y de los cerrados hace menos de 10 días.">
            <TablaEventos eventos={eventos} conLote={false} vacio="Este bloque no ha tenido brotes." />
          </Seccion>
        </TabsContent>
      </Tabs>
    </>
  );
}
