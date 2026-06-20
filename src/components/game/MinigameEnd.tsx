import type { GameState } from "@shared/game";
import { MINIGAME_META } from "@shared/game";
import type { Send } from "./types";

export function MinigameEnd({ state, isHost, send }: { state: GameState; isHost: boolean; send: Send }) {
  const result = state.minigameResult!;
  const meta = MINIGAME_META.find((m) => m.id === result.id);
  const winner = result.winnerId ? state.players.find((p) => p.id === result.winnerId) : null;
  const total = state.playedMinigames.length;
  const totalRounds = state.settings.matchLength;
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 p-4">
      <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">
        Round {total} of {totalRounds} · {meta?.label ?? "Done"}
      </div>
      <div className="text-7xl">{winner ? "🏆" : "🤝"}</div>
      <div className="text-3xl font-black">{winner ? `${winner.name} wins this round` : "Draw"}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
        {state.players.map((p) => {
          const delta = result.scoreDeltas[p.id] ?? 0;
          return (
            <div key={p.id} className="glass rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="font-bold">{p.name}</div>
                <div className="text-xs text-[color:var(--muted)]">Score {p.score}</div>
              </div>
              <div className={`text-2xl font-black tabular-nums ${delta > 0 ? "text-[color:var(--good)]" : ""}`}>
                {delta > 0 ? `+${delta}` : delta}
              </div>
            </div>
          );
        })}
      </div>
      {isHost && (
        <button
          onClick={() => send({ type: "next-question" })}
          className="mt-2 px-6 py-4 rounded-2xl bg-white/10 hover:bg-white/20 font-bold"
        >
          {total < totalRounds ? "Next minigame →" : "See final →"}
        </button>
      )}
    </div>
  );
}
