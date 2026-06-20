import { useEffect, useRef, useState } from "react";
import type { MirrorMatchState } from "@shared/game";
import { useNow } from "@/lib/useNow";
import type { ActiveProps } from "./types";

const PADS = [
  { hex: "#ef4444", glow: "#ef444488" },
  { hex: "#3b82f6", glow: "#3b82f688" },
  { hex: "#22c55e", glow: "#22c55e88" },
  { hex: "#eab308", glow: "#eab30888" },
];

const STEP_MS = 620;

export function MirrorMatchActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as MirrorMatchState;
  const now = useNow(200);
  const remaining = Math.max(0, Math.ceil((mg.startedAt + mg.duration - now) / 1000));
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    return (
      <MirrorPlayer
        // Remount on every level/strike change so the watch animation restarts
        // from fresh initial state (no synchronous setState inside the effect).
        key={`${mg.level[key]}-${mg.strikes[key]}`}
        level={mg.level[key]}
        strikes={mg.strikes[key]}
        cleared={mg.cleared[key]}
        pos={mg.pos[key]}
        sequence={mg.sequence}
        remaining={remaining}
        onTap={(pad) => send({ type: "minigame-input", payload: { kind: "mirror-tap", pad } })}
      />
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
                {mg.cleared[k]}
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                cleared · on level {mg.level[k]} · {mg.strikes[k]} ✗
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-[color:var(--muted)]">Memorize the pattern and tap it back!</div>
    </div>
  );
}

function MirrorPlayer({
  level,
  strikes,
  cleared,
  pos,
  sequence,
  remaining,
  onTap,
}: {
  level: number;
  strikes: number;
  cleared: number;
  pos: number;
  sequence: number[];
  remaining: number;
  onTap: (pad: number) => void;
}) {
  // The sequence is fixed for the whole game; capture it once so opponent
  // broadcasts don't restart our watch animation.
  const seqRef = useRef(sequence);
  const [activePad, setActivePad] = useState<number | null>(null);
  const [watching, setWatching] = useState(true);

  // Play the pattern once on mount; the component is remounted (via key) on
  // every level/strike change, so initial state already resets watch/active.
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const seq = seqRef.current.slice(0, level);
    seq.forEach((pad, i) => {
      timers.push(setTimeout(() => !cancelled && setActivePad(pad), i * STEP_MS + 350));
      timers.push(setTimeout(() => !cancelled && setActivePad(null), i * STEP_MS + 350 + STEP_MS * 0.6));
    });
    timers.push(setTimeout(() => !cancelled && setWatching(false), seq.length * STEP_MS + 500));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [level]);

  return (
    <div className="flex-1 flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between text-sm text-[color:var(--muted)]">
        <span className="text-2xl font-black tabular-nums text-white">{remaining}s</span>
        <span>
          Level <span className="font-black text-white text-lg">{level}</span> · cleared{" "}
          <span className="font-black text-white text-lg">{cleared}</span> · {strikes} ✗
        </span>
      </div>
      <div className="text-center text-lg font-bold h-6">
        {watching ? "👀 Watch…" : `Your turn — tap ${pos}/${level}`}
      </div>
      <div className="grid grid-cols-2 gap-3 flex-1 max-h-[60vh]">
        {PADS.map((pad, i) => {
          const lit = activePad === i;
          return (
            <button
              key={i}
              disabled={watching}
              onClick={() => onTap(i)}
              className="rounded-3xl transition-all duration-150 active:scale-95 disabled:active:scale-100"
              style={{
                background: lit ? pad.hex : `${pad.hex}33`,
                boxShadow: lit ? `0 0 40px 6px ${pad.glow}` : "none",
                opacity: watching && !lit ? 0.5 : 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
