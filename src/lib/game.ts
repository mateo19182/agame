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
  dataUrl: string;
  where: string;
  when: string;
};

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
      promptCount: number;
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
  matchLength: number;
  allowRepeats: boolean;
};

export type TriviaState = {
  id: "trivia";
  mode: "rapid" | "wager";
  questions: Question[];
  questionIndex: number;
  phase: TriviaPhase;
  buzz: BuzzState | null;
  wagers: Record<string, number>;
  lastEvent: { kind: "correct" | "wrong" | "timeout" | "steal"; playerId: string | null; delta: number } | null;
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
  startedAt: number;
  duration: number;
  items: { id: string; label: string; bin: "left" | "right" }[];
  progress: { p1: number; p2: number };
  winnerId: string | null;
  status: "waiting" | "live" | "done";
};

export type TypeRaceState = {
  id: "type-race";
  startedAt: number;
  duration: number;
  prompt: string;
  typed: { p1: string; p2: string };
  finishedAt: { p1: number | null; p2: number | null };
  winnerId: string | null;
  status: "waiting" | "live" | "done";
};

export type MinigameState = TriviaState | MemoryLaneState | ReflexState | SpeedSortState | TypeRaceState;

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
  playedCount: number;
  settings: GameSettings;
};

export type MinigameInput =
  | { kind: "trivia-answer"; correct: boolean }
  | { kind: "trivia-wager"; amount: number }
  | { kind: "memory-lane-guess"; where: string; when: string }
  | { kind: "memory-lane-score"; where: boolean; when: boolean }
  | { kind: "memory-lane-next" }
  | { kind: "reflex-tap" }
  | { kind: "speed-sort-place"; itemId: string; correct: boolean }
  | { kind: "type-race-typed"; text: string };

export type ClientMessage =
  | { type: "host-join"; name: string }
  | { type: "player-join"; name: string }
  | { type: "rejoin"; playerId: string }
  | { type: "start-game"; settings: GameSettings }
  | { type: "next-question" }
  | { type: "buzz" }
  | { type: "minigame-start" }
  | { type: "minigame-skip" }
  | { type: "minigame-input"; payload: MinigameInput }
  | { type: "play-again" };

export type ServerMessage =
  | { type: "state"; state: GameState; youId: string }
  | { type: "error"; message: string };

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
      promptCount: 1,
    },
  };
}

export function defaultSettings(): GameSettings {
  return {
    minigames: defaultMinigameConfigMap(),
    matchLength: 4,
    allowRepeats: false,
  };
}
