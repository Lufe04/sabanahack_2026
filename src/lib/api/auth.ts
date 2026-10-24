import { NextResponse } from "next/server";

import { timingSafeEqual } from "node:crypto";

function tokenDe(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : req.headers.get("x-api-key");
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Valida `Authorization: Bearer <clave>` o `x-api-key: <clave>` contra una variable de entorno. */
export function verificarClave(req: Request, variable: "INGEST_API_KEY" | "DASHBOARD_READ_API_KEY"): NextResponse | null {
  const esperado = process.env[variable];
  if (!esperado) return NextResponse.json({ error: `${variable} no configurada en el servidor` }, { status: 500 });
  const token = tokenDe(req);
  if (!token || !iguales(token, esperado)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return null;
}

/** Autenticación de la API de ingesta (dron, sensores, APK). */
export function verificarApiKey(req: Request): NextResponse | null {
  return verificarClave(req, "INGEST_API_KEY");
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
