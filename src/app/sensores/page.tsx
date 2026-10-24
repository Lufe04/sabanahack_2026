import Link from "next/link";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { SensorEstadoBadge } from "@/components/dashboard/badges";
import { SerieTiempo } from "@/components/charts/serie-tiempo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSensoresEstado, getSerieHorariaFinca } from "@/lib/queries/sensores";
import { COLOR_SENSOR, NOMBRE_SENSOR } from "@/lib/viz/palette";
import { fmtFechaHora, fmtHace, fmtNum } from "@/lib/format";
import type { TipoSensor } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function Sensores() {
  const [sensores, serie] = await Promise.all([getSensoresEstado(), getSerieHorariaFinca(72)]);
  const caidos = sensores.filter((s) => s.estado === "caido");
  const intermitentes = sensores.filter((s) => s.estado === "intermitente");
  const lecturas24h = sensores.reduce((a, s) => a + s.lecturas24h, 0);

  const horaria = (tipo: TipoSensor) =>
    serie.filter((p) => p.tipo === tipo).map((p) => ({ hora: p.hora, valor: p.valor }));

  return (
    <>
      <Encabezado titulo="Sensores" descripcion={`${sensores.length} sensores en ${new Set(sensores.map((s) => s.loteId)).size} lotes · lectura cada 30 minutos`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="Reportando" valor={sensores.length - caidos.length} detalle={`de ${sensores.length} sensores`} tono="bueno" />
        <Kpi etiqueta="Caídos" valor={caidos.length} detalle={caidos.length ? caidos.map((s) => s.id).join(", ") : "sin fallas"} tono={caidos.length ? "malo" : "bueno"} />
        <Kpi etiqueta="Intermitentes" valor={intermitentes.length} detalle="menos de 40 lecturas en 24 h" tono={intermitentes.length ? "malo" : "neutro"} />
        <Kpi etiqueta="Lecturas últimas 24 h" valor={fmtNum(lecturas24h)} detalle="en toda la finca" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {(["humedad_aire", "temperatura", "humedad_suelo"] as const).map((tipo) => (
          <Seccion key={tipo} titulo={NOMBRE_SENSOR[tipo]} descripcion="Promedio horario de la finca, últimas 72 h.">
            <SerieTiempo
              datos={horaria(tipo)}
              series={[{ clave: "valor", nombre: NOMBRE_SENSOR[tipo], color: COLOR_SENSOR[tipo], unidad: tipo === "temperatura" ? "°C" : "%" }]}
              claveX="hora"
              tipo="area"
              formatoX="fechaHora"
              dominioY={tipo === "humedad_aire" ? [30, 100] : ["auto", "auto"]}
              lineaRef={tipo === "humedad_aire" ? { y: 85, etiqueta: "umbral hongos" } : undefined}
            />
          </Seccion>
        ))}
      </div>

      <Seccion titulo="Estado de cada sensor" descripcion="Un sensor se marca caído si no reporta hace más de 6 horas." className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sensor</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Último valor</TableHead>
              <TableHead>Última lectura</TableHead>
              <TableHead className="text-right">Prom. 24 h</TableHead>
              <TableHead className="text-right">Mín / Máx 24 h</TableHead>
              <TableHead className="text-right">Lecturas 24 h</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sensores.map((s) => (
              <TableRow key={s.id} className={s.estado === "caido" ? "bg-destructive/5" : undefined}>
                <TableCell className="font-mono text-xs">{s.id}</TableCell>
                <TableCell><Link href={`/lotes/${s.loteId}`} className="hover:underline">{s.loteId} · {s.loteNombre}</Link></TableCell>
                <TableCell>{NOMBRE_SENSOR[s.tipo]}</TableCell>
                <TableCell><SensorEstadoBadge estado={s.estado} /></TableCell>
                <TableCell className="text-right tabular-nums">{s.ultimoValor !== null ? `${fmtNum(s.ultimoValor, 1)} ${s.unidad}` : "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground" title={s.ultimaLectura ? fmtFechaHora(s.ultimaLectura) : ""}>{fmtHace(s.ultimaLectura)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(s.prom24h, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{s.min24h !== null ? `${fmtNum(s.min24h, 1)} / ${fmtNum(s.max24h, 1)}` : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{s.lecturas24h}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Seccion>
    </>
  );
}
