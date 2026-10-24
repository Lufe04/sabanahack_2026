/** Tipos mínimos del módulo del adaptador `leaflet-routes.mjs` (copiado sin cambios). */
export function attachRoutesLayer(
  L: unknown,
  map: unknown,
  opciones?: { onPointClick?: (p: Record<string, unknown>) => void; onError?: (e: unknown) => void; showBoundaries?: boolean },
): {
  setData(data: unknown): unknown[];
  fit(): void;
  startPolling(load: () => Promise<unknown>, intervalMs?: number): void;
  destroy(): void;
};
