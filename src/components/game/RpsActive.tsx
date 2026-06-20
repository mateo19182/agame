import type { RpsChoice, RpsState } from "@shared/game";
import type { ActiveProps } from "./types";

const CHOICES: { id: RpsChoice; emoji: string; label: string }[] = [
  { id: "rock", emoji: "✊", label: "Rock" },
  { id: "paper", emoji: "✋", label: "Paper" },
  { id: "scissors", emoji: "✌️", label: "Scissors" },
];

const EMOJI: Record<RpsChoice, string> = { rock: "✊", paper: "✋", scissors: "✌️" };

export function RpsActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as RpsState;
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");
  const roundLabel = `Round ${Math.min(mg.round + 1, mg.bestOf)} of ${mg.bestOf}`;

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    const myChoice = mg.choices[key];
    if (mg.phase === "reveal" && mg.reveal) {
      const iWon = mg.reveal.winner === key;
      const tie = mg.reveal.winner === null;
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4 text-center">
          <div className="text-7xl">{EMOJI[mg.reveal[key]]}</div>
          <div className={`text-3xl font-black ${tie ? "" : iWon ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
            {tie ? "Tie!" : iWon ? "You won the round!" : "You lost the round"}
          </div>
          <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4">
        <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
        <div className="text-xl font-bold">{myChoice ? "Locked in — waiting…" : "Make your choice!"}</div>
        <div className="grid grid-cols-3 gap-3 w-full max-w-md">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              disabled={Boolean(myChoice)}
              onClick={() => send({ type: "minigame-input", payload: { kind: "rps-choose", choice: c.id } })}
              className={`flex flex-col items-center gap-1 py-6 rounded-3xl transition-all ${
                myChoice === c.id
                  ? "bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] glow-pink"
                  : myChoice
                    ? "bg-white/5 opacity-40"
                    : "glass active:scale-90"
              }`}
            >
              <span className="text-5xl">{c.emoji}</span>
              <span className="text-xs font-bold">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-sm uppercase tracking-widest text-[color:var(--accent-3)]">{roundLabel}</div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-md items-center">
        {state.players.map((p) => {
          const k = slotOf(p.id);
          const reveal = mg.phase === "reveal" && mg.reveal ? mg.reveal[k] : null;
          const chosen = mg.choices[k] !== null;
          return (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="text-sm text-[color:var(--muted)]">{p.name}</div>
              <div className="text-6xl my-2">{reveal ? EMOJI[reveal] : chosen ? "🔒" : "…"}</div>
              <div className="text-3xl font-black tabular-nums" style={{ color: p.color }}>
                {mg.wins[k]}
              </div>
            </div>
          );
        })}
      </div>
      {mg.phase === "reveal" && mg.reveal && (
        <div className="text-2xl font-black">
          {mg.reveal.winner === null ? "Tie!" : `${state.players.find((p) => slotOf(p.id) === mg.reveal!.winner)?.name} takes it`}
        </div>
      )}
    </div>
  );
}
