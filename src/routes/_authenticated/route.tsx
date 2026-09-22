import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Compass, LogOut, MapPinned } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, loading, user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: "/auth", replace: true });
    }
  }, [loading, session, navigate]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Compass className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/trips" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid size-8 place-items-center rounded-xl bg-hero-gradient text-primary-foreground">
              <MapPinned className="size-4" />
            </span>
            Tripline
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium transition-colors hover:bg-secondary"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
