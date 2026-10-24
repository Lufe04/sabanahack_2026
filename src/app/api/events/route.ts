import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { POST as recibir, GET } from "@/lib/cultivos/servicio";
import { completarObservaciones } from "@/lib/cultivos/completar";
import { normalizarBloque } from "@/lib/cultivos/asignacion-mvp";
import { validate } from "@/lib/cultivos/adaptador/validation.mjs";

/**
 * Receptor de la APK Cultivos a bordo (adaptador 0.2.2).
 * POST: observaciones y estados de recorrido, con INGEST_API_KEY.
 * GET: consulta entre servidores con DASHBOARD_READ_API_KEY. Nunca desde el navegador.
 *
 * Cada POST queda en `cultivos_intentos` (sin cuerpo ni foto) para diagnosticar la conexión.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { GET };

/**
 * Los bloques se llamaban L01 a L10. Si una app con el catálogo viejo envía "L01", se traduce
 * a "B01" antes de validar. La traducción es determinista: un reintento del mismo envío produce
 * el mismo contenido y la idempotencia por UUID se mantiene.
 */
function traducirCodigos(cuerpo: ArrayBuffer): ArrayBuffer {
  try {
    const e = JSON.parse(new TextDecoder().decode(cuerpo)) as Record<string, unknown>;
    let cambio = false;
    for (const obj of [e.route_context, e.route, e] as ({ lot_id?: unknown } | null | undefined)[]) {
      if (obj && typeof obj.lot_id === "string" && /^L\d{2}$/i.test(obj.lot_id)) {
        obj.lot_id = normalizarBloque(obj.lot_id);
        cambio = true;
      }
    }
    return cambio ? (new TextEncoder().encode(JSON.stringify(e)).buffer as ArrayBuffer) : cuerpo;
  } catch {
    return cuerpo; // el receptor responderá 400 por JSON inválido
  }
}

/** Devuelve el UUID si ese contenido original (sin traducir) ya está guardado con la misma huella. */
async function yaGuardadoSinTraducir(original: ArrayBuffer): Promise<string | null> {
  try {
    const { event, hash } = validate(JSON.parse(new TextDecoder().decode(original))) as { event: { id: string }; hash: string };
    const r = await getDb().execute(sql`SELECT id FROM cultivos_registros WHERE id = ${event.id} AND data_hash = ${hash}`);
    return r.rows.length ? event.id : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const original = await request.arrayBuffer();
  const cuerpo = traducirCodigos(original);
  const enviar = (body: ArrayBuffer) =>
    recibir(new Request(request.url, { method: "POST", headers: request.headers, body: body.byteLength ? body : undefined }));
  let respuesta = await enviar(cuerpo);
  // Un reintento de algo guardado antes de la traducción (con "L01") coincide con el
  // contenido original: se confirma como ya guardado en vez de responder 409.
  if (respuesta.status === 409 && cuerpo !== original) {
    const previo = await yaGuardadoSinTraducir(original);
    if (previo) respuesta = Response.json({ id: previo, status: "stored", new: false }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
  await registrarIntento(request, cuerpo, respuesta.clone()).catch((e) => console.error("No se pudo registrar el intento", e));
  // La app aún no envía bloque ni cama: se completan con la asignación fija del MVP.
  if (respuesta.status === 200 || respuesta.status === 201) {
    const ack = (await respuesta.clone().json().catch(() => null)) as { id?: string } | null;
    if (ack?.id) await completarObservaciones({ id: ack.id }).catch((e) => console.error("No se pudo completar la captura", e));
  }
  console.log(`POST /api/events -> ${respuesta.status} (${cuerpo.byteLength} bytes)`);
  return respuesta;
}

async function registrarIntento(request: Request, cuerpo: ArrayBuffer, respuesta: Response) {
  let eventoId: string | null = null;
  let tipo: string | null = null;
  let loteId: string | null = null;
  try {
    const e = JSON.parse(new TextDecoder().decode(cuerpo)) as Record<string, unknown>;
    eventoId = typeof e.id === "string" ? e.id.slice(0, 64) : null;
    tipo = typeof e.type === "string" ? e.type.slice(0, 40) : e.id ? "observation (sin type)" : null;
    const ctx = e.route_context as Record<string, unknown> | undefined;
    const ruta = e.route as Record<string, unknown> | undefined;
    const lote = ctx?.lot_id ?? ruta?.lot_id;
    loteId = typeof lote === "string" ? lote.slice(0, 80) : null;
  } catch {
    tipo = "no es JSON";
  }
  let error: string | null = null;
  if (respuesta.status >= 400) {
    const j = (await respuesta.json().catch(() => null)) as { error?: string } | null;
    error = j?.error?.slice(0, 300) ?? `HTTP ${respuesta.status}`;
  }
  const auth = request.headers.get("authorization") ?? request.headers.get("x-api-key") ?? "";
  await getDb().execute(sql`
    INSERT INTO cultivos_intentos (estado, error, evento_id, tipo, lote_id, bytes, con_token, agente)
    VALUES (${respuesta.status}, ${error}, ${eventoId}, ${tipo}, ${loteId}, ${cuerpo.byteLength}, ${auth.length > 0}, ${(request.headers.get("user-agent") ?? "").slice(0, 160)})
  `);
  // Mantener la bitácora acotada
  await getDb().execute(sql`DELETE FROM cultivos_intentos WHERE recibido_en < now() - interval '14 days'`);
}
