import Link from "next/link";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { SensorEstadoBadge } from "@/components/dashboard/badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSensoresEstado } from "@/lib/queries/sensores";
import { NOMBRE_SENSOR } from "@/lib/viz/palette";
import { fmtFechaHora, fmtHace, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

const ORDEN_ESTADO = { caido: 0, intermitente: 1, ok: 2 } as const;

export default async function Sensores() {
  const sensores = await getSensoresEstado();
  const caidos = sensores.filter((s) => s.estado === "caido");
  const intermitentes = sensores.filter((s) => s.estado === "intermitente");


  return (
    <>
      <Encabezado titulo="Sensores" descripcion={`${sensores.length} sensores en ${new Set(sensores.map((s) => s.loteId)).size} bloques · lectura cada 30 minutos`} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi etiqueta="Reportando" valor={sensores.length - caidos.length} detalle={`de ${sensores.length} sensores`} tono="bueno" />
        <Kpi etiqueta="Caídos" valor={caidos.length} detalle={caidos.length ? caidos.map((s) => s.id).join(", ") : "sin fallas"} tono={caidos.length ? "malo" : "bueno"} />
        <Kpi etiqueta="Intermitentes" valor={intermitentes.length} detalle="menos de 40 lecturas en 24 h" tono={intermitentes.length ? "malo" : "neutro"} />
      </div>


      <Seccion titulo="Estado de cada sensor" descripcion="Primero los que tienen problemas. Un sensor se marca caído si no reporta hace más de 6 horas." className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sensor</TableHead>
              <TableHead>Bloque</TableHead>
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
            {[...sensores].sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || a.id.localeCompare(b.id)).map((s) => (
              <TableRow key={s.id} className={s.estado === "caido" ? "bg-destructive/5" : undefined}>
                <TableCell className="font-mono text-xs">{s.id}</TableCell>
                <TableCell><Link href={`/bloques/${s.loteId}`} className="hover:underline">{s.loteId} · {s.loteNombre}</Link></TableCell>
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
