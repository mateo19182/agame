import type { WhackState } from "@shared/game";
import { useNow } from "@/lib/useNow";
import type { ActiveProps } from "./types";

export function WhackActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as WhackState;
  const now = useNow(100);
  const remaining = Math.max(0, Math.ceil((mg.startedAt + mg.duration - now) / 1000));
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    const target = mg.sequence[mg.progress[key]];
    return (
      <div className="flex-1 flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between text-sm text-[color:var(--muted)]">
          <span className="text-2xl font-black tabular-nums text-white">{remaining}s</span>
          <span>
            Hits: <span className="font-black text-white text-lg">{mg.progress[key]}</span>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 flex-1 max-h-[60vh]">
          {Array.from({ length: 9 }, (_, cell) => {
            const isMole = cell === target;
            return (
              <button
                key={cell}
                onClick={() => send({ type: "minigame-input", payload: { kind: "whack-tap", cell } })}
                className={`rounded-3xl flex items-center justify-center text-5xl transition-all ${
                  isMole
                    ? "bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] glow-pink active:scale-90"
                    : "bg-white/5"
                }`}
              >
                {isMole ? "🐹" : ""}
              </button>
            );
          })}
        </div>
        <div className="text-center text-sm text-[color:var(--muted)]">Tap the mole!</div>
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
              {mg.progress[slotOf(p.id)]}
            </div>
            <div className="text-xs text-[color:var(--muted)]">whacks</div>
          </div>
        ))}
      </div>
    </div>
  );
}
