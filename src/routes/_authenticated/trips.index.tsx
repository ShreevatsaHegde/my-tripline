import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchTrips } from "@/lib/trip-api";

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

function TripsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: trips, isLoading } = useQuery({ queryKey: ["trips"], queryFn: fetchTrips });

  const createTrip = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("trips").insert({
        user_id: userId,
        title,
        description: description || null,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trip created");
      setOpen(false);
      setTitle("");
      setDescription("");
      setStartDate("");
      setEndDate("");
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Trip name (e.g. Kerala backwaters)"
            className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring sm:col-span-2"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short note about this trip"
            className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring sm:col-span-2"
          />
          <label className="text-xs font-medium text-muted-foreground">
            Starts
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Ends
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
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

      {isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading your trips…</p>
      ) : trips && trips.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <Link
              key={trip.id}
              to="/trips/$tripId"
              params={{ tripId: trip.id }}
              className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift"
            >
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
          ))}
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
