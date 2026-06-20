import type { NumberRushState } from "@shared/game";
import { useNow } from "@/lib/useNow";
import type { ActiveProps } from "./types";

export function NumberRushActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as NumberRushState;
  const now = useNow(100);
  const remaining = Math.max(0, Math.ceil((mg.startedAt + mg.duration - now) / 1000));
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");
  const cols = Math.round(Math.sqrt(mg.size)); // 25 → 5×5

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    const found = mg.progress[key];
    const nextTarget = found + 1;
    return (
      <div className="flex-1 flex flex-col gap-3 p-2 sm:p-4">
        <div className="flex items-center justify-between text-sm text-[color:var(--muted)] px-2">
          <span className="text-2xl font-black tabular-nums text-white">{remaining}s</span>
          <span>
            Next: <span className="font-black text-white text-2xl">{nextTarget}</span>
          </span>
        </div>
        <div className="grid gap-1.5 sm:gap-2 flex-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {mg.layout.map((value) => {
            const done = value <= found;
            return (
              <button
                key={value}
                disabled={done}
                onClick={() => send({ type: "minigame-input", payload: { kind: "number-rush-tap", value } })}
                className={`aspect-square rounded-xl text-xl sm:text-2xl font-black tabular-nums transition-all ${
                  done ? "bg-[color:var(--good)]/20 text-[color:var(--good)]/40" : "glass active:scale-90"
                }`}
              >
                {value}
              </button>
            );
          })}
        </div>
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
              {mg.progress[slotOf(p.id)]}/{mg.size}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
