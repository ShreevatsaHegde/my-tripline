import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, MapIcon, Repeat, Route } from "lucide-react";
import { fetchAllPlaces, fetchLeg, type Place, type Trip } from "@/lib/trip-api";

function formatWhen(value: string | null) {
  if (!value) return "no time noted";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TripDashboard({ trips }: { trips: Trip[] }) {
  const { data: places } = useQuery({ queryKey: ["all-places"], queryFn: fetchAllPlaces });

  const all: Place[] = places ?? [];
  const visited = all.filter((p) => p.visited);
  const tripTitle = new Map(trips.map((t) => [t.id, t.title]));

  // Total distance honours each leg's road/flight choice (road = real road distance).
  const legsKey = all.map((p) => `${p.id}:${p.latitude},${p.longitude}:${p.travel_mode}`).join("|");
  const { data: totalKm = 0 } = useQuery({
    queryKey: ["dashboard-legs", legsKey],
    queryFn: async () => {
      let sum = 0;
      for (const trip of trips) {
        const own = all.filter((p) => p.trip_id === trip.id);
        const legs = await Promise.all(own.slice(1).map((p, i) => fetchLeg(own[i]!, p)));
        sum += legs.reduce((s, l) => s + l.km, 0);
      }
      return sum;
    },
    staleTime: 60 * 60 * 1000,
    enabled: all.length > 1,
  });

  const tripsDone = trips.filter((t) => {
    if (t.completed) return true;
    const own = all.filter((p) => p.trip_id === t.id);
    return own.length > 0 && own.every((p) => p.visited);
  }).length;

  const recent = [...visited]
    .sort((a, b) => (b.visited_at ?? "").localeCompare(a.visited_at ?? ""))
    .slice(0, 5);

  const counts = new Map<string, number>();
  for (const p of visited) {
    const key = p.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const mostVisited = [...counts.entries()]
    .map(([key, count]) => ({
      count,
      name: visited.find((p) => p.name.trim().toLowerCase() === key)!.name,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);

  const stats = [
    { label: "Trips completed", value: `${tripsDone} / ${trips.length}`, icon: CheckCircle2 },
    { label: "Places visited", value: `${visited.length}`, icon: MapIcon },
    { label: "Kilometres travelled", value: `${totalKm.toFixed(1)} km`, icon: Route },
    { label: "Places planned", value: `${all.length}`, icon: Repeat },
  ];

  return (
    <section className="mt-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-card p-5 shadow-soft"
          >
            <stat.icon className="size-5 text-primary" />
            <p className="mt-3 text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="text-sm font-semibold">Recently visited</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing ticked off yet — mark a place as visited to see it here.
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {recent.map((p) => (
                <li key={p.id} className="text-sm">
                  <Link
                    to="/trips/$tripId"
                    params={{ tripId: p.trip_id }}
                    className="font-medium hover:text-primary"
                  >
                    {p.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {tripTitle.get(p.trip_id) ?? "Trip"} · {formatWhen(p.visited_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="text-sm font-semibold">Most visited places</h2>
          {mostVisited.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Visit a few places and your favourites will show up here.
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {mostVisited.map((row) => (
                <li key={row.name} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.count} {row.count === 1 ? "visit" : "visits"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
