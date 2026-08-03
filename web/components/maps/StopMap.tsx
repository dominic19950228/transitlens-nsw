"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { StopMapLocation } from "./mapTypes";

interface StopMapProps {
  location: StopMapLocation;
}

export default function StopMap({ location }: StopMapProps) {
  return (
    <MapContainer
      center={[location.latitude, location.longitude]}
      zoom={16}
      scrollWheelZoom={false}
      className="h-80 sm:h-96 w-full rounded-lg overflow-hidden"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[location.latitude, location.longitude]}
        radius={8}
        pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.7 }}
      >
        <Popup>
          <div className="text-sm">
            <p className="font-bold">{location.stopName}</p>
            <p className="font-mono">{location.stopId}</p>
            <p>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>
          </div>
        </Popup>
      </CircleMarker>
    </MapContainer>
  );
}