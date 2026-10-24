"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Polygon, Polyline, ImageOverlay, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import { COLOR_RIESGO, nivelRiesgo, ETIQUETA_RIESGO } from "@/lib/viz/palette";

export type LoteMapa = {
  id: string;
  nombre: string;
  poligono: [number, number][];
  indiceRiesgo: number;
  eventosActivos: number;
};

type Props = {
  lotes: LoteMapa[];
  centro: { lat: number; lng: number };
  zoom?: number;
  alto?: number;
  interactivo?: boolean;
  /** Etiquetas cortas (solo código y riesgo) para mapas pequeños. */
  compacto?: boolean;
  /** Color y etiqueta por bloque para colorear el mapa según otra variable (mapa de calor). */
  colores?: Record<string, { color: string; texto: string }>;
  /** Imagen de mapa de calor por bloque (data URL), dibujada dentro de su contorno. */
  imagenes?: Record<string, string>;
  /** Líneas de las naves de cada invernadero. */
  naves?: Record<string, [number, number][][]>;
};

/** Ajusta el encuadre a los polígonos (zoom fraccionario para aprovechar el espacio). */
function Encuadre({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [map, bounds]);
  return null;
}

export function MapaLotes({ lotes, centro, zoom = 17, alto = 360, interactivo = true, compacto = false, colores, imagenes, naves }: Props) {
  const router = useRouter();
  // Encuadre automático: todos los polígonos visibles con un margen
  const puntos = lotes.flatMap((l) => l.poligono);
  const lats = puntos.map((p) => p[0]);
  const lngs = puntos.map((p) => p[1]);
  const bounds: [[number, number], [number, number]] | undefined =
    puntos.length > 0 ? [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]] : undefined;
  return (
    <div>
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
        {imagenes
          ? lotes.map((l) => {
              const url = imagenes[l.id];
              if (!url) return null;
              const lats = l.poligono.map((p) => p[0]);
              const lngs = l.poligono.map((p) => p[1]);
              return (
                <ImageOverlay
                  key={`calor-${l.id}-${url.length}`}
                  url={url}
                  bounds={[[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]}
                  opacity={0.9}
                />
              );
            })
          : null}
        {naves
          ? lotes.flatMap((l) => (naves[l.id] ?? []).map((linea, i) => (
              <Polyline key={`nave-${l.id}-${i}`} positions={linea} pathOptions={{ color: "#ffffff", weight: 0.8, opacity: 0.7, interactive: false }} />
            )))
          : null}
        {lotes.map((l) => {
          const nivel = nivelRiesgo(l.indiceRiesgo);
          const color = colores?.[l.id]?.color ?? COLOR_RIESGO[nivel];
          const texto = colores?.[l.id]?.texto ?? String(l.indiceRiesgo);
          return (
            <Polygon
              key={l.id}
              positions={l.poligono}
              pathOptions={imagenes?.[l.id] ? { color: "#ffffff", weight: 2, fillOpacity: 0 } : { color, weight: 2.5, fillColor: color, fillOpacity: colores ? 0.55 : 0.35 }}
              eventHandlers={interactivo ? { click: () => router.push(`/bloques/${l.id}`) } : undefined}
            >
              <Tooltip direction="center" permanent className="!border-0 !bg-transparent !p-0 !shadow-none">
                {compacto ? (
                  <span className="flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] leading-tight text-foreground">
                    <span className="font-medium">{l.id}</span>
                    <span className="font-semibold tabular-nums">{texto}</span>
                    {l.eventosActivos ? <span className="text-muted-foreground">· {l.eventosActivos}🐛</span> : null}
                  </span>
                ) : (
                  <span className="flex flex-col items-center rounded bg-background/90 px-1.5 py-0.5 text-[11px] leading-tight text-foreground">
                    <span className="font-medium">{l.id} · {l.nombre}</span>
                    <span className="text-muted-foreground">
                      {colores ? texto : `${ETIQUETA_RIESGO[nivel]} ${l.indiceRiesgo}`}
                      {l.eventosActivos ? ` · ${l.eventosActivos} brote${l.eventosActivos > 1 ? "s" : ""}` : ""}
                    </span>
                  </span>
                )}
              </Tooltip>
            </Polygon>
          );
        })}
      </MapContainer>
    </div>
    </div>
  );
}
