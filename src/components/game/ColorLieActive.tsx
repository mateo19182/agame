import type { ColorLieState } from "@shared/game";
import { useNow } from "@/lib/useNow";
import type { ActiveProps } from "./types";

export function ColorLieActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as ColorLieState;
  const now = useNow(200);
  const remaining = Math.max(0, Math.ceil((mg.startedAt + mg.duration - now) / 1000));
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");
  const round = mg.rounds[mg.index];

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    const locked = mg.lockedOut[key];
    return (
      <div className="flex-1 flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between text-sm text-[color:var(--muted)]">
          <span className="text-2xl font-black tabular-nums text-white">{remaining}s</span>
          <span>
            Score <span className="font-black text-white text-lg">{mg.scores[key]}</span>
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-[22vh]">
          {round && (
            <div className="text-6xl sm:text-7xl font-black" style={{ color: round.inkHex }}>
              {round.word}
            </div>
          )}
        </div>
        <div className="text-center text-sm font-bold h-5">
          {locked ? <span className="text-[color:var(--bad)]">Missed — wait for the next one</span> : "Tap the COLOR, not the word"}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {round?.options.map((opt, i) => (
            <button
              key={i}
              disabled={locked}
              onClick={() =>
                send({ type: "minigame-input", payload: { kind: "color-lie-tap", index: mg.index, optionIndex: i } })
              }
              className="py-6 rounded-2xl font-black text-lg active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: `${opt.hex}33`, border: `2px solid ${opt.hex}` }}
            >
              <span className="w-5 h-5 rounded-full" style={{ background: opt.hex }} />
              {opt.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-5xl font-black tabular-nums">{remaining}</div>
      {round && (
        <div className="text-6xl sm:text-8xl font-black" style={{ color: round.inkHex }}>
          {round.word}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {state.players.map((p) => {
          const k = slotOf(p.id);
          const flash = mg.lastResult?.winner === k;
          return (
            <div key={p.id} className={`glass rounded-2xl p-4 transition-colors ${flash ? "ring-2 ring-[color:var(--good)]" : ""}`}>
              <div className="text-sm text-[color:var(--muted)]">{p.name}</div>
              <div className="text-5xl font-black tabular-nums" style={{ color: p.color }}>
                {mg.scores[k]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
