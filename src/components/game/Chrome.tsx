import { useEffect, useState } from "react";
import type { GameState } from "@shared/game";
import { MINIGAME_META } from "@shared/game";
import type { RoomError } from "@/lib/useRoom";

export function ErrorToast({ error }: { error?: RoomError | null }) {
  const [dismissedSeq, setDismissedSeq] = useState(0);
  // "rejoin-failed" is recovered automatically by the route — no need to alarm.
  const visible = !!error && error.code !== "rejoin-failed" && error.seq !== dismissedSeq;
  useEffect(() => {
    if (!visible || !error) return;
    const t = setTimeout(() => setDismissedSeq(error.seq), 4000);
    return () => clearTimeout(t);
  }, [visible, error]);
  if (!visible || !error) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl glass border border-[color:var(--bad)]/40 text-sm font-semibold text-[color:var(--bad)] shadow-lg">
      {error.message}
    </div>
  );
}

export function Header({ code, state, connected }: { code: string; state: GameState; connected: boolean }) {
  return (
    <header className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-6xl w-full mx-auto">
      <div className="flex items-center gap-3">
        <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">Room</div>
        <div className="px-3 py-1.5 rounded-xl glass font-black tracking-[0.3em] text-lg">{code}</div>
        <div
          className={`ml-2 flex items-center gap-1.5 text-xs ${connected ? "text-[color:var(--good)]" : "text-[color:var(--muted)]"}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[color:var(--good)]" : "bg-[color:var(--muted)]"}`} />
          {connected ? "Live" : "Reconnecting…"}
        </div>
      </div>
      <PhaseLabel state={state} />
    </header>
  );
}

function PhaseLabel({ state }: { state: GameState }) {
  const id = state.currentMinigame;
  const meta = id ? MINIGAME_META.find((m) => m.id === id) : null;
  const played = state.playedMinigames.length;
  const label = (() => {
    if (state.phase === "lobby") return "Lobby";
    if (state.phase === "minigame-intro") return meta ? `Up next · ${meta.label}` : "Up next";
    if (state.phase === "minigame-active") {
      const turn = Math.min(played + 1, state.settings.matchLength);
      return meta ? `Minigame ${turn} of ${state.settings.matchLength} · ${meta.label}` : "Minigame";
    }
    if (state.phase === "minigame-end") return meta ? `${meta.label} · Result` : "Result";
    if (state.phase === "final") return "Final";
    return "";
  })();
  return (
    <div className="hidden sm:block text-sm uppercase tracking-widest text-[color:var(--muted)]">{label}</div>
  );
}

export function ScoreBar({ state, youId }: { state: GameState; youId: string }) {
  return (
    <div className="px-4 sm:px-6 pb-4 max-w-6xl w-full mx-auto">
      <div className="glass rounded-2xl p-3 grid grid-cols-2 gap-3">
        {state.players.map((p) => (
          <div key={p.id} className="px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
              <span className="font-semibold truncate">
                {p.name}
                {p.id === youId && <span className="text-[color:var(--muted)] text-xs"> · you</span>}
              </span>
              <div className="text-xs text-[color:var(--muted)]">{p.connected ? "Connected" : "Disconnected"}</div>
            </div>
            <div className="text-2xl font-black tabular-nums">{p.score}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
