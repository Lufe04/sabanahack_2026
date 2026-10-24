"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { attachRoutesLayer } from "./leaflet-routes.mjs";

export type FeatureCollectionRecorridos = {
  type: "FeatureCollection";
  features: { type: "Feature"; id: string; geometry: unknown; properties: Record<string, unknown> }[];
  omitted_routes?: unknown[];
};

export type PuntoSeleccionado = Record<string, unknown>;

type Props = {
  /** GeoJSON inicial, ya consultado en el servidor. */
  inicial: FeatureCollectionRecorridos;
  /** Ruta del propio dashboard para refrescar el progreso. */
  url: string;
  intervaloMs?: number;
  encuadrar?: boolean;
  onPunto?: (p: PuntoSeleccionado) => void;
};

/**
 * Monta la capa del adaptador (`leaflet-routes.mjs`) sobre la instancia Leaflet existente.
 * No crea otro mapa ni cambia el fondo satelital.
 */
export function CapaRecorridos({ inicial, url, intervaloMs = 10000, encuadrar = false, onPunto }: Props) {
  const map = useMap();
  const onPuntoRef = useRef(onPunto);
  useEffect(() => {
    onPuntoRef.current = onPunto;
  }, [onPunto]);

  useEffect(() => {
    const overlay = attachRoutesLayer(L, map, {
      onPointClick: (p: PuntoSeleccionado) => onPuntoRef.current?.(p),
      onError: (e: unknown) => console.warn("No se pudo actualizar el recorrido", e),
    });
    overlay.setData(inicial);
    if (encuadrar && inicial.features.length) overlay.fit();
    overlay.startPolling(async () => {
      const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }, intervaloMs);
    return () => overlay.destroy();
    // El GeoJSON inicial solo se usa al montar; luego manda el polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, url, intervaloMs, encuadrar]);

  return null;
}
