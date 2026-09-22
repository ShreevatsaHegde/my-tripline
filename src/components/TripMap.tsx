import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Place } from "@/lib/trip-api";

function pinIcon(index: number, visited: boolean, active: boolean) {
  const color = visited ? "var(--color-visited)" : "var(--color-planned)";
  return L.divIcon({
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 30],
    html: `<div class="map-pin" style="background:${color};outline:${
      active ? "3px solid var(--color-primary)" : "none"
    };outline-offset:2px"><span>${index + 1}</span></div>`,
  });
}

function FitBounds({ places }: { places: Place[] }) {
  const map = useMap();
  useEffect(() => {
    if (places.length === 0) return;
    const bounds = L.latLngBounds(places.map((p) => [p.latitude, p.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 13 });
  }, [map, places]);
  return null;
}

function ClickCapture({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (event) => onMapClick(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

export default function TripMap({
  places,
  activeId,
  onHover,
  onSelect,
  onMapClick,
}: {
  places: Place[];
  activeId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
}) {
  const line = useMemo(
    () => places.map((p) => [p.latitude, p.longitude] as [number, number]),
    [places],
  );

  const center: [number, number] = places[0]
    ? [places[0].latitude, places[0].longitude]
    : [20.5937, 78.9629];

  return (
    <MapContainer
      center={center}
      zoom={places.length > 0 ? 11 : 4}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds places={places} />
      <ClickCapture onMapClick={onMapClick} />
      {line.length > 1 && (
        <Polyline positions={line} pathOptions={{ color: "var(--color-primary)", weight: 3, dashArray: "6 8" }} />
      )}
      {places.map((place, index) => (
        <Marker
          key={place.id}
          position={[place.latitude, place.longitude]}
          icon={pinIcon(index, place.visited, activeId === place.id)}
          eventHandlers={{
            mouseover: () => onHover(place.id),
            mouseout: () => onHover(null),
            click: () => onSelect(place.id),
          }}
        />
      ))}
    </MapContainer>
  );
}
