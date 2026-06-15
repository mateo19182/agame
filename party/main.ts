import type {
  GameSettings,
  GameState,
  MinigameState,
  MinigameType,
  PhotoEntry,
  Player,
  Question,
  ClientMessage,
} from "../src/lib/game";
import { getUsQuestions } from "../src/lib/usQuestions";

const ROUND1_SECONDS = 15;
const ROUND2_SECONDS = 20;
const ANSWER_SECONDS = 6;
const REVEAL_MS = 2200;
const WAGER_SECONDS = 20;
const ROUND3_ANSWER_SECONDS = 30;
const ROUND3_REVEAL_SECONDS = 15;
const TIEBREAKER_MS = 20000;
const REFLEX_LIGHT_DELAY_MIN = 1200;
const REFLEX_LIGHT_DELAY_MAX = 4000;
const TRIVIA_CACHE_TTL = 60 * 60 * 24; // 1 day
const STEAL_WINDOW_MS = 4000;
const POST_TIEBREAKER_MS = 3000;

const PLAYER_COLORS = ["#f97316", "#06b6d4", "#a855f7", "#22c55e", "#ec4899", "#eab308"];

function nowMs(): number {
  return Date.now();
}

function defaultSettings(): GameSettings {
  return {
    pack: "general",
    difficulty: "medium",
    round1Questions: 8,
    round2Questions: 3,
    playTiebreaker: true,
    photos: [],
  };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type ConnMeta = { playerId: string | null; isHost: boolean };

type AlarmSpec =
  | { kind: "round1-tick" }
  | { kind: "round2-tick" }
  | { kind: "round2-wager" }
  | { kind: "answer"; playerId: string }
  | { kind: "reveal-next" }
  | { kind: "round3-answer" }
  | { kind: "round3-reveal" }
  | { kind: "tiebreaker-end" }
  | { kind: "reflex-light" }
  | { kind: "reflex-end" }
  | { kind: "final-transition" };

type RoomData = {
  state: GameState;
  playersById: Record<string, Player>;
  questionsRef: { round1: Question[]; round2: Question[] };
  photos: PhotoEntry[];
  playerIdCounter: number;
};

function defaultRoomData(): RoomData {
  return {
    state: makeLobbyState("", defaultSettings()),
    playersById: {},
    questionsRef: { round1: [], round2: [] },
    photos: [],
    playerIdCounter: 0,
  };
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

function makeLobbyState(hostId: string, settings: GameSettings): GameState {
  return {
    phase: "lobby",
    hostId,
    players: [],
    questions: [],
    currentQuestion: -1,
    round: 1,
    buzz: null,
    wagers: {},
    minigame: null,
    round3: null,
    photos: [],
    settings,
    lastEvent: null,
  };
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
        this.data = stored;
      }
      const settingsWrapped = await state.storage.get<{ settings?: GameSettings }>("settings");
      if (settingsWrapped?.settings) {
        this.data.state.settings = { ...defaultSettings(), ...settingsWrapped.settings };
      }
    });
  }

  private async saveGame() {
    await this.state.storage.put("game", this.data);
  }

  private commit(partial: Partial<GameState>) {
    this.data.state = { ...this.data.state, ...partial };
    this.state.waitUntil(this.saveGame());
  }

  private async scheduleAlarm(spec: AlarmSpec, msFromNow: number) {
    await this.state.storage.put("alarm", spec);
    await this.state.storage.setAlarm(nowMs() + msFromNow);
  }

  private async clearAlarm() {
    await this.state.storage.delete("alarm");
    await this.state.storage.deleteAlarm();
  }

  async alarm(_alarmInfo?: AlarmInvocationInfo) {
    const spec = await this.state.storage.get<AlarmSpec>("alarm");
    await this.state.storage.delete("alarm");
    await this.state.storage.deleteAlarm();
    if (!spec) return;
    // Rehydrate in case the DO was evicted and is waking up fresh.
    const stored = await this.state.storage.get<RoomData>("game");
    if (stored) this.data = stored;

    switch (spec.kind) {
      case "round1-tick":
      case "round2-tick":
        this.onTimerExpire();
        break;
      case "round2-wager":
        this.beginRound2Question();
        break;
      case "answer": {
        const cur = this.data.state.buzz;
        if (cur && cur.status === "answering" && cur.buzzedBy === spec.playerId) {
          this.resolveAnswer(spec.playerId, false);
        }
        break;
      }
      case "reveal-next":
        this.advanceFromReveal();
        break;
      case "round3-answer":
        this.onRound3AnswerTimeout();
        break;
      case "round3-reveal":
        this.endRound3Photo();
        break;
      case "tiebreaker-end":
        this.endMinigame();
        break;
      case "reflex-light":
        this.showReflexLight();
        break;
      case "reflex-end":
        this.endMinigame();
        break;
      case "final-transition":
        this.endGame(this.data.state.minigame?.winnerId ?? null);
        break;
    }
  }

  private publicState(): GameState {
    return { ...this.data.state, photos: this.data.photos };
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

  private async fetchQuestionsForRound(round: 1 | 2, settings: GameSettings): Promise<Question[]> {
    const count = round === 1 ? settings.round1Questions : settings.round2Questions;
    if (settings.pack === "us") {
      return shuffle(getUsQuestions()).slice(0, count);
    }
    if (settings.pack === "mixed") {
      const half = Math.ceil(count / 2);
      const us = shuffle(getUsQuestions()).slice(0, half);
      const rest = count - half;
      const otdb = await fetchOpenTdbCached(rest, settings.difficulty);
      return shuffle([...us, ...otdb]);
    }
    return fetchOpenTdbCached(count, settings.difficulty);
  }

  private connectedPlayers() {
    return Object.values(this.data.playersById).filter((p) => p.connected);
  }

  private newBuzz() {
    return {
      buzzedBy: null,
      buzzedAt: null,
      timerEndsAt: nowMs() + ROUND1_SECONDS * 1000,
      status: "buzzing" as const,
      answerCorrect: null,
    };
  }

  private refreshPlayersList() {
    this.data.state.players = this.connectedPlayers();
  }

  private nextRound1Question() {
    const next = this.data.state.currentQuestion + 1;
    if (next >= this.data.questionsRef.round1.length) {
      this.beginRound2Intro();
      return;
    }
    this.data.state.questions = this.data.questionsRef.round1;
    this.data.state.currentQuestion = next;
    this.commit({ phase: "round1-question", buzz: this.newBuzz(), lastEvent: null });
    this.broadcast();
    void this.scheduleAlarm({ kind: "round1-tick" }, ROUND1_SECONDS * 1000);
  }

  private beginRound2Intro() {
    this.data.state.questions = this.data.questionsRef.round2;
    this.data.state.currentQuestion = 0;
    this.data.state.round = 2;
    this.data.state.wagers = {};
    this.commit({ phase: "round2-wager", buzz: null, lastEvent: null });
    this.broadcast();
    void this.scheduleAlarm({ kind: "round2-wager" }, WAGER_SECONDS * 1000);
  }

  private beginRound2Question() {
    this.commit({
      phase: "round2-question",
      buzz: {
        buzzedBy: null,
        buzzedAt: null,
        timerEndsAt: nowMs() + ROUND2_SECONDS * 1000,
        status: "buzzing",
        answerCorrect: null,
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "round2-tick" }, ROUND2_SECONDS * 1000);
  }

  private nextRound2Question() {
    const next = this.data.state.currentQuestion + 1;
    if (next >= this.data.questionsRef.round2.length) {
      if (this.data.photos.length > 0) {
        this.beginRound3Intro();
        return;
      }
      this.beginFinal();
      return;
    }
    this.data.state.currentQuestion = next;
    this.data.state.wagers = {};
    this.commit({ phase: "round2-wager", buzz: null, lastEvent: null });
    this.broadcast();
    void this.scheduleAlarm({ kind: "round2-wager" }, WAGER_SECONDS * 1000);
  }

  private beginRound3Intro() {
    this.data.state.round = 3;
    this.commit({
      phase: "round3-intro",
      round3: null,
      buzz: null,
      lastEvent: null,
    });
    this.broadcast();
  }

  private startRound3() {
    if (this.data.photos.length === 0) {
      this.beginFinal();
      return;
    }
    this.commit({
      phase: "round3-photo",
      round3: {
        currentPhotoIndex: 0,
        phase: "answering",
        timerEndsAt: nowMs() + ROUND3_ANSWER_SECONDS * 1000,
        guesses: {},
        selfScored: {},
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "round3-answer" }, ROUND3_ANSWER_SECONDS * 1000);
  }

  private onRound3AnswerTimeout() {
    const r3 = this.data.state.round3;
    if (!r3 || r3.phase !== "answering") return;
    this.beginRound3Reveal();
  }

  private beginRound3Reveal() {
    const r3 = this.data.state.round3;
    if (!r3) return;
    this.commit({
      phase: "round3-reveal",
      round3: {
        ...r3,
        phase: "reveal",
        timerEndsAt: nowMs() + ROUND3_REVEAL_SECONDS * 1000,
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "round3-reveal" }, ROUND3_REVEAL_SECONDS * 1000);
  }

  private endRound3Photo() {
    const r3 = this.data.state.round3;
    if (!r3) return;
    const players = this.data.state.players;
    for (const p of players) {
      const sc = r3.selfScored[p.id];
      if (sc?.where) p.score += 1;
      if (sc?.when) p.score += 1;
    }
    this.data.state.lastEvent = null;
    const next = r3.currentPhotoIndex + 1;
    if (next >= this.data.photos.length) {
      this.state.waitUntil(this.saveGame());
      this.beginFinal();
      return;
    }
    this.commit({
      round3: {
        currentPhotoIndex: next,
        phase: "answering",
        timerEndsAt: nowMs() + ROUND3_ANSWER_SECONDS * 1000,
        guesses: {},
        selfScored: {},
      },
      phase: "round3-photo",
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "round3-answer" }, ROUND3_ANSWER_SECONDS * 1000);
  }

  private onRound3Guess(playerId: string, where: string, when: string) {
    const r3 = this.data.state.round3;
    if (!r3 || r3.phase !== "answering") return;
    r3.guesses[playerId] = { where, when };
    this.state.waitUntil(this.saveGame());
    this.broadcast();
    const players = this.connectedPlayers();
    if (players.every((p) => r3.guesses[p.id])) {
      void this.clearAlarm();
      this.beginRound3Reveal();
    }
  }

  private onRound3SelfScore(playerId: string, where: boolean, when: boolean) {
    const r3 = this.data.state.round3;
    if (!r3 || r3.phase !== "reveal") return;
    r3.selfScored[playerId] = { where, when };
    this.state.waitUntil(this.saveGame());
    this.broadcast();
    const players = this.connectedPlayers();
    if (players.every((p) => r3.selfScored[p.id])) {
      void this.clearAlarm();
      this.endRound3Photo();
    }
  }

  private onRound3Next() {
    const r3 = this.data.state.round3;
    if (!r3 || r3.phase !== "reveal") return;
    void this.clearAlarm();
    this.endRound3Photo();
  }

  private beginFinal() {
    const players = this.data.state.players;
    const top = Math.max(...players.map((p) => p.score));
    const leaders = players.filter((p) => p.score === top);
    if (leaders.length > 1 && this.data.state.settings.playTiebreaker) {
      this.beginTiebreakerIntro();
      return;
    }
    this.endGame(leaders[0]?.id ?? null);
  }

  private beginTiebreakerIntro() {
    this.commit({ phase: "tiebreaker-intro", minigame: pickRandomMinigame() });
    this.broadcast();
  }

  private startTiebreaker() {
    const mg = this.data.state.minigame;
    if (!mg) return;
    if (mg.type === "reflex") {
      this.commit({
        phase: "tiebreaker-play",
        minigame: {
          ...mg,
          startedAt: nowMs(),
          duration: TIEBREAKER_MS,
          taps: { p1: 0, p2: 0 },
          lightsOn: false,
          lightOnAt: null,
          winnerId: null,
          status: "live",
        },
      });
      this.broadcast();
      this.scheduleReflexLight();
    } else if (mg.type === "speed-sort") {
      this.commit({
        phase: "tiebreaker-play",
        minigame: { ...mg, startedAt: nowMs(), duration: TIEBREAKER_MS, progress: { p1: 0, p2: 0 }, winnerId: null, status: "live" },
      });
      this.broadcast();
      void this.scheduleAlarm({ kind: "tiebreaker-end" }, TIEBREAKER_MS);
    } else {
      this.commit({
        phase: "tiebreaker-play",
        minigame: { ...mg, startedAt: nowMs(), duration: TIEBREAKER_MS, typed: { p1: "", p2: "" }, finishedAt: { p1: null, p2: null }, winnerId: null, status: "live" },
      });
      this.broadcast();
      void this.scheduleAlarm({ kind: "tiebreaker-end" }, TIEBREAKER_MS);
    }
  }

  private scheduleReflexLight() {
    const delay = REFLEX_LIGHT_DELAY_MIN + Math.random() * (REFLEX_LIGHT_DELAY_MAX - REFLEX_LIGHT_DELAY_MIN);
    void this.scheduleAlarm({ kind: "reflex-light" }, delay);
  }

  private showReflexLight() {
    const mg = this.data.state.minigame;
    if (!mg || mg.type !== "reflex" || mg.status !== "live") return;
    this.commit({ minigame: { ...mg, lightsOn: true, lightOnAt: nowMs() } });
    this.broadcast();
    void this.scheduleAlarm({ kind: "reflex-end" }, 1500);
  }

  private endMinigame() {
    const mg = this.data.state.minigame;
    if (!mg) return;
    let winnerId: string | null = null;
    if (mg.type === "reflex") {
      const [p1, p2] = this.data.state.players;
      winnerId = mg.taps.p1 > mg.taps.p2 ? p1.id : mg.taps.p2 > mg.taps.p1 ? p2.id : null;
    } else if (mg.type === "speed-sort") {
      const [p1, p2] = this.data.state.players;
      winnerId = mg.progress.p1 > mg.progress.p2 ? p1.id : mg.progress.p2 > mg.progress.p1 ? p2.id : null;
    } else {
      const [p1, p2] = this.data.state.players;
      const p1Done = mg.finishedAt.p1 !== null;
      const p2Done = mg.finishedAt.p2 !== null;
      if (p1Done && p2Done) winnerId = (mg.finishedAt.p1! < mg.finishedAt.p2!) ? p1.id : p2.id;
      else if (p1Done) winnerId = p1.id;
      else if (p2Done) winnerId = p2.id;
    }
    this.commit({ phase: "tiebreaker-result", minigame: { ...mg, winnerId, status: "done" } });
    this.broadcast();
    void this.scheduleAlarm({ kind: "final-transition" }, POST_TIEBREAKER_MS);
  }

  private endGame(winnerId: string | null) {
    void winnerId;
    void this.clearAlarm();
    this.commit({ phase: "final", buzz: null, minigame: null, lastEvent: null });
    this.broadcast();
  }

  private onTimerExpire() {
    const phase = this.data.state.phase;
    if (phase === "round1-question") {
      this.commit({
        phase: "round1-reveal",
        buzz: { ...(this.data.state.buzz!), status: "reveal", answerCorrect: false, buzzedBy: this.data.state.buzz?.buzzedBy ?? null },
        lastEvent: { kind: "timeout", playerId: null, delta: 0 },
      });
      this.broadcast();
      void this.scheduleAlarm({ kind: "reveal-next" }, REVEAL_MS);
    } else if (phase === "round1-reveal") {
      this.nextRound1Question();
    } else if (phase === "round2-question") {
      this.commit({
        phase: "round2-reveal",
        buzz: { ...(this.data.state.buzz!), status: "reveal", answerCorrect: false },
        lastEvent: { kind: "timeout", playerId: null, delta: 0 },
      });
      this.broadcast();
      void this.scheduleAlarm({ kind: "reveal-next" }, REVEAL_MS);
    } else if (phase === "round2-wager") {
      this.beginRound2Question();
    } else if (phase === "tiebreaker-play") {
      this.endMinigame();
    }
  }

  private advanceFromReveal() {
    const phase = this.data.state.phase;
    if (phase === "round1-reveal") this.nextRound1Question();
    else if (phase === "round2-reveal") this.nextRound2Question();
  }

  private onBuzz(playerId: string) {
    const phase = this.data.state.phase;
    const buzz = this.data.state.buzz;
    if (!buzz || buzz.status !== "buzzing" || buzz.buzzedBy) return;
    if (phase !== "round1-question" && phase !== "round2-question") return;
    const newBuzz = { ...buzz, buzzedBy: playerId, buzzedAt: nowMs(), status: "answering" as const };
    const answerDeadline = nowMs() + ANSWER_SECONDS * 1000;
    newBuzz.timerEndsAt = answerDeadline;
    this.commit({ buzz: newBuzz });
    this.broadcast();
    void this.scheduleAlarm({ kind: "answer", playerId }, ANSWER_SECONDS * 1000);
  }

  private onAnswer(playerId: string, correct: boolean) {
    const buzz = this.data.state.buzz;
    if (!buzz || buzz.status !== "answering" || buzz.buzzedBy !== playerId) return;
    this.resolveAnswer(playerId, correct);
  }

  private resolveAnswer(playerId: string, correct: boolean) {
    const phase = this.data.state.phase;
    const players = this.data.state.players;
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    if (correct) {
      const delta = phase === "round2-question" ? (this.data.state.wagers[playerId] ?? 0) : 1;
      player.score += delta;
      this.commit({
        phase: phase === "round1-question" ? "round1-reveal" : "round2-reveal",
        buzz: { ...(this.data.state.buzz!), status: "reveal", answerCorrect: true },
        lastEvent: { kind: "correct", playerId, delta },
      });
      this.broadcast();
      void this.scheduleAlarm({ kind: "reveal-next" }, REVEAL_MS);
    } else {
      if (phase === "round1-question") {
        const other = players.find((p) => p.id !== playerId && p.connected);
        if (other) {
          this.commit({
            buzz: {
              ...(this.data.state.buzz!),
              status: "buzzing",
              buzzedBy: null,
              buzzedAt: null,
              timerEndsAt: nowMs() + STEAL_WINDOW_MS,
              answerCorrect: null,
            },
            lastEvent: { kind: "wrong", playerId, delta: 0 },
          });
          this.broadcast();
          void this.scheduleAlarm({ kind: "round1-tick" }, STEAL_WINDOW_MS);
        } else {
          this.commit({
            phase: "round1-reveal",
            buzz: { ...(this.data.state.buzz!), status: "reveal", answerCorrect: false },
            lastEvent: { kind: "wrong", playerId, delta: 0 },
          });
          this.broadcast();
          void this.scheduleAlarm({ kind: "reveal-next" }, REVEAL_MS);
        }
      } else {
        const delta = -(this.data.state.wagers[playerId] ?? 0);
        player.score = Math.max(0, player.score + delta);
        this.commit({
          phase: "round2-reveal",
          buzz: { ...(this.data.state.buzz!), status: "reveal", answerCorrect: false },
          lastEvent: { kind: "wrong", playerId, delta },
        });
        this.broadcast();
        void this.scheduleAlarm({ kind: "reveal-next" }, REVEAL_MS);
      }
    }
  }

  private onSetWager(playerId: string, amount: number) {
    if (this.data.state.phase !== "round2-wager") return;
    const player = this.data.state.players.find((p) => p.id === playerId);
    if (!player) return;
    const max = Math.max(1, player.score);
    const safe = Math.max(0, Math.min(max, Math.floor(amount)));
    this.data.state.wagers = { ...this.data.state.wagers, [playerId]: safe };
    this.state.waitUntil(this.saveGame());
    this.broadcast();
    const players = this.connectedPlayers();
    if (players.every((p) => this.data.state.wagers[p.id] !== undefined)) {
      void this.clearAlarm();
      this.beginRound2Question();
    }
  }

  private onMinigameInput(playerId: string, payload: unknown) {
    const mg = this.data.state.minigame;
    if (!mg || mg.status !== "live" || this.data.state.phase !== "tiebreaker-play") return;
    const players = this.data.state.players;
    const idx = players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    const key = idx === 0 ? "p1" : "p2";
    if (mg.type === "reflex") {
      if (!mg.lightsOn) return;
      if (typeof payload === "object" && payload && (payload as { tap?: boolean }).tap) {
        this.commit({ minigame: { ...mg, taps: { ...mg.taps, [key]: mg.taps[key] + 1 } } });
        this.broadcast();
      }
    } else if (mg.type === "speed-sort") {
      const p = payload as { itemId: string; correct: boolean };
      if (!p) return;
      const newProgress = { ...mg.progress };
      if (p.correct) newProgress[key] = Math.min(mg.items.length, newProgress[key] + 1);
      this.commit({ minigame: { ...mg, progress: newProgress } });
      this.broadcast();
      if (newProgress.p1 >= mg.items.length || newProgress.p2 >= mg.items.length) {
        this.endMinigame();
      }
    } else {
      const p = payload as { typed: string };
      if (!p) return;
      const typed = { ...mg.typed, [key]: p.typed };
      const finishedAt = { ...mg.finishedAt };
      if (p.typed === mg.prompt && finishedAt[key] === null) finishedAt[key] = nowMs();
      this.commit({ minigame: { ...mg, typed, finishedAt } });
      this.broadcast();
      if (finishedAt.p1 !== null || finishedAt.p2 !== null) {
        const done = Object.values(finishedAt).filter((v) => v !== null).length;
        if (done === 2) this.endMinigame();
      }
    }
  }

  private onPlayAgain() {
    if (this.data.state.phase !== "final") return;
    void this.clearAlarm();
    for (const id of Object.keys(this.data.playersById)) {
      this.data.playersById[id].score = 0;
    }
    this.data.state = makeLobbyState(this.data.state.hostId, this.data.state.settings);
    this.refreshPlayersList();
    this.data.photos = [];
    this.state.waitUntil(this.saveGame());
    this.broadcast();
  }

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

  private async startGame(settingsOverride?: GameSettings, photosOverride?: PhotoEntry[]) {
    if (this.data.state.phase !== "lobby") return;
    if (this.connectedPlayers().length < 2) {
      this.broadcastError("Need 2 players to start");
      return;
    }
    if (await this.state.storage.get<boolean>("starting")) return;
    await this.state.storage.put("starting", true);
    void this.clearAlarm();
    if (settingsOverride) {
      this.data.state.settings = { ...defaultSettings(), ...settingsOverride };
      await this.state.storage.put("settings", { settings: this.data.state.settings });
    }
    this.data.photos = (photosOverride ?? []).filter(
      (p) => p && p.dataUrl && (p.where || p.when)
    );
    const settings = this.data.state.settings;
    try {
      const questions = await this.fetchQuestionsForRound(1, settings);
      this.data.questionsRef.round1 = questions;
      this.data.questionsRef.round2 = await this.fetchQuestionsForRound(2, settings);
      this.data.state.questions = questions;
      this.data.state.currentQuestion = 0;
      this.data.state.round = 1;
      this.data.state.lastEvent = null;
      this.commit({ phase: "round1-question", buzz: this.newBuzz() });
      this.broadcast();
      void this.scheduleAlarm({ kind: "round1-tick" }, ROUND1_SECONDS * 1000);
    } catch (err) {
      this.broadcastError(`Trivia fetch failed: ${(err as Error).message}`);
    } finally {
      await this.state.storage.delete("starting");
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("OK", { status: 200 });
    }
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
        await this.startGame(msg.settings, msg.photos);
        return;
      case "next-question":
        if (meta.playerId !== this.data.state.hostId) return;
        if (this.data.state.phase === "round1-reveal") this.nextRound1Question();
        else if (this.data.state.phase === "round2-reveal") this.nextRound2Question();
        else if (this.data.state.phase === "round2-wager") this.beginRound2Question();
        else if (this.data.state.phase === "round3-intro") this.startRound3();
        else if (this.data.state.phase === "round3-reveal") this.onRound3Next();
        else if (this.data.state.phase === "tiebreaker-intro") this.startTiebreaker();
        return;
      case "buzz":
        if (meta.playerId) this.onBuzz(meta.playerId);
        return;
      case "answer":
        if (meta.playerId) this.onAnswer(meta.playerId, msg.correct);
        return;
      case "set-wager":
        if (meta.playerId) this.onSetWager(meta.playerId, msg.amount);
        return;
      case "play-again":
        if (meta.playerId !== this.data.state.hostId) return;
        this.onPlayAgain();
        return;
      case "minigame-start":
        if (meta.playerId !== this.data.state.hostId) return;
        this.startTiebreaker();
        return;
      case "minigame-input":
        if (meta.playerId) this.onMinigameInput(meta.playerId, msg.payload);
        return;
      case "round3-guess":
        if (meta.playerId) this.onRound3Guess(meta.playerId, msg.where, msg.when);
        return;
      case "round3-self-score":
        if (meta.playerId) this.onRound3SelfScore(meta.playerId, msg.where, msg.when);
        return;
      case "round3-next":
        if (meta.playerId !== this.data.state.hostId) return;
        this.onRound3Next();
        return;
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    const meta = (ws.deserializeAttachment() as ConnMeta | null) ?? { playerId: null, isHost: false };
    if (meta.playerId) this.removePlayer(meta.playerId);
    this.broadcast();
  }

  async webSocketError(ws: WebSocket, _err: unknown) {
    try {
      ws.close(1011, "error");
    } catch {}
  }
}

function pickRandomMinigame(): MinigameState {
  const choices: MinigameType[] = ["reflex", "speed-sort", "type-race"];
  const pick = choices[Math.floor(Math.random() * choices.length)];
  if (pick === "reflex") {
    return { type: "reflex", startedAt: 0, duration: 0, taps: { p1: 0, p2: 0 }, lightsOn: false, lightOnAt: null, winnerId: null, status: "waiting" };
  }
  if (pick === "speed-sort") {
    const fruits = ["Apple", "Banana", "Cherry", "Grape", "Lemon", "Mango", "Peach", "Pear"];
    const veggies = ["Carrot", "Onion", "Pepper", "Potato", "Tomato", "Cucumber", "Lettuce", "Spinach"];
    const items: { id: string; label: string; bin: "left" | "right" }[] = [];
    const fr = shuffle(fruits).slice(0, 4).map((label, i) => ({ id: `fr-${i}`, label, bin: "left" as const }));
    const ve = shuffle(veggies).slice(0, 4).map((label, i) => ({ id: `ve-${i}`, label, bin: "right" as const }));
    items.push(...shuffle([...fr, ...ve]));
    return { type: "speed-sort", startedAt: 0, duration: 0, items, progress: { p1: 0, p2: 0 }, winnerId: null, status: "waiting" };
  }
  const prompts = [
    "i love you so much",
    "you are my favorite person",
    "best team in the world",
    "i am so lucky",
    "you make me laugh every day",
    "lets go on an adventure",
  ];
  return {
    type: "type-race",
    startedAt: 0,
    duration: 0,
    prompt: prompts[Math.floor(Math.random() * prompts.length)],
    typed: { p1: "", p2: "" },
    finishedAt: { p1: null, p2: null },
    winnerId: null,
    status: "waiting",
  };
}

function parseRoomId(url: URL): string | null {
  const m = url.pathname.match(/^\/parties\/[^/]+\/([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
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
