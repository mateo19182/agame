import { useState } from "react";
import { Link } from "react-router-dom";
import type { GameState, MinigameId } from "@shared/game";
import { MAX_MATCH_LENGTH, MINIGAME_META, memoryLaneHasContent } from "@shared/game";
import { loadSettings } from "@/lib/settings";
import type { Send } from "./types";
import { CopyButton } from "./CopyButton";

export function Lobby({
  state,
  isHost,
  send,
  youId,
  code,
}: {
  state: GameState;
  isHost: boolean;
  send: Send;
  youId: string;
  code: string;
}) {
  const players = state.players;
  const youAreIn = players.some((p) => p.id === youId);
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
          <LobbyOptions send={send} />
        ) : (
          <div className="text-[color:var(--muted)]">Waiting for at least 2 players…</div>
        )
      ) : (
        <div className="text-[color:var(--muted)]">{youAreIn ? "Waiting for the host to start…" : "Joining…"}</div>
      )}
    </div>
  );
}

function LobbyOptions({ send }: { send: Send }) {
  // Read the host's saved minigame configs (incl. uploaded photos) once.
  const [settings] = useState(loadSettings);
  const hasPhotos = memoryLaneHasContent(settings.minigames["memory-lane"].photos);

  const [enabled, setEnabled] = useState<Record<MinigameId, boolean>>({
    trivia: true,
    "memory-lane": hasPhotos,
    reflex: true,
    "speed-sort": true,
    "type-race": true,
  });
  const [matchLength, setMatchLength] = useState(settings.matchLength);
  const [allowRepeats, setAllowRepeats] = useState(settings.allowRepeats);

  const enabledIds = (Object.entries(enabled) as [MinigameId, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => k);
  const maxMatchLength = allowRepeats ? MAX_MATCH_LENGTH : Math.max(1, enabledIds.length);
  const effectiveMatchLength = Math.min(matchLength, maxMatchLength);
  const canStart = enabledIds.length > 0 && effectiveMatchLength > 0;

  function start() {
    send({
      type: "start-game",
      settings: {
        ...settings,
        enabledMinigames: enabledIds,
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
                  {m.id === "memory-lane" && !hasPhotos && (
                    <div className="text-[10px] text-[color:var(--accent-3)] mt-0.5">Add photos in Settings to enable</div>
                  )}
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
              <div className="text-xs text-[color:var(--muted)] mt-1">Capped at {maxMatchLength} (no repeats)</div>
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
          Configure each minigame in <Link to="/settings" className="underline">Settings</Link>.
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
