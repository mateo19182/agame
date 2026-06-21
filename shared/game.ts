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

/** The eight minigames that share the quiz-race engine (multiple-choice race). */
export type QuizRaceId =
  | "math-duel"
  | "stroop"
  | "odd-one-out"
  | "emoji-decode"
  | "flag-quiz"
  | "word-match"
  | "true-false"
  | "compare";

export const QUIZ_RACE_IDS: QuizRaceId[] = [
  "math-duel",
  "stroop",
  "odd-one-out",
  "emoji-decode",
  "flag-quiz",
  "word-match",
  "true-false",
  "compare",
];

export type MinigameId =
  | "trivia"
  | "memory-lane"
  | "reflex"
  | "speed-sort"
  | "type-race"
  | QuizRaceId
  | "whack"
  | "number-rush"
  | "rps"
  | "balloon"
  // Hidden-information "mind games" (manga-inspired bluff/memory duels).
  | "e-card"
  | "tower"
  | "mirror-match"
  | "doubt"
  | "color-lie";

export function isQuizRaceId(id: MinigameId): id is QuizRaceId {
  return (QUIZ_RACE_IDS as string[]).includes(id);
}

export const ALL_MINIGAME_IDS: MinigameId[] = [
  "trivia",
  "memory-lane",
  "reflex",
  "speed-sort",
  "type-race",
  "math-duel",
  "stroop",
  "odd-one-out",
  "emoji-decode",
  "flag-quiz",
  "word-match",
  "true-false",
  "compare",
  "whack",
  "number-rush",
  "rps",
  "balloon",
  "e-card",
  "tower",
  "mirror-match",
  "doubt",
  "color-lie",
];

export type MinigameMeta = { id: MinigameId; label: string; emoji: string; description: string };

export const MINIGAME_META: MinigameMeta[] = [
  { id: "trivia", label: "Trivia", emoji: "🧠", description: "Buzz in and answer. Optionally wagers for high-stakes questions." },
  { id: "memory-lane", label: "Memory Lane", emoji: "📸", description: "Your own photos: guess where & when." },
  { id: "reflex", label: "Reflex Tap", emoji: "⚡", description: "Wait for green light, then mash." },
  { id: "speed-sort", label: "Speed Sort", emoji: "🍎", description: "Sort fruits and veggies into bins." },
  { id: "type-race", label: "Type Race", emoji: "⌨️", description: "Type the phrase fastest." },
  { id: "math-duel", label: "Math Duel", emoji: "🔢", description: "Solve as many arithmetic problems as you can." },
  { id: "stroop", label: "Stroop Test", emoji: "🌈", description: "Tap the COLOR of the word, not what it says." },
  { id: "odd-one-out", label: "Odd One Out", emoji: "🧩", description: "Spot the item that doesn't belong." },
  { id: "emoji-decode", label: "Emoji Decode", emoji: "🎬", description: "Guess the phrase from the emoji." },
  { id: "flag-quiz", label: "Flag Quiz", emoji: "🚩", description: "Name the country from its flag." },
  { id: "word-match", label: "Word Match", emoji: "📖", description: "Pick the matching synonym." },
  { id: "true-false", label: "True or False", emoji: "✅", description: "Rapid-fire true/false statements." },
  { id: "compare", label: "Bigger Number", emoji: "⚖️", description: "Tap the biggest number, fast." },
  { id: "whack", label: "Whack-a-Mole", emoji: "🔨", description: "Tap the mole wherever it pops up." },
  { id: "number-rush", label: "Number Rush", emoji: "🎯", description: "Tap the numbers 1→25 in order." },
  { id: "rps", label: "Rock Paper Scissors", emoji: "✊", description: "Best of 5. Outguess your opponent." },
  { id: "balloon", label: "Balloon Pump", emoji: "🎈", description: "Pump to inflate, bank to keep the points — but a pop costs you them!" },
  { id: "e-card", label: "E-Card", emoji: "👑", description: "Emperor beats Citizen, Citizen beats Slave, Slave beats Emperor. Bluff your way through." },
  { id: "tower", label: "Tower of Confession", emoji: "🗼", description: "Hide a secret number; your partner reads your mind. Close guesses pay off." },
  { id: "mirror-match", label: "Mirror Match", emoji: "🧠", description: "Memorize the growing pattern and tap it back. Furthest sequence wins." },
  { id: "doubt", label: "Doubt", emoji: "🃏", description: "One of you sees the gem and makes a claim — truth or lie. The other calls it." },
  { id: "color-lie", label: "Color Lie", emoji: "🎨", description: "Tap the COLOR of the word, not what it says. First correct tap wins the point." },
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
  | { id: "type-race" }
  // The newer minigames need no configuration; a bare `{ id }` keeps them in the
  // settings map so the host can still enable/disable them per match. The mapped
  // form distributes over each QuizRaceId so `Extract<…, { id: K }>` resolves.
  | { [K in QuizRaceId]: { id: K } }[QuizRaceId]
  | { id: "whack" }
  | { id: "number-rush" }
  | { id: "rps" }
  | { id: "balloon" }
  | { id: "e-card" }
  | { id: "tower" }
  | { id: "mirror-match" }
  | { id: "doubt" }
  | { id: "color-lie" };

export type MinigameConfigMap = {
  [K in MinigameId]: Extract<MinigameConfig, { id: K }>;
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

/** One multiple-choice question in a quiz-race. `correctIndex` is masked to -1
 *  on the wire (see the Worker's `publicState`) so clients can't cheat. */
export type QuizRound = {
  prompt: string;
  sub?: string;
  options: string[];
  correctIndex: number;
  /** Optional hex color for the prompt text (used by the Stroop test). */
  promptColor?: string;
};

export type QuizRaceState = {
  id: QuizRaceId;
  slots: Slots;
  startedAt: number;
  duration: number;
  rounds: QuizRound[];
  /** Each player's current question index (they race independently). */
  progress: { p1: number; p2: number };
  correct: { p1: number; p2: number };
  /** Last answer correctness, for a quick ✓/✗ flash on the client. */
  lastCorrect: { p1: boolean | null; p2: boolean | null };
  winnerId: string | null;
  status: "waiting" | "live" | "done";
};

export type WhackState = {
  id: "whack";
  slots: Slots;
  startedAt: number;
  duration: number;
  /** Shared mole path; each player advances through it independently. */
  sequence: number[];
  progress: { p1: number; p2: number };
  winnerId: string | null;
  status: "waiting" | "live" | "done";
};

export type NumberRushState = {
  id: "number-rush";
  slots: Slots;
  startedAt: number;
  duration: number;
  /** Fixed shuffled layout of 1..size shared by both players. */
  layout: number[];
  size: number;
  /** How many numbers each player has found so far (next target = progress+1). */
  progress: { p1: number; p2: number };
  winnerId: string | null;
  status: "waiting" | "live" | "done";
};

export type RpsChoice = "rock" | "paper" | "scissors";

export type RpsState = {
  id: "rps";
  slots: Slots;
  bestOf: number;
  round: number;
  wins: { p1: number; p2: number };
  choices: { p1: RpsChoice | null; p2: RpsChoice | null };
  reveal: { p1: RpsChoice; p2: RpsChoice; winner: "p1" | "p2" | null } | null;
  phase: "choosing" | "reveal";
  winnerId: string | null;
  status: "live" | "done";
};

export type BalloonState = {
  id: "balloon";
  slots: Slots;
  startedAt: number;
  duration: number;
  /** Current un-banked balloon size per player. */
  size: { p1: number; p2: number };
  banked: { p1: number; p2: number };
  pops: { p1: number; p2: number };
  /** Transient flag so the client can flash a pop animation. */
  justPopped: { p1: boolean; p2: boolean };
  /** Points lost on the most recent pop, for the client's "−N" flash. */
  lastPopSize: { p1: number; p2: number };
  winnerId: string | null;
  status: "waiting" | "live" | "done";
};

// ─── E-Card (Kaiji) ──────────────────────────────────────────────────────
export type ECardKind = "emperor" | "slave" | "citizen";
export type ECardOutcome = "draw" | "emperor-win" | "slave-win";

export type ECardState = {
  id: "e-card";
  slots: Slots;
  /** Two sub-games (0,1) so each player gets a turn on the Emperor side. */
  game: number;
  totalGames: number;
  /** Which slot holds the Emperor hand this sub-game. */
  emperorSlot: "p1" | "p2";
  /** Remaining cards per slot (the played card is removed each turn). */
  hands: { p1: ECardKind[]; p2: ECardKind[] };
  turn: number;
  /** This turn's face-down plays. Masked from the opponent until reveal. */
  played: { p1: ECardKind | null; p2: ECardKind | null };
  /** True once a slot has committed a card this turn (always safe to send). */
  locked: { p1: boolean; p2: boolean };
  reveal: { emperor: ECardKind; slave: ECardKind; outcome: ECardOutcome } | null;
  phase: "playing" | "reveal";
  /** Match points: Emperor win = 1, Slave upset = 2. */
  points: { p1: number; p2: number };
  winnerId: string | null;
  status: "live" | "done";
};

// ─── Tower of Confession (hidden-number duel) ──────────────────────────────
export type ConfessionState = {
  id: "tower";
  slots: Slots;
  round: number;
  totalRounds: number;
  /** Who hides the secret this round; the other player reads it. */
  confessorSlot: "p1" | "p2";
  /** 0..9. Masked from the reader until reveal. */
  secret: number | null;
  guess: number | null;
  phase: "confess" | "read" | "reveal";
  /** Last round's resolution, for the reveal screen. */
  lastResult: { secret: number; guess: number; gap: number; readerGain: number; confessorGain: number } | null;
  points: { p1: number; p2: number };
  winnerId: string | null;
  status: "live" | "done";
};

// ─── Mirror Match (escalating Simon, self-paced) ───────────────────────────
export type MirrorMatchState = {
  id: "mirror-match";
  slots: Slots;
  startedAt: number;
  duration: number;
  /** Shared pad sequence (values 0..3); each player advances independently. */
  sequence: number[];
  /** Target length each player is currently trying to reproduce. */
  level: { p1: number; p2: number };
  /** Progress within the current attempt. */
  pos: { p1: number; p2: number };
  strikes: { p1: number; p2: number };
  /** Highest level cleared (the score). */
  cleared: { p1: number; p2: number };
  winnerId: string | null;
  status: "waiting" | "live" | "done";
};

// ─── Doubt (one-sided-info bluff) ──────────────────────────────────────────
export type DoubtGem = "ruby" | "sapphire" | "emerald" | "topaz";

export type DoubtState = {
  id: "doubt";
  slots: Slots;
  round: number;
  totalRounds: number;
  /** Who secretly sees the gem and makes a claim this round. */
  tellerSlot: "p1" | "p2";
  /** The hidden gem. Visible only to the teller until reveal. */
  secret: DoubtGem | null;
  /** The teller's public claim (may be a lie). */
  claim: DoubtGem | null;
  /** The caller's verdict: true = "Doubt!" (calling a lie). */
  doubted: boolean | null;
  phase: "claim" | "call" | "reveal";
  lastResult: { secret: DoubtGem; claim: DoubtGem; lie: boolean; doubted: boolean; callerWon: boolean } | null;
  scores: { p1: number; p2: number };
  winnerId: string | null;
  status: "live" | "done";
};

// ─── Color Lie (head-to-head Stroop reaction) ──────────────────────────────
export type ColorLieRound = {
  /** The written color NAME (the lie). */
  word: string;
  /** Hex the word is printed in — the real answer. */
  inkHex: string;
  options: { name: string; hex: string }[];
  /** Index of the ink color in options. Masked to -1 on the wire. */
  correctIndex: number;
};

export type ColorLieState = {
  id: "color-lie";
  slots: Slots;
  startedAt: number;
  duration: number;
  rounds: ColorLieRound[];
  /** Current shared prompt; first correct tap advances it. */
  index: number;
  scores: { p1: number; p2: number };
  /** A wrong tap locks you out of the current prompt. */
  lockedOut: { p1: boolean; p2: boolean };
  /** Last prompt's resolution, for a quick flash. */
  lastResult: { winner: "p1" | "p2" | null; correctIndex: number } | null;
  winnerId: string | null;
  status: "waiting" | "live" | "done";
};

export type MinigameState =
  | TriviaState
  | MemoryLaneState
  | ReflexState
  | SpeedSortState
  | TypeRaceState
  | QuizRaceState
  | WhackState
  | NumberRushState
  | RpsState
  | BalloonState
  | ECardState
  | ConfessionState
  | MirrorMatchState
  | DoubtState
  | ColorLieState;

/** The head-to-head minigames that use fixed p1/p2 slots. */
export type SlottedState =
  | ReflexState
  | SpeedSortState
  | TypeRaceState
  | QuizRaceState
  | WhackState
  | NumberRushState
  | RpsState
  | BalloonState
  | ECardState
  | ConfessionState
  | MirrorMatchState
  | DoubtState
  | ColorLieState;

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
  | { kind: "type-race-typed"; text: string }
  | { kind: "quiz-answer"; index: number }
  | { kind: "whack-tap"; cell: number }
  | { kind: "number-rush-tap"; value: number }
  | { kind: "rps-choose"; choice: RpsChoice }
  | { kind: "balloon-pump" }
  | { kind: "balloon-bank" }
  | { kind: "ecard-play"; card: ECardKind }
  | { kind: "tower-confess"; value: number }
  | { kind: "tower-read"; value: number }
  | { kind: "mirror-tap"; pad: number }
  | { kind: "doubt-claim"; gem: DoubtGem }
  | { kind: "doubt-call"; doubt: boolean }
  | { kind: "color-lie-tap"; index: number; optionIndex: number };

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
    "math-duel": { id: "math-duel" },
    stroop: { id: "stroop" },
    "odd-one-out": { id: "odd-one-out" },
    "emoji-decode": { id: "emoji-decode" },
    "flag-quiz": { id: "flag-quiz" },
    "word-match": { id: "word-match" },
    "true-false": { id: "true-false" },
    compare: { id: "compare" },
    whack: { id: "whack" },
    "number-rush": { id: "number-rush" },
    rps: { id: "rps" },
    balloon: { id: "balloon" },
    "e-card": { id: "e-card" },
    tower: { id: "tower" },
    "mirror-match": { id: "mirror-match" },
    doubt: { id: "doubt" },
    "color-lie": { id: "color-lie" },
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
export const MAX_TRIVIA_QUESTIONS = 20;
export const MAX_MEMORY_LANE_PHOTOS = 50;

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
  const minigames = {
    ...base.minigames,
    ...(partial.minigames ?? {}),
  } as MinigameConfigMap;
  // Clamp untrusted per-game config the same way on both sides: a crafted
  // start-game message must not be able to request an oversized trivia fetch
  // or push an unbounded photo array into Durable Object state.
  const qc = Math.floor(minigames.trivia.questionCount);
  minigames.trivia = {
    ...minigames.trivia,
    questionCount: Number.isFinite(qc) ? Math.max(1, Math.min(MAX_TRIVIA_QUESTIONS, qc)) : base.minigames.trivia.questionCount,
  };
  minigames["memory-lane"] = {
    ...minigames["memory-lane"],
    photos: Array.isArray(minigames["memory-lane"].photos)
      ? minigames["memory-lane"].photos.slice(0, MAX_MEMORY_LANE_PHOTOS)
      : [],
  };
  return {
    minigames,
    enabledMinigames: enabled.length > 0 ? enabled : base.enabledMinigames,
    matchLength:
      typeof partial.matchLength === "number" && partial.matchLength > 0
        ? Math.min(MAX_MATCH_LENGTH, Math.floor(partial.matchLength))
        : base.matchLength,
    allowRepeats: typeof partial.allowRepeats === "boolean" ? partial.allowRepeats : base.allowRepeats,
  };
}
