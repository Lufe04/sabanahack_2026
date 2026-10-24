"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Polygon, Tooltip, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import { COLOR_RIESGO, nivelRiesgo, ETIQUETA_RIESGO, COLOR_ENFERMEDAD, NOMBRE_ENFERMEDAD } from "@/lib/viz/palette";
import type { Enfermedad } from "@/db/schema";

export type LoteMapa = {
  id: string;
  nombre: string;
  poligono: [number, number][];
  indiceRiesgo: number;
  eventosActivos: number;
};

export type PuntoDeteccion = { lat: number; lng: number; enfermedad: Enfermedad; severidad: number };

type Props = {
  lotes: LoteMapa[];
  centro: { lat: number; lng: number };
  zoom?: number;
  alto?: number;
  detecciones?: PuntoDeteccion[];
  interactivo?: boolean;
  /** Etiquetas cortas (solo código y riesgo) para mapas pequeños. */
  compacto?: boolean;
};

/** Ajusta el encuadre a los polígonos (zoom fraccionario para aprovechar el espacio). */
function Encuadre({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [map, bounds]);
  return null;
}

export function MapaLotes({ lotes, centro, zoom = 17, alto = 360, detecciones = [], interactivo = true, compacto = false }: Props) {
  const router = useRouter();
  // Encuadre automático: todos los polígonos visibles con un margen
  const puntos = lotes.flatMap((l) => l.poligono);
  const lats = puntos.map((p) => p[0]);
  const lngs = puntos.map((p) => p[1]);
  const bounds: [[number, number], [number, number]] | undefined =
    puntos.length > 0 ? [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]] : undefined;
  return (
    <div style={{ height: alto }} className="overflow-hidden rounded-md border border-border">
      <MapContainer
        center={[centro.lat, centro.lng]}
        zoom={zoom}
        zoomSnap={0.25}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        {bounds ? <Encuadre bounds={bounds} /> : null}
        <TileLayer
          attribution="Imágenes &copy; Esri, Maxar, Earthstar Geographics"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={20}
          maxNativeZoom={18}
        />
        {lotes.map((l) => {
          const nivel = nivelRiesgo(l.indiceRiesgo);
          const color = COLOR_RIESGO[nivel];
          return (
            <Polygon
              key={l.id}
              positions={l.poligono}
              pathOptions={{ color, weight: 2.5, fillColor: color, fillOpacity: 0.35 }}
              eventHandlers={interactivo ? { click: () => router.push(`/lotes/${l.id}`) } : undefined}
            >
              <Tooltip direction="center" permanent className="!border-0 !bg-transparent !p-0 !shadow-none">
                {compacto ? (
                  <span className="flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] leading-tight text-foreground">
                    <span className="font-medium">{l.id}</span>
                    <span style={{ color }} className="font-semibold tabular-nums">{l.indiceRiesgo}</span>
                    {l.eventosActivos ? <span className="text-muted-foreground">· {l.eventosActivos}🐛</span> : null}
                  </span>
                ) : (
                  <span className="flex flex-col items-center rounded bg-background/90 px-1.5 py-0.5 text-[11px] leading-tight text-foreground">
                    <span className="font-medium">{l.id} · {l.nombre}</span>
                    <span className="text-muted-foreground">
                      {ETIQUETA_RIESGO[nivel]} {l.indiceRiesgo}
                      {l.eventosActivos ? ` · ${l.eventosActivos} brote${l.eventosActivos > 1 ? "s" : ""}` : ""}
                    </span>
                  </span>
                )}
              </Tooltip>
            </Polygon>
          );
        })}
        {detecciones.map((d, i) => (
          <CircleMarker
            key={i}
            center={[d.lat, d.lng]}
            radius={4 + d.severidad}
            pathOptions={{ color: "var(--viz-surface)", weight: 1.5, fillColor: COLOR_ENFERMEDAD[d.enfermedad], fillOpacity: 0.9 }}
          >
            <Tooltip>
              <span className="text-xs">{NOMBRE_ENFERMEDAD[d.enfermedad]} · severidad {d.severidad}</span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
