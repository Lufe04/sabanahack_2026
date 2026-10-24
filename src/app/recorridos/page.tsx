import Link from "next/link";
import { Route } from "lucide-react";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { FaseRecorrido, Progreso } from "@/components/dashboard/fase-recorrido";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRecorridos } from "@/lib/queries/cultivos";
import { fmtFecha } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Recorridos({ searchParams }: { searchParams: Promise<{ lote?: string }> }) {
  const { lote } = await searchParams;
  const recorridos = await getRecorridos(lote || undefined);
  return (
    <>
      <Encabezado
        titulo="Recorridos de inspección"
        descripcion="Revisiones asistidas registradas en la app. Completo significa que se revisaron todos los puntos que definió el técnico, no toda la superficie del lote."
      />
      <Seccion titulo={`${recorridos.length} revisiones`} descripcion="Se muestra la versión más reciente de cada revisión. Una actualización vieja que llega tarde no hace retroceder el progreso.">
        {recorridos.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Revisión</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Progreso</TableHead>
                <TableHead className="text-right">Lecturas</TableHead>
                <TableHead className="text-right">Alertas</TableHead>
                <TableHead className="text-right">Actualizada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recorridos.map((r) => (
                <TableRow key={r.inspectionId}>
                  <TableCell>
                    <Link href={`/recorridos/${r.inspectionId}`} className="font-medium hover:underline">{r.nombre ?? r.inspectionId.slice(0, 8)}</Link>
                    <div className="text-[11px] text-muted-foreground">plan {r.planId?.slice(0, 8) ?? "—"}</div>
                  </TableCell>
                  <TableCell>{r.loteId ? <Link href={`/lotes/${r.loteId}`} className="hover:underline">{r.loteId}</Link> : "—"}</TableCell>
                  <TableCell><FaseRecorrido fase={r.fase} completa={r.completa} /></TableCell>
                  <TableCell><Progreso completados={r.completados} total={r.total} /></TableCell>
                  <TableCell className="text-right tabular-nums">{r.lecturas}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.alertas || <span className="text-muted-foreground">0</span>}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{fmtFecha(r.actualizadoEn, "d MMM, HH:mm")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Route className="size-6" />
            Aún no llega ningún recorrido. Aparecen cuando la app envía el estado de una revisión.
          </div>
        )}
      </Seccion>
    </>
  );
}
