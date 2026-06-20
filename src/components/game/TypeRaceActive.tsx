import { useState } from "react";
import type { TypeRaceState } from "@shared/game";
import { useNow } from "@/lib/useNow";
import type { ActiveProps, Send } from "./types";

export function TypeRaceActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as TypeRaceState;
  const now = useNow(100);
  const remaining = Math.max(0, Math.ceil((mg.startedAt + mg.duration - now) / 1000));
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    return <TypeRaceInput prompt={mg.prompt} done={mg.finishedAt[key] !== null} remaining={remaining} send={send} />;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-7xl font-black tabular-nums">{remaining}</div>
      <div className="space-y-3 w-full max-w-md">
        {state.players.map((p) => {
          const k = slotOf(p.id);
          return (
            <div key={p.id} className="glass rounded-2xl p-4 text-left">
              <div className="text-sm text-[color:var(--muted)] flex justify-between">
                <span>{p.name}</span>
                <span>{mg.finishedAt[k] !== null ? "DONE" : `${mg.typed[k].length}/${mg.prompt.length}`}</span>
              </div>
              <div className="mt-2 text-lg font-mono">{mg.typed[k] || "…"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Local-state input so keystrokes are instant (not gated on the WS round-trip).
function TypeRaceInput({
  prompt,
  done,
  remaining,
  send,
}: {
  prompt: string;
  done: boolean;
  remaining: number;
  send: Send;
}) {
  const [text, setText] = useState("");
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
      <div className="text-3xl font-black tabular-nums">{remaining}s</div>
      <div className="text-[color:var(--muted)] text-sm">Type this:</div>
      <div className="glass rounded-2xl px-4 py-3 text-2xl font-mono">{prompt}</div>
      <input
        autoFocus
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          send({ type: "minigame-input", payload: { kind: "type-race-typed", text: e.target.value } });
        }}
        className="w-full max-w-md px-4 py-4 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-2xl font-mono"
      />
      {done && <div className="text-[color:var(--good)] font-black text-2xl">DONE!</div>}
    </div>
  );
}
