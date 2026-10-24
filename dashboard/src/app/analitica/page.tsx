import Link from "next/link";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { BarrasHorizontales } from "@/components/charts/barras-horizontales";
import { SerieTiempo } from "@/components/charts/serie-tiempo";
import { BarrasApiladas } from "@/components/charts/barras-apiladas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getBrotesPorDrenaje,
  getBrotesPorMes,
  getKpis,
  getRankingLotes,
  getResumenEnfermedades,
  getTasaBrotePorCondicion,
} from "@/lib/queries/analitica";
import { ENFERMEDADES } from "@/db/schema";
import { COLOR_ENFERMEDAD, NOMBRE_ENFERMEDAD } from "@/lib/viz/palette";
import { fmtNum, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Analitica() {
  const [kpis, ranking, porMes, enfermedades, tasaAire, tasaTemp, drenaje] = await Promise.all([
    getKpis(),
    getRankingLotes(),
    getBrotesPorMes(),
    getResumenEnfermedades(),
    getTasaBrotePorCondicion("horas_humedad_alta"),
    getTasaBrotePorCondicion("temp_prom"),
    getBrotesPorDrenaje(),
  ]);

  const masComun = enfermedades[0];
  const meses = [...new Set(porMes.map((m) => m.mes))].sort();

  const porMesDatos = meses.map((mes) => {
    const fila: Record<string, unknown> = { mes };
    for (const e of ENFERMEDADES) fila[e] = porMes.find((p) => p.mes === mes && p.enfermedad === e)?.n ?? 0;
    return fila;
  });

  const porHa = [...ranking].sort((a, b) => b.brotesPorHa - a.brotesPorHa);
  const peor = porHa[0];
  const seriesPlaga = ENFERMEDADES.map((e) => ({ clave: e, nombre: NOMBRE_ENFERMEDAD[e], color: COLOR_ENFERMEDAD[e] }));
  const aplanar = (t: typeof tasaAire) => t.map((x) => ({ rango: x.rango, ...x.porPlaga, total: x.tasaPor100, loteDias: x.loteDias }));
  const mejor = porHa[porHa.length - 1];

  return (
    <>
      <Encabezado titulo="Patrones de plagas y enfermedades" descripcion="Qué tanto se enferman los bloques, cuáles más, cada cuánto y bajo qué condiciones. Trips, Botrytis y Alternaria." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi etiqueta="Problema más frecuente" valor={masComun ? NOMBRE_ENFERMEDAD[masComun.enfermedad] : "—"} detalle={masComun ? `${masComun.brotes} brotes en ${masComun.lotesAfectados} bloques` : undefined} />
        <Kpi etiqueta="Detectados por el robot" valor={fmtPct(kpis.pctDeteccionRobot, 0)} detalle="el resto en campo o trampas" />
        <Kpi etiqueta="Tiempo a detección" valor={fmtNum(kpis.diasDeteccionProm, 1)} unidad="días" detalle="promedio desde el inicio del brote" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Seccion titulo="¿Cuáles bloques se enferman más?" descripcion="Brotes por hectárea en el período. Normalizado por tamaño del bloque." className="lg:col-span-2">
          <BarrasHorizontales
            datos={porHa.map((r) => ({ etiqueta: r.nombre, valor: r.brotesPorHa, detalle: `${r.brotes} brotes · drenaje ${r.drenaje} · ${r.variedad}` }))}
            nombreValor="Brotes por ha"
            decimales={1}
          />
          {peor && mejor ? (
            <p className="mt-2 text-xs text-muted-foreground">
              <Link href={`/bloques/${peor.loteId}`} className="font-medium text-foreground underline">{peor.nombre}</Link> se enferma{" "}
              {mejor.brotesPorHa > 0 ? `${fmtNum(peor.brotesPorHa / mejor.brotesPorHa, 1)} veces más` : "mucho más"} que{" "}
              <Link href={`/bloques/${mejor.loteId}`} className="font-medium text-foreground underline">{mejor.nombre}</Link>.
            </p>
          ) : null}
        </Seccion>
        <Seccion titulo="¿Cada cuánto y qué tan grave?" descripcion="Días promedio entre un brote y el siguiente, severidad promedio y cuánto tarda en detectarse." className="lg:col-span-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bloque</TableHead>
                <TableHead className="text-right">Brotes</TableHead>
                <TableHead className="text-right">Se enferma cada</TableHead>
                <TableHead className="text-right">Severidad</TableHead>
                <TableHead className="text-right">Tarda en detectarse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((r) => (
                <TableRow key={r.loteId}>
                  <TableCell><Link href={`/bloques/${r.loteId}`} className="font-medium hover:underline">{r.nombre}</Link></TableCell>
                  <TableCell className="text-right tabular-nums">{r.brotes}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.diasEntreBrotes ? `${fmtNum(r.diasEntreBrotes, 0)} d` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(r.severidadProm, 1)} / 5</TableCell>
                  <TableCell className="text-right tabular-nums">{r.diasDeteccionProm !== null ? `${fmtNum(r.diasDeteccionProm, 1)} d` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Seccion>
      </div>

      <div className="mt-4">
        <Seccion titulo="¿En qué meses?" descripcion="Estacionalidad: los hongos suben con las lluvias y los trips en los meses secos.">
          <BarrasApiladas
            datos={porMesDatos}
            claveX="mes"
            series={ENFERMEDADES.map((e) => ({ clave: e, nombre: NOMBRE_ENFERMEDAD[e], color: COLOR_ENFERMEDAD[e] }))}
            formatoX="mes"
          />
        </Seccion>
      </div>


      <h2 className="mb-1 mt-8 text-base font-semibold">¿Por qué se enferman?</h2>
      <p className="mb-3 text-sm text-muted-foreground">Brotes por cada 100 bloque-días (un bloque observado un día) según el ambiente de los 5 días previos. Si una barra es el doble de alta, el brote es el doble de probable.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Humedad del aire" descripcion="Horas al día con humedad sobre 85 %. Los hongos suben con la humedad; los trips, al contrario, con el aire seco.">
          <SerieTiempo datos={aplanar(tasaAire)} series={seriesPlaga} claveX="rango" formatoX="texto" tipo="barra" decimalesY={1} alto={240} />
        </Seccion>
        <Seccion titulo="Temperatura" descripcion="Temperatura promedio del día. Botrytis prefiere el frío; Alternaria y trips, los días más cálidos.">
          <SerieTiempo datos={aplanar(tasaTemp)} series={seriesPlaga} claveX="rango" formatoX="texto" tipo="barra" decimalesY={1} alto={240} />
        </Seccion>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Drenaje del bloque" descripcion="Brotes por hectárea según la calidad del drenaje. Es la variable estructural: se corrige con obras, no con aplicaciones.">
          <BarrasHorizontales datos={drenaje.map((d) => ({ etiqueta: d.drenaje[0].toUpperCase() + d.drenaje.slice(1), valor: d.brotesPorHa, detalle: `${d.brotes} brotes en ${d.lotes} bloques` }))} nombreValor="Brotes por ha" color="var(--series-1)" decimales={1} />
        </Seccion>
        <Seccion titulo="Cómo leer esto" descripcion="Lo que estos datos sugieren para el manejo.">
          <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
            <li><span className="text-foreground">Humedad sostenida es el disparador de hongos.</span> Cuando el aire pasa más de 15 horas al día sobre 85 % durante varios días, conviene inspeccionar y hacer poda sanitaria antes de que aparezca el moho.</li>
            <li><span className="text-foreground">Los trips llegan con el tiempo seco.</span> En rachas secas revisar trampas azules y flores abiertas, sobre todo en Sharpblue y Ventura.</li>
            <li><span className="text-foreground">El drenaje pesa más que la variedad.</span> Los bloques con drenaje malo acumulan brotes de hongos todo el año. Mejorar canales es la inversión con mayor retorno.</li>
            <li><span className="text-foreground">El robot encuentra los hongos antes que la gente.</span> Su cámara pasa a la altura de la planta cada pocos días: Botrytis y Alternaria se ven con claridad; los trips cuestan más y conviene seguirlos también con trampas azules.</li>
          </ul>
        </Seccion>
      </div>
    </>
  );
}
