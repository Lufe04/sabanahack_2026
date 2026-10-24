import { PHOTO } from "@/lib/cultivos/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** JPEG de una captura, entre servidores (DASHBOARD_READ_API_KEY). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return PHOTO(request, id);
}
