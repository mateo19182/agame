import {
  ALL_MINIGAME_IDS,
  isQuizRaceId,
  isUsablePhoto,
  memoryLaneHasContent,
} from "@shared/game";
import type {
  BalloonState,
  BuzzState,
  ColorLieRound,
  ColorLieState,
  ConfessionState,
  DoubtGem,
  DoubtState,
  ECardKind,
  ECardOutcome,
  ECardState,
  GameState,
  MemoryLaneState,
  MinigameConfigMap,
  MinigameId,
  MinigameState,
  MirrorMatchState,
  NumberRushState,
  Player,
  QuizRaceId,
  QuizRaceState,
  ReflexState,
  RpsState,
  Slots,
  SpeedSortState,
  TypeRaceState,
  WhackState,
} from "@shared/game";
import { generateQuizRounds } from "./quizContent";

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
export const QUIZ_RACE_MS = 30_000;
export const WHACK_MS = 30_000;
export const NUMBER_RUSH_MS = 60_000;
export const BALLOON_MS = 30_000;
export const RPS_CHOOSE_MS = 8_000;
export const RPS_REVEAL_MS = 2_500;
export const RPS_BEST_OF = 5;
export const ECARD_PLAY_MS = 15_000;
export const ECARD_REVEAL_MS = 3_800;
export const ECARD_GAMES = 2;
export const TOWER_CONFESS_MS = 12_000;
export const TOWER_READ_MS = 12_000;
export const TOWER_REVEAL_MS = 4_500;
export const TOWER_ROUNDS = 6;
export const DOUBT_CLAIM_MS = 12_000;
export const DOUBT_CALL_MS = 12_000;
export const DOUBT_REVEAL_MS = 4_500;
export const DOUBT_ROUNDS = 6;
export const MIRROR_MS = 45_000;
export const COLOR_LIE_MS = 30_000;
export const NUMBER_RUSH_SIZE = 25;
export const WHACK_CELLS = 9;
export const BALLOON_MAX_SIZE = 12;
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
  "you are my home",
  "thank you for being you",
  "every day with you is better",
  "you make my heart so happy",
  "i would choose you again",
  "you are my best friend",
  "lets grow old together",
  "you are worth the wait",
  "my hand fits yours perfectly",
  "you are my favorite hello",
  "i love your silly laugh",
  "we make a great team",
  "you are my safe place",
  "forever sounds good with you",
];

const SPEED_SORT_FRUITS = [
  "Apple", "Banana", "Cherry", "Grape", "Lemon", "Mango", "Peach", "Pear",
  "Orange", "Plum", "Kiwi", "Melon", "Apricot", "Lime", "Fig", "Papaya",
];
const SPEED_SORT_VEGGIES = [
  "Carrot", "Onion", "Pepper", "Potato", "Tomato", "Cucumber", "Lettuce", "Spinach",
  "Broccoli", "Celery", "Radish", "Pumpkin", "Cabbage", "Garlic", "Zucchini", "Beet",
];

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

export function makeQuizRaceState(id: QuizRaceId, slots: Slots): QuizRaceState {
  return {
    id,
    slots,
    startedAt: 0,
    duration: 0,
    rounds: generateQuizRounds(id),
    progress: { p1: 0, p2: 0 },
    correct: { p1: 0, p2: 0 },
    lastCorrect: { p1: null, p2: null },
    winnerId: null,
    status: "waiting",
  };
}

export function makeWhackState(slots: Slots): WhackState {
  // A long mole path; no player will exhaust it within the timer.
  const sequence: number[] = [];
  let prev = -1;
  for (let i = 0; i < 120; i++) {
    let cell = Math.floor(Math.random() * WHACK_CELLS);
    if (cell === prev) cell = (cell + 1) % WHACK_CELLS; // never repeat the same cell
    sequence.push(cell);
    prev = cell;
  }
  return {
    id: "whack",
    slots,
    startedAt: 0,
    duration: 0,
    sequence,
    progress: { p1: 0, p2: 0 },
    winnerId: null,
    status: "waiting",
  };
}

export function makeNumberRushState(slots: Slots): NumberRushState {
  const layout = shuffle(Array.from({ length: NUMBER_RUSH_SIZE }, (_, i) => i + 1));
  return {
    id: "number-rush",
    slots,
    startedAt: 0,
    duration: 0,
    layout,
    size: NUMBER_RUSH_SIZE,
    progress: { p1: 0, p2: 0 },
    winnerId: null,
    status: "waiting",
  };
}

export function makeRpsState(slots: Slots): RpsState {
  return {
    id: "rps",
    slots,
    bestOf: RPS_BEST_OF,
    round: 0,
    wins: { p1: 0, p2: 0 },
    choices: { p1: null, p2: null },
    reveal: null,
    phase: "choosing",
    winnerId: null,
    status: "live",
  };
}

export function makeBalloonState(slots: Slots): BalloonState {
  return {
    id: "balloon",
    slots,
    startedAt: 0,
    duration: 0,
    size: { p1: 0, p2: 0 },
    banked: { p1: 0, p2: 0 },
    pops: { p1: 0, p2: 0 },
    justPopped: { p1: false, p2: false },
    lastPopSize: { p1: 0, p2: 0 },
    winnerId: null,
    status: "waiting",
  };
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── E-Card (Kaiji) ────────────────────────────────────────────────────────
function eCardHand(role: "emperor" | "slave"): ECardKind[] {
  const special: ECardKind = role === "emperor" ? "emperor" : "slave";
  return [special, "citizen", "citizen", "citizen", "citizen"];
}

export function makeECardState(slots: Slots): ECardState {
  return {
    id: "e-card",
    slots,
    game: 0,
    totalGames: ECARD_GAMES,
    emperorSlot: "p1",
    hands: { p1: eCardHand("emperor"), p2: eCardHand("slave") },
    turn: 0,
    played: { p1: null, p2: null },
    locked: { p1: false, p2: false },
    reveal: null,
    phase: "playing",
    points: { p1: 0, p2: 0 },
    winnerId: null,
    status: "live",
  };
}

/** Deal a fresh E-Card sub-game with the given Emperor side. */
export function dealECardGame(emperorSlot: "p1" | "p2"): Pick<ECardState, "emperorSlot" | "hands"> {
  const slaveSlot = emperorSlot === "p1" ? "p2" : "p1";
  return {
    emperorSlot,
    hands: { [emperorSlot]: eCardHand("emperor"), [slaveSlot]: eCardHand("slave") } as ECardState["hands"],
  };
}

/** Resolve one E-Card turn from the Emperor-side and Slave-side cards. */
export function resolveECardTurn(emperorCard: ECardKind, slaveCard: ECardKind): ECardOutcome {
  if (emperorCard === "citizen" && slaveCard === "citizen") return "draw";
  if (emperorCard === "emperor" && slaveCard === "slave") return "slave-win";
  // emperor-vs-citizen, or citizen-vs-slave → the Emperor side takes it.
  return "emperor-win";
}

// ─── Tower of Confession ─────────────────────────────────────────────────
export function makeConfessionState(slots: Slots): ConfessionState {
  return {
    id: "tower",
    slots,
    round: 0,
    totalRounds: TOWER_ROUNDS,
    confessorSlot: "p1",
    secret: null,
    guess: null,
    phase: "confess",
    lastResult: null,
    points: { p1: 0, p2: 0 },
    winnerId: null,
    status: "live",
  };
}

/** Who confesses on a given round (alternating, p1 starts). */
export function towerConfessorSlot(round: number): "p1" | "p2" {
  return round % 2 === 0 ? "p1" : "p2";
}

// ─── Doubt ────────────────────────────────────────────────────────────────
export const DOUBT_GEMS: DoubtGem[] = ["ruby", "sapphire", "emerald", "topaz"];

export function randomGem(): DoubtGem {
  return pick(DOUBT_GEMS);
}

export function makeDoubtState(slots: Slots): DoubtState {
  return {
    id: "doubt",
    slots,
    round: 0,
    totalRounds: DOUBT_ROUNDS,
    tellerSlot: "p1",
    secret: randomGem(),
    claim: null,
    doubted: null,
    phase: "claim",
    lastResult: null,
    scores: { p1: 0, p2: 0 },
    winnerId: null,
    status: "live",
  };
}

export function doubtTellerSlot(round: number): "p1" | "p2" {
  return round % 2 === 0 ? "p1" : "p2";
}

// ─── Mirror Match ───────────────────────────────────────────────────────────
export function makeMirrorMatchState(slots: Slots): MirrorMatchState {
  const sequence: number[] = [];
  let prev = -1;
  for (let i = 0; i < 80; i++) {
    let pad = Math.floor(Math.random() * 4);
    if (pad === prev) pad = (pad + 1) % 4; // never two of the same pad in a row
    sequence.push(pad);
    prev = pad;
  }
  return {
    id: "mirror-match",
    slots,
    startedAt: 0,
    duration: 0,
    sequence,
    level: { p1: 2, p2: 2 },
    pos: { p1: 0, p2: 0 },
    strikes: { p1: 0, p2: 0 },
    cleared: { p1: 0, p2: 0 },
    winnerId: null,
    status: "waiting",
  };
}

// ─── Color Lie ────────────────────────────────────────────────────────────
const COLOR_LIE_PALETTE = [
  { name: "RED", hex: "#ef4444" },
  { name: "BLUE", hex: "#3b82f6" },
  { name: "GREEN", hex: "#22c55e" },
  { name: "YELLOW", hex: "#eab308" },
  { name: "PURPLE", hex: "#a855f7" },
  { name: "ORANGE", hex: "#f97316" },
] as const;

function colorLieRound(): ColorLieRound {
  const word = pick(COLOR_LIE_PALETTE);
  let ink = pick(COLOR_LIE_PALETTE);
  if (ink.name === word.name) {
    ink = pick(COLOR_LIE_PALETTE.filter((c) => c.name !== word.name));
  }
  const wordColor = COLOR_LIE_PALETTE.find((c) => c.name === word.name)!;
  const pool = COLOR_LIE_PALETTE.filter((c) => c.name !== ink.name && c.name !== word.name);
  const distractors = shuffle(pool).slice(0, 2);
  // Always include the word's own color as a tempting trap, plus two others.
  const options = shuffle([ink, wordColor, ...distractors]).map((c) => ({ name: c.name, hex: c.hex }));
  return {
    word: word.name,
    inkHex: ink.hex,
    options,
    correctIndex: options.findIndex((o) => o.name === ink.name),
  };
}

export function makeColorLieState(slots: Slots): ColorLieState {
  return {
    id: "color-lie",
    slots,
    startedAt: 0,
    duration: 0,
    rounds: Array.from({ length: 60 }, colorLieRound),
    index: 0,
    scores: { p1: 0, p2: 0 },
    lockedOut: { p1: false, p2: false },
    lastResult: null,
    winnerId: null,
    status: "waiting",
  };
}

/** Probability a balloon pops on the next pump, given its current size.
 *  Safe for the first few pumps, then climbs steeply. */
export function balloonPopChance(size: number): number {
  if (size < 3) return 0;
  return Math.min(0.9, (size - 2) / (BALLOON_MAX_SIZE - 2));
}

/** Resolve a single rock-paper-scissors round to its slot winner (or null tie). */
export function rpsRoundWinner(p1: RpsState["choices"]["p1"], p2: RpsState["choices"]["p2"]): "p1" | "p2" | null {
  if (!p1 || !p2 || p1 === p2) return null;
  const beats: Record<string, string> = { rock: "scissors", paper: "rock", scissors: "paper" };
  return beats[p1] === p2 ? "p1" : "p2";
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
  if (mg.id === "whack" || mg.id === "number-rush") {
    if (mg.progress.p1 > mg.progress.p2) return mg.slots.p1;
    if (mg.progress.p2 > mg.progress.p1) return mg.slots.p2;
    return null;
  }
  if (mg.id === "balloon") {
    if (mg.banked.p1 > mg.banked.p2) return mg.slots.p1;
    if (mg.banked.p2 > mg.banked.p1) return mg.slots.p2;
    return null;
  }
  if (mg.id === "rps") {
    if (mg.wins.p1 > mg.wins.p2) return mg.slots.p1;
    if (mg.wins.p2 > mg.wins.p1) return mg.slots.p2;
    return null;
  }
  if (mg.id === "e-card" || mg.id === "tower") {
    const pts = mg.points;
    if (pts.p1 > pts.p2) return mg.slots.p1;
    if (pts.p2 > pts.p1) return mg.slots.p2;
    return null;
  }
  if (mg.id === "doubt" || mg.id === "color-lie") {
    const s = mg.scores;
    if (s.p1 > s.p2) return mg.slots.p1;
    if (s.p2 > s.p1) return mg.slots.p2;
    return null;
  }
  if (mg.id === "mirror-match") {
    if (mg.cleared.p1 !== mg.cleared.p2) return mg.cleared.p1 > mg.cleared.p2 ? mg.slots.p1 : mg.slots.p2;
    if (mg.strikes.p1 !== mg.strikes.p2) return mg.strikes.p1 < mg.strikes.p2 ? mg.slots.p1 : mg.slots.p2;
    return null;
  }
  // Quiz-race family: most correct answers wins.
  if (isQuizRaceId(mg.id)) {
    const q = mg as QuizRaceState;
    if (q.correct.p1 > q.correct.p2) return q.slots.p1;
    if (q.correct.p2 > q.correct.p1) return q.slots.p2;
    return null;
  }
  return null;
}
