import type { BalloonState } from "@shared/game";
import { useNow } from "@/lib/useNow";
import type { ActiveProps } from "./types";

export function BalloonActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as BalloonState;
  const now = useNow(100);
  const remaining = Math.max(0, Math.ceil((mg.startedAt + mg.duration - now) / 1000));
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    const size = mg.size[key];
    const popped = mg.justPopped[key];
    const scale = 0.5 + size * 0.18;
    return (
      <div className="flex-1 flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between text-sm text-[color:var(--muted)]">
          <span className="text-2xl font-black tabular-nums text-white">{remaining}s</span>
          <span>
            Banked: <span className="font-black text-white text-lg">+{mg.banked[key]}</span>
          </span>
        </div>
        <div className="text-center text-xs text-[color:var(--muted)]">
          Bank to keep the points · a pop subtracts them from your score
        </div>
        <div className="flex-1 flex items-center justify-center min-h-[30vh]">
          <div
            className="text-[7rem] leading-none transition-transform duration-100"
            style={{ transform: `scale(${popped ? 0.4 : scale})` }}
          >
            {popped ? "💥" : "🎈"}
          </div>
        </div>
        <div className="text-center text-lg font-bold">
          {popped ? (
            <span className="text-[color:var(--bad)]">POP! −{mg.lastPopSize[key]} points</span>
          ) : (
            <span>
              At risk: <span className="font-black text-[color:var(--accent-3)]">{size}</span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => send({ type: "minigame-input", payload: { kind: "balloon-pump" } })}
            className="py-6 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] glow-pink active:scale-95 text-2xl font-black transition-transform"
          >
            Pump 💨
          </button>
          <button
            disabled={size === 0}
            onClick={() => send({ type: "minigame-input", payload: { kind: "balloon-bank" } })}
            className="py-6 rounded-2xl glass active:scale-95 text-2xl font-black transition-transform disabled:opacity-40"
          >
            Bank 💰
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-7xl font-black tabular-nums">{remaining}</div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {state.players.map((p) => {
          const k = slotOf(p.id);
          return (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="text-sm text-[color:var(--muted)]">{p.name}</div>
              <div className="text-5xl font-black tabular-nums" style={{ color: p.color }}>
                {mg.banked[k]}
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                {mg.justPopped[k] ? "💥 popped" : `🎈 ${mg.size[k]} in play`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
