import { supabase } from "@/integrations/supabase/client";

export type Trip = {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  completed: boolean;
  completed_at: string | null;
};

export type Place = {
  id: string;
  trip_id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  visited: boolean;
  visited_at: string | null;
  planned_at: string | null;
  notes: string | null;
  photo_url: string | null;
  sort_order: number;
  travel_mode: TravelMode;
};

export type TravelMode = "road" | "flight";

export async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("id, title, description, start_date, end_date, created_at, completed, completed_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTrip(id: string): Promise<Trip> {
  const { data, error } = await supabase
    .from("trips")
    .select("id, title, description, start_date, end_date, created_at, completed, completed_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchPlaces(tripId: string): Promise<Place[]> {
  const { data, error } = await supabase
    .from("places")
    .select(
      "id, trip_id, name, address, latitude, longitude, visited, visited_at, planned_at, notes, photo_url, sort_order, travel_mode",
    )
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Place[];
}

export async function fetchAllPlaces(): Promise<Place[]> {
  const { data, error } = await supabase
    .from("places")
    .select(
      "id, trip_id, name, address, latitude, longitude, visited, visited_at, planned_at, notes, photo_url, sort_order, travel_mode",
    )
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Place[];
}

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeDistanceKm(places: Place[]): number {
  let total = 0;
  for (let i = 1; i < places.length; i++) total += distanceKm(places[i - 1]!, places[i]!);
  return total;
}

export function tripDayCount(trip: Pick<Trip, "start_date" | "end_date">): number | null {
  if (!trip.start_date) return null;
  const start = new Date(trip.start_date);
  const end = trip.end_date ? new Date(trip.end_date) : start;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days > 0 ? days : 1;
}

export type GeoResult = { name: string; address: string; lat: number; lon: number };

export async function searchPlaceByName(query: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Place search failed");
  const rows = (await res.json()) as Array<{
    display_name: string;
    name?: string;
    lat: string;
    lon: string;
  }>;
  return rows.map((row) => ({
    name: row.name && row.name.length > 0 ? row.name : row.display_name.split(",")[0]!,
    address: row.display_name,
    lat: Number(row.lat),
    lon: Number(row.lon),
  }));
}

export async function reverseGeocode(lat: number, lon: number): Promise<GeoResult | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const row = (await res.json()) as { display_name?: string; name?: string };
  if (!row.display_name) return null;
  return {
    name: row.name && row.name.length > 0 ? row.name : row.display_name.split(",")[0]!,
    address: row.display_name,
    lat,
    lon,
  };
}

export async function uploadPhoto(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("trip-photos").upload(path, file);
  if (error) throw error;
  return path;
}

export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("trip-photos")
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export type Leg = {
  fromId: string;
  toId: string;
  mode: TravelMode;
  km: number;
  coords: [number, number][];
  road: boolean; // true when a real road path was found
};

/** Road route between two points via the free OSRM service; falls back to a straight line. */
export async function fetchLeg(a: Place, b: Place): Promise<Leg> {
  const straight: Leg = {
    fromId: a.id,
    toId: b.id,
    mode: b.travel_mode,
    km: distanceKm(a, b),
    coords: [
      [a.latitude, a.longitude],
      [b.latitude, b.longitude],
    ],
    road: false,
  };
  if (b.travel_mode === "flight") return straight;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return straight;
    const json = (await res.json()) as {
      routes?: { distance: number; geometry: { coordinates: [number, number][] } }[];
    };
    const r = json.routes?.[0];
    if (!r) return straight;
    return {
      ...straight,
      km: r.distance / 1000,
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      road: true,
    };
  } catch {
    return straight;
  }
}
