import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { checkAuthed, login } from "@/lib/api";

/** Reject open-redirect targets — only same-origin absolute paths are allowed. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Already authenticated → skip the form.
  useEffect(() => {
    let active = true;
    checkAuthed().then((ok) => {
      if (active && ok) navigate(next, { replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await login(password);
    setPending(false);
    if (res.ok) navigate(next, { replace: true });
    else setError(res.error ?? "Wrong password");
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs uppercase tracking-[0.2em] text-[color:var(--muted)] mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)] animate-pulse" />
            Private
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-shadow-lg">
            <span className="bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent-2)] bg-clip-text text-transparent">
              magame
            </span>
          </h1>
          <p className="mt-3 text-[color:var(--muted)]">Enter the password to play.</p>
        </div>
        <div className="glass rounded-3xl p-6 sm:p-8">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-[color:var(--muted)] mb-2">Password</label>
              <input
                name="password"
                type="password"
                autoFocus
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-lg"
              />
            </div>
            {error && <div className="text-sm text-[color:var(--bad)] font-semibold">{error}</div>}
            <button
              type="submit"
              disabled={pending}
              className="w-full px-5 py-4 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-black text-lg glow-pink disabled:opacity-50"
            >
              {pending ? "Checking…" : "Enter →"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
