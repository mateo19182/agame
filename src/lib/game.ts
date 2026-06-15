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

export type Round3State = {
  currentPhotoIndex: number;
  phase: "answering" | "reveal";
  timerEndsAt: number | null;
  guesses: Record<string, { where: string; when: string }>;
  selfScored: Record<string, { where: boolean | null; when: boolean | null }>;
};

export type Question = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  category: string;
  source: "opentdb" | "us";
};

export type MinigameType = "reflex" | "speed-sort" | "type-race";

export type MinigameState =
  | { type: "reflex"; startedAt: number; duration: number; taps: { p1: number; p2: number }; lightsOn: boolean; lightOnAt: number | null; winnerId: string | null; status: "waiting" | "live" | "done" }
  | { type: "speed-sort"; startedAt: number; duration: number; items: { id: string; label: string; bin: "left" | "right" }[]; progress: { p1: number; p2: number }; winnerId: string | null; status: "waiting" | "live" | "done" }
  | { type: "type-race"; startedAt: number; duration: number; prompt: string; typed: { p1: string; p2: string }; finishedAt: { p1: number | null; p2: number | null }; winnerId: string | null; status: "waiting" | "live" | "done" };

export type GameSettings = {
  pack: "general" | "us" | "mixed";
  difficulty: "easy" | "medium" | "hard";
  round1Questions: number;
  round2Questions: number;
  playTiebreaker: boolean;
  photos: PhotoEntry[];
};

export type BuzzState = {
  buzzedBy: string | null;
  buzzedAt: number | null;
  timerEndsAt: number;
  status: "buzzing" | "answering" | "reveal";
  answerCorrect: boolean | null;
};

export type GameState = {
  phase:
    | "lobby"
    | "round1-intro"
    | "round1-question"
    | "round1-reveal"
    | "round2-wager"
    | "round2-question"
    | "round2-reveal"
    | "round3-intro"
    | "round3-photo"
    | "round3-reveal"
    | "tiebreaker-intro"
    | "tiebreaker-play"
    | "tiebreaker-result"
    | "final";
  hostId: string;
  players: Player[];
  questions: Question[];
  currentQuestion: number;
  round: 1 | 2 | 3;
  buzz: BuzzState | null;
  wagers: Record<string, number>;
  minigame: MinigameState | null;
  round3: Round3State | null;
  photos: PhotoEntry[];
  settings: GameSettings;
  lastEvent: { kind: "correct" | "wrong" | "timeout" | "steal"; playerId: string | null; delta: number } | null;
};

export type ClientMessage =
  | { type: "host-join"; name: string }
  | { type: "player-join"; name: string }
  | { type: "rejoin"; playerId: string }
  | { type: "start-game"; settings?: GameSettings; photos?: PhotoEntry[] }
  | { type: "next-question" }
  | { type: "buzz" }
  | { type: "answer"; correct: boolean }
  | { type: "set-wager"; amount: number }
  | { type: "play-again" }
  | { type: "minigame-input"; payload: unknown }
  | { type: "minigame-start" }
  | { type: "round3-guess"; where: string; when: string }
  | { type: "round3-self-score"; where: boolean; when: boolean }
  | { type: "round3-next" };

export type ServerMessage =
  | { type: "state"; state: GameState; youId: string }
  | { type: "error"; message: string };
