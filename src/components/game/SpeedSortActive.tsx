import type { SpeedSortState } from "@shared/game";
import { useNow } from "@/lib/useNow";
import type { ActiveProps } from "./types";

export function SpeedSortActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as SpeedSortState;
  const now = useNow(100);
  const remaining = Math.max(0, Math.ceil((mg.startedAt + mg.duration - now) / 1000));
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    const myBin = key === "p1" ? "left" : "right";
    return (
      <div className="flex-1 flex flex-col gap-4 p-4">
        <div className="text-center text-3xl font-black tabular-nums">
          {remaining}s · {mg.progress[key]}/{mg.items.length}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {mg.items.map((it, i) => {
            const isDone = i < mg.progress[key];
            return (
              <button
                key={it.id}
                disabled={isDone}
                onClick={() => {
                  const correct = it.bin === myBin;
                  send({ type: "minigame-input", payload: { kind: "speed-sort-place", itemId: it.id, correct } });
                }}
                className={`px-3 py-4 rounded-2xl text-base font-bold ${isDone ? "opacity-30" : "glass active:scale-95"}`}
              >
                {it.label}
              </button>
            );
          })}
        </div>
        <div className="flex justify-around text-sm text-[color:var(--muted)]">
          <span>← {myBin === "left" ? "Fruits" : "Veggies"}</span>
          <span>{myBin === "left" ? "Veggies" : "Fruits"} →</span>
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
            <div className="text-4xl font-black tabular-nums">
              {mg.progress[slotOf(p.id)]}/{mg.items.length}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
