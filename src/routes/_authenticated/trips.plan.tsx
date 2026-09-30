import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateTripPlan, type AiPlan } from "@/lib/ai-plan.functions";
import { PIT_STOP_META, searchPlaceByName, type PlaceKind } from "@/lib/trip-api";

export const Route = createFileRoute("/_authenticated/trips/plan")({
  head: () => ({
    meta: [
      { title: "Plan my trip with AI — Tripline" },
      { name: "description", content: "Describe your trip and get a day-by-day itinerary you can save as a trip." },
      { property: "og:title", content: "Plan my trip with AI — Tripline" },
      { property: "og:description", content: "Describe your trip and get a day-by-day itinerary you can save as a trip." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanPage,
});

type Row = {
  key: string;
  name: string;
  address: string;
  lat: number | null;
  lon: number | null;
  kind: PlaceKind;
  day: number;
  notes: string;
};

const KINDS: { value: PlaceKind; label: string }[] = [
  { value: "start", label: "🚩 Start" },
  { value: "destination", label: "📍 Destination" },
  { value: "hotel", label: `${PIT_STOP_META.hotel.emoji} Hotel` },
  { value: "break", label: `${PIT_STOP_META.break.emoji} Break` },
  { value: "fuel", label: `${PIT_STOP_META.fuel.emoji} Fuel` },
  { value: "end", label: "🏁 End" },
];

const input =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

function PlanPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const generate = useServerFn(generateTripPlan);
  const [form, setForm] = useState({
    start: "",
    end: "",
    destination: "",
    startDate: "",
    days: 3,
    people: "",
    preferences: "",
    interests: "",
    budget: "",
  });
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<AiPlan | null>(null);
  const [title, setTitle] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  async function run() {
    if (!form.start.trim()) { toast.error("Enter a starting location"); return; }
    setLoading(true);
    try {
      const p = await generate({ data: form });
      // Look up real map positions for each stop, keeping the AI's position as a fallback.
      const located = await Promise.all(
        p.stops.map(async (s, i) => {
          let lat = s.lat;
          let lon = s.lon;
          let address = s.region;
          try {
            const r = (await searchPlaceByName(`${s.name}, ${s.region}`))[0];
            if (r) {
              lat = r.lat;
              lon = r.lon;
              address = r.address;
            }
          } catch {
            /* keep AI coords */
          }
          return {
            key: `${i}-${s.name}`,
            name: s.name,
            address,
            lat,
            lon,
            kind: s.kind,
            day: s.day,
            notes: [s.activities, s.travel && `Travel: ${s.travel}`].filter(Boolean).join("\n"),
          } satisfies Row;
        }),
      );
      setPlan(p);
      setTitle(p.title);
      setItinerary(p.itinerary);
      setRows(located);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate a plan");
    } finally {
      setLoading(false);
    }
  }

  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const move = (i: number, d: number) =>
    setRows((r) => {
      const n = [...r];
      const j = i + d;
      if (j < 0 || j >= n.length) return r;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  async function addRow() {
    if (q.trim().length < 2) return;
    try {
      const r = (await searchPlaceByName(q))[0];
      if (!r) { toast.error("Place not found"); return; }
      const lastDay = rows.at(-1)?.day ?? 1;
      const row: Row = { key: crypto.randomUUID(), name: r.name, address: r.address, lat: r.lat, lon: r.lon, kind: "destination", day: lastDay, notes: "" };
      setRows((rs) => {
        const endIdx = rs.findIndex((x) => x.kind === "end");
        if (endIdx === -1) return [...rs, row];
        return [...rs.slice(0, endIdx), row, ...rs.slice(endIdx)];
      });
      setQ("");
    } catch {
      toast.error("Search failed");
    }
  }

  async function save() {
    const usable = rows.filter((r) => r.lat != null && r.lon != null);
    if (usable.length === 0) { toast.error("Add at least one place with a map location"); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error("Not signed in");
      const end =
        form.startDate &&
        new Date(new Date(form.startDate).getTime() + (form.days - 1) * 86_400_000).toISOString().slice(0, 10);
      const { data: trip, error } = await supabase
        .from("trips")
        .insert({
          user_id: userId,
          title: title || "AI trip",
          description: [plan?.summary, itinerary].filter(Boolean).join("\n\n") || null,
          start_date: form.startDate || null,
          end_date: end || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: pe } = await supabase.from("places").insert(
        usable.map((r, i) => ({
          trip_id: trip.id,
          user_id: userId,
          name: r.name,
          address: r.address || null,
          latitude: r.lat!,
          longitude: r.lon!,
          notes: [`Day ${r.day}`, r.notes].filter(Boolean).join(" · "),
          sort_order: i,
          kind: r.kind,
          day_number: r.day,
          visited: false,
        })),
      );
      if (pe) throw pe;
      await qc.invalidateQueries({ queryKey: ["trips"] });
      toast.success("Trip saved from your AI plan");
      void navigate({ to: "/trips/$tripId", params: { tripId: trip.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const days = [...new Set(rows.map((r) => r.day))].sort((a, b) => a - b);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <Link to="/trips" className="text-sm text-muted-foreground hover:text-primary">← My trips</Link>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold">
        <Sparkles className="size-7 text-primary" /> Plan my trip with AI
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Describe your trip. You can review and change everything before it is saved.
      </p>

      <div className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft sm:grid-cols-2">
        <label className="text-sm">Starting location *
          <input className={input} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} placeholder="Sirsi" />
        </label>
        <label className="text-sm">End location (blank = back to start)
          <input className={input} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </label>
        <label className="text-sm sm:col-span-2">Destination / area
          <input className={input} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Coastal Karnataka" />
        </label>
        <label className="text-sm">Start date
          <input type="date" className={input} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </label>
        <label className="text-sm">Number of days
          <input type="number" min={1} max={30} className={input} value={form.days} onChange={(e) => setForm({ ...form, days: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })} />
        </label>
        <label className="text-sm">People
          <input className={input} value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} placeholder="2 adults" />
        </label>
        <label className="text-sm">Budget
          <input className={input} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="₹15,000" />
        </label>
        <label className="text-sm sm:col-span-2">Travel preferences
          <input className={input} value={form.preferences} onChange={(e) => setForm({ ...form, preferences: e.target.value })} placeholder="By car, relaxed pace, avoid night driving" />
        </label>
        <label className="text-sm sm:col-span-2">Places, interests & adventure
          <textarea rows={2} className={input} value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} placeholder="Waterfalls, beaches, river rafting in Dandeli, temples" />
        </label>
        <button
          onClick={() => void run()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 sm:col-span-2"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {loading ? "Planning your trip…" : plan ? "Generate again" : "Plan My Trip with AI"}
        </button>
      </div>

      {plan && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <label className="text-sm font-semibold">Trip name
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            {plan.summary && <p className="mt-3 text-sm text-muted-foreground">{plan.summary}</p>}
            <label className="mt-3 block text-sm font-semibold">Day-by-day itinerary
              <textarea rows={10} className={`${input} font-mono text-xs`} value={itinerary} onChange={(e) => setItinerary(e.target.value)} />
            </label>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="text-sm font-semibold">Route stops · review before saving</h2>
            <p className="text-xs text-muted-foreground">
              Nothing is marked visited — you tick places off yourself during the trip. You can pick the exact road after saving.
            </p>
            {days.map((d) => (
              <div key={d} className="mt-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-primary">Day {d}</h3>
                <ul className="mt-2 space-y-2">
                  {rows.map((r, i) =>
                    r.day !== d ? null : (
                      <li key={r.key} className="rounded-xl border border-border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <select className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs" value={r.kind} onChange={(e) => update(i, { kind: e.target.value as PlaceKind })}>
                            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                          </select>
                          <input className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm font-medium" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
                          <label className="text-xs">Day
                            <input type="number" min={1} className="ml-1 w-14 rounded-lg border border-input bg-background px-2 py-1 text-xs" value={r.day} onChange={(e) => update(i, { day: Math.max(1, Number(e.target.value) || 1) })} />
                          </label>
                          <button aria-label="Move up" onClick={() => move(i, -1)} className="rounded-md p-1.5 hover:bg-secondary"><ArrowUp className="size-4" /></button>
                          <button aria-label="Move down" onClick={() => move(i, 1)} className="rounded-md p-1.5 hover:bg-secondary"><ArrowDown className="size-4" /></button>
                          <button aria-label="Remove" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-destructive hover:bg-secondary"><Trash2 className="size-4" /></button>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.lat == null ? "⚠ No map location found — will be skipped" : r.address}
                        </p>
                        <textarea rows={2} className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs" value={r.notes} onChange={(e) => update(i, { notes: e.target.value })} />
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
            <div className="mt-4 flex gap-2">
              <input className={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addRow()} placeholder="Add another place, e.g. Murudeshwar" />
              <button onClick={() => void addRow()} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-secondary">
                <Plus className="size-4" /> Add
              </button>
            </div>
          </div>

          <button
            onClick={() => void save()}
            disabled={saving}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Accept plan & create trip"}
          </button>
        </div>
      )}
    </div>
  );
}
