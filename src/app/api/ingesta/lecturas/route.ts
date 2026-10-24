import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { verificarApiKey } from "@/lib/api/auth";

/**
 * POST /api/ingesta/lecturas
 * Body: { lecturas: [{ sensorId, ts, valor }] }  (hasta 5000 por llamada)
 * Es el endpoint que usarán los gateways de sensores reales.
 */
const esquema = z.object({
  lecturas: z
    .array(
      z.object({
        sensorId: z.string().min(1),
        ts: z.coerce.date(),
        valor: z.number().finite(),
      }),
    )
    .min(1)
    .max(5000),
});

export async function POST(req: Request) {
  const noAuth = verificarApiKey(req);
  if (noAuth) return noAuth;

  const parse = esquema.safeParse(await req.json().catch(() => null));
  if (!parse.success) return NextResponse.json({ error: "Body inválido", detalle: parse.error.flatten() }, { status: 400 });

  const db = getDb();
  const sensoresValidos = new Set((await db.select({ id: schema.sensores.id }).from(schema.sensores)).map((s) => s.id));
  const desconocidos = [...new Set(parse.data.lecturas.map((l) => l.sensorId).filter((id) => !sensoresValidos.has(id)))];
  if (desconocidos.length) return NextResponse.json({ error: "Sensores desconocidos", desconocidos }, { status: 422 });

  await db.insert(schema.lecturas).values(parse.data.lecturas);
  return NextResponse.json({ ok: true, insertadas: parse.data.lecturas.length });
}
