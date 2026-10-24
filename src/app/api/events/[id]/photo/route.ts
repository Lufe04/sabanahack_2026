import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { verificarClave } from "@/lib/api/auth";

/** GET /api/events/{id}/photo — JPEG de una captura, entre servidores. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const noAuth = verificarClave(req, "DASHBOARD_READ_API_KEY");
  if (noAuth) return noAuth;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "UUID inválido" }, { status: 400 });
  const r = await getDb().execute(sql`SELECT foto FROM cultivos_registros WHERE id = ${id} AND foto IS NOT NULL`);
  if (!r.rows.length) return NextResponse.json({ error: "Sin foto" }, { status: 404 });
  const foto = (r.rows[0] as { foto: Buffer }).foto;
  return new Response(new Uint8Array(foto), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" },
  });
}
