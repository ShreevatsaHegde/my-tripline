import { createFileRoute, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  Check,
  Clock,
  Copy,
  GripVertical,
  Share2,
  Car,
  Loader2,
  Plane,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { PhotoImage } from "@/components/PhotoImage";
import {
  fetchPlaces,
  fetchTrip,
  searchPlaceByName,
  uploadPhoto,
  type GeoResult,
  type Place,
  tripDayCount,
  fetchLeg,
  type TravelMode,
  type PlaceKind,
  PIT_STOP_META,
  isDestination,
  tripStatus,
  googleMapsRouteUrl,
  syncTripCompletion,
} from "@/lib/trip-api";

const KIND_OPTIONS: { value: PlaceKind; label: string }[] = [
  { value: "destination", label: "📍 Destination" },
  { value: "hotel", label: `${PIT_STOP_META.hotel.emoji} ${PIT_STOP_META.hotel.label}` },
  { value: "break", label: `${PIT_STOP_META.break.emoji} ${PIT_STOP_META.break.label}` },
  { value: "fuel", label: `${PIT_STOP_META.fuel.emoji} ${PIT_STOP_META.fuel.label}` },
];

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
    kind: PlaceKind;
  } | null>(null);

  const { data: trip } = useQuery({ queryKey: ["trip", tripId], queryFn: () => fetchTrip(tripId) });
  const { data: places = [] } = useQuery({
    queryKey: ["places", tripId],
    queryFn: () => fetchPlaces(tripId),
  });

  const legKey = places.map((p) => `${p.id}:${p.latitude},${p.longitude}:${p.travel_mode}`).join("|");
  const { data: legs = [] } = useQuery({
    queryKey: ["legs", legKey],
    queryFn: () => Promise.all(places.slice(1).map((p, i) => fetchLeg(places[i]!, p))),
    staleTime: 60 * 60 * 1000,
    enabled: places.length > 1,
  });
  const totalKm = legs.reduce((sum, l) => sum + l.km, 0);
  const setMode = (id: string, mode: TravelMode) =>
    updatePlace.mutate({ id, patch: { travel_mode: mode } });

  // A selected place stays pinned in the panel so editing is not interrupted by hovering.
  const activeId = selectedId ?? hoveredId;
  const highlightId = hoveredId ?? selectedId;
  const activePlace = places.find((p) => p.id === activeId) ?? null;

  // On narrow screens the panel sits under the map, so bring it into view when a pin is clicked.
  const panelRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    if (typeof window === "undefined" || window.innerWidth >= 1024) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  const addPlace = useMutation({
    mutationFn: async (input: {
      name: string;
      address: string;
      lat: number;
      lon: number;
      plannedAt: string;
      kind: PlaceKind;
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
        kind: input.kind,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void afterRouteChange();
      toast.success("Place added to your route");
      setDraft(null);
      setQuery("");
      setResults([]);
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["places", tripId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add place"),
  });

  async function afterRouteChange() {
    try {
      const result = await syncTripCompletion(tripId);
      if (result === "completed") toast.success("Trip Completed ✓ — all destinations visited");
      if (result === "reopened") toast("Trip is back in progress");
    } catch (e) {
      console.warn("Could not update trip status", e);
    }
    queryClient.invalidateQueries({ queryKey: ["places", tripId] });
    queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
    queryClient.invalidateQueries({ queryKey: ["trips"] });
    queryClient.invalidateQueries({ queryKey: ["all-places"] });
  }

  const updatePlace = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Place> }) => {
      const { error } = await supabase.from("places").update(patch).eq("id", id);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch) => {
      if ("visited" in patch || "kind" in patch) void afterRouteChange();
      else queryClient.invalidateQueries({ queryKey: ["places", tripId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const movePlace = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const index = places.findIndex((p) => p.id === id);
      const other = index + dir;
      if (index < 0 || other < 0 || other >= places.length) return;
      const a = places[index]!;
      const b = places[other]!;
      const { error: e1 } = await supabase
        .from("places")
        .update({ sort_order: b.sort_order })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("places")
        .update({ sort_order: a.sort_order })
        .eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["places", tripId] }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not reorder stops"),
  });

  const [order, setOrder] = useState<string[] | null>(null);
  const orderedPlaces = order
    ? (order.map((id) => places.find((p) => p.id === id)).filter(Boolean) as Place[])
    : places;
  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.all(
        ids.map((id, i) => supabase.from("places").update({ sort_order: i }).eq("id", id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["places", tripId] });
      setOrder(null);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not reorder stops"),
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = orderedPlaces.map((p) => p.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setOrder(next);
    reorder.mutate(next);
  }

  const routeUrl = googleMapsRouteUrl(places);
  async function shareRoute() {
    if (!routeUrl) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: trip?.title ?? "Trip route", url: routeUrl });
        return;
      } catch {
        /* cancelled — fall through to open */
      }
    }
    window.open(routeUrl, "_blank", "noopener");
  }
  async function copyRoute() {
    if (!routeUrl) return;
    try {
      await navigator.clipboard.writeText(routeUrl);
      toast.success("Google Maps link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  }

  const deletePlace = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("places").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedId(null);
      void afterRouteChange();
    },
  });

  async function runSearch() {
    if (query.trim().length < 2) return;
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

  const destinations = places.filter(isDestination);
  const visitedPlaces = destinations.filter((p) => p.visited);
  const missedPlaces = destinations.filter((p) => !p.visited);
  const status = trip ? tripStatus(trip, places) : "planned";
  const statusLabel =
    status === "completed" ? "Trip Completed ✓" : status === "in_progress" ? "In Progress" : "Planned";
  const visitedCount = visitedPlaces.length;
  const plannedDays = trip ? tripDayCount(trip) : null;
  const activeDays = new Set(
    visitedPlaces
      .filter((p) => p.visited_at)
      .map((p) => new Date(p.visited_at!).toDateString()),
  ).size;

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
            {visitedCount} of {destinations.length} places visited
            {trip ? (tripDayCount(trip) !== null ? ` · ${tripDayCount(trip)} ${tripDayCount(trip) === 1 ? "day" : "days"}` : "") : ""}
            {trip?.start_date ? ` · from ${trip.start_date}` : ""}
            {legs.length > 0 ? ` · ${totalKm.toFixed(1)} km route` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              status === "completed"
                ? "bg-[var(--color-visited)] text-white"
                : status === "in_progress"
                  ? "bg-[var(--color-planned)] text-white"
                  : "bg-secondary text-muted-foreground"
            }`}
          >
            {statusLabel}
          </span>
          {routeUrl && (
            <>
              <button
                onClick={() => void shareRoute()}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold hover:bg-secondary"
              >
                <Share2 className="size-4" /> Share Route
              </button>
              <button
                onClick={() => void copyRoute()}
                aria-label="Copy Google Maps link"
                title="Copy Google Maps link"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold hover:bg-secondary"
              >
                <Copy className="size-4" /> <span className="hidden sm:inline">Copy Google Maps Link</span>
              </button>
            </>
          )}
          <button
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" /> Add stop
          </button>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Trip summary</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              status === "completed"
                ? "bg-[var(--color-visited)] text-white"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-2xl font-bold">{plannedDays ?? "—"}</p>
            <p className="text-xs text-muted-foreground">
              {plannedDays === 1 ? "day planned" : "days planned"}
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold">{activeDays}</p>
            <p className="text-xs text-muted-foreground">
              {activeDays === 1 ? "day completed" : "days completed"}
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              {visitedCount} / {destinations.length}
            </p>
            <p className="text-xs text-muted-foreground">destinations visited</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-[var(--color-visited)] transition-all"
                style={{ width: `${destinations.length ? (visitedCount / destinations.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Places visited</h3>
            {visitedPlaces.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing ticked off yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {visitedPlaces.map((p) => (
                  <li key={p.id} className="text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.visited_at ? new Date(p.visited_at).toLocaleString() : "no time noted"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">Missed out places</h3>
            {missedPlaces.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                You covered every place you planned.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {missedPlaces.map((p) => (
                  <li key={p.id} className="text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.planned_at
                        ? `planned for ${new Date(p.planned_at).toLocaleString()}`
                        : "planned, not visited"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {legs.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">Route legs · {totalKm.toFixed(1)} km</h3>
            <ul className="mt-3 space-y-2">
              {legs.map((leg, i) => {
                const to = places[i + 1]!;
                return (
                  <li
                    key={`${leg.fromId}-${leg.toId}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-2.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">
                        {i + 1} → {i + 2}: {places[i]!.name} → {to.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {leg.km.toFixed(1)} km{" "}
                        {leg.mode === "flight"
                          ? "direct flight distance"
                          : leg.road
                            ? "by road"
                            : "straight line (no road found)"}
                      </span>
                    </span>
                    <ModeToggle value={to.travel_mode} onChange={(m) => setMode(to.id, m)} />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

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
                        kind: draft?.kind ?? "destination",
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
              <label className="text-xs font-medium text-muted-foreground sm:col-span-2">
                Stop type
                <select
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value as PlaceKind })}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block">Pit stops (hotel, break, fuel) don't count toward trip completion.</span>
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
                legs={legs}
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
                    kind: draft?.kind ?? "destination",
                  });
                }}
              />
            </Suspense>
          </ClientOnly>
        </div>

        <aside
          ref={panelRef}
          className={`flex max-h-[620px] scroll-mt-20 flex-col gap-4 overflow-y-auto rounded-2xl border bg-card p-4 shadow-soft ${
            selectedId ? "border-primary/60 ring-2 ring-primary/20" : "border-border"
          }`}
        >
          {activePlace ? (
            <div key={activePlace.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{activePlace.name}</h2>
                  {activePlace.address && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{activePlace.address}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (confirm(`Remove “${activePlace.name}” from this trip?`)) {
                        deletePlace.mutate(activePlace.id);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" /> Remove
                  </button>
                  <button
                    onClick={() => {
                      setSelectedId(null);
                      setHoveredId(null);
                    }}
                    aria-label="Close place details"
                    title="Close"
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              {activePlace.photo_url ? (
                <PhotoImage
                  path={activePlace.photo_url}
                  alt={activePlace.name}
                  className="mt-3 h-44 w-full rounded-xl object-cover"
                />
              ) : (
                <div className="mt-3 flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                  No photo yet
                </div>
              )}

              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary">
                <Camera className="size-3.5" />
                {activePlace.photo_url ? "Replace photo" : "Attach photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePhoto(activePlace, file);
                  }}
                />
              </label>

              {places.findIndex((p) => p.id === activePlace.id) > 0 && (
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  Travel here from previous stop by
                  <ModeToggle
                    value={activePlace.travel_mode}
                    onChange={(m) => setMode(activePlace.id, m)}
                  />
                </div>
              )}

              <label className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                Stop type
                <select
                  value={activePlace.kind}
                  onChange={(e) =>
                    updatePlace.mutate({ id: activePlace.id, patch: { kind: e.target.value as PlaceKind } })
                  }
                  className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                >
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label
                className={`mt-3 flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors ${
                  activePlace.visited
                    ? "border-[var(--color-visited)] bg-[var(--color-visited)]/10 text-[var(--color-visited)]"
                    : "border-border"
                }`}
              >
                <input
                  type="checkbox"
                  checked={activePlace.visited}
                  onChange={(e) =>
                    updatePlace.mutate({
                      id: activePlace.id,
                      patch: {
                        visited: e.target.checked,
                        visited_at: e.target.checked
                          ? (activePlace.visited_at ?? new Date().toISOString())
                          : null,
                      },
                    })
                  }
                  className="size-4 accent-[var(--color-visited)]"
                />
                {activePlace.visited ? "✓ Visited" : "○ Not visited — tap to mark as visited"}
              </label>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  Planned time
                  <input
                    type="datetime-local"
                    value={toLocalInput(activePlace.planned_at)}
                    onChange={(e) =>
                      updatePlace.mutate({
                        id: activePlace.id,
                        patch: {
                          planned_at: e.target.value
                            ? new Date(e.target.value).toISOString()
                            : null,
                        },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Visit time
                  <input
                    type="datetime-local"
                    value={toLocalInput(activePlace.visited_at)}
                    onChange={(e) =>
                      updatePlace.mutate({
                        id: activePlace.id,
                        patch: {
                          visited_at: e.target.value
                            ? new Date(e.target.value).toISOString()
                            : null,
                          visited: e.target.value ? true : activePlace.visited,
                        },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>

              <label className="mt-3 block text-xs text-muted-foreground">
                Notes
                <textarea
                  defaultValue={activePlace.notes ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (activePlace.notes ?? "") &&
                    updatePlace.mutate({ id: activePlace.id, patch: { notes: e.target.value } })
                  }
                  placeholder="What you did here, tickets, food, anything…"
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>

              <label className="mt-3 flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={activePlace.has_stay}
                  onChange={(e) =>
                    updatePlace.mutate({ id: activePlace.id, patch: { has_stay: e.target.checked } })
                  }
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                Stay here
              </label>
              {activePlace.has_stay && (
                <div key={activePlace.id} className="mt-2 grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
                  {(
                    [
                      ["stay_name", "Hotel / stay name", "e.g. Hotel Sunrise"],
                    ] as const
                  ).map(([field, label, ph]) => (
                    <label key={field} className="text-xs text-muted-foreground">
                      {label}
                      <input
                        defaultValue={activePlace[field] ?? ""}
                        placeholder={ph}
                        onBlur={(e) =>
                          e.target.value !== (activePlace[field] ?? "") &&
                          updatePlace.mutate({ id: activePlace.id, patch: { [field]: e.target.value || null } })
                        }
                        className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                  ))}
                  <StaySearch
                    address={activePlace.stay_address}
                    onPick={(r) =>
                      updatePlace.mutate({
                        id: activePlace.id,
                        patch: {
                          stay_address: r.address,
                          stay_name: activePlace.stay_name || r.name,
                        },
                      })
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["stay_check_in", "Check-in"],
                        ["stay_check_out", "Check-out"],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="text-xs text-muted-foreground">
                        {label}
                        <input
                          type="datetime-local"
                          value={toLocalInput(activePlace[field])}
                          onChange={(e) =>
                            updatePlace.mutate({
                              id: activePlace.id,
                              patch: { [field]: e.target.value ? new Date(e.target.value).toISOString() : null },
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                        />
                      </label>
                    ))}
                  </div>
                  <label className="text-xs text-muted-foreground">
                    Booking details
                    <textarea
                      defaultValue={activePlace.stay_notes ?? ""}
                      placeholder="Booking ID, price, contact…"
                      rows={2}
                      onBlur={(e) =>
                        e.target.value !== (activePlace.stay_notes ?? "") &&
                        updatePlace.mutate({ id: activePlace.id, patch: { stay_notes: e.target.value || null } })
                      }
                      className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                </div>
              )}

              {selectedId && (
                <button
                  onClick={() => setSelectedId(null)}
                  className="mt-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Close details
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Click a pin on the map (or a stop below) to add its details, time, notes and photo
              here.
            </p>
          )}

          <div className="border-t border-border pt-3">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Itinerary
            </h3>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedPlaces.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <ul className="mt-3 space-y-2">
              {orderedPlaces.map((place, index) => (
                <SortableStop
                  key={place.id}
                  place={place}
                  index={index}
                  total={orderedPlaces.length}
                  destNo={orderedPlaces.slice(0, index + 1).filter(isDestination).length}
                  highlighted={highlightId === place.id}
                  onHover={setHoveredId}
                  onSelect={setSelectedId}
                  onMove={(dir) => movePlace.mutate({ id: place.id, dir })}
                  moving={movePlace.isPending || reorder.isPending}
                  onToggleVisited={(v) =>
                    updatePlace.mutate({
                      id: place.id,
                      patch: { visited: v, visited_at: v ? (place.visited_at ?? new Date().toISOString()) : null },
                    })
                  }
                />
              ))}
              {places.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No places yet — use “Add place” or click the map.
                </li>
              )}
            </ul>
            </SortableContext>
            </DndContext>
            <p className="mt-4 text-[10px] text-muted-foreground">
              Tip: drag ☰ to reorder. START and END on the map mark the first and last stop.
            </p>
          </div>
        </aside>
      </div>

    </div>
  );
}

function ModeToggle({ value, onChange }: { value: TravelMode; onChange: (m: TravelMode) => void }) {
  const opts: { m: TravelMode; label: string; Icon: typeof Car }[] = [
    { m: "road", label: "Road", Icon: Car },
    { m: "flight", label: "Flight", Icon: Plane },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      {opts.map(({ m, label, Icon }) => (
        <button
          key={m}
          type="button"
          onClick={() => value !== m && onChange(m)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium ${
            value === m ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
          }`}
        >
          <Icon className="size-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}

function StaySearch({
  address,
  onPick,
}: {
  address: string | null;
  onPick: (r: GeoResult) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<GeoResult[]>([]);
  async function go() {
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      setList(await searchPlaceByName(q.trim()));
    } catch {
      toast.error("Search is unavailable right now");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="text-xs text-muted-foreground">
      Stay location (Google Maps)
      {address && (
        <div className="mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground">
          {address}{" "}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline"
          >
            Open in Google Maps
          </a>
        </div>
      )}
      <div className="mt-1 flex gap-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), go())}
          placeholder="Search hotel by name…"
          className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className="rounded-lg bg-primary px-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "…" : "Search"}
        </button>
      </div>
      {list.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-auto rounded-lg border border-border bg-background">
          {list.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setList([]);
                  setQ("");
                }}
                className="block w-full px-2 py-1.5 text-left hover:bg-muted"
              >
                <span className="font-medium text-foreground">{r.name}</span>
                <span className="block truncate">{r.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SortableStop({
  place,
  index,
  total,
  destNo,
  highlighted,
  onHover,
  onSelect,
  onMove,
  moving,
  onToggleVisited,
}: {
  place: Place;
  index: number;
  total: number;
  destNo: number;
  highlighted: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onMove: (dir: -1 | 1) => void;
  moving: boolean;
  onToggleVisited: (v: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
  });
  const dest = isDestination(place);
  const pit = !dest ? PIT_STOP_META[place.kind as keyof typeof PIT_STOP_META] : null;
  const tag = total > 1 ? (index === 0 ? "START" : index === total - 1 ? "END" : null) : null;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1.5 ${isDragging ? "z-10 opacity-80 shadow-lg" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Drag ${place.name}`}
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-secondary active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <button
        onMouseEnter={() => onHover(place.id)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onSelect(place.id)}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border p-2.5 text-left transition-colors ${
          highlighted ? "border-primary bg-secondary/50" : "border-border hover:bg-secondary/40"
        } ${!dest ? "border-dashed" : ""}`}
      >
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
          style={{
            background: !dest ? "#64748b" : place.visited ? "var(--color-visited)" : "#2563eb",
          }}
        >
          {pit ? pit.emoji : destNo}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {tag && (
              <span
                className={`rounded px-1 text-[9px] font-bold text-white ${
                  tag === "START" ? "bg-green-600" : "bg-red-600"
                }`}
              >
                {tag}
              </span>
            )}
            <span className="block truncate text-sm font-semibold">{place.name}</span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {pit
              ? `Pit stop · ${pit.label}`
              : place.visited
                ? place.visited_at
                  ? `✓ ${new Date(place.visited_at).toLocaleString()}`
                  : "✓ Visited"
                : "○ Not visited"}
          </span>
        </span>
        {place.photo_url && <Camera className="size-3.5 text-muted-foreground" />}
      </button>
      {dest && (
        <button
          onClick={() => onToggleVisited(!place.visited)}
          aria-label={place.visited ? `Mark ${place.name} not visited` : `Mark ${place.name} visited`}
          title={place.visited ? "Mark as not visited" : "Mark as visited"}
          className={`grid size-8 shrink-0 place-items-center rounded-lg border transition-colors ${
            place.visited
              ? "border-transparent bg-[var(--color-visited)] text-white"
              : "border-border text-muted-foreground hover:bg-secondary"
          }`}
        >
          <Check className="size-4" />
        </button>
      )}
      <span className="flex shrink-0 flex-col gap-0.5">
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0 || moving}
          aria-label={`Move ${place.name} earlier`}
          className="grid size-6 place-items-center rounded-md border border-border text-muted-foreground hover:bg-secondary disabled:opacity-30"
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={index === total - 1 || moving}
          aria-label={`Move ${place.name} later`}
          className="grid size-6 place-items-center rounded-md border border-border text-muted-foreground hover:bg-secondary disabled:opacity-30"
        >
          <ArrowDown className="size-3.5" />
        </button>
      </span>
    </li>
  );
}
