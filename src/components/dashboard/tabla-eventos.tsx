import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EnfermedadBadge, EstadoEventoBadge, OrigenBadge, Severidad } from "./badges";
import { fmtFecha, fmtPct } from "@/lib/format";
import type { EventoFila } from "@/lib/queries/lotes";

export function TablaEventos({ eventos, conLote = true, vacio = "Sin brotes registrados." }: { eventos: EventoFila[]; conLote?: boolean; vacio?: string }) {
  if (!eventos.length) return <p className="py-6 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {conLote ? <TableHead>Lote</TableHead> : null}
          <TableHead>Plaga</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Severidad</TableHead>
          <TableHead className="text-right">Área</TableHead>
          <TableHead>Inicio</TableHead>
          <TableHead>Detección</TableHead>
          <TableHead>Cierre</TableHead>
          <TableHead>Tratamiento</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {eventos.map((e) => (
          <TableRow key={e.id}>
            {conLote ? (
              <TableCell>
                <Link href={`/lotes/${e.loteId}`} className="font-medium hover:underline">
                  {e.loteId} · {e.loteNombre}
                </Link>
              </TableCell>
            ) : null}
            <TableCell><EnfermedadBadge enfermedad={e.enfermedad} /></TableCell>
            <TableCell><EstadoEventoBadge estado={e.estado} /></TableCell>
            <TableCell><Severidad nivel={e.severidadMax} /></TableCell>
            <TableCell className="text-right tabular-nums">{fmtPct(e.areaAfectadaPct, 1)}</TableCell>
            <TableCell className="whitespace-nowrap">{fmtFecha(e.fechaInicio)}</TableCell>
            <TableCell className="whitespace-nowrap">
              <div className="flex flex-col">
                <span>{fmtFecha(e.fechaDeteccion)}{e.diasDeteccion !== null ? <span className="text-muted-foreground"> (+{e.diasDeteccion} d)</span> : null}</span>
                <OrigenBadge origen={e.origen} />
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap">{fmtFecha(e.fechaFin)}</TableCell>
            <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={e.tratamiento ?? ""}>{e.tratamiento ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
