// Types and pure helpers shared by the React client and the Cloudflare Worker.

export type Player = {
  id: string;
  name: string;
  score: number;
  color: string;
  isHost: boolean;
  connected: boolean;
};

export type PhotoEntry = {
  id: string;
  /** R2 object key; the image is served from /api/photos/<key>. */
  key: string;
  where: string;
  when: string;
};

/** Resolve the <img> src for a photo (served from R2 via the auth-gated route). */
export function photoSrc(p: PhotoEntry): string {
  return `/api/photos/${p.key}`;
}

/** A Memory Lane photo only counts if it has a key and at least one answer. */
export function isUsablePhoto(p: PhotoEntry): boolean {
  return Boolean(p && p.key && (p.where || p.when));
}

/** Does the Memory Lane config have at least one usable photo? */
export function memoryLaneHasContent(photos: PhotoEntry[]): boolean {
  return photos.some(isUsablePhoto);
}

export type Question = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  category: string;
  source: "opentdb" | "us";
};

export type BuzzState = {
  buzzedBy: string | null;
  buzzedAt: number | null;
  timerEndsAt: number;
  status: "buzzing" | "answering" | "reveal";
  answerCorrect: boolean | null;
};

export type TriviaPhase = "wager" | "buzzing" | "answering" | "reveal";
export type MemoryLanePhase = "answering" | "reveal";

export type MinigameId = "trivia" | "memory-lane" | "reflex" | "speed-sort" | "type-race";

export const ALL_MINIGAME_IDS: MinigameId[] = [
  "trivia",
  "memory-lane",
  "reflex",
  "speed-sort",
  "type-race",
];

export type MinigameMeta = { id: MinigameId; label: string; description: string };

export const MINIGAME_META: MinigameMeta[] = [
  { id: "trivia", label: "Trivia", description: "Buzz in and answer. Optionally wagers for high-stakes questions." },
  { id: "memory-lane", label: "Memory Lane", description: "Your own photos: guess where & when." },
  { id: "reflex", label: "Reflex Tap", description: "Wait for green light, then mash." },
  { id: "speed-sort", label: "Speed Sort", description: "Sort fruits and veggies into bins." },
  { id: "type-race", label: "Type Race", description: "Type the phrase fastest." },
];

export type MinigameConfig =
  | {
      id: "trivia";
      pack: "general" | "us" | "mixed";
      difficulty: "easy" | "medium" | "hard";
      questionCount: number;
      useWagers: boolean;
    }
  | {
      id: "memory-lane";
      photos: PhotoEntry[];
    }
  | {
      id: "reflex";
      durationMs: number;
      lightDelayMinMs: number;
      lightDelayMaxMs: number;
    }
  | {
      id: "speed-sort";
      itemCount: number;
    }
  | {
      id: "type-race";
    };

export type MinigameConfigMap = {
  trivia: Extract<MinigameConfig, { id: "trivia" }>;
  "memory-lane": Extract<MinigameConfig, { id: "memory-lane" }>;
  reflex: Extract<MinigameConfig, { id: "reflex" }>;
  "speed-sort": Extract<MinigameConfig, { id: "speed-sort" }>;
  "type-race": Extract<MinigameConfig, { id: "type-race" }>;
};

export type GameSettings = {
  minigames: MinigameConfigMap;
  /** Which minigames the host enabled for this match. */
  enabledMinigames: MinigameId[];
  matchLength: number;
  allowRepeats: boolean;
};

/** Stable mapping of the two competing players to fixed p1/p2 slots, captured
 *  when a head-to-head minigame goes live so a mid-game disconnect can't
 *  reshuffle who is p1/p2. */
export type Slots = { p1: string; p2: string };

export type TriviaState = {
  id: "trivia";
  mode: "rapid" | "wager";
  questions: Question[];
  questionIndex: number;
  phase: TriviaPhase;
  buzz: BuzzState | null;
  wagers: Record<string, number>;
  lastEvent: { kind: "correct" | "wrong" | "timeout"; playerId: string | null; delta: number } | null;
};

export type MemoryLaneState = {
  id: "memory-lane";
  photos: PhotoEntry[];
  photoIndex: number;
  phase: MemoryLanePhase;
  timerEndsAt: number | null;
  guesses: Record<string, { where: string; when: string }>;
  selfScored: Record<string, { where: boolean | null; when: boolean | null }>;
};

export type ReflexState = {
  id: "reflex";
  slots: Slots;
  startedAt: number;
  duration: number;
  taps: { p1: number; p2: number };
  lightsOn: boolean;
  lightOnAt: number | null;
  winnerId: string | null;
  status: "waiting" | "live" | "done";
};

export type SpeedSortState = {
  id: "speed-sort";
  slots: Slots;
  startedAt: number;
  duration: number;
  items: { id: string; label: string; bin: "left" | "right" }[];
  progress: { p1: number; p2: number };
  winnerId: string | null;
  status: "waiting" | "live" | "done";
};

export type TypeRaceState = {
  id: "type-race";
  slots: Slots;
  startedAt: number;
  duration: number;
  prompt: string;
  typed: { p1: string; p2: string };
  finishedAt: { p1: number | null; p2: number | null };
  winnerId: string | null;
  status: "waiting" | "live" | "done";
};

export type MinigameState = TriviaState | MemoryLaneState | ReflexState | SpeedSortState | TypeRaceState;

/** The three head-to-head minigames that use fixed p1/p2 slots. */
export type SlottedState = ReflexState | SpeedSortState | TypeRaceState;

export type MinigameResult = {
  id: MinigameId;
  winnerId: string | null;
  scoreDeltas: Record<string, number>;
};

export type GamePhase = "lobby" | "minigame-intro" | "minigame-active" | "minigame-end" | "final";

export type GameState = {
  phase: GamePhase;
  hostId: string;
  players: Player[];
  currentMinigame: MinigameId | null;
  minigame: MinigameState | null;
  minigameResult: MinigameResult | null;
  playedMinigames: MinigameId[];
  settings: GameSettings;
};

export type MinigameInput =
  | { kind: "trivia-answer"; answerIndex: number }
  | { kind: "trivia-wager"; amount: number }
  | { kind: "memory-lane-guess"; where: string; when: string }
  | { kind: "memory-lane-score"; where: boolean; when: boolean }
  | { kind: "memory-lane-next" }
  | { kind: "reflex-tap" }
  | { kind: "speed-sort-place"; itemId: string; correct: boolean }
  | { kind: "type-race-typed"; text: string };

export type ClientMessage =
  | { type: "host-join"; name: string; asPlayer: boolean }
  | { type: "player-join"; name: string }
  | { type: "rejoin"; playerId: string }
  | { type: "start-game"; settings: GameSettings }
  | { type: "next-question" }
  | { type: "buzz" }
  | { type: "minigame-skip" }
  | { type: "minigame-input"; payload: MinigameInput }
  | { type: "play-again" };

export type ServerErrorCode = "rejoin-failed";

export type ServerMessage =
  | { type: "state"; state: GameState; youId: string }
  | { type: "error"; message: string; code?: ServerErrorCode };

export function defaultMinigameConfigMap(): MinigameConfigMap {
  return {
    trivia: {
      id: "trivia",
      pack: "general",
      difficulty: "medium",
      questionCount: 8,
      useWagers: false,
    },
    "memory-lane": {
      id: "memory-lane",
      photos: [],
    },
    reflex: {
      id: "reflex",
      durationMs: 1500,
      lightDelayMinMs: 1200,
      lightDelayMaxMs: 4000,
    },
    "speed-sort": {
      id: "speed-sort",
      itemCount: 8,
    },
    "type-race": {
      id: "type-race",
    },
  };
}

export function defaultSettings(): GameSettings {
  return {
    minigames: defaultMinigameConfigMap(),
    enabledMinigames: [...ALL_MINIGAME_IDS],
    matchLength: 4,
    allowRepeats: false,
  };
}

export const MAX_MATCH_LENGTH = 20;

/**
 * Merge a (possibly partial / untrusted) settings object onto the defaults.
 * Shared by the client settings page and the authoritative server so both
 * apply the same clamping. `matchLength` is capped at {@link MAX_MATCH_LENGTH}
 * and `enabledMinigames` is filtered to known ids (defaulting to all).
 */
export function mergeSettings(partial: Partial<GameSettings> | undefined): GameSettings {
  const base = defaultSettings();
  if (!partial) return base;
  const enabled = Array.isArray(partial.enabledMinigames)
    ? ALL_MINIGAME_IDS.filter((id) => partial.enabledMinigames!.includes(id))
    : base.enabledMinigames;
  return {
    minigames: {
      ...base.minigames,
      ...(partial.minigames ?? {}),
    } as MinigameConfigMap,
    enabledMinigames: enabled.length > 0 ? enabled : base.enabledMinigames,
    matchLength:
      typeof partial.matchLength === "number" && partial.matchLength > 0
        ? Math.min(MAX_MATCH_LENGTH, Math.floor(partial.matchLength))
        : base.matchLength,
    allowRepeats: typeof partial.allowRepeats === "boolean" ? partial.allowRepeats : base.allowRepeats,
  };
}
