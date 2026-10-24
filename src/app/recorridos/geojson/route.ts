import { geojsonRecorridos } from "@/lib/cultivos/servicio";

export const dynamic = "force-dynamic";

/**
 * GeoJSON de recorridos para los mapas del propio dashboard (polling desde el navegador).
 * No usa la clave entre servidores: en el MVP sin login tiene la misma visibilidad que el
 * resto del dashboard. Al agregar sesión, verificarla aquí y filtrar los lotes autorizados.
 */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const fc = await geojsonRecorridos(p.get("lote"), p.get("inspeccion"));
  return Response.json(fc, { headers: { "cache-control": "no-store" } });
}
