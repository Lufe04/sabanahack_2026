import { NextResponse } from "next/server";

/** Autenticación simple por token para la API de ingesta (dron, sensores). */
export function verificarApiKey(req: Request): NextResponse | null {
  const esperado = process.env.INGEST_API_KEY;
  if (!esperado) return NextResponse.json({ error: "INGEST_API_KEY no configurada en el servidor" }, { status: 500 });
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-api-key");
  if (token !== esperado) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return null;
}

/** Vercel Cron envía `Authorization: Bearer <CRON_SECRET>`. */
export function verificarCron(req: Request): NextResponse | null {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${esperado}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return null;
}
