import { googlePlaceSearch } from "@/lib/places.functions";
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
  completed_km: number | null;
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
  has_stay: boolean;
  stay_name: string | null;
  stay_address: string | null;
  stay_check_in: string | null;
  stay_check_out: string | null;
  stay_notes: string | null;
  kind: PlaceKind;
};

export type PlaceKind = "destination" | "hotel" | "break" | "fuel";
export const PIT_STOP_META: Record<Exclude<PlaceKind, "destination">, { label: string; emoji: string }> = {
  hotel: { label: "Hotel / Stay", emoji: "🏨" },
  break: { label: "Break", emoji: "☕" },
  fuel: { label: "Petrol / Fuel", emoji: "⛽" },
};
export const isDestination = (p: Pick<Place, "kind">) => (p.kind ?? "destination") === "destination";

export type TripStatus = "planned" | "in_progress" | "completed";
export function tripStatus(trip: Pick<Trip, "completed">, places: Place[]): TripStatus {
  if (trip.completed) return "completed";
  return places.some((p) => isDestination(p) && p.visited) ? "in_progress" : "planned";
}

/** Google Maps directions URL: first stop = origin, last = destination, rest = waypoints in order. */
export function googleMapsRouteUrl(places: Place[]): string | null {
  if (places.length === 0) return null;
  const ll = (p: Place) => `${p.latitude},${p.longitude}`;
  if (places.length === 1) return `https://www.google.com/maps/search/?api=1&query=${ll(places[0]!)}`;
  const origin = ll(places[0]!);
  const dest = ll(places[places.length - 1]!);
  const way = places.slice(1, -1).map(ll).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${way ? `&waypoints=${encodeURIComponent(way)}` : ""}&travelmode=driving`;
}

/**
 * Single source of truth for completion: a trip is completed only when it has at least one
 * destination and every destination is visited. Pit stops are ignored. The route km is
 * snapshotted once into completed_km, so the dashboard counts each trip exactly once.
 */
export async function syncTripCompletion(tripId: string): Promise<"completed" | "reopened" | null> {
  const [trip, places] = await Promise.all([fetchTrip(tripId), fetchPlaces(tripId)]);
  const dests = places.filter(isDestination);
  const allDone = dests.length > 0 && dests.every((p) => p.visited);
  if (allDone && !trip.completed) {
    const legs = await Promise.all(places.slice(1).map((p, i) => fetchLeg(places[i]!, p)));
    const km = legs.reduce((s, l) => s + l.km, 0);
    const { error } = await supabase
      .from("trips")
      .update({ completed: true, completed_at: new Date().toISOString(), completed_km: km })
      .eq("id", tripId);
    if (error) throw error;
    return "completed";
  }
  if (!allDone && trip.completed) {
    const { error } = await supabase
      .from("trips")
      .update({ completed: false, completed_at: null, completed_km: null })
      .eq("id", tripId);
    if (error) throw error;
    return "reopened";
  }
  return null;
}

export type TravelMode = "road" | "flight";

export async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("id, title, description, start_date, end_date, created_at, completed, completed_at, completed_km")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTrip(id: string): Promise<Trip> {
  const { data, error } = await supabase
    .from("trips")
    .select("id, title, description, start_date, end_date, created_at, completed, completed_at, completed_km")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchPlaces(tripId: string): Promise<Place[]> {
  const { data, error } = await supabase
    .from("places")
    .select(
      "id, trip_id, name, address, latitude, longitude, visited, visited_at, planned_at, notes, photo_url, sort_order, travel_mode, has_stay, stay_name, stay_address, stay_check_in, stay_check_out, stay_notes, kind",
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
      "id, trip_id, name, address, latitude, longitude, visited, visited_at, planned_at, notes, photo_url, sort_order, travel_mode, has_stay, stay_name, stay_address, stay_check_in, stay_check_out, stay_notes, kind",
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

async function searchPhoton(query: string): Promise<GeoResult[]> {
  const res = await fetch(`https://photon.komoot.io/api/?limit=8&q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    features?: { geometry: { coordinates: [number, number] }; properties: { name?: string; street?: string; city?: string; county?: string; state?: string; country?: string } }[];
  };
  return (json.features ?? []).map((f) => {
    const p = f.properties;
    const parts = [p.name, p.street, p.city ?? p.county, p.state, p.country].filter(Boolean);
    return {
      name: p.name ?? parts[0] ?? query,
      address: Array.from(new Set(parts)).join(", "),
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
    };
  });
}

async function searchNominatim(query: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=en&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ display_name: string; name?: string; lat: string; lon: string }>;
  return rows.map((row) => ({
    name: row.name && row.name.length > 0 ? row.name : row.display_name.split(",")[0]!,
    address: row.display_name,
    lat: Number(row.lat),
    lon: Number(row.lon),
  }));
}

/** Combines a typo-tolerant search (Photon) with Nominatim so more places are found. */
export async function searchPlaceByName(query: string): Promise<GeoResult[]> {
  try {
    const google = await googlePlaceSearch({ data: { query } });
    if (google.length > 0) return google;
  } catch (e) {
    console.warn("Google search unavailable, using open map search", e);
  }
  const [a, b] = await Promise.allSettled([searchPhoton(query), searchNominatim(query)]);
  const all = [
    ...(a.status === "fulfilled" ? a.value : []),
    ...(b.status === "fulfilled" ? b.value : []),
  ];
  if (a.status === "rejected" && b.status === "rejected") throw new Error("Place search failed");
  const seen = new Set<string>();
  return all
    .filter((r) => {
      const k = `${r.lat.toFixed(3)},${r.lon.toFixed(3)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 10);
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
