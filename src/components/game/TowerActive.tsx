import type { ConfessionState } from "@shared/game";
import type { ActiveProps } from "./types";

function NumberPad({ onPick }: { onPick: (n: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2 w-full max-w-sm">
      {Array.from({ length: 10 }, (_, n) => (
        <button
          key={n}
          onClick={() => onPick(n)}
          className="aspect-square rounded-2xl glass active:scale-90 transition-transform text-2xl font-black"
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function TowerActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as ConfessionState;
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");
  const readerSlot = mg.confessorSlot === "p1" ? "p2" : "p1";
  const roundLabel = `Floor ${mg.round + 1} of ${mg.totalRounds}`;

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    const amConfessor = key === mg.confessorSlot;

    if (mg.phase === "reveal" && mg.lastResult) {
      const r = mg.lastResult;
      const myGain = amConfessor ? r.confessorGain : r.readerGain;
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
          <div className="text-lg">
            Secret <span className="text-3xl font-black text-[color:var(--accent-3)]">{r.secret}</span> · Guess{" "}
            <span className="text-3xl font-black">{r.guess}</span>
          </div>
          <div className="text-sm text-[color:var(--muted)]">Off by {r.gap}</div>
          <div className="text-3xl font-black text-[color:var(--good)]">+{myGain}</div>
        </div>
      );
    }

    if (mg.phase === "confess") {
      if (amConfessor) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4 text-center">
            <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
            <div className="text-xl font-black">🤫 Hide a number (0–9)</div>
            <div className="text-xs text-[color:var(--muted)] max-w-xs">
              Be unpredictable — the further their guess lands, the more you score.
            </div>
            <NumberPad onPick={(n) => send({ type: "minigame-input", payload: { kind: "tower-confess", value: n } })} />
          </div>
        );
      }
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
          <div className="text-xl font-bold">Your partner is hiding a number…</div>
          <div className="text-5xl">🗼</div>
        </div>
      );
    }

    // read phase
    if (!amConfessor) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4 text-center">
          <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
          <div className="text-xl font-black">🔮 Read their mind (0–9)</div>
          <div className="text-xs text-[color:var(--muted)] max-w-xs">The closer you guess, the more you score.</div>
          <NumberPad onPick={(n) => send({ type: "minigame-input", payload: { kind: "tower-read", value: n } })} />
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
        <div className="text-xl font-bold">
          You hid <span className="text-3xl font-black text-[color:var(--accent-3)]">{mg.secret ?? "?"}</span>
        </div>
        <div className="text-sm text-[color:var(--muted)]">Waiting for their guess…</div>
      </div>
    );
  }

  // Host / scoreboard
  const phaseText =
    mg.phase === "confess" ? "Hiding the number…" : mg.phase === "read" ? "Reading their mind…" : "Reveal";
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-sm uppercase tracking-widest text-[color:var(--accent-3)]">{roundLabel}</div>
      <div className="text-5xl">🗼</div>
      <div className="text-lg font-bold text-[color:var(--muted)]">{phaseText}</div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {state.players.map((p) => {
          const k = slotOf(p.id);
          const tag = k === mg.confessorSlot ? "🤫 Confessor" : "🔮 Reader";
          return (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="text-sm text-[color:var(--muted)]">{p.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-[color:var(--accent-3)]">{tag}</div>
              <div className="text-4xl font-black tabular-nums mt-1" style={{ color: p.color }}>
                {mg.points[k]}
              </div>
            </div>
          );
        })}
      </div>
      {mg.phase === "reveal" && mg.lastResult && (
        <div className="text-xl font-black">
          Secret {mg.lastResult.secret} · Guess {mg.lastResult.guess} · off by {mg.lastResult.gap}
        </div>
      )}
      <div className="text-xs text-[color:var(--muted)]">(Reader: {slotName(state, mg.slots[readerSlot])})</div>
    </div>
  );
}

function slotName(state: ActiveProps["state"], id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? "—";
}
