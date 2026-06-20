import {
  ALL_MINIGAME_IDS,
  isUsablePhoto,
  memoryLaneHasContent,
} from "@shared/game";
import type {
  BuzzState,
  GameState,
  MemoryLaneState,
  MinigameConfigMap,
  MinigameId,
  MinigameState,
  Player,
  ReflexState,
  Slots,
  SpeedSortState,
  TypeRaceState,
} from "@shared/game";

// ─── Timing (ms) ───────────────────────────────────────────────────────────
export const TRIVIA_BUZZ_RAPID_MS = 15_000;
export const TRIVIA_BUZZ_WAGER_MS = 20_000;
export const TRIVIA_ANSWER_MS = 6_000;
export const TRIVIA_WAGER_MS = 20_000;
export const TRIVIA_REVEAL_MS = 2_200;
export const MEMORY_LANE_ANSWER_MS = 30_000;
export const MEMORY_LANE_REVEAL_MS = 15_000;
export const SPEED_SORT_MS = 30_000;
export const TYPE_RACE_MS = 30_000;
export const STEAL_WINDOW_MS = 4_000;
export const POST_MINIGAME_MS = 3_000;
export const IDLE_CLEANUP_MS = 30 * 60 * 1000;

export const PLAYER_COLORS = ["#f97316", "#06b6d4", "#a855f7", "#22c55e", "#ec4899", "#eab308"];

const TYPE_RACE_PROMPTS = [
  "i love you so much",
  "you are my favorite person",
  "best team in the world",
  "i am so lucky",
  "you make me laugh every day",
  "lets go on an adventure",
];

const SPEED_SORT_FRUITS = ["Apple", "Banana", "Cherry", "Grape", "Lemon", "Mango", "Peach", "Pear"];
const SPEED_SORT_VEGGIES = ["Carrot", "Onion", "Pepper", "Potato", "Tomato", "Cucumber", "Lettuce", "Spinach"];

export function nowMs(): number {
  return Date.now();
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Fixed p1/p2 mapping from the two players competing in a head-to-head game. */
export function slotsFrom(players: Player[]): Slots {
  return { p1: players[0].id, p2: players[1].id };
}

export function newBuzz(durationMs: number): BuzzState {
  return {
    buzzedBy: null,
    buzzedAt: null,
    timerEndsAt: nowMs() + durationMs,
    status: "buzzing",
    answerCorrect: null,
  };
}

export function makeMemoryLaneState(cfg: MinigameConfigMap["memory-lane"]): MemoryLaneState {
  const photos = cfg.photos.filter(isUsablePhoto);
  return {
    id: "memory-lane",
    photos,
    photoIndex: 0,
    phase: "answering",
    timerEndsAt: nowMs() + MEMORY_LANE_ANSWER_MS,
    guesses: {},
    selfScored: {},
  };
}

export function makeReflexState(slots: Slots): ReflexState {
  return {
    id: "reflex",
    slots,
    startedAt: 0,
    duration: 0,
    taps: { p1: 0, p2: 0 },
    lightsOn: false,
    lightOnAt: null,
    winnerId: null,
    status: "waiting",
  };
}

export function makeSpeedSortState(cfg: MinigameConfigMap["speed-sort"], slots: Slots): SpeedSortState {
  const n = Math.max(2, Math.min(8, Math.floor(cfg.itemCount)));
  const halfF = Math.ceil(n / 2);
  const halfV = n - halfF;
  const fruits = shuffle(SPEED_SORT_FRUITS)
    .slice(0, halfF)
    .map((label, i) => ({ id: `fr-${i}`, label, bin: "left" as const }));
  const veggies = shuffle(SPEED_SORT_VEGGIES)
    .slice(0, halfV)
    .map((label, i) => ({ id: `ve-${i}`, label, bin: "right" as const }));
  const items = shuffle([...fruits, ...veggies]);
  return {
    id: "speed-sort",
    slots,
    startedAt: 0,
    duration: 0,
    items,
    progress: { p1: 0, p2: 0 },
    winnerId: null,
    status: "waiting",
  };
}

export function makeTypeRaceState(slots: Slots): TypeRaceState {
  const prompt = TYPE_RACE_PROMPTS[Math.floor(Math.random() * TYPE_RACE_PROMPTS.length)];
  return {
    id: "type-race",
    slots,
    startedAt: 0,
    duration: 0,
    prompt,
    typed: { p1: "", p2: "" },
    finishedAt: { p1: null, p2: null },
    winnerId: null,
    status: "waiting",
  };
}

/** Pick the next minigame, honouring the host's enabled set, no-repeat rule,
 *  match length, and Memory Lane's photo requirement. */
export function pickNextMinigame(state: GameState): MinigameId | null {
  if (state.playedMinigames.length >= state.settings.matchLength) return null;
  const enabled = new Set(state.settings.enabledMinigames);
  const playable = ALL_MINIGAME_IDS.filter((id) => {
    if (!enabled.has(id)) return false;
    if (id === "memory-lane") {
      return memoryLaneHasContent(state.settings.minigames["memory-lane"].photos);
    }
    return true;
  });
  if (playable.length === 0) return null;
  if (state.settings.allowRepeats) {
    return playable[Math.floor(Math.random() * playable.length)];
  }
  const played = new Set(state.playedMinigames);
  const remaining = playable.filter((id) => !played.has(id));
  if (remaining.length === 0) return null;
  return remaining[Math.floor(Math.random() * remaining.length)];
}

export function computeResultDeltas(
  players: Player[],
  scoresAtStart: Record<string, number>
): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const p of players) {
    const before = scoresAtStart[p.id] ?? p.score;
    deltas[p.id] = p.score - before;
  }
  return deltas;
}

/** Winner of a head-to-head minigame, resolved via the fixed p1/p2 slots so a
 *  mid-game disconnect can't change who is who. */
export function determineWinner(mg: MinigameState): string | null {
  if (mg.id === "reflex") {
    if (mg.taps.p1 > mg.taps.p2) return mg.slots.p1;
    if (mg.taps.p2 > mg.taps.p1) return mg.slots.p2;
    return null;
  }
  if (mg.id === "speed-sort") {
    if (mg.progress.p1 > mg.progress.p2) return mg.slots.p1;
    if (mg.progress.p2 > mg.progress.p1) return mg.slots.p2;
    return null;
  }
  if (mg.id === "type-race") {
    const p1Done = mg.finishedAt.p1 !== null;
    const p2Done = mg.finishedAt.p2 !== null;
    if (p1Done && p2Done) return mg.finishedAt.p1! < mg.finishedAt.p2! ? mg.slots.p1 : mg.slots.p2;
    if (p1Done) return mg.slots.p1;
    if (p2Done) return mg.slots.p2;
    return null;
  }
  return null;
}
