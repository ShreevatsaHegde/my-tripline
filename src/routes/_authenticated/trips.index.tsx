import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchTrips, type Trip } from "@/lib/trip-api";

export const Route = createFileRoute("/_authenticated/trips/")({
  head: () => ({
    meta: [
      { title: "My trips — Tripline" },
      {
        name: "description",
        content: "All your trip plans with maps, routes, visited places and visit times.",
      },
      { property: "og:title", content: "My trips — Tripline" },
      {
        property: "og:description",
        content: "All your trip plans with maps, routes, visited places and visit times.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TripsPage,
});

type TripForm = {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
};

const emptyForm: TripForm = { title: "", description: "", startDate: "", endDate: "" };

function TripsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TripForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TripForm>(emptyForm);

  const { data: trips, isLoading } = useQuery({ queryKey: ["trips"], queryFn: fetchTrips });

  const createTrip = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("trips").insert({
        user_id: userId,
        title: form.title,
        description: form.description || null,
        start_date: form.startDate || null,
        end_date: form.endDate || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trip created");
      setOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const updateTrip = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("trips")
        .update({
          title: editForm.title,
          description: editForm.description || null,
          start_date: editForm.startDate || null,
          end_date: editForm.endDate || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      toast.success("Trip updated");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["trip", id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update"),
  });

  const deleteTrip = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trips").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trip deleted");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete"),
  });

  function startEdit(trip: Trip) {
    setEditingId(trip.id);
    setEditForm({
      title: trip.title,
      description: trip.description ?? "",
      startDate: trip.start_date ?? "",
      endDate: trip.end_date ?? "",
    });
  }

  const inputClass =
    "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">My trips</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a trip to see its map, route and the places you have visited.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" /> New trip
        </button>
      </div>

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createTrip.mutate();
          }}
          className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft sm:grid-cols-2"
        >
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Trip name (e.g. Kerala backwaters)"
            className={`${inputClass} sm:col-span-2`}
          />
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Short note about this trip"
            className={`${inputClass} sm:col-span-2`}
          />
          <label className="text-xs font-medium text-muted-foreground">
            Starts
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className={`${inputClass} mt-1 text-foreground`}
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Ends
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className={`${inputClass} mt-1 text-foreground`}
            />
          </label>
          <button
            type="submit"
            disabled={createTrip.isPending}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2"
          >
            Save trip
          </button>
        </form>
      )}

      {trips && trips.length > 0 && <TripDashboard trips={trips} />}

      {isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading your trips…</p>
      ) : trips && trips.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) =>
            editingId === trip.id ? (
              <form
                key={trip.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  updateTrip.mutate(trip.id);
                }}
                className="grid gap-3 rounded-2xl border border-primary bg-card p-5 shadow-soft"
              >
                <input
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="Trip name"
                  className={inputClass}
                />
                <input
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Short note about this trip"
                  className={inputClass}
                />
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-medium text-muted-foreground">
                    Starts
                    <input
                      type="date"
                      value={editForm.startDate}
                      onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                      className={`${inputClass} mt-1 text-foreground`}
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Ends
                    <input
                      type="date"
                      value={editForm.endDate}
                      onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                      className={`${inputClass} mt-1 text-foreground`}
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={updateTrip.isPending}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div
                key={trip.id}
                className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift"
              >
                <Link to="/trips/$tripId" params={{ tripId: trip.id }} className="block">
                  <h2 className="text-lg font-semibold group-hover:text-primary">{trip.title}</h2>
                  {trip.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {trip.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3.5" />
                      {trip.start_date ?? "No dates yet"}
                      {trip.end_date ? ` → ${trip.end_date}` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" /> Open map
                    </span>
                  </div>
                </Link>
                <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                  <button
                    onClick={() => startEdit(trip)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                  >
                    <Pencil className="size-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(`Delete "${trip.title}" and all its places? This cannot be undone.`)
                      ) {
                        deleteTrip.mutate(trip.id);
                      }
                    }}
                    disabled={deleteTrip.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">No trips yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first trip and start pinning places on the map.
          </p>
        </div>
      )}
    </div>
  );
}
