import type { GameState } from "@shared/game";
import { MINIGAME_META } from "@shared/game";
import type { Send } from "./types";

export function MinigameIntro({ state, isHost, send }: { state: GameState; isHost: boolean; send: Send }) {
  const id = state.currentMinigame!;
  const meta = MINIGAME_META.find((m) => m.id === id)!;
  const turn = state.playedMinigames.length + 1;
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-4">
      <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">
        Round {turn} of {state.settings.matchLength}
      </div>
      <h2 className="text-4xl sm:text-6xl font-black">{meta.label}</h2>
      <p className="text-[color:var(--muted)] max-w-md">{meta.description}</p>
      {id === "trivia" && state.settings.minigames.trivia.useWagers && (
        <div className="glass rounded-2xl px-4 py-2 text-sm text-[color:var(--accent-3)]">Wagers enabled</div>
      )}
      {isHost ? (
        <button
          onClick={() => send({ type: "next-question" })}
          className="px-8 py-5 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-black text-2xl glow-pink"
        >
          Begin →
        </button>
      ) : (
        <div className="text-[color:var(--muted)]">Waiting for the host to start…</div>
      )}
    </div>
  );
}
