import type { GameState } from "@shared/game";
import type { Send } from "./types";

export function FinalView({ state, isHost, send }: { state: GameState; isHost: boolean; send: Send }) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-4">
      <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">Final</div>
      <h2 className="text-5xl sm:text-7xl font-black text-shadow-lg">
        {winner?.name}{" "}
        <span className="bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent-2)] bg-clip-text text-transparent">
          wins
        </span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl mt-4">
        {sorted.map((p, i) => (
          <div key={p.id} className="glass rounded-2xl p-5 flex items-center gap-3">
            <div className="text-3xl">{i === 0 ? "🥇" : "🥈"}</div>
            <div className="flex-1 text-left">
              <div className="font-bold text-lg">{p.name}</div>
              <div className="text-xs text-[color:var(--muted)]">Final score</div>
            </div>
            <div className="text-3xl font-black tabular-nums">{p.score}</div>
          </div>
        ))}
      </div>
      {isHost && (
        <button
          onClick={() => send({ type: "play-again" })}
          className="mt-6 px-8 py-5 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-black text-2xl glow-pink"
        >
          Play again →
        </button>
      )}
    </div>
  );
}
