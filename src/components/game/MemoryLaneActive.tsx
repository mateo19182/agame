import { useState } from "react";
import type { MemoryLaneState } from "@shared/game";
import { photoSrc } from "@shared/game";
import { useNow } from "@/lib/useNow";
import type { ActiveProps, Send } from "./types";

export function MemoryLaneActive(props: ActiveProps) {
  const mg = props.state.minigame as MemoryLaneState;
  if (mg.phase === "answering") return <MemoryLaneAnswerView {...props} />;
  return <MemoryLaneRevealView {...props} />;
}

function MemoryLaneAnswerView({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as MemoryLaneState;
  const photo = mg.photos[mg.photoIndex];
  const now = useNow(200);
  const remaining = Math.max(0, Math.ceil(((mg.timerEndsAt ?? now) - now) / 1000));
  const me = state.players.find((p) => p.id === youId);
  const myGuess = me ? mg.guesses[me.id] : undefined;
  const allGuessed = state.players.filter((p) => p.connected).every((p) => mg.guesses[p.id]);

  if (!photo) return null;

  if (role === "player") {
    if (!me) return null;
    return (
      <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
        <div className="text-center text-3xl font-black tabular-nums">{remaining}s</div>
        <div className="text-center text-xs uppercase tracking-widest text-[color:var(--muted)]">
          Memory Lane · {mg.photoIndex + 1}/{mg.photos.length}
        </div>
        <img src={photoSrc(photo)} alt="Memory" className="w-full max-h-[40vh] object-contain rounded-2xl glass" />
        <MemoryLaneGuessForm key={mg.photoIndex} initial={myGuess} send={send} />
        {allGuessed ? (
          <div className="text-center text-[color:var(--accent-3)] font-bold">Both in! Revealing…</div>
        ) : (
          <div className="text-center text-xs text-[color:var(--muted)]">Tap a field to keep typing</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between text-sm">
        <div className="text-[color:var(--muted)]">Memory Lane · {mg.photoIndex + 1}/{mg.photos.length}</div>
        <div className="text-3xl font-black tabular-nums">{remaining}s</div>
      </div>
      <img src={photoSrc(photo)} alt="Memory" className="w-full max-h-[50vh] object-contain rounded-2xl glass" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {state.players.map((p) => {
          const g = mg.guesses[p.id];
          return (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="text-sm text-[color:var(--muted)] flex items-center justify-between">
                <span>{p.name}</span>
                <span>{g ? "✓" : "…"}</span>
              </div>
              <div className="mt-2 text-sm">
                <div><span className="text-[color:var(--muted)]">Where:</span> {g?.where || <span className="italic text-[color:var(--muted)]">—</span>}</div>
                <div><span className="text-[color:var(--muted)]">When:</span> {g?.when || <span className="italic text-[color:var(--muted)]">—</span>}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-auto text-center text-[color:var(--muted)] text-sm">
        {allGuessed ? "Both submitted — revealing…" : "Waiting for both players…"}
      </div>
    </div>
  );
}

// Local-state guess fields (instant typing); send to the server on each change.
// Keyed by photoIndex in the parent so it remounts fresh for each photo.
function MemoryLaneGuessForm({ initial, send }: { initial?: { where: string; when: string }; send: Send }) {
  const [where, setWhere] = useState(initial?.where ?? "");
  const [when, setWhen] = useState(initial?.when ?? "");
  const push = (w: string, t: string) =>
    send({ type: "minigame-input", payload: { kind: "memory-lane-guess", where: w, when: t } });
  return (
    <div className="space-y-2">
      <input
        value={where}
        onChange={(e) => {
          setWhere(e.target.value);
          push(e.target.value, when);
        }}
        placeholder="Where was this?"
        maxLength={80}
        className="w-full px-3 py-3 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-base"
      />
      <input
        value={when}
        onChange={(e) => {
          setWhen(e.target.value);
          push(where, e.target.value);
        }}
        placeholder="When? (e.g. 'summer 2023')"
        maxLength={80}
        className="w-full px-3 py-3 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-base"
      />
    </div>
  );
}

function MemoryLaneRevealView({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as MemoryLaneState;
  const photo = mg.photos[mg.photoIndex];
  const now = useNow(200);
  const remaining = Math.max(0, Math.ceil(((mg.timerEndsAt ?? now) - now) / 1000));
  const me = state.players.find((p) => p.id === youId);
  const myScore = me ? mg.selfScored[me.id] : undefined;
  const allScored = state.players.filter((p) => p.connected).every((p) => mg.selfScored[p.id]);

  if (!photo) return null;

  if (role === "player") {
    if (!me) return null;
    const myGuess = mg.guesses[me.id];
    return (
      <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
        <div className="text-center text-3xl font-black tabular-nums">{remaining}s</div>
        <img src={photoSrc(photo)} alt="Memory" className="w-full max-h-[35vh] object-contain rounded-2xl glass" />
        <div className="glass rounded-2xl p-4 space-y-2">
          <div>
            <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">Truth · Where</div>
            <div className="text-lg font-bold">{photo.where || "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">Truth · When</div>
            <div className="text-lg font-bold">{photo.when || "—"}</div>
          </div>
          <div className="pt-2 border-t border-white/10 space-y-1">
            <div className="text-sm"><span className="text-[color:var(--muted)]">Your where:</span> {myGuess?.where || "—"}</div>
            <div className="text-sm"><span className="text-[color:var(--muted)]">Your when:</span> {myGuess?.when || "—"}</div>
          </div>
        </div>
        <div className="text-center font-bold text-[color:var(--accent-3)]">Did you get it?</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={myScore?.where === true}
            onClick={() => send({ type: "minigame-input", payload: { kind: "memory-lane-score", where: true, when: myScore?.when ?? false } })}
            className={`py-3 rounded-2xl font-bold text-lg transition ${myScore?.where ? "bg-[color:var(--good)] text-black" : "glass hover:bg-white/10"}`}
          >
            Where ✓
          </button>
          <button
            disabled={myScore?.where === false}
            onClick={() => send({ type: "minigame-input", payload: { kind: "memory-lane-score", where: false, when: myScore?.when ?? false } })}
            className={`py-3 rounded-2xl font-bold text-lg transition ${myScore?.where === false ? "bg-[color:var(--bad)]/40" : "glass hover:bg-white/10"}`}
          >
            Where ✗
          </button>
          <button
            disabled={myScore?.when === true}
            onClick={() => send({ type: "minigame-input", payload: { kind: "memory-lane-score", where: myScore?.where ?? false, when: true } })}
            className={`py-3 rounded-2xl font-bold text-lg transition ${myScore?.when ? "bg-[color:var(--good)] text-black" : "glass hover:bg-white/10"}`}
          >
            When ✓
          </button>
          <button
            disabled={myScore?.when === false}
            onClick={() => send({ type: "minigame-input", payload: { kind: "memory-lane-score", where: myScore?.where ?? false, when: false } })}
            className={`py-3 rounded-2xl font-bold text-lg transition ${myScore?.when === false ? "bg-[color:var(--bad)]/40" : "glass hover:bg-white/10"}`}
          >
            When ✗
          </button>
        </div>
        {allScored && <div className="text-center text-[color:var(--accent-3)] text-sm">Both scored! Moving on…</div>}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between text-sm">
        <div className="text-[color:var(--muted)]">Revealing · {mg.photoIndex + 1}/{mg.photos.length}</div>
        <div className="text-3xl font-black tabular-nums">{remaining}s</div>
      </div>
      <img src={photoSrc(photo)} alt="Memory" className="w-full max-h-[40vh] object-contain rounded-2xl glass" />
      <div className="glass rounded-2xl p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">Where</div>
            <div className="font-bold">{photo.where || "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">When</div>
            <div className="font-bold">{photo.when || "—"}</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {state.players.map((p) => {
          const g = mg.guesses[p.id];
          const s = mg.selfScored[p.id];
          const whereRight = s?.where === true;
          const whenRight = s?.when === true;
          return (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="text-sm text-[color:var(--muted)] flex items-center justify-between">
                <span>{p.name}</span>
                <span>{s ? `${whereRight ? "W✓" : "W✗"} · ${whenRight ? "T✓" : "T✗"}` : "scoring…"}</span>
              </div>
              <div className="mt-2 text-sm">
                <div><span className="text-[color:var(--muted)]">Where:</span> {g?.where || "—"}</div>
                <div><span className="text-[color:var(--muted)]">When:</span> {g?.when || "—"}</div>
              </div>
            </div>
          );
        })}
      </div>
      {allScored ? (
        <div className="text-center text-[color:var(--accent-3)]">Both scored! Moving on…</div>
      ) : (
        <button
          onClick={() => send({ type: "next-question" })}
          className="mt-auto mx-auto px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 font-semibold"
        >
          Skip →
        </button>
      )}
    </div>
  );
}
