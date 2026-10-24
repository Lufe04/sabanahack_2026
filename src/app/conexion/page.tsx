import { sql } from "drizzle-orm";
import { CheckCircle2, XCircle, Radio } from "lucide-react";
import { getDb } from "@/db";
import { Encabezado, Seccion } from "@/components/dashboard/encabezado";
import { Kpi } from "@/components/dashboard/kpi";
import { AutoRecarga } from "@/components/dashboard/auto-recarga";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtFecha, fmtHace, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

type Intento = { id: number; recibidoEn: string; estado: number; error: string | null; eventoId: string | null; tipo: string | null; loteId: string | null; bytes: number | null; conToken: boolean; agente: string | null };

/** Qué significa cada respuesta y qué hacer en la app. */
const SIGNIFICADO: Record<number, string> = {
  201: "Guardado.",
  200: "Ya estaba guardado; era un reintento.",
  400: "El contenido no cumple el contrato. La app bloquea ese registro hasta corregir y guardar Receptor.",
  401: "Token incorrecto o vacío. Revisa el token en Receptor.",
  409: "Ese UUID ya existe con otro contenido.",
  413: "El envío supera 3,5 MB.",
  415: "La app no envió JSON.",
  422: "El bloque no está en el catálogo. Importa los bloques de nuevo y usa L01 a L10.",
  500: "Error del servidor. La app reintenta sola.",
  503: "El receptor no tiene token configurado.",
};

export default async function Conexion() {
  const db = getDb();
  const [intentos, resumen] = await Promise.all([
    db.execute(sql`
      SELECT id, to_char(recibido_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "recibidoEn", estado, error,
             evento_id AS "eventoId", tipo, lote_id AS "loteId", bytes, con_token AS "conToken", agente
      FROM cultivos_intentos ORDER BY id DESC LIMIT 60`),
    db.execute(sql`
      SELECT count(*) FILTER (WHERE recibido_en > now() - interval '1 hour')::int AS hora,
             count(*) FILTER (WHERE recibido_en > now() - interval '1 hour' AND estado IN (200, 201))::int AS aceptados,
             count(*) FILTER (WHERE recibido_en > now() - interval '1 hour' AND estado >= 400)::int AS rechazados,
             to_char(max(recibido_en) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ultimo
      FROM cultivos_intentos`),
  ]);
  const filas = intentos.rows as Intento[];
  const r = resumen.rows[0] as { hora: number; aceptados: number; rechazados: number; ultimo: string | null };

  return (
    <>
      <AutoRecarga segundos={5} />
      <Encabezado
        titulo="Conexión con la app"
        descripcion="Cada intento de la app de enviar datos, aceptado o rechazado. Se actualiza sola cada 5 segundos."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Último contacto" valor={r.ultimo ? fmtHace(r.ultimo) : "nunca"} detalle={r.ultimo ? fmtFecha(r.ultimo, "d MMM, HH:mm:ss") : "la app no ha llamado a este servidor"} tono={r.ultimo ? "bueno" : "malo"} />
        <Kpi etiqueta="Intentos última hora" valor={fmtNum(r.hora)} />
        <Kpi etiqueta="Aceptados" valor={fmtNum(r.aceptados)} tono="bueno" />
        <Kpi etiqueta="Rechazados" valor={fmtNum(r.rechazados)} tono={r.rechazados ? "malo" : "neutro"} detalle={r.rechazados ? "mira el motivo abajo" : undefined} />
      </div>

      <Seccion titulo="Intentos recientes" className="mt-4" descripcion="Si la app dice que envió algo y aquí no aparece nada, el envío nunca salió del teléfono o fue a otra dirección.">
        {filas.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Qué era</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Tamaño</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="whitespace-nowrap">{fmtFecha(f.recibidoEn, "HH:mm:ss")}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {f.estado < 300 ? (
                      <span className="inline-flex items-center gap-1 text-[var(--status-good-text)]"><CheckCircle2 className="size-4" />{f.estado}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[var(--status-critical)]"><XCircle className="size-4" />{f.estado}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {f.tipo ?? "—"}{f.loteId ? ` · ${f.loteId}` : ""}
                    {!f.conToken ? <div className="text-[11px] text-[var(--status-critical)]">sin token</div> : null}
                  </TableCell>
                  <TableCell className="max-w-md text-sm">
                    {f.error ? <span className="font-medium">{f.error}</span> : null}
                    <div className="text-xs text-muted-foreground">{SIGNIFICADO[f.estado] ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{f.bytes !== null ? `${fmtNum(f.bytes / 1024, 1)} KB` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Radio className="size-6" />
            <p>Todavía no hay ningún intento. La app no ha llamado a <code>/api/events</code> en este servidor.</p>
          </div>
        )}
      </Seccion>
    </>
  );
}
