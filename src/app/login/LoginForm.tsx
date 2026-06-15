"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await loginAction(formData);
      return result ?? null;
    },
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="block text-xs uppercase tracking-widest text-[color:var(--muted)] mb-2">
          Password
        </label>
        <input
          name="password"
          type="password"
          autoFocus
          required
          autoComplete="current-password"
          className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-lg"
        />
      </div>
      {state?.error && (
        <div className="text-sm text-[color:var(--bad)] font-semibold">{state.error}</div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full px-5 py-4 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-black text-lg glow-pink disabled:opacity-50"
      >
        {pending ? "Checking…" : "Enter →"}
      </button>
    </form>
  );
}
