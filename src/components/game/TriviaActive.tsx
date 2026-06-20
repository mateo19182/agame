import { useEffect } from "react";
import type { TriviaState } from "@shared/game";
import { useNow } from "@/lib/useNow";
import { sounds } from "@/lib/sounds";
import type { ActiveProps } from "./types";
import { nameOf } from "./types";

export function TriviaActive(props: ActiveProps) {
  const mg = props.state.minigame as TriviaState;
  if (mg.phase === "wager") return <TriviaWagerView {...props} />;
  return <TriviaQuestionView {...props} />;
}

// Valid wager amounts for a player: presets capped at their score, plus an
// "ALL" for the max. Deduped & sorted so there are no invalid or repeated keys.
function wagerOptions(myMax: number): number[] {
  const presets = [0, 1, 2, 3, 5, 8, 10].filter((v) => v <= myMax);
  return Array.from(new Set([...presets, myMax])).sort((a, b) => a - b);
}

function TriviaWagerView({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as TriviaState;
  const me = state.players.find((p) => p.id === youId);
  const myWager = me ? mg.wagers[me.id] : undefined;
  const other = state.players.find((p) => p.id !== youId);
  const otherSet = other ? mg.wagers[other.id] !== undefined : true;
  const myMax = me ? Math.max(1, me.score) : 1;
  const allSet = state.players.every((p) => mg.wagers[p.id] !== undefined);

  if (role === "player" && me) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4 text-center">
        <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">Wager</div>
        <h2 className="text-2xl font-bold">How many points will you risk?</h2>
        <div className="text-sm text-[color:var(--muted)]">You have {me.score} · risk 0–{myMax}</div>
        <div className="grid grid-cols-4 gap-2 w-full max-w-md">
          {wagerOptions(myMax).map((v) => (
            <button
              key={v}
              onClick={() => send({ type: "minigame-input", payload: { kind: "trivia-wager", amount: v } })}
              className={`py-4 rounded-2xl text-xl font-black ${myWager === v ? "bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] glow-pink" : "glass"}`}
            >
              {v === myMax ? "ALL" : v}
            </button>
          ))}
        </div>
        <div className="text-[color:var(--muted)] text-sm">
          {otherSet ? "Both locked in…" : `Waiting for ${other?.name ?? "opponent"}…`}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-4">
      <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">Trivia · Wagers</div>
      <h2 className="text-3xl sm:text-5xl font-black">Place your wagers…</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {state.players.map((p) => (
          <div key={p.id} className="glass rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="font-bold text-lg">{p.name}</div>
              <div className="text-xs text-[color:var(--muted)]">Score {p.score}</div>
            </div>
            <div className="text-3xl font-black tabular-nums">
              {mg.wagers[p.id] === undefined ? "…" : mg.wagers[p.id]}
            </div>
          </div>
        ))}
      </div>
      {role === "host" && allSet && (
        <button
          onClick={() => send({ type: "next-question" })}
          className="px-6 py-4 rounded-2xl bg-white/10 hover:bg-white/20 font-bold"
        >
          Reveal question →
        </button>
      )}
    </div>
  );
}

function TriviaQuestionView({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as TriviaState;
  const now = useNow(100);
  const q = mg.questions[mg.questionIndex];
  const buzz = mg.buzz!;
  const remaining = Math.max(0, Math.ceil((buzz.timerEndsAt - now) / 1000));
  const youBuzzed = buzz.buzzedBy === youId;
  const youLocked = role === "player" && buzz.buzzedBy && buzz.buzzedBy !== youId;
  const canBuzz = role === "player" && buzz.status === "buzzing" && !buzz.buzzedBy;

  useEffect(() => {
    if (remaining <= 4 && remaining > 0 && buzz.status === "buzzing") sounds.tick();
  }, [remaining, buzz.status]);

  useEffect(() => {
    if (youBuzzed) sounds.buzz();
  }, [youBuzzed]);

  if (!q) return null;

  if (role === "player") {
    if (canBuzz) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4">
          <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">Q{mg.questionIndex + 1}</div>
          <h2 className="text-2xl font-bold text-center max-w-md leading-snug">{q.prompt}</h2>
          <div className="text-7xl font-black tabular-nums">{remaining}</div>
          <button
            onClick={() => send({ type: "buzz" })}
            className="w-64 h-64 rounded-full bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] glow-pink active:scale-95 transition-transform text-4xl font-black"
          >
            BUZZ
          </button>
          <div className="text-xs text-[color:var(--muted)]">First buzz wins the question</div>
        </div>
      );
    }
    if (youBuzzed && buzz.status === "answering") {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
          <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">Pick an answer</div>
          <h2 className="text-xl font-bold text-center max-w-md leading-snug">{q.prompt}</h2>
          <div className="text-3xl font-black tabular-nums text-[color:var(--accent-3)]">{remaining}</div>
          <div className="grid grid-cols-1 gap-3 w-full max-w-md mt-2">
            {q.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => send({ type: "minigame-input", payload: { kind: "trivia-answer", answerIndex: i } })}
                className="px-4 py-4 rounded-2xl glass text-left font-semibold text-lg hover:bg-white/10 active:scale-[0.98] transition"
              >
                <span className="text-[color:var(--muted)] mr-2">{String.fromCharCode(65 + i)}.</span>
                {opt}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (youLocked) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4 text-center">
          <div className="text-2xl">🔒</div>
          <div className="text-[color:var(--muted)]">{nameOf(state, buzz.buzzedBy)} is answering</div>
          <h2 className="text-xl font-bold max-w-md">{q.prompt}</h2>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4 text-center">
        <div className="text-7xl font-black tabular-nums">{remaining}</div>
        <h2 className="text-xl font-bold max-w-md leading-snug">{q.prompt}</h2>
        <div className="text-[color:var(--muted)] text-sm">Waiting for someone to buzz…</div>
      </div>
    );
  }

  // Host
  const hostLocked = buzz.buzzedBy && buzz.buzzedBy !== youId;
  const hostCanBuzz = buzz.status === "buzzing" && !buzz.buzzedBy && youId;
  const hostYouBuzzed = youBuzzed && buzz.status === "answering";

  if (hostCanBuzz) {
    return (
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex items-center justify-between text-sm">
          <div className="text-[color:var(--muted)]">Q{mg.questionIndex + 1} · {q.category}</div>
          <div className={`text-3xl font-black tabular-nums ${remaining <= 5 ? "text-[color:var(--accent)] animate-pulse" : ""}`}>{remaining}s</div>
        </div>
        <h2 className="text-3xl sm:text-5xl font-black leading-tight">{q.prompt}</h2>
        <div className="mt-auto flex flex-col items-center gap-4">
          <button
            onClick={() => send({ type: "buzz" })}
            className="w-56 h-56 rounded-full bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] glow-pink active:scale-95 transition-transform text-3xl font-black"
          >
            BUZZ
          </button>
          <div className="text-[color:var(--muted)] text-sm">Or wait for the other player…</div>
        </div>
      </div>
    );
  }

  if (hostYouBuzzed) {
    return (
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex items-center justify-between text-sm">
          <div className="text-[color:var(--muted)]">Q{mg.questionIndex + 1} · {q.category}</div>
          <div className={`text-3xl font-black tabular-nums ${remaining <= 5 ? "text-[color:var(--accent)] animate-pulse" : ""}`}>{remaining}s</div>
        </div>
        <h2 className="text-3xl sm:text-5xl font-black leading-tight">{q.prompt}</h2>
        <div className="text-center text-[color:var(--accent-3)] font-bold">Pick your answer</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => send({ type: "minigame-input", payload: { kind: "trivia-answer", answerIndex: i } })}
              className="px-5 py-5 rounded-2xl glass text-lg font-semibold text-left hover:bg-white/10 active:scale-[0.98] transition"
            >
              <span className="text-[color:var(--muted)] mr-3 text-xl">{String.fromCharCode(65 + i)}</span>
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (hostLocked) {
    return (
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex items-center justify-between text-sm">
          <div className="text-[color:var(--muted)]">Q{mg.questionIndex + 1} · {q.category}</div>
          <div className="text-3xl font-black tabular-nums">{remaining}s</div>
        </div>
        <h2 className="text-3xl sm:text-5xl font-black leading-tight">{q.prompt}</h2>
        <div className="mt-auto text-center">
          <div className="text-2xl">🔒</div>
          <div className="text-[color:var(--muted)]">{nameOf(state, buzz.buzzedBy)} is answering</div>
        </div>
      </div>
    );
  }

  // reveal phase on host
  if (buzz.status === "reveal") {
    const correct = buzz.answerCorrect;
    return (
      <div className="flex-1 flex flex-col gap-6">
        <div className="text-sm text-[color:var(--muted)]">Q{mg.questionIndex + 1} · {q.category}</div>
        <h2 className="text-3xl sm:text-5xl font-black leading-tight">{q.prompt}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {q.options.map((opt, i) => (
            <div
              key={i}
              className={`px-5 py-5 rounded-2xl glass text-lg font-semibold flex items-center gap-3 ${i === q.correctIndex ? "!border-[color:var(--good)] !bg-[color:var(--good)]/10" : ""}`}
            >
              <span className="text-[color:var(--muted)] text-xl">{String.fromCharCode(65 + i)}</span>
              <span className="flex-1">{opt}</span>
              {i === q.correctIndex && <span className="text-[color:var(--good)] font-black">✓</span>}
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between">
          <div className="text-lg">
            {correct ? (
              <span className="text-[color:var(--good)] font-bold">+{mg.lastEvent?.delta ?? 1} {nameOf(state, buzz.buzzedBy)}</span>
            ) : buzz.buzzedBy ? (
              <span className="text-[color:var(--bad)] font-bold">{nameOf(state, buzz.buzzedBy)} wrong</span>
            ) : (
              <span className="text-[color:var(--muted)]">No one buzzed</span>
            )}
          </div>
          <button
            onClick={() => send({ type: "next-question" })}
            className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 font-semibold"
          >
            Next →
          </button>
        </div>
      </div>
    );
  }

  // Host viewing the buzzing phase
  return (
    <div className="flex-1 flex flex-col gap-6">
      <div className="flex items-center justify-between text-sm">
        <div className="text-[color:var(--muted)]">Q{mg.questionIndex + 1} · {q.category}</div>
        <div className={`text-3xl font-black tabular-nums ${remaining <= 5 ? "text-[color:var(--accent)] animate-pulse" : ""}`}>{remaining}s</div>
      </div>
      <h2 className="text-3xl sm:text-5xl font-black leading-tight">{q.prompt}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {q.options.map((opt, i) => (
          <div
            key={i}
            className={`px-5 py-5 rounded-2xl glass text-lg font-semibold ${i === q.correctIndex && buzz.status === "reveal" ? "border-[color:var(--good)]" : ""}`}
          >
            <span className="text-[color:var(--muted)] mr-3 text-xl">{String.fromCharCode(65 + i)}</span>
            {opt}
          </div>
        ))}
      </div>
      <div className="mt-auto text-center text-[color:var(--muted)]">
        {buzz.status === "buzzing" && (buzz.buzzedBy ? `${nameOf(state, buzz.buzzedBy)} buzzed…` : "Waiting for a buzz…")}
        {buzz.status === "answering" && `${nameOf(state, buzz.buzzedBy)} is picking an answer`}
      </div>
    </div>
  );
}
