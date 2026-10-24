import { getFoto } from "@/lib/queries/cultivos";

/**
 * Foto de una captura para las pantallas del dashboard.
 * Sin login en el MVP: tiene la misma visibilidad que el resto del dashboard.
 * Cuando exista sesión, esta ruta debe verificarla antes de responder.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const foto = await getFoto(id);
  if (!foto) return new Response("Sin foto", { status: 404 });
  return new Response(new Uint8Array(foto), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400, immutable" },
  });
}
