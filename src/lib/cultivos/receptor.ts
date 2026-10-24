import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import type { Puntuaciones } from "@/db/schema";

/** Límites del contrato con la APK 0.2.0. Vercel limita el cuerpo a 4,5 MB. */
export const MAX_JSON_BYTES = 3_500_000;
export const MAX_FOTO_BYTES = 2_000_000;

export class ErrorRecepcion extends Error {
  constructor(
    public status: number,
    public cuerpo: Record<string, unknown>,
  ) {
    super(String(cuerpo.error));
  }
}

// ---------- Utilidades ----------

/** JSON con llaves ordenadas: el mismo contenido produce siempre la misma huella. */
function canonico(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
    .join(",")}}`;
}

const huella = (v: unknown) => createHash("sha256").update(canonico(v)).digest("hex");

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Ubicación tolerante a los nombres de campo; nunca inventa coordenadas. */
function ubicacion(v: unknown): { lat: number; lng: number; precision: number | null } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const lat = num(o.lat ?? o.latitude);
  const lng = num(o.lng ?? o.lon ?? o.longitude);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, precision: num(o.accuracy_m ?? o.accuracy ?? o.precision_m ?? o.precision) };
}

const uuidOpcional = z.string().uuid().nullish();
const puntuacion = z.number().min(0).max(1);

const esquemaPuntuaciones = z.object({
  alternaria: puntuacion,
  botrytis: puntuacion,
  sana: puntuacion,
  trips: puntuacion,
});

const esquemaBase = z
  .object({
    id: z.string().uuid(),
    schema_version: z.number().int().nullish(),
    type: z.string().nullish(),
    captured_at: z.string().datetime({ offset: true }).nullish(),
  })
  .passthrough();

const esquemaObservacion = z
  .object({
    scores: esquemaPuntuaciones.nullish(),
    alert: z.boolean().nullish(),
    capture_mode: z.string().max(40).nullish(),
    model_version: z.string().max(120).nullish(),
    photo_filename: z.string().max(255).nullish(),
    photo_mime: z.string().max(60).nullish(),
    photo_base64: z.string().nullish(),
    route_context: z
      .object({
        inspection_id: uuidOpcional,
        plan_id: uuidOpcional,
        lot_id: z.string().max(60).nullish(),
        waypoint_id: uuidOpcional,
        location: z.unknown().nullish(),
      })
      .passthrough()
      .nullish(),
    lot_id: z.string().max(60).nullish(),
    location: z.unknown().nullish(),
  })
  .passthrough();

const esquemaRecorrido = z
  .object({
    route: z
      .object({
        id: z.string().uuid(),
        plan_id: uuidOpcional,
        lot_id: z.string().max(60).nullish(),
        name: z.string().max(200).nullish(),
        phase: z.string().max(40).nullish(),
        completed: z.union([z.boolean(), z.number()]).nullish(),
        revision: z.number().int().nonnegative().nullish(),
        updated_at: z.string().datetime({ offset: true }).nullish(),
        waypoints: z.array(z.unknown()).max(1000).nullish(),
      })
      .passthrough(),
  })
  .passthrough();

const PUNTO_HECHO = new Set(["completed", "complete", "done", "reviewed", "revisado", "completo"]);

function puntoCompletado(w: unknown): boolean {
  if (!w || typeof w !== "object") return false;
  const o = w as Record<string, unknown>;
  if (o.completed === true || o.done === true || o.reviewed === true) return true;
  if (typeof o.completed_at === "string" && o.completed_at) return true;
  const estado = String(o.status ?? o.state ?? "").toLowerCase();
  return PUNTO_HECHO.has(estado);
}

function detalleZod(e: z.ZodError) {
  return e.issues.slice(0, 10).map((i) => ({ campo: i.path.join("."), problema: i.message }));
}

async function validarLote(loteId: string | null) {
  if (!loteId) return;
  const db = getDb();
  const r = await db.execute(sql`SELECT id FROM lotes ORDER BY id`);
  const validos = (r.rows as { id: string }[]).map((x) => x.id);
  if (!validos.includes(loteId)) {
    throw new ErrorRecepcion(422, { error: "Lote desconocido", loteId, lotesValidos: validos });
  }
}

function decodificarFoto(b64: string | null | undefined, mime: string | null | undefined) {
  if (!b64) return null;
  if (b64.startsWith("data:")) {
    throw new ErrorRecepcion(400, { error: "photo_base64 debe venir sin prefijo data:" });
  }
  if (mime && mime.toLowerCase() !== "image/jpeg") {
    throw new ErrorRecepcion(415, { error: "Solo se aceptan fotos JPEG", photo_mime: mime });
  }
  const limpio = b64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(limpio)) throw new ErrorRecepcion(400, { error: "photo_base64 no es base64 válido" });
  const bytes = Buffer.from(limpio, "base64");
  if (bytes.length > MAX_FOTO_BYTES) {
    throw new ErrorRecepcion(413, { error: "Foto demasiado grande", bytes: bytes.length, maximo: MAX_FOTO_BYTES });
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new ErrorRecepcion(400, { error: "photo_base64 no contiene un JPEG" });
  }
  return bytes;
}

// ---------- Recepción ----------

export type ResultadoRecepcion = { status: 200 | 201; cuerpo: { id: string; status: "stored"; new: boolean } };

/**
 * Guarda un evento de la APK. Idempotente por UUID:
 * - UUID nuevo: inserta y responde 201 después del COMMIT.
 * - Mismo UUID y mismo contenido: 200 con new:false, sin insertar otra fila ni foto.
 * - Mismo UUID con contenido distinto: 409, no sobrescribe.
 */
export async function recibirEvento(crudo: string): Promise<ResultadoRecepcion> {
  if (Buffer.byteLength(crudo) > MAX_JSON_BYTES) {
    throw new ErrorRecepcion(413, { error: "JSON demasiado grande", maximo: MAX_JSON_BYTES });
  }
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    throw new ErrorRecepcion(400, { error: "JSON inválido" });
  }
  const base = esquemaBase.safeParse(cuerpo);
  if (!base.success) throw new ErrorRecepcion(400, { error: "Body inválido", detalle: detalleZod(base.error) });

  const id = base.data.id;
  const tipoEntrada = base.data.type ?? null;
  const firma = huella(cuerpo);
  const db = getDb();

  // Reintento: responder sin tocar nada.
  const previo = await db.execute(sql`SELECT huella FROM cultivos_registros WHERE id = ${id}`);
  if (previo.rows.length) return compararPrevio(id, previo.rows[0] as { huella: string }, firma);

  let fila: Record<string, unknown>;
  let recorrido: Record<string, unknown> | null = null;

  if (tipoEntrada === "route_snapshot") {
    const r = esquemaRecorrido.safeParse(cuerpo);
    if (!r.success) throw new ErrorRecepcion(400, { error: "Body inválido", detalle: detalleZod(r.error) });
    const route = r.data.route;
    const loteId = route.lot_id ?? null;
    await validarLote(loteId);
    const puntos = route.waypoints ?? [];
    const completados = typeof route.completed === "number" ? route.completed : puntos.filter(puntoCompletado).length;
    const fase = route.phase ?? null;
    const completa =
      route.completed === true || ["completed", "complete", "completo", "done"].includes(String(fase).toLowerCase()) || (puntos.length > 0 && completados >= puntos.length);
    const capturado = base.data.captured_at ?? route.updated_at ?? new Date().toISOString();
    fila = {
      tipo: "route_snapshot",
      capturado,
      loteId,
      inspectionId: route.id,
      planId: route.plan_id ?? null,
      waypointId: null,
      modelo: null,
      puntuaciones: null,
      alerta: false,
      modo: null,
      ubic: null,
      foto: null,
      fotoMime: null,
      fotoNombre: null,
    };
    recorrido = {
      inspectionId: route.id,
      planId: route.plan_id ?? null,
      loteId,
      nombre: route.name ?? null,
      fase,
      completados: Math.min(completados, Math.max(puntos.length, completados)),
      total: puntos.length,
      completa,
      revision: route.revision ?? 0,
      actualizadoEn: route.updated_at ?? capturado,
      puntos,
      datos: route,
    };
  } else {
    // observation, o captura de una versión anterior sin type
    const o = esquemaObservacion.safeParse(cuerpo);
    if (!o.success) throw new ErrorRecepcion(400, { error: "Body inválido", detalle: detalleZod(o.error) });
    const d = o.data;
    const ctx = d.route_context ?? null;
    const loteId = ctx?.lot_id ?? d.lot_id ?? null;
    await validarLote(loteId);
    const foto = decodificarFoto(d.photo_base64, d.photo_mime);
    const ubic = ubicacion(d.location) ?? ubicacion(ctx?.location);
    fila = {
      tipo: tipoEntrada === "observation" ? "observation" : "legacy",
      capturado: base.data.captured_at ?? new Date().toISOString(),
      loteId,
      inspectionId: ctx?.inspection_id ?? null,
      planId: ctx?.plan_id ?? null,
      waypointId: ctx?.waypoint_id ?? null,
      modelo: d.model_version ?? null,
      puntuaciones: (d.scores ?? null) as Puntuaciones | null,
      alerta: d.alert ?? false,
      modo: d.capture_mode ?? null,
      ubic,
      foto,
      fotoMime: foto ? "image/jpeg" : null,
      fotoNombre: foto ? (d.photo_filename ?? `${id}.jpg`) : null,
    };
  }

  // El payload se guarda completo salvo los bytes de la foto, que van en su columna.
  const datos = { ...(cuerpo as Record<string, unknown>) };
  if ("photo_base64" in datos) datos.photo_base64 = datos.photo_base64 ? "[guardada en columna foto]" : null;

  const insertado = await db.transaction(async (tx) => {
    const ubic = fila.ubic as ReturnType<typeof ubicacion>;
    const foto = fila.foto as Buffer | null;
    const res = await tx.execute(sql`
      INSERT INTO cultivos_registros (
        id, tipo, schema_version, capturado_en, lote_id, inspection_id, plan_id, waypoint_id,
        modelo, puntuaciones, alerta, modo_captura, lat, lng, precision_m,
        foto, foto_mime, foto_nombre, foto_bytes, datos, huella
      ) VALUES (
        ${id}, ${fila.tipo}, ${base.data.schema_version ?? null}, ${fila.capturado}, ${fila.loteId},
        ${fila.inspectionId}, ${fila.planId}, ${fila.waypointId},
        ${fila.modelo}, ${fila.puntuaciones ? JSON.stringify(fila.puntuaciones) : null}::jsonb,
        ${fila.alerta}, ${fila.modo}, ${ubic?.lat ?? null}, ${ubic?.lng ?? null}, ${ubic?.precision ?? null},
        ${foto}, ${fila.fotoMime}, ${fila.fotoNombre}, ${foto?.length ?? null},
        ${JSON.stringify(datos)}::jsonb, ${firma}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `);
    if (!res.rows.length) return false; // otro envío del mismo UUID ganó la carrera

    if (recorrido) {
      // Upsert que nunca retrocede: solo gana una revisión más nueva.
      await tx.execute(sql`
        INSERT INTO cultivos_recorridos (
          inspection_id, plan_id, lote_id, nombre, fase, completados, total, completa,
          revision, actualizado_en, puntos, datos, ultimo_evento_id
        ) VALUES (
          ${recorrido.inspectionId}, ${recorrido.planId}, ${recorrido.loteId}, ${recorrido.nombre}, ${recorrido.fase},
          ${recorrido.completados}, ${recorrido.total}, ${recorrido.completa},
          ${recorrido.revision}, ${recorrido.actualizadoEn},
          ${JSON.stringify(recorrido.puntos)}::jsonb, ${JSON.stringify(recorrido.datos)}::jsonb, ${id}
        )
        ON CONFLICT (inspection_id) DO UPDATE SET
          plan_id = excluded.plan_id, lote_id = excluded.lote_id, nombre = excluded.nombre, fase = excluded.fase,
          completados = excluded.completados, total = excluded.total, completa = excluded.completa,
          revision = excluded.revision, actualizado_en = excluded.actualizado_en,
          puntos = excluded.puntos, datos = excluded.datos, ultimo_evento_id = excluded.ultimo_evento_id,
          recibido_en = now()
        WHERE (excluded.revision, excluded.actualizado_en) > (cultivos_recorridos.revision, cultivos_recorridos.actualizado_en)
      `);
    }
    return true;
  });

  if (!insertado) {
    const otro = await db.execute(sql`SELECT huella FROM cultivos_registros WHERE id = ${id}`);
    return compararPrevio(id, otro.rows[0] as { huella: string }, firma);
  }
  return { status: 201, cuerpo: { id, status: "stored", new: true } };
}

function compararPrevio(id: string, previo: { huella: string }, firma: string): ResultadoRecepcion {
  if (previo.huella !== firma) {
    throw new ErrorRecepcion(409, { error: "UUID reutilizado con contenido diferente", id });
  }
  return { status: 200, cuerpo: { id, status: "stored", new: false } };
}
