"use client";

import { useEffect, useMemo, useRef } from "react";
import confetti from "canvas-confetti";
import type { GameState } from "@/lib/game";
import { useNow } from "@/lib/useNow";
import { sounds } from "@/lib/sounds";

type Props = {
  role: "host" | "player";
  code: string;
  state: GameState;
  youId: string;
  connected: boolean;
  send: (msg: import("@/lib/game").ClientMessage) => void;
};

export function GameView({ role, code, state, youId, connected, send }: Props) {
  const me = state.players.find((p) => p.id === youId);
  const isHost = role === "host" || Boolean(me?.isHost);

  const lastPhase = useRef(state.phase);
  useEffect(() => {
    if (lastPhase.current !== state.phase) {
      if (state.phase === "final") {
        sounds.win();
        confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
      }
      lastPhase.current = state.phase;
    }
  }, [state.phase]);

  return (
    <main className="flex-1 flex flex-col">
      <Header code={code} state={state} connected={connected} />
      <div className="flex-1 flex flex-col px-4 sm:px-6 pb-6 max-w-6xl w-full mx-auto">
        {state.phase === "lobby" && (
          <Lobby state={state} isHost={isHost} send={send} youId={youId} />
        )}
        {state.phase === "round1-intro" && <Round1Intro state={state} isHost={isHost} send={send} />}
        {state.phase === "round1-question" && (
          <QuestionView state={state} role={role} send={send} youId={youId} />
        )}
        {state.phase === "round1-reveal" && (
          <RevealView state={state} role={role} send={send} youId={youId} />
        )}
        {state.phase === "round2-wager" && (
          <WagerView state={state} role={role} send={send} youId={youId} />
        )}
        {state.phase === "round2-question" && (
          <QuestionView state={state} role={role} send={send} youId={youId} />
        )}
        {state.phase === "round2-reveal" && (
          <RevealView state={state} role={role} send={send} youId={youId} />
        )}
        {state.phase === "round3-intro" && (
          <Round3Intro state={state} isHost={isHost} send={send} />
        )}
        {state.phase === "round3-photo" && (
          <Round3Photo state={state} role={role} send={send} youId={youId} />
        )}
        {state.phase === "round3-reveal" && (
          <Round3Reveal state={state} role={role} send={send} youId={youId} />
        )}
        {state.phase === "tiebreaker-intro" && (
          <TiebreakerIntro state={state} isHost={isHost} send={send} />
        )}
        {state.phase === "tiebreaker-play" && (
          <TiebreakerPlay state={state} role={role} send={send} youId={youId} />
        )}
        {state.phase === "tiebreaker-result" && <TiebreakerResult state={state} />}
        {state.phase === "final" && <FinalView state={state} isHost={isHost} send={send} />}
      </div>
      <ScoreBar state={state} youId={youId} />
    </main>
  );
}

function Header({ code, state, connected }: { code: string; state: GameState; connected: boolean }) {
  return (
    <header className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-6xl w-full mx-auto">
      <div className="flex items-center gap-3">
        <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">Room</div>
        <div className="px-3 py-1.5 rounded-xl glass font-black tracking-[0.3em] text-lg">{code}</div>
        <div className={`ml-2 flex items-center gap-1.5 text-xs ${connected ? "text-[color:var(--good)]" : "text-[color:var(--muted)]"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[color:var(--good)]" : "bg-[color:var(--muted)]"}`} />
          {connected ? "Live" : "Reconnecting…"}
        </div>
      </div>
      <PhaseLabel state={state} />
    </header>
  );
}

function PhaseLabel({ state }: { state: GameState }) {
  const map: Record<GameState["phase"], string> = {
    lobby: "Lobby",
    "round1-intro": "Round 1",
    "round1-question": "Round 1",
    "round1-reveal": "Round 1",
    "round2-wager": "Round 2 · Wager",
    "round2-question": "Round 2",
    "round2-reveal": "Round 2",
    "round3-intro": "Round 3 · Memory Lane",
    "round3-photo": "Round 3 · Memory Lane",
    "round3-reveal": "Round 3 · Memory Lane",
    "tiebreaker-intro": "Tiebreaker",
    "tiebreaker-play": "Tiebreaker",
    "tiebreaker-result": "Tiebreaker",
    final: "Final",
  };
  return (
    <div className="hidden sm:block text-sm uppercase tracking-widest text-[color:var(--muted)]">
      {map[state.phase]}
    </div>
  );
}

function ScoreBar({ state, youId }: { state: GameState; youId: string }) {
  return (
    <div className="px-4 sm:px-6 py-3 max-w-6xl w-full mx-auto w-full">
      <div className="glass rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
        {state.players.length === 0 && <div className="text-[color:var(--muted)] text-sm">Waiting for players…</div>}
        {state.players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-3 flex-1 ${p.id === youId ? "" : "opacity-90"}`}
          >
            <div
              className="w-8 h-8 rounded-full grid place-items-center font-black text-black"
              style={{ background: p.color }}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate flex items-center gap-2">
                {p.name}
                {p.isHost && <span className="text-[10px] uppercase tracking-widest text-[color:var(--muted)]">Host</span>}
              </div>
              <div className="text-xs text-[color:var(--muted)]">{p.connected ? "Connected" : "Disconnected"}</div>
            </div>
            <div className="text-2xl font-black tabular-nums">{p.score}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Lobby({ state, isHost, send, youId }: { state: GameState; isHost: boolean; send: Props["send"]; youId: string }) {
  const players = state.players;
  const youAreIn = players.some((p) => p.id === youId);
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
      <div>
        <div className="text-sm uppercase tracking-widest text-[color:var(--accent-3)]">Open this on a phone</div>
        <div className="mt-2 text-6xl sm:text-8xl font-black tracking-[0.3em] text-shadow-lg">{state.players.length ? "" : ""}</div>
      </div>
      <div className="glass rounded-3xl px-6 py-8 max-w-md w-full">
        <div className="text-sm text-[color:var(--muted)]">Share this URL or just the code</div>
        <div className="mt-2 text-3xl font-black tracking-[0.3em]">{`${typeof window !== "undefined" ? window.location.origin : ""}/play/${getRoomFromUrl()}`}</div>
        <div className="mt-6 text-sm text-[color:var(--muted)]">In the room</div>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {players.length === 0 && <div className="text-[color:var(--muted)] text-sm">No one yet</div>}
          {players.map((p) => (
            <div key={p.id} className="px-3 py-1.5 rounded-full flex items-center gap-2 glass">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              <span className="text-sm font-semibold">{p.name}</span>
              {p.isHost && <span className="text-[10px] uppercase text-[color:var(--muted)]">Host</span>}
            </div>
          ))}
        </div>
      </div>
      {isHost ? (
        players.length >= 2 ? (
          <button
            onClick={() => send({ type: "start-game" })}
            className="px-8 py-5 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-black text-2xl glow-pink hover:brightness-110 active:scale-[0.98] transition"
          >
            Start game →
          </button>
        ) : (
          <div className="text-[color:var(--muted)]">Waiting for at least 2 players…</div>
        )
      ) : (
        <div className="text-[color:var(--muted)]">{youAreIn ? "Waiting for the host to start…" : "Joining…"}</div>
      )}
    </div>
  );
}

function getRoomFromUrl(): string {
  if (typeof window === "undefined") return "";
  const m = window.location.pathname.match(/\/(host|play)\/([A-Z]{4})/);
  return m?.[2] ?? "";
}

function Round1Intro({ state, isHost, send }: { state: GameState; isHost: boolean; send: Props["send"] }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
      <div className="text-sm uppercase tracking-widest text-[color:var(--accent-3)]">Round 1</div>
      <h2 className="text-4xl sm:text-6xl font-black">Rapid Fire</h2>
      <p className="text-[color:var(--muted)] max-w-md">
        {state.settings.round1Questions} questions. First to buzz answers. Wrong answer steals for the other player.
      </p>
      {isHost && (
        <button
          onClick={() => send({ type: "next-question" })}
          className="px-8 py-5 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-black text-2xl glow-pink"
        >
          Begin →
        </button>
      )}
    </div>
  );
}

function QuestionView({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const now = useNow(100);
  const q = state.questions[state.currentQuestion];
  const buzz = state.buzz!;
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

  if (role === "player") {
    if (canBuzz) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4">
          <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">Q{state.currentQuestion + 1}</div>
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
                onClick={() => send({ type: "answer", correct: i === q.correctIndex })}
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
    // buzzing but haven't buzzed, or in answer mode
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4 text-center">
        <div className="text-7xl font-black tabular-nums">{remaining}</div>
        <h2 className="text-xl font-bold max-w-md leading-snug">{q.prompt}</h2>
        <div className="text-[color:var(--muted)] text-sm">Waiting for someone to buzz…</div>
      </div>
    );
  }

  // Host
  const hostLocked = role === "host" && buzz.buzzedBy && buzz.buzzedBy !== youId;
  const hostCanBuzz = role === "host" && buzz.status === "buzzing" && !buzz.buzzedBy && youId;
  const hostYouBuzzed = role === "host" && youBuzzed && buzz.status === "answering";

  if (hostCanBuzz) {
    return (
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex items-center justify-between text-sm">
          <div className="text-[color:var(--muted)]">Q{state.currentQuestion + 1} · {q.category}</div>
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
          <div className="text-[color:var(--muted)]">Q{state.currentQuestion + 1} · {q.category}</div>
          <div className={`text-3xl font-black tabular-nums ${remaining <= 5 ? "text-[color:var(--accent)] animate-pulse" : ""}`}>{remaining}s</div>
        </div>
        <h2 className="text-3xl sm:text-5xl font-black leading-tight">{q.prompt}</h2>
        <div className="text-center text-[color:var(--accent-3)] font-bold">Pick your answer</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => send({ type: "answer", correct: i === q.correctIndex })}
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
          <div className="text-[color:var(--muted)]">Q{state.currentQuestion + 1} · {q.category}</div>
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

  return (
    <div className="flex-1 flex flex-col gap-6">
      <div className="flex items-center justify-between text-sm">
        <div className="text-[color:var(--muted)]">Q{state.currentQuestion + 1} · {q.category}</div>
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
        {buzz.status === "reveal" && (buzz.answerCorrect ? "✅ Correct!" : "❌ Wrong")}
      </div>
    </div>
  );
}

function RevealView({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const q = state.questions[state.currentQuestion];
  const buzz = state.buzz!;
  const correct = buzz.answerCorrect;
  const youAnswered = buzz.buzzedBy === youId;

  useEffect(() => {
    if (role === "host" || youAnswered) {
      if (correct) sounds.correct();
      else if (buzz.buzzedBy) sounds.wrong();
      else sounds.reveal();
    }
  }, [correct, buzz.buzzedBy, role, youAnswered]);

  if (role === "player") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
        <div className={`text-7xl ${correct ? "" : "opacity-70"}`}>{correct ? "✅" : "❌"}</div>
        <div className="text-3xl font-black">{correct ? "Correct!" : buzz.buzzedBy ? "Wrong" : "Time's up"}</div>
        <div className="glass rounded-2xl px-5 py-4 max-w-md">
          <div className="text-sm text-[color:var(--muted)]">Answer</div>
          <div className="text-xl font-bold">{q.options[q.correctIndex]}</div>
        </div>
        {state.lastEvent && state.lastEvent.delta !== 0 && (
          <div className="text-[color:var(--accent-3)] text-2xl font-black">
            {state.lastEvent.delta > 0 ? `+${state.lastEvent.delta}` : state.lastEvent.delta}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-6">
      <div className="text-sm text-[color:var(--muted)]">Q{state.currentQuestion + 1} · {q.category}</div>
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
          {correct ? <span className="text-[color:var(--good)] font-bold">+{state.lastEvent?.delta ?? 1} {nameOf(state, buzz.buzzedBy)}</span>
            : buzz.buzzedBy ? <span className="text-[color:var(--bad)] font-bold">{nameOf(state, buzz.buzzedBy)} wrong</span>
            : <span className="text-[color:var(--muted)]">No one buzzed</span>}
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

function WagerView({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const q = state.questions[state.currentQuestion];
  const me = state.players.find((p) => p.id === youId);
  const myWager = me ? state.wagers[me.id] : undefined;
  const other = state.players.find((p) => p.id !== youId);
  const otherSet = other ? state.wagers[other.id] !== undefined : true;
  const myMax = me ? Math.max(1, me.score) : 1;

  if (role === "player" && me) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4 text-center">
        <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">Round 2 · Wager</div>
        <h2 className="text-2xl font-bold">How many points will you risk?</h2>
        <div className="text-sm text-[color:var(--muted)]">You have {me.score} · risk 0–{myMax}</div>
        <div className="grid grid-cols-4 gap-2 w-full max-w-md">
          {[0, 1, 2, 3, 5, 8, 10, myMax].map((v) => (
            <button
              key={v}
              onClick={() => send({ type: "set-wager", amount: v })}
              className={`py-4 rounded-2xl text-xl font-black ${myWager === v ? "bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] glow-pink" : "glass"}`}
            >
              {v === myMax ? "ALL" : v}
            </button>
          ))}
        </div>
        <div className="text-[color:var(--muted)] text-sm">{otherSet ? "Both locked in…" : `Waiting for ${other?.name ?? "opponent"}…`}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-4">
      <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">Round 2 · Wagers</div>
      <h2 className="text-3xl sm:text-5xl font-black">Place your wagers…</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {state.players.map((p) => (
          <div key={p.id} className="glass rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="font-bold text-lg">{p.name}</div>
              <div className="text-xs text-[color:var(--muted)]">Score {p.score}</div>
            </div>
            <div className="text-3xl font-black tabular-nums">
              {state.wagers[p.id] === undefined ? "…" : state.wagers[p.id]}
            </div>
          </div>
        ))}
      </div>
      {role === "host" && state.players.every((p) => state.wagers[p.id] !== undefined) && (
        <button
          onClick={() => send({ type: "next-question" })}
          className="px-6 py-4 rounded-2xl bg-white/10 hover:bg-white/20 font-bold"
        >
          Reveal question →
        </button>
      )}
      {q && role === "host" && false /* hide question during wager */ && null}
    </div>
  );
}

function Round3Intro({ state, isHost, send }: { state: GameState; isHost: boolean; send: Props["send"] }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-4">
      <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">Round 3</div>
      <h2 className="text-4xl sm:text-6xl font-black">Memory Lane</h2>
      <p className="text-[color:var(--muted)] max-w-md">
        {state.photos.length} photo{state.photos.length === 1 ? "" : "s"}. Both of you will see each photo
        and type where and when. Then you&apos;ll see the truth and self-score.
      </p>
      {isHost ? (
        <button
          onClick={() => send({ type: "next-question" })}
          className="px-8 py-5 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-black text-2xl glow-pink"
        >
          Begin →
        </button>
      ) : (
        <div className="text-[color:var(--muted)]">Waiting for the host to start…</div>
      )}
    </div>
  );
}

function Round3Photo({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const r3 = state.round3!;
  const photo = state.photos[r3.currentPhotoIndex];
  const now = useNow(200);
  const remaining = Math.max(0, Math.ceil(((r3.timerEndsAt ?? now) - now) / 1000));
  const me = state.players.find((p) => p.id === youId);
  const myGuess = me ? r3.guesses[me.id] : undefined;
  const allGuessed = state.players.filter((p) => p.connected).every((p) => r3.guesses[p.id]);

  if (role === "player") {
    if (!me) return null;
    return (
      <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
        <div className="text-center text-3xl font-black tabular-nums">{remaining}s</div>
        <div className="text-center text-xs uppercase tracking-widest text-[color:var(--muted)]">
          Memory Lane · {r3.currentPhotoIndex + 1}/{state.photos.length}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.dataUrl} alt="Memory" className="w-full max-h-[40vh] object-contain rounded-2xl glass" />
        <div className="space-y-2">
          <input
            value={myGuess?.where ?? ""}
            onChange={(e) => send({ type: "round3-guess", where: e.target.value, when: myGuess?.when ?? "" })}
            placeholder="Where was this?"
            maxLength={80}
            className="w-full px-3 py-3 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-base"
          />
          <input
            value={myGuess?.when ?? ""}
            onChange={(e) => send({ type: "round3-guess", where: myGuess?.where ?? "", when: e.target.value })}
            placeholder="When? (e.g. 'summer 2023')"
            maxLength={80}
            className="w-full px-3 py-3 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-base"
          />
        </div>
        {allGuessed ? (
          <div className="text-center text-[color:var(--accent-3)] font-bold">Both in! Revealing…</div>
        ) : (
          <div className="text-center text-xs text-[color:var(--muted)]">Tap a field to keep typing</div>
        )}
      </div>
    );
  }

  // Host
  return (
    <div className="flex-1 flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between text-sm">
        <div className="text-[color:var(--muted)]">Memory Lane · {r3.currentPhotoIndex + 1}/{state.photos.length}</div>
        <div className="text-3xl font-black tabular-nums">{remaining}s</div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.dataUrl} alt="Memory" className="w-full max-h-[50vh] object-contain rounded-2xl glass" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {state.players.map((p) => {
          const g = r3.guesses[p.id];
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

function Round3Reveal({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const r3 = state.round3!;
  const photo = state.photos[r3.currentPhotoIndex];
  const now = useNow(200);
  const remaining = Math.max(0, Math.ceil(((r3.timerEndsAt ?? now) - now) / 1000));
  const me = state.players.find((p) => p.id === youId);
  const myScore = me ? r3.selfScored[me.id] : undefined;
  const allScored = state.players.filter((p) => p.connected).every((p) => r3.selfScored[p.id]);

  if (role === "player") {
    if (!me) return null;
    const myGuess = r3.guesses[me.id];
    return (
      <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
        <div className="text-center text-3xl font-black tabular-nums">{remaining}s</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.dataUrl} alt="Memory" className="w-full max-h-[35vh] object-contain rounded-2xl glass" />
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
            onClick={() => send({ type: "round3-self-score", where: true, when: myScore?.when ?? false })}
            className={`py-3 rounded-2xl font-bold text-lg transition ${myScore?.where ? "bg-[color:var(--good)] text-black" : "glass hover:bg-white/10"}`}
          >
            Where ✓
          </button>
          <button
            disabled={myScore?.where === false}
            onClick={() => send({ type: "round3-self-score", where: false, when: myScore?.when ?? false })}
            className={`py-3 rounded-2xl font-bold text-lg transition ${myScore?.where === false ? "bg-[color:var(--bad)]/40" : "glass hover:bg-white/10"}`}
          >
            Where ✗
          </button>
          <button
            disabled={myScore?.when === true}
            onClick={() => send({ type: "round3-self-score", where: myScore?.where ?? false, when: true })}
            className={`py-3 rounded-2xl font-bold text-lg transition ${myScore?.when ? "bg-[color:var(--good)] text-black" : "glass hover:bg-white/10"}`}
          >
            When ✓
          </button>
          <button
            disabled={myScore?.when === false}
            onClick={() => send({ type: "round3-self-score", where: myScore?.where ?? false, when: false })}
            className={`py-3 rounded-2xl font-bold text-lg transition ${myScore?.when === false ? "bg-[color:var(--bad)]/40" : "glass hover:bg-white/10"}`}
          >
            When ✗
          </button>
        </div>
        {allScored && <div className="text-center text-[color:var(--accent-3)] text-sm">Both scored! Moving on…</div>}
      </div>
    );
  }

  // Host
  return (
    <div className="flex-1 flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between text-sm">
        <div className="text-[color:var(--muted)]">Revealing · {r3.currentPhotoIndex + 1}/{state.photos.length}</div>
        <div className="text-3xl font-black tabular-nums">{remaining}s</div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.dataUrl} alt="Memory" className="w-full max-h-[40vh] object-contain rounded-2xl glass" />
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
          const g = r3.guesses[p.id];
          const s = r3.selfScored[p.id];
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
      {isHostAllScored(allScored) ? (
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

function isHostAllScored(allScored: boolean): boolean {
  return allScored;
}

function TiebreakerIntro({ state, isHost, send }: { state: GameState; isHost: boolean; send: Props["send"] }) {
  const mg = state.minigame;
  const names: Record<string, string> = {
    reflex: "Reflex Tap",
    "speed-sort": "Speed Sort",
    "type-race": "Type Race",
  };
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-4">
      <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">Tiebreaker</div>
      <h2 className="text-4xl sm:text-6xl font-black">You&apos;re tied.</h2>
      <div className="glass rounded-2xl p-6 max-w-md">
        <div className="text-sm text-[color:var(--muted)]">Up next</div>
        <div className="text-3xl font-black mt-1">{mg ? names[mg.type] : ""}</div>
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          {mg?.type === "reflex" && "When the light turns green, mash your button. Most taps in 1.5s wins."}
          {mg?.type === "speed-sort" && "Sort 8 items into the right bins. First to clear wins."}
          {mg?.type === "type-race" && "Type the phrase as fast as you can. First to finish wins."}
        </p>
      </div>
      {isHost && (
        <button
          onClick={() => send({ type: "minigame-start" })}
          className="px-8 py-5 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-black text-2xl glow-pink"
        >
          Start tiebreaker →
        </button>
      )}
    </div>
  );
}

function TiebreakerPlay({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const mg = state.minigame!;
  const now = useNow(100);
  const remaining = Math.max(0, Math.ceil((mg.startedAt + mg.duration - now) / 1000));

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me) return null;
    const key = state.players[0].id === me.id ? "p1" : "p2";
    if (mg.type === "reflex") {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
          <div className="text-7xl font-black tabular-nums">{mg.lightsOn ? "GO" : "Wait…"}</div>
          <button
            disabled={!mg.lightsOn}
            onClick={() => send({ type: "minigame-input", payload: { tap: true } })}
            className={`w-72 h-72 rounded-full text-4xl font-black transition-all ${mg.lightsOn ? "bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] glow-pink active:scale-95" : "bg-white/10 opacity-50"}`}
          >
            {mg.lightsOn ? "TAP!" : "..."}
          </button>
          <div className="text-[color:var(--muted)] text-sm">Taps: {mg.taps[key]}</div>
        </div>
      );
    }
    if (mg.type === "speed-sort") {
      return (
        <div className="flex-1 flex flex-col gap-4 p-4">
          <div className="text-center text-3xl font-black tabular-nums">{remaining}s · {mg.progress[key]}/{mg.items.length}</div>
          <div className="grid grid-cols-2 gap-2">
            {mg.items.map((it, i) => {
              const isDone = i < mg.progress[key];
              return (
                <button
                  key={it.id}
                  disabled={isDone}
                  onClick={() => {
                    const isCorrect = (key === "p1" ? it.bin === "left" : it.bin === "right");
                    send({ type: "minigame-input", payload: { itemId: it.id, correct: isCorrect } });
                  }}
                  className={`px-3 py-4 rounded-2xl text-base font-bold ${isDone ? "opacity-30" : "glass active:scale-95"}`}
                >
                  {it.label}
                </button>
              );
            })}
          </div>
          <div className="flex justify-around text-sm text-[color:var(--muted)]">
            <span>← {key === "p1" ? "Fruits" : "Veggies"}</span>
            <span>{key === "p1" ? "Veggies" : "Fruits"} →</span>
          </div>
        </div>
      );
    }
    // type-race
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
        <div className="text-3xl font-black tabular-nums">{remaining}s</div>
        <div className="text-[color:var(--muted)] text-sm">Type this:</div>
        <div className="glass rounded-2xl px-4 py-3 text-2xl font-mono">{mg.prompt}</div>
        <input
          autoFocus
          value={mg.typed[key]}
          onChange={(e) => send({ type: "minigame-input", payload: { typed: e.target.value } })}
          className="w-full max-w-md px-4 py-4 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-2xl font-mono"
        />
        {mg.finishedAt[key] !== null && <div className="text-[color:var(--good)] font-black text-2xl">DONE!</div>}
      </div>
    );
  }

  // Host view of minigame
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-7xl font-black tabular-nums">{remaining}</div>
      {mg.type === "reflex" && (
        <div className="text-3xl font-bold">{mg.lightsOn ? "GO!" : "Wait for green…"}</div>
      )}
      {mg.type === "speed-sort" && (
        <div className="grid grid-cols-2 gap-3 w-full max-w-md">
          {state.players.map((p, i) => (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="text-sm text-[color:var(--muted)]">{p.name}</div>
              <div className="text-4xl font-black tabular-nums">{mg.progress[i === 0 ? "p1" : "p2"]}/{mg.items.length}</div>
            </div>
          ))}
        </div>
      )}
      {mg.type === "type-race" && (
        <div className="space-y-3 w-full max-w-md">
          {state.players.map((p, i) => {
            const k = i === 0 ? "p1" : "p2";
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
      )}
    </div>
  );
}

function TiebreakerResult({ state }: { state: GameState }) {
  const mg = state.minigame!;
  const winner = state.players.find((p) => p.id === mg.winnerId);
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-4">
      <div className="text-7xl">🏆</div>
      <div className="text-3xl font-black">{winner ? `${winner.name} wins!` : "Draw!"}</div>
    </div>
  );
}

function FinalView({ state, isHost, send }: { state: GameState; isHost: boolean; send: Props["send"] }) {
  const sorted = useMemo(() => [...state.players].sort((a, b) => b.score - a.score), [state.players]);
  const winner = sorted[0];
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-4">
      <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">Final</div>
      <h2 className="text-5xl sm:text-7xl font-black text-shadow-lg">
        {winner?.name} <span className="bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent-2)] bg-clip-text text-transparent">wins</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl mt-4">
        {sorted.map((p, i) => (
          <div key={p.id} className="glass rounded-2xl p-5 flex items-center gap-3">
            <div className="text-3xl">{i === 0 ? "🥇" : "🥈"}</div>
            <div className="flex-1 text-left">
              <div className="font-bold text-lg">{p.name}</div>
              <div className="text-xs text-[color:var(--muted)]">Final score</div>
            </div>
            <div className="text-3xl font-black tabular-nums">{p.score}</div>
          </div>
        ))}
      </div>
      {isHost && (
        <button
          onClick={() => send({ type: "play-again" })}
          className="mt-6 px-8 py-5 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-black text-2xl glow-pink"
        >
          Play again →
        </button>
      )}
    </div>
  );
}

function nameOf(state: GameState, id: string | null): string {
  if (!id) return "Someone";
  return state.players.find((p) => p.id === id)?.name ?? "Someone";
}
