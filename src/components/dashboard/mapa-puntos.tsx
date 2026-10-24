"use client";

import { Fragment, useEffect } from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type PuntoMapa = { id: string; orden: number; lat: number; lng: number; precisionM: number | null; completado: boolean; etiqueta: string };

function Encuadre({ puntos }: { puntos: PuntoMapa[] }) {
  const map = useMap();
  useEffect(() => {
    if (!puntos.length) return;
    const lats = puntos.map((p) => p.lat);
    const lngs = puntos.map((p) => p.lng);
    map.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [40, 40], maxZoom: 20 });
  }, [map, puntos]);
  return null;
}

/** Solo puntos con GPS real. El círculo claro es la precisión reportada por el teléfono. */
export function MapaPuntos({ puntos, alto = 360 }: { puntos: PuntoMapa[]; alto?: number }) {
  const centro = puntos[0] ?? { lat: 4.99, lng: -73.9 };
  return (
    <div style={{ height: alto }} className="overflow-hidden rounded-md border border-border">
      <MapContainer center={[centro.lat, centro.lng]} zoom={18} zoomSnap={0.25} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution="Imágenes &copy; Esri, Maxar, Earthstar Geographics" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={21} maxNativeZoom={18} />
        <Encuadre puntos={puntos} />
        <Polyline positions={puntos.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#ffffff", weight: 1.5, opacity: 0.7, dashArray: "4 4" }} />
        {puntos.map((p) => (
          <Fragment key={p.id}>
            {p.precisionM ? <Circle center={[p.lat, p.lng]} radius={p.precisionM} pathOptions={{ color: "#ffffff", weight: 1, fillOpacity: 0.12 }} /> : null}
            <CircleMarker center={[p.lat, p.lng]} radius={7} pathOptions={{ color: "#ffffff", weight: 2, fillColor: p.completado ? "#0ca30c" : "#fab219", fillOpacity: 1 }}>
              <Tooltip permanent direction="top" offset={[0, -6]}>
                <span className="text-[11px] font-medium">{p.orden}</span>
              </Tooltip>
              <Tooltip>
                <span className="text-xs">{p.etiqueta} · {p.completado ? "revisado" : "pendiente"}{p.precisionM ? ` · ±${Math.round(p.precisionM)} m` : " · sin precisión"}</span>
              </Tooltip>
            </CircleMarker>
          </Fragment>
        ))}
      </MapContainer>
    </div>
  );
}
