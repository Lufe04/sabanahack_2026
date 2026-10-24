/**
 * Conecta el adaptador "Integracion_dashboard 0.2.2" (src/lib/cultivos/adaptador, copiado
 * casi sin cambios) con el dashboard:
 * - usa el pool `pg` del proyecto (TLS verificado hacia Neon, zona horaria de Colombia),
 * - valida los lotes contra `lotes`, el mismo catálogo que publica /api/lotes.
 */
import { getPool } from "@/db";
import { handlers } from "./adaptador/http.mjs";
import { makeRepository } from "./adaptador/repository.mjs";

export type FeatureCollectionRecorridos = {
  type: "FeatureCollection";
  features: { type: "Feature"; id: string; geometry: unknown; properties: Record<string, unknown> }[];
  omitted_routes?: { inspection_id: string; lot_id: string; reason: string }[];
};

type Repositorio = {
  mapRoutes(lote: string | null): Promise<FeatureCollectionRecorridos>;
  photo(id: string): Promise<Buffer | null>;
};

let repositorio: Repositorio | null = null;

export async function getRepositorio(): Promise<Repositorio> {
  if (!repositorio) repositorio = makeRepository(getPool(), { tablaLotes: "lotes" }) as Repositorio;
  return repositorio;
}

type Handler = (req: Request, ...args: unknown[]) => Promise<Response>;
const h = handlers(getRepositorio) as { POST: Handler; GET: Handler; MAP: Handler; PHOTO: (req: Request, id: string) => Promise<Response> };

export const { POST, GET, MAP, PHOTO } = h;

/** GeoJSON para los mapas del dashboard, filtrado por lote y, opcionalmente, por revisión. */
export async function geojsonRecorridos(lote?: string | null, inspeccion?: string | null): Promise<FeatureCollectionRecorridos> {
  const fc = await (await getRepositorio()).mapRoutes(lote ?? null);
  if (!inspeccion) return fc;
  return {
    ...fc,
    features: fc.features.filter((f) => f.properties.inspection_id === inspeccion),
    omitted_routes: (fc.omitted_routes ?? []).filter((r) => r.inspection_id === inspeccion),
  };
}
