import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Clock, MapPinned, Route as RouteIcon } from "lucide-react";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tripline — Track your trip plan on a live map" },
      {
        name: "description",
        content:
          "Plan your trip stops on an interactive map, mark the places you visited, note the time and attach photos.",
      },
      { property: "og:title", content: "Tripline — Track your trip plan on a live map" },
      {
        property: "og:description",
        content:
          "Plan your trip stops on an interactive map, mark the places you visited, note the time and attach photos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: RouteIcon,
    title: "Map and route",
    text: "Every stop is pinned and joined into your travel route on an interactive map.",
  },
  {
    icon: MapPinned,
    title: "Visited or not",
    text: "Tick off places as you go — visited pins turn green, planned pins stay amber.",
  },
  {
    icon: Clock,
    title: "Times and notes",
    text: "Record the exact time you arrived and jot down what you want to remember.",
  },
  {
    icon: Camera,
    title: "Photos on hover",
    text: "Hover a pin and the side panel shows that stop's details and photo.",
  },
];

function Landing() {
  const { session, loading } = useSession();

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid size-8 place-items-center rounded-xl bg-hero-gradient text-primary-foreground">
            <MapPinned className="size-4" />
          </span>
          Tripline
        </span>
        <Link
          to={!loading && session ? "/trips" : "/auth"}
          className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-secondary"
        >
          {!loading && session ? "My trips" : "Sign in"}
        </Link>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16">
        <div className="overflow-hidden rounded-3xl bg-hero-gradient p-8 text-primary-foreground shadow-lift sm:p-14">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase opacity-80">
            Trip planner &amp; travel log
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl leading-tight font-bold sm:text-5xl">
            Your whole trip on one map — planned, visited, timed.
          </h1>
          <p className="mt-4 max-w-xl text-sm opacity-90 sm:text-base">
            Pin the places you want to see, watch them join into a route, mark what you have
            visited, save the time you were there and attach a photo of the moment.
          </p>
          <Link
            to={!loading && session ? "/trips" : "/auth"}
            className="mt-8 inline-flex rounded-xl bg-card px-6 py-3 text-sm font-semibold text-foreground shadow-soft transition-transform hover:-translate-y-0.5"
          >
            {!loading && session ? "Open my trips" : "Start tracking free"}
          </Link>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <Icon className="size-5 text-primary" />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Maps &amp; place search by OpenStreetMap contributors
      </footer>
    </div>
  );
}
