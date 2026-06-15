import type {
  BuzzState,
  ClientMessage,
  GameSettings,
  GameState,
  MemoryLaneState,
  MinigameConfigMap,
  MinigameId,
  MinigameInput,
  MinigameResult,
  MinigameState,
  PhotoEntry,
  Player,
  Question,
  ReflexState,
  SpeedSortState,
  TriviaState,
  TypeRaceState,
} from "../src/lib/game";
import { defaultSettings } from "../src/lib/game";
import { getUsQuestions } from "../src/lib/usQuestions";

const TRIVIA_BUZZ_RAPID_MS = 15_000;
const TRIVIA_BUZZ_WAGER_MS = 20_000;
const TRIVIA_ANSWER_MS = 6_000;
const TRIVIA_WAGER_MS = 20_000;
const TRIVIA_REVEAL_MS = 2_200;
const MEMORY_LANE_ANSWER_MS = 30_000;
const MEMORY_LANE_REVEAL_MS = 15_000;
const SPEED_SORT_MS = 30_000;
const TYPE_RACE_MS = 30_000;
const STEAL_WINDOW_MS = 4_000;
const POST_MINIGAME_MS = 3_000;
const TRIVIA_CACHE_TTL = 60 * 60 * 24;
const IDLE_CLEANUP_MS = 30 * 60 * 1000;

const PLAYER_COLORS = ["#f97316", "#06b6d4", "#a855f7", "#22c55e", "#ec4899", "#eab308"];

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

const ALL_MINIGAME_IDS: MinigameId[] = ["trivia", "memory-lane", "reflex", "speed-sort", "type-race"];

function nowMs(): number {
  return Date.now();
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&eacute;/g, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

type ConnMeta = { playerId: string | null; isHost: boolean };

type AlarmSpec =
  | { kind: "trivia-buzz-tick" }
  | { kind: "trivia-wager" }
  | { kind: "trivia-answer"; playerId: string }
  | { kind: "trivia-reveal-next" }
  | { kind: "memory-lane-answer" }
  | { kind: "memory-lane-reveal" }
  | { kind: "reflex-light" }
  | { kind: "reflex-end" }
  | { kind: "minigame-end-timer" }
  | { kind: "minigame-end-transition" }
  | { kind: "idle-cleanup" };

type RoomData = {
  state: GameState;
  playersById: Record<string, Player>;
  questionsRef: { trivia: Question[] };
  minigameScoresAtStart: Record<string, number>;
  playerIdCounter: number;
  dirty: boolean;
};

function makeLobbyState(settings: GameSettings): GameState {
  return {
    phase: "lobby",
    hostId: "",
    players: [],
    currentMinigame: null,
    minigame: null,
    minigameResult: null,
    playedMinigames: [],
    playedCount: 0,
    settings,
  };
}

function defaultRoomData(): RoomData {
  return {
    state: makeLobbyState(defaultSettings()),
    playersById: {},
    questionsRef: { trivia: [] },
    minigameScoresAtStart: {},
    playerIdCounter: 0,
    dirty: false,
  };
}

async function fetchOpenTdb(count: number, difficulty: string): Promise<Question[]> {
  const url = `https://opentdb.com/api.php?amount=${count}&difficulty=${difficulty}&type=multiple&encode=url3986`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenTDB ${res.status}`);
  const data = (await res.json()) as {
    response_code: number;
    results: Array<{
      category: string;
      question: string;
      correct_answer: string;
      incorrect_answers: string[];
    }>;
  };
  if (data.response_code !== 0) throw new Error(`OpenTDB code ${data.response_code}`);
  return data.results.map((r, i) => {
    const correct = decodeHtml(decodeURIComponent(r.correct_answer));
    const incorrects = r.incorrect_answers.map((a) => decodeHtml(decodeURIComponent(a)));
    const options = shuffle([correct, ...incorrects]);
    return {
      id: `otdb-${i}-${Math.random().toString(36).slice(2, 6)}`,
      prompt: decodeHtml(decodeURIComponent(r.question)),
      options,
      correctIndex: options.indexOf(correct),
      category: decodeHtml(decodeURIComponent(r.category)),
      source: "opentdb" as const,
    };
  });
}

async function fetchOpenTdbCached(count: number, difficulty: string): Promise<Question[]> {
  const cache = caches.default;
  const cacheKey = `https://trivia-cache.internal/?d=${difficulty}&n=${count}`;
  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      return (await cached.json()) as Question[];
    } catch {
      // fall through to refresh
    }
  }
  const questions = await fetchOpenTdb(count, difficulty);
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(questions), {
      headers: { "cache-control": `max-age=${TRIVIA_CACHE_TTL}` },
    })
  );
  return questions;
}

async function fetchTriviaQuestions(cfg: MinigameConfigMap["trivia"]): Promise<Question[]> {
  const count = cfg.questionCount;
  if (cfg.pack === "us") {
    return shuffle(getUsQuestions()).slice(0, count);
  }
  if (cfg.pack === "mixed") {
    const half = Math.ceil(count / 2);
    const us = shuffle(getUsQuestions()).slice(0, half);
    const rest = count - half;
    const otdb = await fetchOpenTdbCached(rest, cfg.difficulty);
    return shuffle([...us, ...otdb]);
  }
  return fetchOpenTdbCached(count, cfg.difficulty);
}

function newBuzz(durationMs: number): BuzzState {
  return {
    buzzedBy: null,
    buzzedAt: null,
    timerEndsAt: nowMs() + durationMs,
    status: "buzzing",
    answerCorrect: null,
  };
}

function makeMemoryLaneState(cfg: MinigameConfigMap["memory-lane"]): MemoryLaneState {
  const photos = cfg.photos.filter((p) => p && p.dataUrl && (p.where || p.when));
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

function makeReflexState(): ReflexState {
  return {
    id: "reflex",
    startedAt: 0,
    duration: 0,
    taps: { p1: 0, p2: 0 },
    lightsOn: false,
    lightOnAt: null,
    winnerId: null,
    status: "waiting",
  };
}

function makeSpeedSortState(cfg: MinigameConfigMap["speed-sort"]): SpeedSortState {
  const n = Math.max(2, Math.min(8, Math.floor(cfg.itemCount)));
  const halfF = Math.ceil(n / 2);
  const halfV = n - halfF;
  const fruits = shuffle(SPEED_SORT_FRUITS).slice(0, halfF).map((label, i) => ({ id: `fr-${i}`, label, bin: "left" as const }));
  const veggies = shuffle(SPEED_SORT_VEGGIES).slice(0, halfV).map((label, i) => ({ id: `ve-${i}`, label, bin: "right" as const }));
  const items = shuffle([...fruits, ...veggies]);
  return {
    id: "speed-sort",
    startedAt: 0,
    duration: 0,
    items,
    progress: { p1: 0, p2: 0 },
    winnerId: null,
    status: "waiting",
  };
}

function makeTypeRaceState(_cfg: MinigameConfigMap["type-race"]): TypeRaceState {
  const prompt = TYPE_RACE_PROMPTS[Math.floor(Math.random() * TYPE_RACE_PROMPTS.length)];
  return {
    id: "type-race",
    startedAt: 0,
    duration: 0,
    prompt,
    typed: { p1: "", p2: "" },
    finishedAt: { p1: null, p2: null },
    winnerId: null,
    status: "waiting",
  };
}

function memoryLanePlayable(photos: PhotoEntry[]): boolean {
  return photos.filter((p) => p && p.dataUrl && (p.where || p.when)).length > 0;
}

function pickNextMinigame(state: GameState): MinigameId | null {
  if (state.playedMinigames.length >= state.settings.matchLength) return null;
  const playable = ALL_MINIGAME_IDS.filter((id) => {
    if (id === "memory-lane") {
      return memoryLanePlayable(state.settings.minigames["memory-lane"].photos);
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

function computeResultDeltas(state: GameState, scoresAtStart: Record<string, number>): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const p of state.players) {
    const before = scoresAtStart[p.id] ?? p.score;
    deltas[p.id] = p.score - before;
  }
  return deltas;
}

function determineWinner(mg: MinigameState, players: Player[]): string | null {
  if (players.length < 2) return null;
  const [p1, p2] = players;
  if (mg.id === "reflex") {
    if (mg.taps.p1 > mg.taps.p2) return p1.id;
    if (mg.taps.p2 > mg.taps.p1) return p2.id;
    return null;
  }
  if (mg.id === "speed-sort") {
    if (mg.progress.p1 > mg.progress.p2) return p1.id;
    if (mg.progress.p2 > mg.progress.p1) return p2.id;
    return null;
  }
  if (mg.id === "type-race") {
    const p1Done = mg.finishedAt.p1 !== null;
    const p2Done = mg.finishedAt.p2 !== null;
    if (p1Done && p2Done) return mg.finishedAt.p1! < mg.finishedAt.p2! ? p1.id : p2.id;
    if (p1Done) return p1.id;
    if (p2Done) return p2.id;
    return null;
  }
  return null;
}

export class GameRoom implements DurableObject {
  readonly state: DurableObjectState;
  data: RoomData;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    this.data = defaultRoomData();

    state.blockConcurrencyWhile(async () => {
      const stored = await state.storage.get<RoomData>("game");
      if (stored) {
        this.data = {
          ...defaultRoomData(),
          ...stored,
          state: {
            ...defaultRoomData().state,
            ...stored.state,
            settings: mergeSettings(stored.state.settings),
          },
          dirty: false,
        };
      }
    });
  }

  private async saveGame() {
    await this.state.storage.put("game", this.data);
  }

  private commit(partial: Partial<GameState>, opts?: { skipSave?: boolean }) {
    this.data.state = { ...this.data.state, ...partial };
    if (opts?.skipSave) {
      this.data.dirty = true;
    } else {
      this.data.dirty = false;
      this.state.waitUntil(this.saveGame());
    }
  }

  private async scheduleAlarm(spec: AlarmSpec, msFromNow: number) {
    await this.state.storage.put("alarm", spec);
    await this.state.storage.setAlarm(nowMs() + msFromNow);
  }

  private async clearAlarm() {
    await this.state.storage.delete("alarm");
    await this.state.storage.deleteAlarm();
  }

  private async maybeScheduleIdleCleanup() {
    const existing = await this.state.storage.get<AlarmSpec>("alarm");
    if (existing && existing.kind !== "idle-cleanup") return;
    if (existing?.kind === "idle-cleanup") return;
    await this.state.storage.setAlarm(nowMs() + IDLE_CLEANUP_MS);
    await this.state.storage.put("alarm", { kind: "idle-cleanup" });
  }

  private async cancelIdleCleanup() {
    const existing = await this.state.storage.get<AlarmSpec>("alarm");
    if (existing?.kind === "idle-cleanup") {
      await this.state.storage.delete("alarm");
      await this.state.storage.deleteAlarm();
    }
  }

  async alarm(_alarmInfo?: AlarmInvocationInfo) {
    const spec = await this.state.storage.get<AlarmSpec>("alarm");
    await this.state.storage.delete("alarm");
    await this.state.storage.deleteAlarm();
    if (!spec) return;
    if (this.data.dirty) {
      this.data.dirty = false;
      await this.saveGame();
    }
    const stored = await this.state.storage.get<RoomData>("game");
    if (stored) this.data = stored;

    switch (spec.kind) {
      case "trivia-buzz-tick":
        this.onTriviaBuzzTick();
        break;
      case "trivia-wager":
        this.onTriviaWagerTick();
        break;
      case "trivia-answer":
        this.onTriviaAnswerTick(spec.playerId);
        break;
      case "trivia-reveal-next":
        this.onTriviaRevealNext();
        break;
      case "memory-lane-answer":
        this.beginMemoryLaneReveal();
        break;
      case "memory-lane-reveal":
        this.endMemoryLanePhoto();
        break;
      case "reflex-light":
        this.onReflexLight();
        break;
      case "reflex-end":
        this.endMinigame();
        break;
      case "minigame-end-timer":
        this.endMinigame();
        break;
      case "minigame-end-transition":
        this.afterMinigameEnd();
        break;
      case "idle-cleanup":
        if (this.connectedPlayers().length === 0) {
          await this.state.storage.deleteAll();
        }
        break;
    }
  }

  private publicState(): GameState {
    return { ...this.data.state };
  }

  private sendTo(ws: WebSocket, payload: unknown) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {}
  }

  private sendError(ws: WebSocket, message: string) {
    this.sendTo(ws, { type: "error", message });
  }

  private broadcastError(message: string) {
    for (const ws of this.state.getWebSockets()) this.sendError(ws, message);
  }

  private broadcast() {
    const payload = this.publicState();
    for (const ws of this.state.getWebSockets()) {
      const meta = ws.deserializeAttachment() as ConnMeta | null;
      this.sendTo(ws, { type: "state", state: payload, youId: meta?.playerId ?? "" });
    }
  }

  private connectedPlayers(): Player[] {
    return Object.values(this.data.playersById).filter((p) => p.connected);
  }

  private refreshPlayersList() {
    this.data.state.players = this.connectedPlayers();
  }

  private snapshotScores() {
    const snap: Record<string, number> = {};
    for (const p of this.data.playersById) snap[p.id] = p.score;
    this.data.minigameScoresAtStart = snap;
  }

  // ─── Minigame lifecycle ────────────────────────────────────────────────

  private async startGame(settings: GameSettings) {
    if (this.data.state.phase !== "lobby") return;
    if (this.connectedPlayers().length < 2) {
      this.broadcastError("Need 2 players to start");
      return;
    }
    if (await this.state.storage.get<boolean>("starting")) return;
    await this.state.storage.put("starting", true);
    void this.clearAlarm();
    this.data.state.settings = mergeSettings(settings);
    await this.beginNextMinigame();
    await this.state.storage.delete("starting");
  }

  private async beginNextMinigame() {
    const next = pickNextMinigame(this.data.state);
    if (!next) {
      this.endMatch();
      return;
    }
    this.data.state.currentMinigame = next;
    this.data.state.minigame = null;
    this.data.state.minigameResult = null;
    this.snapshotScores();
    this.commit({ phase: "minigame-intro" });
    this.broadcast();
  }

  private async startActiveMinigame() {
    const id = this.data.state.currentMinigame;
    if (!id) return;
    let state: MinigameState;
    switch (id) {
      case "trivia": {
        const cfg = this.data.state.settings.minigames.trivia;
        let questions = this.data.questionsRef.trivia;
        if (questions.length === 0) {
          try {
            questions = await fetchTriviaQuestions(cfg);
            this.data.questionsRef.trivia = questions;
          } catch (err) {
            this.broadcastError(`Trivia fetch failed: ${(err as Error).message}`);
            // Skip trivia, move to next
            this.data.state.currentMinigame = null;
            this.commit({ minigame: null, minigameResult: null });
            void this.scheduleAlarm({ kind: "minigame-end-transition" }, 100);
            return;
          }
        }
        const mode = cfg.useWagers ? "wager" : "rapid";
        state = {
          id: "trivia",
          mode,
          questions,
          questionIndex: 0,
          phase: mode === "wager" ? "wager" : "buzzing",
          buzz: mode === "wager" ? null : newBuzz(TRIVIA_BUZZ_RAPID_MS),
          wagers: {},
          lastEvent: null,
        };
        break;
      }
      case "memory-lane": {
        state = makeMemoryLaneState(this.data.state.settings.minigames["memory-lane"]);
        break;
      }
      case "reflex": {
        state = makeReflexState();
        break;
      }
      case "speed-sort": {
        state = makeSpeedSortState(this.data.state.settings.minigames["speed-sort"]);
        break;
      }
      case "type-race": {
        state = makeTypeRaceState(this.data.state.settings.minigames["type-race"]);
        break;
      }
    }
    this.data.state.minigame = state;
    this.commit({ phase: "minigame-active", minigame: state });
    this.broadcast();
    this.scheduleFirstMinigameAlarm(state);
  }

  private scheduleFirstMinigameAlarm(mg: MinigameState) {
    switch (mg.id) {
      case "trivia": {
        if (mg.phase === "wager") {
          void this.scheduleAlarm({ kind: "trivia-wager" }, TRIVIA_WAGER_MS);
        } else {
          void this.scheduleAlarm({ kind: "trivia-buzz-tick" }, TRIVIA_BUZZ_RAPID_MS);
        }
        return;
      }
      case "memory-lane": {
        void this.scheduleAlarm({ kind: "memory-lane-answer" }, MEMORY_LANE_ANSWER_MS);
        return;
      }
      case "reflex": {
        const cfg = this.data.state.settings.minigames.reflex;
        this.commit({
          minigame: {
            ...mg,
            startedAt: nowMs(),
            duration: cfg.durationMs,
            taps: { p1: 0, p2: 0 },
            lightsOn: false,
            lightOnAt: null,
            winnerId: null,
            status: "live",
          },
        });
        this.broadcast();
        const delay = cfg.lightDelayMinMs + Math.random() * (cfg.lightDelayMaxMs - cfg.lightDelayMinMs);
        void this.scheduleAlarm({ kind: "reflex-light" }, delay);
        return;
      }
      case "speed-sort": {
        this.commit({
          minigame: {
            ...mg,
            startedAt: nowMs(),
            duration: SPEED_SORT_MS,
            progress: { p1: 0, p2: 0 },
            winnerId: null,
            status: "live",
          },
        });
        this.broadcast();
        void this.scheduleAlarm({ kind: "minigame-end-timer" }, SPEED_SORT_MS);
        return;
      }
      case "type-race": {
        this.commit({
          minigame: {
            ...mg,
            startedAt: nowMs(),
            duration: TYPE_RACE_MS,
            typed: { p1: "", p2: "" },
            finishedAt: { p1: null, p2: null },
            winnerId: null,
            status: "live",
          },
        });
        this.broadcast();
        void this.scheduleAlarm({ kind: "minigame-end-timer" }, TYPE_RACE_MS);
        return;
      }
    }
  }

  private onReflexLight() {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "reflex" || mg.status !== "live") return;
    this.commit({ minigame: { ...mg, lightsOn: true, lightOnAt: nowMs() } });
    this.broadcast();
    const cfg = this.data.state.settings.minigames.reflex;
    void this.scheduleAlarm({ kind: "reflex-end" }, cfg.durationMs);
  }

  private endMinigame() {
    const mg = this.data.state.minigame;
    if (!mg) return;
    void this.clearAlarm();
    const players = this.connectedPlayers();
    const winnerId = determineWinner(mg, players);
    if (winnerId) {
      const stored = this.data.playersById[winnerId];
      if (stored) stored.score += 1;
      this.refreshPlayersList();
    }
    const id = this.data.state.currentMinigame;
    if (id && !this.data.state.playedMinigames.includes(id)) {
      this.data.state.playedMinigames = [...this.data.state.playedMinigames, id];
    }
    const result: MinigameResult = {
      id: id!,
      winnerId,
      scoreDeltas: computeResultDeltas(this.data.state, this.data.minigameScoresAtStart),
    };
    this.commit({
      phase: "minigame-end",
      minigameResult: result,
      playedCount: this.data.state.playedMinigames.length,
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "minigame-end-transition" }, POST_MINIGAME_MS);
  }

  private afterMinigameEnd() {
    void this.clearAlarm();
    void this.beginNextMinigame();
  }

  private endMatch() {
    void this.clearAlarm();
    this.commit({
      phase: "final",
      currentMinigame: null,
      minigame: null,
      minigameResult: null,
    });
    this.broadcast();
    if (this.connectedPlayers().length === 0) {
      void this.maybeScheduleIdleCleanup();
    }
  }

  // ─── Trivia flow ───────────────────────────────────────────────────────

  private onTriviaBuzzTick() {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "trivia" || mg.phase !== "buzzing" || !mg.buzz) return;
    this.commit({
      minigame: {
        ...mg,
        phase: "reveal",
        buzz: { ...mg.buzz, status: "reveal", answerCorrect: false },
        lastEvent: { kind: "timeout", playerId: null, delta: 0 },
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "trivia-reveal-next" }, TRIVIA_REVEAL_MS);
  }

  private onTriviaWagerTick() {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "trivia" || mg.phase !== "wager") return;
    const wagers = { ...mg.wagers };
    for (const p of this.data.state.players) {
      if (wagers[p.id] === undefined) wagers[p.id] = 0;
    }
    this.commit({ minigame: { ...mg, wagers } });
    this.beginTriviaBuzzing();
  }

  private beginTriviaBuzzing() {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "trivia") return;
    const dur = mg.mode === "wager" ? TRIVIA_BUZZ_WAGER_MS : TRIVIA_BUZZ_RAPID_MS;
    this.commit({
      minigame: {
        ...mg,
        phase: "buzzing",
        buzz: newBuzz(dur),
        lastEvent: null,
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "trivia-buzz-tick" }, dur);
  }

  private onBuzz(playerId: string) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "trivia" || mg.phase !== "buzzing" || !mg.buzz) return;
    if (mg.buzz.buzzedBy) return;
    const newBuzz: BuzzState = {
      ...mg.buzz,
      buzzedBy: playerId,
      buzzedAt: nowMs(),
      status: "answering",
      timerEndsAt: nowMs() + TRIVIA_ANSWER_MS,
    };
    this.commit({
      minigame: { ...mg, phase: "answering", buzz: newBuzz },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "trivia-answer", playerId }, TRIVIA_ANSWER_MS);
  }

  private onTriviaAnswerTick(playerId: string) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "trivia" || mg.phase !== "answering") return;
    if (!mg.buzz || mg.buzz.buzzedBy !== playerId) return;
    this.resolveTriviaAnswer(playerId, false);
  }

  private resolveTriviaAnswer(playerId: string, correct: boolean) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "trivia" || !mg.buzz) return;
    const players = this.data.state.players;
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    if (correct) {
      const wager = mg.wagers[playerId] ?? 0;
      const delta = mg.mode === "wager" ? wager : 1;
      const stored = this.data.playersById[playerId];
      if (stored) stored.score += delta;
      this.refreshPlayersList();
      this.commit({
        minigame: {
          ...mg,
          phase: "reveal",
          buzz: { ...mg.buzz, status: "reveal", answerCorrect: true },
          lastEvent: { kind: "correct", playerId, delta },
        },
      });
      this.broadcast();
      void this.scheduleAlarm({ kind: "trivia-reveal-next" }, TRIVIA_REVEAL_MS);
      return;
    }
    if (mg.mode === "rapid") {
      const other = players.find((p) => p.id !== playerId && p.connected);
      if (other) {
        this.commit({
          minigame: {
            ...mg,
            phase: "buzzing",
            buzz: {
              ...mg.buzz,
              status: "buzzing",
              buzzedBy: null,
              buzzedAt: null,
              timerEndsAt: nowMs() + STEAL_WINDOW_MS,
              answerCorrect: null,
            },
            lastEvent: { kind: "wrong", playerId, delta: 0 },
          },
        });
        this.broadcast();
        void this.scheduleAlarm({ kind: "trivia-buzz-tick" }, STEAL_WINDOW_MS);
        return;
      }
    } else {
      const wager = mg.wagers[playerId] ?? 0;
      const stored = this.data.playersById[playerId];
      if (stored) stored.score = Math.max(0, stored.score - wager);
      this.refreshPlayersList();
      this.commit({
        minigame: {
          ...mg,
          phase: "reveal",
          buzz: { ...mg.buzz, status: "reveal", answerCorrect: false },
          lastEvent: { kind: "wrong", playerId, delta: -wager },
        },
      });
      this.broadcast();
      void this.scheduleAlarm({ kind: "trivia-reveal-next" }, TRIVIA_REVEAL_MS);
      return;
    }
    this.commit({
      minigame: {
        ...mg,
        phase: "reveal",
        buzz: { ...mg.buzz, status: "reveal", answerCorrect: false },
        lastEvent: { kind: "wrong", playerId, delta: 0 },
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "trivia-reveal-next" }, TRIVIA_REVEAL_MS);
  }

  private onTriviaRevealNext() {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "trivia" || mg.phase !== "reveal") return;
    const next = mg.questionIndex + 1;
    if (next >= mg.questions.length) {
      this.endMinigame();
      return;
    }
    const isWager = mg.mode === "wager";
    this.commit({
      minigame: {
        ...mg,
        questionIndex: next,
        phase: isWager ? "wager" : "buzzing",
        buzz: isWager ? null : newBuzz(TRIVIA_BUZZ_RAPID_MS),
        wagers: {},
        lastEvent: null,
      },
    });
    this.broadcast();
    if (isWager) {
      void this.scheduleAlarm({ kind: "trivia-wager" }, TRIVIA_WAGER_MS);
    } else {
      void this.scheduleAlarm({ kind: "trivia-buzz-tick" }, TRIVIA_BUZZ_RAPID_MS);
    }
  }

  private onSetWager(playerId: string, amount: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "trivia" || mg.phase !== "wager") return;
    const player = this.data.state.players.find((p) => p.id === playerId);
    if (!player) return;
    const max = Math.max(1, player.score);
    const safe = Math.max(0, Math.min(max, Math.floor(amount)));
    this.commit(
      {
        minigame: { ...mg, wagers: { ...mg.wagers, [playerId]: safe } },
      },
      { skipSave: true }
    );
    this.broadcast();
    const players = this.connectedPlayers();
    if (players.every((p) => mg.wagers[p.id] !== undefined)) {
      void this.clearAlarm();
      this.beginTriviaBuzzing();
    }
  }

  // ─── Memory lane flow ──────────────────────────────────────────────────

  private beginMemoryLaneReveal() {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "memory-lane" || mg.phase !== "answering") return;
    this.commit({
      minigame: {
        ...mg,
        phase: "reveal",
        timerEndsAt: nowMs() + MEMORY_LANE_REVEAL_MS,
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "memory-lane-reveal" }, MEMORY_LANE_REVEAL_MS);
  }

  private endMemoryLanePhoto() {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "memory-lane") return;
    for (const p of this.data.state.players) {
      const sc = mg.selfScored[p.id];
      const stored = this.data.playersById[p.id];
      if (!stored) continue;
      if (sc?.where) stored.score += 1;
      if (sc?.when) stored.score += 1;
    }
    this.refreshPlayersList();
    const next = mg.photoIndex + 1;
    if (next >= mg.photos.length) {
      this.endMinigame();
      return;
    }
    this.commit({
      minigame: {
        ...mg,
        photoIndex: next,
        phase: "answering",
        timerEndsAt: nowMs() + MEMORY_LANE_ANSWER_MS,
        guesses: {},
        selfScored: {},
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "memory-lane-answer" }, MEMORY_LANE_ANSWER_MS);
  }

  private onMemoryLaneGuess(playerId: string, where: string, when: string) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "memory-lane" || mg.phase !== "answering") return;
    this.commit(
      {
        minigame: { ...mg, guesses: { ...mg.guesses, [playerId]: { where, when } } },
      },
      { skipSave: true }
    );
    this.broadcast();
    const players = this.connectedPlayers();
    if (players.every((p) => mg.guesses[p.id])) {
      void this.clearAlarm();
      this.beginMemoryLaneReveal();
    }
  }

  private onMemoryLaneScore(playerId: string, where: boolean, when: boolean) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "memory-lane" || mg.phase !== "reveal") return;
    this.commit(
      {
        minigame: { ...mg, selfScored: { ...mg.selfScored, [playerId]: { where, when } } },
      },
      { skipSave: true }
    );
    this.broadcast();
    const players = this.connectedPlayers();
    if (players.every((p) => mg.selfScored[p.id])) {
      void this.clearAlarm();
      this.endMemoryLanePhoto();
    }
  }

  // ─── Generic minigame input (reflex / speed-sort / type-race / trivia / memory-lane) ──

  private onMinigameInput(playerId: string, input: MinigameInput) {
    const mg = this.data.state.minigame;
    if (!mg) return;
    const players = this.data.state.players;
    const idx = players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    const key: "p1" | "p2" = idx === 0 ? "p1" : "p2";

    switch (input.kind) {
      case "trivia-answer": {
        if (mg.id !== "trivia" || mg.phase !== "answering" || !mg.buzz || mg.buzz.buzzedBy !== playerId) return;
        this.resolveTriviaAnswer(playerId, input.correct);
        return;
      }
      case "trivia-wager": {
        this.onSetWager(playerId, input.amount);
        return;
      }
      case "memory-lane-guess": {
        this.onMemoryLaneGuess(playerId, input.where, input.when);
        return;
      }
      case "memory-lane-score": {
        this.onMemoryLaneScore(playerId, input.where, input.when);
        return;
      }
      case "memory-lane-next": {
        if (mg.id !== "memory-lane" || mg.phase !== "reveal") return;
        void this.clearAlarm();
        this.endMemoryLanePhoto();
        return;
      }
      case "reflex-tap": {
        if (mg.id !== "reflex" || !mg.lightsOn || mg.status !== "live") return;
        this.commit(
          {
            minigame: { ...mg, taps: { ...mg.taps, [key]: mg.taps[key] + 1 } },
          },
          { skipSave: true }
        );
        this.broadcast();
        return;
      }
      case "speed-sort-place": {
        if (mg.id !== "speed-sort" || mg.status !== "live") return;
        const item = mg.items.find((it) => it.id === input.itemId);
        if (!item) return;
        const newProgress = { ...mg.progress };
        if (input.correct) newProgress[key] = Math.min(mg.items.length, newProgress[key] + 1);
        this.commit(
          { minigame: { ...mg, progress: newProgress } },
          { skipSave: true }
        );
        this.broadcast();
        if (newProgress.p1 >= mg.items.length || newProgress.p2 >= mg.items.length) {
          this.endMinigame();
        }
        return;
      }
      case "type-race-typed": {
        if (mg.id !== "type-race" || mg.status !== "live") return;
        const typed = { ...mg.typed, [key]: input.text };
        const finishedAt = { ...mg.finishedAt };
        if (input.text === mg.prompt && finishedAt[key] === null) finishedAt[key] = nowMs();
        this.commit(
          { minigame: { ...mg, typed, finishedAt } },
          { skipSave: true }
        );
        this.broadcast();
        if (finishedAt.p1 !== null && finishedAt.p2 !== null) this.endMinigame();
        return;
      }
    }
  }

  // ─── Host navigation ───────────────────────────────────────────────────

  private onHostNext() {
    const phase = this.data.state.phase;
    const mg = this.data.state.minigame;
    if (phase === "minigame-intro") {
      void this.startActiveMinigame();
      return;
    }
    if (phase === "minigame-end") {
      void this.clearAlarm();
      void this.beginNextMinigame();
      return;
    }
    if (phase === "minigame-active" && mg) {
      if (mg.id === "trivia") {
        if (mg.phase === "wager") {
          const wagers = { ...mg.wagers };
          for (const p of this.data.state.players) {
            if (wagers[p.id] === undefined) wagers[p.id] = 0;
          }
          this.commit({ minigame: { ...mg, wagers } });
          void this.clearAlarm();
          this.beginTriviaBuzzing();
          return;
        }
        if (mg.phase === "reveal") {
          void this.clearAlarm();
          this.onTriviaRevealNext();
          return;
        }
        return;
      }
      if (mg.id === "memory-lane") {
        if (mg.phase === "answering") {
          void this.clearAlarm();
          this.beginMemoryLaneReveal();
          return;
        }
        if (mg.phase === "reveal") {
          void this.clearAlarm();
          this.endMemoryLanePhoto();
          return;
        }
      }
    }
  }

  private onHostSkip() {
    if (this.data.state.phase !== "minigame-active" && this.data.state.phase !== "minigame-intro") return;
    void this.clearAlarm();
    this.endMinigame();
  }

  // ─── Players ───────────────────────────────────────────────────────────

  private addPlayer(ws: WebSocket, name: string, isHost: boolean) {
    const meta = (ws.deserializeAttachment() as ConnMeta | null) ?? { playerId: null, isHost: false };
    if (meta.playerId) return;
    if (!isHost && this.data.state.phase !== "lobby") {
      this.sendError(ws, "Game already in progress");
      return;
    }
    const trimmed = (name || (isHost ? "Host" : "Player")).trim().slice(0, 16) || "Player";
    const id = `p${++this.data.playerIdCounter}`;
    const takenColors = new Set(Object.values(this.data.playersById).map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !takenColors.has(c)) ?? PLAYER_COLORS[0];
    const player: Player = {
      id,
      name: trimmed,
      score: 0,
      color,
      isHost,
      connected: true,
    };
    this.data.playersById[id] = player;
    ws.serializeAttachment({ playerId: id, isHost } satisfies ConnMeta);
    if (isHost && !this.data.state.hostId) {
      this.data.state.hostId = id;
    }
    this.refreshPlayersList();
    this.state.waitUntil(this.saveGame());
  }

  private reattachPlayer(ws: WebSocket, playerId: string) {
    const player = this.data.playersById[playerId];
    if (!player) return false;
    player.connected = true;
    ws.serializeAttachment({ playerId, isHost: player.isHost } satisfies ConnMeta);
    if (player.isHost && !this.data.state.hostId) {
      this.data.state.hostId = playerId;
    }
    this.refreshPlayersList();
    this.state.waitUntil(this.saveGame());
    return true;
  }

  private removePlayer(playerId: string) {
    const player = this.data.playersById[playerId];
    if (!player) return;
    player.connected = false;
    this.refreshPlayersList();
    this.state.waitUntil(this.saveGame());
  }

  private onPlayAgain() {
    if (this.data.state.phase !== "final") return;
    void this.clearAlarm();
    for (const id of Object.keys(this.data.playersById)) {
      this.data.playersById[id].score = 0;
    }
    const hostId = this.data.state.hostId;
    const settings = this.data.state.settings;
    this.data.state = makeLobbyState(settings);
    this.data.state.hostId = hostId;
    this.refreshPlayersList();
    this.state.waitUntil(this.saveGame());
    this.broadcast();
  }

  // ─── WebSocket ─────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("OK", { status: 200 });
    }
    await this.cancelIdleCleanup();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null, isHost: false } satisfies ConnMeta);
    this.sendTo(server, { type: "state", state: this.publicState(), youId: "" });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const meta = (ws.deserializeAttachment() as ConnMeta | null) ?? { playerId: null, isHost: false };
    let msg: ClientMessage;
    try {
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case "host-join":
        if (this.data.state.hostId && this.data.state.hostId !== meta.playerId) {
          this.sendError(ws, "Host already present");
          return;
        }
        this.addPlayer(ws, msg.name, true);
        this.broadcast();
        return;
      case "player-join":
        this.addPlayer(ws, msg.name, false);
        this.broadcast();
        return;
      case "rejoin": {
        if (meta.playerId) return;
        const ok = this.reattachPlayer(ws, msg.playerId);
        if (!ok) {
          this.sendError(ws, "Player not found, please rejoin with a new identity");
          return;
        }
        this.broadcast();
        return;
      }
      case "start-game":
        if (meta.playerId !== this.data.state.hostId) return;
        await this.startGame(msg.settings);
        return;
      case "next-question":
        if (meta.playerId !== this.data.state.hostId) return;
        this.onHostNext();
        return;
      case "buzz":
        if (meta.playerId) this.onBuzz(meta.playerId);
        return;
      case "minigame-skip":
        if (meta.playerId !== this.data.state.hostId) return;
        this.onHostSkip();
        return;
      case "minigame-input":
        if (meta.playerId) this.onMinigameInput(meta.playerId, msg.payload);
        return;
      case "play-again":
        if (meta.playerId !== this.data.state.hostId) return;
        this.onPlayAgain();
        return;
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    const meta = (ws.deserializeAttachment() as ConnMeta | null) ?? { playerId: null, isHost: false };
    if (meta.playerId) this.removePlayer(meta.playerId);
    this.broadcast();
    if (this.connectedPlayers().length === 0) {
      await this.maybeScheduleIdleCleanup();
    }
  }

  async webSocketError(ws: WebSocket, _err: unknown) {
    try {
      ws.close(1011, "error");
    } catch {}
  }
}

function parseRoomId(url: URL): string | null {
  const m = url.pathname.match(/^\/parties\/[^/]+\/([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

function mergeSettings(partial: Partial<GameSettings> | undefined): GameSettings {
  const base = defaultSettings();
  if (!partial) return base;
  const cfg: GameSettings["minigames"] = {
    ...base.minigames,
    ...(partial.minigames ?? {}),
  } as GameSettings["minigames"];
  return {
    minigames: cfg,
    matchLength:
      typeof partial.matchLength === "number" && partial.matchLength > 0
        ? Math.min(20, Math.floor(partial.matchLength))
        : base.matchLength,
    allowRepeats: typeof partial.allowRepeats === "boolean" ? partial.allowRepeats : base.allowRepeats,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const roomId = parseRoomId(url);
    if (!roomId) {
      return new Response("Not found. Use /parties/main/<roomId>", { status: 404 });
    }
    const id = env.PARTYKIT_DURABLE.idFromName(roomId);
    const stub = env.PARTYKIT_DURABLE.get(id);
    return stub.fetch(request);
  },
};
