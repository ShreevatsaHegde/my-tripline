import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPinned } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Tripline trip tracker" },
      {
        name: "description",
        content: "Sign in to Tripline to plan routes, mark visited places and note your times.",
      },
      { property: "og:title", content: "Sign in — Tripline trip tracker" },
      {
        property: "og:description",
        content: "Sign in to Tripline to plan routes, mark visited places and note your times.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/trips", replace: true });
  }, [loading, session, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/trips", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-hero-gradient p-10 text-primary-foreground lg:flex">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold">
          <MapPinned className="size-5" /> Tripline
        </Link>
        <div className="max-w-sm">
          <h2 className="text-3xl font-bold">Every stop, every hour, on one map.</h2>
          <p className="mt-3 text-sm opacity-90">
            Plan your route, tick off the places you have seen, add photos and keep the exact time
            you were there.
          </p>
        </div>
        <p className="text-xs opacity-70">Maps by OpenStreetMap contributors</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to open your trips."
              : "Start tracking your trips in a minute."}
          </p>

          <button
            onClick={handleGoogle}
            className="mt-6 w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
          >
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {mode === "signin"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
