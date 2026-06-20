import type { ReflexState } from "@shared/game";
import type { ActiveProps } from "./types";

export function ReflexActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as ReflexState;
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
        <div className="text-7xl font-black tabular-nums">{mg.lightsOn ? "GO" : "Wait…"}</div>
        <button
          disabled={!mg.lightsOn}
          onClick={() => send({ type: "minigame-input", payload: { kind: "reflex-tap" } })}
          className={`w-72 h-72 rounded-full text-4xl font-black transition-all ${mg.lightsOn ? "bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] glow-pink active:scale-95" : "bg-white/10 opacity-50"}`}
        >
          {mg.lightsOn ? "TAP!" : "..."}
        </button>
        <div className="text-[color:var(--muted)] text-sm">Taps: {mg.taps[key]}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-7xl font-black tabular-nums">
        {mg.status === "live" ? (mg.lightsOn ? "GO!" : "Wait for green…") : "..."}
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {state.players.map((p) => (
          <div key={p.id} className="glass rounded-2xl p-4">
            <div className="text-sm text-[color:var(--muted)]">{p.name}</div>
            <div className="text-4xl font-black tabular-nums">{mg.taps[slotOf(p.id)]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
