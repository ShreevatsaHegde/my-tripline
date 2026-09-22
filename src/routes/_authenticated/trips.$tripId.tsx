import { createFileRoute, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Check,
  Clock,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PhotoImage } from "@/components/PhotoImage";
import {
  fetchPlaces,
  fetchTrip,
  searchPlaceByName,
  uploadPhoto,
  type GeoResult,
  type Place,
} from "@/lib/trip-api";

const TripMap = lazy(() => import("@/components/TripMap"));

export const Route = createFileRoute("/_authenticated/trips/$tripId")({
  head: () => ({
    meta: [
      { title: "Trip map — Tripline" },
      {
        name: "description",
        content: "Interactive map of your trip route with visited places, times, notes and photos.",
      },
      { property: "og:title", content: "Trip map — Tripline" },
      {
        property: "og:description",
        content: "Interactive map of your trip route with visited places, times, notes and photos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TripDetail,
});

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TripDetail() {
  const { tripId } = Route.useParams();
  const queryClient = useQueryClient();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<{
    name: string;
    address: string;
    lat: number;
    lon: number;
    plannedAt: string;
  } | null>(null);

  const { data: trip } = useQuery({ queryKey: ["trip", tripId], queryFn: () => fetchTrip(tripId) });
  const { data: places = [] } = useQuery({
    queryKey: ["places", tripId],
    queryFn: () => fetchPlaces(tripId),
  });

  // A selected place stays pinned in the panel so editing is not interrupted by hovering.
  const activeId = selectedId ?? hoveredId;
  const highlightId = hoveredId ?? selectedId;
  const activePlace = places.find((p) => p.id === activeId) ?? null;

  const addPlace = useMutation({
    mutationFn: async (input: {
      name: string;
      address: string;
      lat: number;
      lon: number;
      plannedAt: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("places").insert({
        trip_id: tripId,
        user_id: userId,
        name: input.name,
        address: input.address || null,
        latitude: input.lat,
        longitude: input.lon,
        planned_at: input.plannedAt ? new Date(input.plannedAt).toISOString() : null,
        sort_order: places.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Place added to your route");
      setDraft(null);
      setQuery("");
      setResults([]);
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["places", tripId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add place"),
  });

  const updatePlace = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Place> }) => {
      const { error } = await supabase.from("places").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["places", tripId] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const deletePlace = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("places").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["places", tripId] });
    },
  });

  async function runSearch() {
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      setResults(await searchPlaceByName(query.trim()));
    } catch {
      toast.error("Place search is unavailable right now");
    } finally {
      setSearching(false);
    }
  }

  async function handlePhoto(place: Place, file: File) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const path = await uploadPhoto(userId, file);
      await updatePlace.mutateAsync({ id: place.id, patch: { photo_url: path } });
      toast.success("Photo added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  }

  const visitedCount = places.filter((p) => p.visited).length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/trips"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> All trips
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{trip?.title ?? "Trip"}</h1>
          <p className="text-sm text-muted-foreground">
            {visitedCount} of {places.length} places visited
            {trip?.start_date ? ` · from ${trip.start_date}` : ""}
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" /> Add place
        </button>
      </div>

      {adding && (
        <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runSearch();
                }
              }}
              placeholder="Search a place, e.g. Gateway of India"
              className="flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => void runSearch()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary"
            >
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Search
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Or click anywhere on the map to drop a pin there.
          </p>

          {results.length > 0 && (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {results.map((result) => (
                <li key={`${result.lat}-${result.lon}`}>
                  <button
                    onClick={() =>
                      setDraft({
                        name: result.name,
                        address: result.address,
                        lat: result.lat,
                        lon: result.lon,
                        plannedAt: "",
                      })
                    }
                    className="w-full px-3 py-2.5 text-left text-sm hover:bg-secondary"
                  >
                    <span className="font-medium">{result.name}</span>
                    <span className="block text-xs text-muted-foreground">{result.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {draft && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addPlace.mutate(draft);
              }}
              className="mt-4 grid gap-3 rounded-xl bg-muted/60 p-4 sm:grid-cols-2"
            >
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Place name"
                className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <label className="text-xs font-medium text-muted-foreground">
                Planned time (optional)
                <input
                  type="datetime-local"
                  value={draft.plannedAt}
                  onChange={(e) => setDraft({ ...draft, plannedAt: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <p className="text-xs text-muted-foreground sm:col-span-2">{draft.address}</p>
              <button
                type="submit"
                disabled={addPlace.isPending}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2"
              >
                Add to trip
              </button>
            </form>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="h-[420px] overflow-hidden rounded-2xl border border-border shadow-soft lg:h-[620px]">
          <ClientOnly fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
            <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
              <TripMap
                places={places}
                activeId={highlightId}
                onHover={setHoveredId}
                onSelect={setSelectedId}
                onMapClick={(lat, lng) => {
                  setAdding(true);
                  setDraft({
                    name: "",
                    address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                    lat,
                    lon: lng,
                    plannedAt: "",
                  });
                }}
              />
            </Suspense>
          </ClientOnly>
        </div>

        <aside className="flex max-h-[620px] flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-soft">
          {activePlace ? (
            <div>
              <h2 className="text-lg font-semibold">{activePlace.name}</h2>
              {activePlace.address && (
                <p className="mt-0.5 text-xs text-muted-foreground">{activePlace.address}</p>
              )}
              {activePlace.photo_url && (
                <PhotoImage
                  path={activePlace.photo_url}
                  alt={activePlace.name}
                  className="mt-3 h-44 w-full rounded-xl object-cover"
                />
              )}
              <div className="mt-3 space-y-1 text-sm">
                {activePlace.planned_at && (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="size-3.5" /> Planned:{" "}
                    {new Date(activePlace.planned_at).toLocaleString()}
                  </p>
                )}
                {activePlace.visited_at && (
                  <p className="flex items-center gap-1.5 text-visited">
                    <Check className="size-3.5" /> Visited:{" "}
                    {new Date(activePlace.visited_at).toLocaleString()}
                  </p>
                )}
                {activePlace.notes && <p className="pt-1 text-sm">{activePlace.notes}</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Hover or tap a pin on the map to see that stop's details, time and photo here.
            </p>
          )}

          <div className="border-t border-border pt-3">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Itinerary
            </h3>
            <ul className="mt-3 space-y-3">
              {places.map((place, index) => (
                <li
                  key={place.id}
                  onMouseEnter={() => setHoveredId(place.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setSelectedId(place.id)}
                  className={`rounded-xl border p-3 transition-colors ${
                    activeId === place.id ? "border-primary bg-secondary/50" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {index + 1}. {place.name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" />
                        {place.visited ? "Visited" : "Planned"}
                      </p>
                    </div>
                    <button
                      onClick={() => deletePlace.mutate(place.id)}
                      aria-label="Remove place"
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={place.visited}
                      onChange={(e) =>
                        updatePlace.mutate({
                          id: place.id,
                          patch: {
                            visited: e.target.checked,
                            visited_at: e.target.checked
                              ? (place.visited_at ?? new Date().toISOString())
                              : null,
                          },
                        })
                      }
                      className="size-4 accent-[var(--color-visited)]"
                    />
                    Mark as visited
                  </label>

                  <label className="mt-2 block text-xs text-muted-foreground">
                    Visit time
                    <input
                      type="datetime-local"
                      value={toLocalInput(place.visited_at)}
                      onChange={(e) =>
                        updatePlace.mutate({
                          id: place.id,
                          patch: {
                            visited_at: e.target.value
                              ? new Date(e.target.value).toISOString()
                              : null,
                            visited: e.target.value ? true : place.visited,
                          },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>

                  <textarea
                    defaultValue={place.notes ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (place.notes ?? "") &&
                      updatePlace.mutate({ id: place.id, patch: { notes: e.target.value } })
                    }
                    placeholder="Notes about this stop…"
                    rows={2}
                    className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                  />

                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary">
                    <Camera className="size-3.5" />
                    {place.photo_url ? "Replace photo" : "Add photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handlePhoto(place, file);
                      }}
                    />
                  </label>
                </li>
              ))}
              {places.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No places yet — use “Add place” or click the map.
                </li>
              )}
            </ul>
            <p className="mt-4 text-[10px] text-muted-foreground">
              Tip: leaving the visit time empty keeps a stop as planned.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
