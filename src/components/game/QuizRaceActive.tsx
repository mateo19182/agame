import type { QuizRaceState } from "@shared/game";
import { useNow } from "@/lib/useNow";
import type { ActiveProps } from "./types";

export function QuizRaceActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as QuizRaceState;
  const now = useNow(100);
  const remaining = Math.max(0, Math.ceil((mg.startedAt + mg.duration - now) / 1000));
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    const round = mg.rounds[mg.progress[key]];
    const last = mg.lastCorrect[key];
    return (
      <div className="flex-1 flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between text-sm text-[color:var(--muted)]">
          <span className="text-2xl font-black tabular-nums text-white">{remaining}s</span>
          <span>
            Correct: <span className="font-black text-white text-lg">{mg.correct[key]}</span>
          </span>
        </div>
        {round ? (
          <>
            {round.sub && <div className="text-center text-sm text-[color:var(--muted)]">{round.sub}</div>}
            <div
              className="text-center text-5xl sm:text-6xl font-black py-6 break-words"
              style={round.promptColor ? { color: round.promptColor } : undefined}
            >
              {round.prompt}
            </div>
            <div className={`grid gap-3 ${round.options.length <= 2 ? "grid-cols-1" : "grid-cols-2"}`}>
              {round.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => send({ type: "minigame-input", payload: { kind: "quiz-answer", index: i } })}
                  className="px-4 py-6 rounded-2xl glass active:scale-95 text-2xl font-bold transition-transform"
                >
                  {opt}
                </button>
              ))}
            </div>
            <div className="h-6 text-center font-black text-xl">
              {last === true && <span className="text-[color:var(--good)]">✓ Correct!</span>}
              {last === false && <span className="text-[color:var(--bad)]">✗ Nope</span>}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-2xl font-black">Out of questions! 🎉</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-7xl font-black tabular-nums">{remaining}</div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {state.players.map((p) => (
          <div key={p.id} className="glass rounded-2xl p-4">
            <div className="text-sm text-[color:var(--muted)]">{p.name}</div>
            <div className="text-5xl font-black tabular-nums" style={{ color: p.color }}>
              {mg.correct[slotOf(p.id)]}
            </div>
            <div className="text-xs text-[color:var(--muted)]">correct</div>
          </div>
        ))}
      </div>
    </div>
  );
}
