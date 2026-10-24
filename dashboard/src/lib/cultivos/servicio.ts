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

// MAP (feed GeoJSON de recorridos) no se expone: los recorridos ya no se muestran.
export const { POST, GET, PHOTO } = h;
