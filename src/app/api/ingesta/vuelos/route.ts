import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { ENFERMEDADES } from "@/db/schema";
import { verificarApiKey } from "@/lib/api/auth";

/**
 * POST /api/ingesta/vuelos
 * Body: un vuelo de dron con sus detecciones. Lo enviará el pipeline de visión
 * después de procesar las imágenes.
 */
const esquema = z.object({
  loteId: z.string().min(1),
  dronId: z.string().min(1),
  fecha: z.coerce.date(),
  duracionMin: z.number().nonnegative(),
  coberturaPct: z.number().min(0).max(100),
  ndvi: z.number().min(-1).max(1),
  ndviMin: z.number().min(-1).max(1),
  areaAnomalaPct: z.number().min(0).max(100),
  imagenUrl: z.string().url().nullable().optional(),
  detecciones: z
    .array(
      z.object({
        enfermedad: z.enum(ENFERMEDADES),
        severidad: z.number().int().min(1).max(5),
        plantasAfectadasPct: z.number().min(0).max(100),
        lat: z.number(),
        lng: z.number(),
        confianza: z.number().min(0).max(1),
      }),
    )
    .default([]),
});

export async function POST(req: Request) {
  const noAuth = verificarApiKey(req);
  if (noAuth) return noAuth;

  const parse = esquema.safeParse(await req.json().catch(() => null));
  if (!parse.success) return NextResponse.json({ error: "Body inválido", detalle: parse.error.flatten() }, { status: 400 });
  const { detecciones, ...vuelo } = parse.data;

  const db = getDb();
  const resultado = await db.transaction(async (tx) => {
    const [v] = await tx.insert(schema.vuelosDron).values({ ...vuelo, imagenUrl: vuelo.imagenUrl ?? null }).returning({ id: schema.vuelosDron.id });
    if (detecciones.length) {
      await tx.insert(schema.detecciones).values(detecciones.map((d) => ({ ...d, vueloId: v.id, loteId: vuelo.loteId })));
    }
    return v.id;
  });
  return NextResponse.json({ ok: true, vueloId: resultado, detecciones: detecciones.length }, { status: 201 });
}
