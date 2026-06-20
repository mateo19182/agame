import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { checkAuthed } from "@/lib/api";

// Client-side gate: the SPA shell is public, but the data behind it (photos,
// rooms) is enforced server-side. This just routes unauthenticated visitors to
// the login screen for a clean UX.
export function RequireAuth() {
  const [status, setStatus] = useState<"checking" | "in" | "out">("checking");
  const location = useLocation();

  useEffect(() => {
    let active = true;
    checkAuthed().then((ok) => {
      if (active) setStatus(ok ? "in" : "out");
    });
    return () => {
      active = false;
    };
  }, []);

  if (status === "checking") {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-[color:var(--muted)] animate-pulse">Loading…</div>
      </main>
    );
  }
  if (status === "out") {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}
