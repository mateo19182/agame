import type { DoubtGem, DoubtState } from "@shared/game";
import type { ActiveProps } from "./types";

const GEMS: Record<DoubtGem, { emoji: string; label: string; color: string }> = {
  ruby: { emoji: "🔴", label: "Ruby", color: "#ef4444" },
  sapphire: { emoji: "🔵", label: "Sapphire", color: "#3b82f6" },
  emerald: { emoji: "🟢", label: "Emerald", color: "#22c55e" },
  topaz: { emoji: "🟡", label: "Topaz", color: "#eab308" },
};

const GEM_IDS: DoubtGem[] = ["ruby", "sapphire", "emerald", "topaz"];

function GemButton({ gem, onPick }: { gem: DoubtGem; onPick: (g: DoubtGem) => void }) {
  return (
    <button
      onClick={() => onPick(gem)}
      className="flex flex-col items-center gap-1 py-5 rounded-3xl glass active:scale-90 transition-transform"
    >
      <span className="text-5xl">{GEMS[gem].emoji}</span>
      <span className="text-sm font-bold">{GEMS[gem].label}</span>
    </button>
  );
}

export function DoubtActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as DoubtState;
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");
  const callerSlot = mg.tellerSlot === "p1" ? "p2" : "p1";
  const roundLabel = `Round ${mg.round + 1} of ${mg.totalRounds}`;

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    const amTeller = key === mg.tellerSlot;

    if (mg.phase === "reveal" && mg.lastResult) {
      const r = mg.lastResult;
      const iWon = amTeller ? !r.callerWon : r.callerWon;
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
          <div className="text-5xl">{GEMS[r.secret].emoji}</div>
          <div className="text-lg">
            It was a <b>{GEMS[r.secret].label}</b>. Claimed <b>{GEMS[r.claim].label}</b> —{" "}
            {r.lie ? "a LIE 🤥" : "the TRUTH 😇"}
          </div>
          <div className={`text-2xl font-black ${iWon ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
            {iWon ? "You win the round!" : "You lose the round"}
          </div>
        </div>
      );
    }

    if (mg.phase === "claim") {
      if (amTeller) {
        const gem = mg.secret;
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4 text-center">
            <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
            <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">Only you can see it</div>
            <div className="text-6xl">{gem ? GEMS[gem].emoji : "❓"}</div>
            <div className="text-lg font-bold">It&apos;s a {gem ? GEMS[gem].label : "gem"}.</div>
            <div className="text-xs text-[color:var(--muted)]">Claim any gem — tell the truth, or sell a lie.</div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              {GEM_IDS.map((g) => (
                <GemButton key={g} gem={g} onPick={(gg) => send({ type: "minigame-input", payload: { kind: "doubt-claim", gem: gg } })} />
              ))}
            </div>
          </div>
        );
      }
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
          <div className="text-6xl">🃏</div>
          <div className="text-xl font-bold">Your partner is inspecting the gem…</div>
          <div className="text-xs text-[color:var(--muted)]">Watch their face. They&apos;ll make a claim.</div>
        </div>
      );
    }

    // call phase
    if (key === callerSlot) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4 text-center">
          <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
          <div className="text-lg">They claim it&apos;s a…</div>
          <div className="text-6xl">{mg.claim ? GEMS[mg.claim].emoji : "❓"}</div>
          <div className="text-2xl font-black">{mg.claim ? GEMS[mg.claim].label : ""}</div>
          <div className="text-xs text-[color:var(--muted)]">Truth or lie?</div>
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            <button
              onClick={() => send({ type: "minigame-input", payload: { kind: "doubt-call", doubt: false } })}
              className="py-6 rounded-2xl bg-gradient-to-br from-[color:var(--good)]/80 to-[color:var(--good)]/50 active:scale-95 text-2xl font-black transition-transform"
            >
              😇 Trust
            </button>
            <button
              onClick={() => send({ type: "minigame-input", payload: { kind: "doubt-call", doubt: true } })}
              className="py-6 rounded-2xl bg-gradient-to-br from-[color:var(--bad)]/80 to-[color:var(--bad)]/50 active:scale-95 text-2xl font-black transition-transform"
            >
              🤥 Doubt!
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="text-sm text-[color:var(--muted)]">{roundLabel}</div>
        <div className="text-xl font-bold">
          You claimed <b>{mg.claim ? GEMS[mg.claim].label : "—"}</b>.
        </div>
        <div className="text-sm text-[color:var(--muted)]">Hold your nerve… awaiting their verdict.</div>
      </div>
    );
  }

  // Host / scoreboard
  const phaseText = mg.phase === "claim" ? "Making a claim…" : mg.phase === "call" ? "Calling it…" : "Reveal";
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-sm uppercase tracking-widest text-[color:var(--accent-3)]">{roundLabel}</div>
      <div className="text-5xl">🃏</div>
      <div className="text-lg font-bold text-[color:var(--muted)]">{phaseText}</div>
      {(mg.phase === "call" || mg.phase === "reveal") && mg.claim && (
        <div className="text-xl">
          Claim: {GEMS[mg.claim].emoji} <b>{GEMS[mg.claim].label}</b>
        </div>
      )}
      {mg.phase === "reveal" && mg.lastResult && (
        <div className="text-xl font-black">
          Really {GEMS[mg.lastResult.secret].emoji} {GEMS[mg.lastResult.secret].label} —{" "}
          {mg.lastResult.lie ? "LIE 🤥" : "TRUTH 😇"}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {state.players.map((p) => {
          const k = slotOf(p.id);
          return (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="text-sm text-[color:var(--muted)]">{p.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-[color:var(--accent-3)]">
                {k === mg.tellerSlot ? "🗣️ Teller" : "🔎 Caller"}
              </div>
              <div className="text-4xl font-black tabular-nums mt-1" style={{ color: p.color }}>
                {mg.scores[k]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
