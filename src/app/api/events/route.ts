import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { verificarApiKey, verificarClave } from "@/lib/api/auth";
import { ErrorRecepcion, recibirEvento } from "@/lib/cultivos/receptor";

export const maxDuration = 60;

/**
 * POST /api/events — receptor de la APK "Cultivos a bordo" 0.2.0.
 * Observaciones (cuatro puntuaciones, foto opcional) y estados de recorrido.
 * Contrato completo en docs/INTEGRACION.md.
 */
export async function POST(req: Request) {
  const noAuth = verificarApiKey(req);
  if (noAuth) return noAuth;
  try {
    const r = await recibirEvento(await req.text());
    return NextResponse.json(r.cuerpo, { status: r.status });
  } catch (e) {
    if (e instanceof ErrorRecepcion) return NextResponse.json(e.cuerpo, { status: e.status });
    console.error("Error en /api/events", e);
    return NextResponse.json({ error: "Error interno; reintentar" }, { status: 500 });
  }
}

/**
 * GET /api/events?after=0&lote=L01 — consulta entre servidores.
 * Requiere DASHBOARD_READ_API_KEY. Nunca usar esta clave desde el navegador.
 */
export async function GET(req: Request) {
  const noAuth = verificarClave(req, "DASHBOARD_READ_API_KEY");
  if (noAuth) return noAuth;
  const url = new URL(req.url);
  const after = Math.max(0, Number(url.searchParams.get("after") ?? 0) || 0);
  const lote = url.searchParams.get("lote");
  const limite = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));

  const res = await getDb().execute(sql`
    SELECT id, seq, tipo, schema_version, capturado_en, recibido_en, lote_id, inspection_id, plan_id, waypoint_id,
           modelo, puntuaciones, alerta, modo_captura, lat, lng, precision_m,
           (foto IS NOT NULL) AS tiene_foto, foto_mime, foto_bytes, revision_humana, datos
    FROM cultivos_registros
    WHERE seq > ${after} ${lote ? sql`AND lote_id = ${lote}` : sql``}
    ORDER BY seq
    LIMIT ${limite}
  `);
  const registros = res.rows as { seq: number }[];
  return NextResponse.json({
    registros,
    siguiente: registros.length === limite ? registros[registros.length - 1].seq : null,
  });
}
