"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import type {
  GameState,
  MemoryLaneState,
  MinigameId,
  ReflexState,
  SpeedSortState,
  TriviaState,
  TypeRaceState,
} from "@/lib/game";
import { MINIGAME_META } from "@/lib/game";
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
        {state.phase === "minigame-intro" && state.currentMinigame && (
          <MinigameIntro state={state} isHost={isHost} send={send} />
        )}
        {state.phase === "minigame-active" && state.minigame && (
          <MinigameActive state={state} role={role} send={send} youId={youId} />
        )}
        {state.phase === "minigame-end" && state.minigameResult && (
          <MinigameEnd state={state} isHost={isHost} send={send} />
        )}
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
  const id = state.currentMinigame;
  const meta = id ? MINIGAME_META.find((m) => m.id === id) : null;
  const label = (() => {
    if (state.phase === "lobby") return "Lobby";
    if (state.phase === "minigame-intro") return meta ? `Up next · ${meta.label}` : "Up next";
    if (state.phase === "minigame-active") {
      const turn = Math.min(state.playedCount + 1, state.settings.matchLength);
      return meta ? `Minigame ${turn} of ${state.settings.matchLength} · ${meta.label}` : "Minigame";
    }
    if (state.phase === "minigame-end") return meta ? `${meta.label} · Result` : "Result";
    if (state.phase === "final") return "Final";
    return "";
  })();
  return (
    <div className="hidden sm:block text-sm uppercase tracking-widest text-[color:var(--muted)]">
      {label}
    </div>
  );
}

function ScoreBar({ state, youId }: { state: GameState; youId: string }) {
  return (
    <div className="px-4 sm:px-6 pb-4 max-w-6xl w-full mx-auto w-full">
      <div className="glass rounded-2xl p-3 grid grid-cols-2 gap-3">
        {state.players.map((p) => (
          <div key={p.id} className="px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
              <span className="font-semibold truncate">
                {p.name}
                {p.id === youId && <span className="text-[color:var(--muted)] text-xs"> · you</span>}
              </span>
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
  const code = getRoomFromUrl();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const fullUrl = `${origin}/play/${code}`;
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
      <div>
        <div className="text-sm uppercase tracking-widest text-[color:var(--accent-3)]">Open this on a phone</div>
      </div>
      <div className="glass rounded-3xl px-6 py-8 max-w-md w-full">
        <div className="text-sm text-[color:var(--muted)]">Room code</div>
        <div className="mt-2 text-6xl sm:text-7xl font-black tracking-[0.2em]">{code}</div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <div className="text-xs text-[color:var(--muted)] break-all max-w-full">{fullUrl}</div>
          <CopyButton value={fullUrl} />
        </div>
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
          <LobbyOptions state={state} send={send} />
        ) : (
          <div className="text-[color:var(--muted)]">Waiting for at least 2 players…</div>
        )
      ) : (
        <div className="text-[color:var(--muted)]">{youAreIn ? "Waiting for the host to start…" : "Joining…"}</div>
      )}
    </div>
  );
}

function LobbyOptions({ state, send }: { state: GameState; send: Props["send"] }) {
  const initialEnabled = useMemo<Record<MinigameId, boolean>>(() => {
    const hasPhotos = state.settings.minigames["memory-lane"].photos.filter(
      (p) => p.dataUrl && (p.where || p.when)
    ).length > 0;
    return {
      trivia: true,
      "memory-lane": hasPhotos,
      reflex: true,
      "speed-sort": true,
      "type-race": true,
    };
  }, [state]);

  const [enabled, setEnabled] = useState<Record<MinigameId, boolean>>(initialEnabled);
  const [matchLength, setMatchLength] = useState(state.settings.matchLength);
  const [allowRepeats, setAllowRepeats] = useState(state.settings.allowRepeats);

  const enabledIds = (Object.entries(enabled) as [MinigameId, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => k);
  const maxMatchLength = allowRepeats ? 20 : Math.max(1, enabledIds.length);
  const effectiveMatchLength = Math.min(matchLength, maxMatchLength);
  const canStart = enabledIds.length > 0 && effectiveMatchLength > 0;

  function start() {
    const minigames = { ...state.settings.minigames };
    send({
      type: "start-game",
      settings: {
        minigames,
        matchLength: effectiveMatchLength,
        allowRepeats,
      },
    });
  }

  return (
    <div className="w-full max-w-xl space-y-4">
      <div className="glass rounded-3xl p-5 sm:p-6 text-left space-y-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">Minigames in this match</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MINIGAME_META.map((m) => {
              const checked = enabled[m.id];
              return (
                <button
                  key={m.id}
                  onClick={() => setEnabled((e) => ({ ...e, [m.id]: !e[m.id] }))}
                  className={`w-full text-left px-3 py-2.5 rounded-2xl border transition ${checked ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10" : "border-white/10 hover:border-white/20"}`}
                >
                  <div className="font-semibold">{m.label}</div>
                  <div className="text-xs text-[color:var(--muted)] mt-0.5">{m.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">Rounds</div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => setMatchLength((n) => Math.max(1, n - 1))}
                className="w-9 h-9 rounded-full glass font-black"
                aria-label="Fewer rounds"
              >
                −
              </button>
              <div className="flex-1 text-center text-2xl font-black tabular-nums">{effectiveMatchLength}</div>
              <button
                onClick={() => setMatchLength((n) => Math.min(maxMatchLength, n + 1))}
                className="w-9 h-9 rounded-full glass font-black"
                aria-label="More rounds"
              >
                +
              </button>
            </div>
            {!allowRepeats && (
              <div className="text-xs text-[color:var(--muted)] mt-1">
                Capped at {maxMatchLength} (no repeats)
              </div>
            )}
          </div>

          <div>
            <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">Allow repeats</div>
            <button
              onClick={() => setAllowRepeats((v) => !v)}
              className="mt-2 w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-white/10"
            >
              <span className="font-semibold">Pick a minigame twice</span>
              <span className={`w-12 h-7 rounded-full p-1 transition ${allowRepeats ? "bg-[color:var(--accent)]" : "bg-white/10"}`}>
                <span className={`block w-5 h-5 rounded-full bg-white transition ${allowRepeats ? "translate-x-5" : ""}`} />
              </span>
            </button>
          </div>
        </div>

        <div className="text-xs text-[color:var(--muted)]">
          Configure each minigame in <Link href="/settings" className="underline">Settings</Link>.
        </div>
      </div>

      <button
        onClick={start}
        disabled={!canStart}
        className="w-full px-8 py-5 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-black text-2xl glow-pink hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Start game ({effectiveMatchLength} {effectiveMatchLength === 1 ? "round" : "rounds"}) →
      </button>
    </div>
  );
}

function MinigameIntro({ state, isHost, send }: { state: GameState; isHost: boolean; send: Props["send"] }) {
  const id = state.currentMinigame!;
  const meta = MINIGAME_META.find((m) => m.id === id)!;
  const turn = state.playedCount + 1;
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-4">
      <div className="text-xs uppercase tracking-widest text-[color:var(--accent-3)]">
        Round {turn} of {state.settings.matchLength}
      </div>
      <h2 className="text-4xl sm:text-6xl font-black">{meta.label}</h2>
      <p className="text-[color:var(--muted)] max-w-md">{meta.description}</p>
      {id === "trivia" && state.settings.minigames.trivia.useWagers && (
        <div className="glass rounded-2xl px-4 py-2 text-sm text-[color:var(--accent-3)]">Wagers enabled</div>
      )}
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

function MinigameActive({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const mg = state.minigame!;
  if (mg.id === "trivia") return <TriviaActive state={state} role={role} send={send} youId={youId} />;
  if (mg.id === "memory-lane") return <MemoryLaneActive state={state} role={role} send={send} youId={youId} />;
  if (mg.id === "reflex") return <ReflexActive state={state} role={role} send={send} youId={youId} />;
  if (mg.id === "speed-sort") return <SpeedSortActive state={state} role={role} send={send} youId={youId} />;
  return <TypeRaceActive state={state} role={role} send={send} youId={youId} />;
}

function TriviaActive({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const mg = state.minigame as TriviaState;
  if (mg.phase === "wager") return <TriviaWagerView state={state} role={role} send={send} youId={youId} />;
  return <TriviaQuestionView state={state} role={role} send={send} youId={youId} />;
}

function TriviaWagerView({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
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
          {[0, 1, 2, 3, 5, 8, 10, myMax].map((v) => (
            <button
              key={v}
              onClick={() => send({ type: "minigame-input", payload: { kind: "trivia-wager", amount: v } })}
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

function TriviaQuestionView({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
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
                onClick={() => send({ type: "minigame-input", payload: { kind: "trivia-answer", correct: i === q.correctIndex } })}
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
  const hostLocked = role === "host" && buzz.buzzedBy && buzz.buzzedBy !== youId;
  const hostCanBuzz = role === "host" && buzz.status === "buzzing" && !buzz.buzzedBy && youId;
  const hostYouBuzzed = role === "host" && youBuzzed && buzz.status === "answering";

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
              onClick={() => send({ type: "minigame-input", payload: { kind: "trivia-answer", correct: i === q.correctIndex } })}
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

function MemoryLaneActive({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const mg = state.minigame as MemoryLaneState;
  if (mg.phase === "answering") return <MemoryLaneAnswerView state={state} role={role} send={send} youId={youId} />;
  return <MemoryLaneRevealView state={state} role={role} send={send} youId={youId} />;
}

function MemoryLaneAnswerView({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.dataUrl} alt="Memory" className="w-full max-h-[40vh] object-contain rounded-2xl glass" />
        <div className="space-y-2">
          <input
            value={myGuess?.where ?? ""}
            onChange={(e) =>
              send({
                type: "minigame-input",
                payload: { kind: "memory-lane-guess", where: e.target.value, when: myGuess?.when ?? "" },
              })
            }
            placeholder="Where was this?"
            maxLength={80}
            className="w-full px-3 py-3 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-base"
          />
          <input
            value={myGuess?.when ?? ""}
            onChange={(e) =>
              send({
                type: "minigame-input",
                payload: { kind: "memory-lane-guess", where: myGuess?.where ?? "", when: e.target.value },
              })
            }
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

  return (
    <div className="flex-1 flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between text-sm">
        <div className="text-[color:var(--muted)]">Memory Lane · {mg.photoIndex + 1}/{mg.photos.length}</div>
        <div className="text-3xl font-black tabular-nums">{remaining}s</div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.dataUrl} alt="Memory" className="w-full max-h-[50vh] object-contain rounded-2xl glass" />
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

function MemoryLaneRevealView({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
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

function ReflexActive({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const mg = state.minigame as ReflexState;
  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me) return null;
    const key = state.players[0].id === me.id ? "p1" : "p2";
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
      <div className="text-7xl font-black tabular-nums">{mg.status === "live" ? (mg.lightsOn ? "GO!" : "Wait for green…") : "..."}</div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {state.players.map((p, i) => (
          <div key={p.id} className="glass rounded-2xl p-4">
            <div className="text-sm text-[color:var(--muted)]">{p.name}</div>
            <div className="text-4xl font-black tabular-nums">{mg.taps[i === 0 ? "p1" : "p2"]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpeedSortActive({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const mg = state.minigame as SpeedSortState;
  const now = useNow(100);
  const remaining = Math.max(0, Math.ceil((mg.startedAt + mg.duration - now) / 1000));

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me) return null;
    const key = state.players[0].id === me.id ? "p1" : "p2";
    const myBin = key === "p1" ? "left" : "right";
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
                  const correct = it.bin === myBin;
                  send({ type: "minigame-input", payload: { kind: "speed-sort-place", itemId: it.id, correct } });
                }}
                className={`px-3 py-4 rounded-2xl text-base font-bold ${isDone ? "opacity-30" : "glass active:scale-95"}`}
              >
                {it.label}
              </button>
            );
          })}
        </div>
        <div className="flex justify-around text-sm text-[color:var(--muted)]">
          <span>← {myBin === "left" ? "Fruits" : "Veggies"}</span>
          <span>{myBin === "left" ? "Veggies" : "Fruits"} →</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-7xl font-black tabular-nums">{remaining}</div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {state.players.map((p, i) => (
          <div key={p.id} className="glass rounded-2xl p-4">
            <div className="text-sm text-[color:var(--muted)]">{p.name}</div>
            <div className="text-4xl font-black tabular-nums">{mg.progress[i === 0 ? "p1" : "p2"]}/{mg.items.length}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeRaceActive({ state, role, send, youId }: { state: GameState; role: "host" | "player"; send: Props["send"]; youId: string }) {
  const mg = state.minigame as TypeRaceState;
  const now = useNow(100);
  const remaining = Math.max(0, Math.ceil((mg.startedAt + mg.duration - now) / 1000));

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me) return null;
    const key = state.players[0].id === me.id ? "p1" : "p2";
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
        <div className="text-3xl font-black tabular-nums">{remaining}s</div>
        <div className="text-[color:var(--muted)] text-sm">Type this:</div>
        <div className="glass rounded-2xl px-4 py-3 text-2xl font-mono">{mg.prompt}</div>
        <input
          autoFocus
          value={mg.typed[key]}
          onChange={(e) => send({ type: "minigame-input", payload: { kind: "type-race-typed", text: e.target.value } })}
          className="w-full max-w-md px-4 py-4 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-2xl font-mono"
        />
        {mg.finishedAt[key] !== null && <div className="text-[color:var(--good)] font-black text-2xl">DONE!</div>}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-7xl font-black tabular-nums">{remaining}</div>
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
    </div>
  );
}

function MinigameEnd({ state, isHost, send }: { state: GameState; isHost: boolean; send: Props["send"] }) {
  const result = state.minigameResult!;
  const meta = MINIGAME_META.find((m) => m.id === result.id);
  const winner = result.winnerId ? state.players.find((p) => p.id === result.winnerId) : null;
  const total = state.playedCount;
  const totalRounds = state.settings.matchLength;
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 p-4">
      <div className="text-xs uppercase tracking-widest text-[color:var(--muted)]">
        Round {total} of {totalRounds} · {meta?.label ?? "Done"}
      </div>
      <div className="text-7xl">{winner ? "🏆" : "🤝"}</div>
      <div className="text-3xl font-black">
        {winner ? `${winner.name} wins this round` : "Draw"}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
        {state.players.map((p) => {
          const delta = result.scoreDeltas[p.id] ?? 0;
          return (
            <div key={p.id} className="glass rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="font-bold">{p.name}</div>
                <div className="text-xs text-[color:var(--muted)]">Score {p.score}</div>
              </div>
              <div className={`text-2xl font-black tabular-nums ${delta > 0 ? "text-[color:var(--good)]" : ""}`}>
                {delta > 0 ? `+${delta}` : delta}
              </div>
            </div>
          );
        })}
      </div>
      {isHost && (
        <button
          onClick={() => send({ type: "next-question" })}
          className="mt-2 px-6 py-4 rounded-2xl bg-white/10 hover:bg-white/20 font-bold"
        >
          {total < totalRounds ? "Next minigame →" : "See final →"}
        </button>
      )}
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

function getRoomFromUrl(): string {
  if (typeof window === "undefined") return "";
  const m = window.location.pathname.match(/\/(host|play)\/([A-Z]{4})/);
  return m?.[2] ?? "";
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  return (
    <button
      onClick={copy}
      className="shrink-0 px-2.5 py-1 rounded-full glass text-xs font-semibold hover:bg-white/10"
      aria-label="Copy room URL"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

function nameOf(state: GameState, id: string | null): string {
  if (!id) return "Someone";
  return state.players.find((p) => p.id === id)?.name ?? "Someone";
}
