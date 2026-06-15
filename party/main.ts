import type * as Party from "partykit/server";
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

type ServerData = {
  state: GameState;
  connToPlayer: Record<string, string>;
  playersById: Record<string, Player>;
  pendingTimers: ReturnType<typeof setTimeout>[];
  questionsRef: { round1: Question[]; round2: Question[] };
  photos: PhotoEntry[];
};

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

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): { fetch(request: Request): Promise<Response> };
}
interface DurableObjectId {
  toString(): string;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

class BuzzerServer implements Party.Server {
  readonly data: ServerData;
  readonly room: Party.Room;

  constructor(room: Party.Room) {
    this.room = room;
    this.data = {
      state: makeLobbyState("", defaultSettings()),
      connToPlayer: {},
      playersById: {},
      pendingTimers: [],
      questionsRef: { round1: [], round2: [] },
      photos: [],
    };
  }

  async onStart() {
    const stored = await this.room.storage.get<{ settings?: GameSettings }>("settings");
    if (stored?.settings) {
      this.data.state.settings = { ...defaultSettings(), ...stored.settings };
    }
  }

  clearTimers() {
    for (const t of this.data.pendingTimers) clearTimeout(t);
    this.data.pendingTimers = [];
  }

  queueTimer(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.data.pendingTimers = this.data.pendingTimers.filter((x) => x !== t);
      fn();
    }, ms);
    this.data.pendingTimers.push(t);
  }

  broadcast() {
    const payload = { ...this.data.state, photos: this.data.photos };
    for (const conn of this.room.getConnections()) {
      const playerId = this.data.connToPlayer[conn.id];
      conn.send(JSON.stringify({ type: "state", state: payload, youId: playerId ?? "" }));
    }
  }

  setState(partial: Partial<GameState>) {
    this.data.state = { ...this.data.state, ...partial };
  }

  async fetchQuestionsForRound(round: 1 | 2, settings: GameSettings): Promise<Question[]> {
    const count = round === 1 ? settings.round1Questions : settings.round2Questions;
    if (settings.pack === "us") {
      return shuffle(getUsQuestions()).slice(0, count);
    }
    if (settings.pack === "mixed") {
      const half = Math.ceil(count / 2);
      const us = shuffle(getUsQuestions()).slice(0, half);
      const rest = count - half;
      const otdb = await fetchOpenTdb(rest, settings.difficulty);
      return shuffle([...us, ...otdb]);
    }
    return fetchOpenTdb(count, settings.difficulty);
  }

  playerCount() {
    return Object.values(this.data.playersById).filter((p) => p.connected).length;
  }

  addPlayer(conn: Party.Connection, name: string, isHost: boolean) {
    if (this.data.connToPlayer[conn.id]) return;
    if (!isHost && this.data.state.phase !== "lobby") {
      conn.send(JSON.stringify({ type: "error", message: "Game already in progress" }));
      return;
    }
    const trimmed = (name || (isHost ? "Host" : "Player")).trim().slice(0, 16) || "Player";
    const id = conn.id;
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
    this.data.connToPlayer[conn.id] = id;
    if (isHost && !this.data.state.hostId) {
      this.data.state.hostId = id;
    }
    if (this.data.state.phase === "lobby") {
      this.data.state.players = Object.values(this.data.playersById).filter((p) => p.connected);
    }
  }

  removePlayer(conn: Party.Connection) {
    const playerId = this.data.connToPlayer[conn.id];
    if (!playerId) return;
    const player = this.data.playersById[playerId];
    if (player) {
      player.connected = false;
    }
    delete this.data.connToPlayer[conn.id];
    if (this.data.state.phase === "lobby") {
      this.data.state.players = Object.values(this.data.playersById).filter((p) => p.connected);
    }
  }

  async startGame(settingsOverride?: GameSettings, photosOverride?: PhotoEntry[]) {
    if (this.data.state.phase !== "lobby") return;
    if (this.playerCount() < 2) {
      for (const c of this.room.getConnections()) {
        c.send(JSON.stringify({ type: "error", message: "Need 2 players to start" }));
      }
      return;
    }
    this.clearTimers();
    if (settingsOverride) {
      this.data.state.settings = { ...defaultSettings(), ...settingsOverride };
      await this.room.storage.put("settings", { settings: this.data.state.settings });
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
      this.setState({ phase: "round1-question", buzz: this.newBuzz() });
      this.broadcast();
      this.queueTimer(() => this.onTimerExpire(), ROUND1_SECONDS * 1000);
    } catch (err) {
      for (const c of this.room.getConnections()) {
        c.send(JSON.stringify({ type: "error", message: `Trivia fetch failed: ${(err as Error).message}` }));
      }
    }
  }

  newBuzz() {
    return {
      buzzedBy: null,
      buzzedAt: null,
      timerEndsAt: nowMs() + ROUND1_SECONDS * 1000,
      status: "buzzing" as const,
      answerCorrect: null,
    };
  }

  nextRound1Question() {
    const next = this.data.state.currentQuestion + 1;
    if (next >= this.data.questionsRef.round1.length) {
      this.beginRound2Intro();
      return;
    }
    this.data.state.questions = this.data.questionsRef.round1;
    this.data.state.currentQuestion = next;
    this.setState({ phase: "round1-question", buzz: this.newBuzz(), lastEvent: null });
    this.broadcast();
    this.queueTimer(() => this.onTimerExpire(), ROUND1_SECONDS * 1000);
  }

  beginRound2Intro() {
    this.data.state.questions = this.data.questionsRef.round2;
    this.data.state.currentQuestion = 0;
    this.data.state.round = 2;
    this.data.state.wagers = {};
    this.setState({ phase: "round2-wager", buzz: null, lastEvent: null });
    this.broadcast();
    this.queueTimer(() => this.beginRound2Question(), WAGER_SECONDS * 1000);
  }

  beginRound2Question() {
    this.setState({
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
    this.queueTimer(() => this.onTimerExpire(), ROUND2_SECONDS * 1000);
  }

  nextRound2Question() {
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
    this.setState({ phase: "round2-wager", buzz: null, lastEvent: null });
    this.broadcast();
    this.queueTimer(() => this.beginRound2Question(), WAGER_SECONDS * 1000);
  }

  beginRound3Intro() {
    this.data.state.round = 3;
    this.setState({
      phase: "round3-intro",
      round3: null,
      buzz: null,
      lastEvent: null,
    });
    this.broadcast();
  }

  startRound3() {
    if (this.data.photos.length === 0) {
      this.beginFinal();
      return;
    }
    this.setState({
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
    this.queueTimer(() => this.onRound3AnswerTimeout(), ROUND3_ANSWER_SECONDS * 1000);
  }

  onRound3AnswerTimeout() {
    const r3 = this.data.state.round3;
    if (!r3 || r3.phase !== "answering") return;
    this.beginRound3Reveal();
  }

  beginRound3Reveal() {
    const r3 = this.data.state.round3;
    if (!r3) return;
    this.setState({
      phase: "round3-reveal",
      round3: {
        ...r3,
        phase: "reveal",
        timerEndsAt: nowMs() + ROUND3_REVEAL_SECONDS * 1000,
      },
    });
    this.broadcast();
    this.queueTimer(() => this.endRound3Photo(), ROUND3_REVEAL_SECONDS * 1000);
  }

  endRound3Photo() {
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
      this.beginFinal();
      return;
    }
    this.setState({
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
    this.queueTimer(() => this.onRound3AnswerTimeout(), ROUND3_ANSWER_SECONDS * 1000);
  }

  onRound3Guess(playerId: string, where: string, when: string) {
    const r3 = this.data.state.round3;
    if (!r3 || r3.phase !== "answering") return;
    r3.guesses[playerId] = { where, when };
    this.broadcast();
    const players = this.data.state.players.filter((p) => p.connected);
    if (players.every((p) => r3.guesses[p.id])) {
      this.clearTimers();
      this.beginRound3Reveal();
    }
  }

  onRound3SelfScore(playerId: string, where: boolean, when: boolean) {
    const r3 = this.data.state.round3;
    if (!r3 || r3.phase !== "reveal") return;
    r3.selfScored[playerId] = { where, when };
    this.broadcast();
    const players = this.data.state.players.filter((p) => p.connected);
    if (players.every((p) => r3.selfScored[p.id])) {
      this.clearTimers();
      this.endRound3Photo();
    }
  }

  onRound3Next() {
    const r3 = this.data.state.round3;
    if (!r3 || r3.phase !== "reveal") return;
    this.clearTimers();
    this.endRound3Photo();
  }

  beginFinal() {
    const players = this.data.state.players;
    const top = Math.max(...players.map((p) => p.score));
    const leaders = players.filter((p) => p.score === top);
    if (leaders.length > 1 && this.data.state.settings.playTiebreaker) {
      this.beginTiebreakerIntro();
      return;
    }
    this.endGame(leaders[0]?.id ?? null);
  }

  beginTiebreakerIntro() {
    this.setState({ phase: "tiebreaker-intro", minigame: pickRandomMinigame() });
    this.broadcast();
  }

  startTiebreaker() {
    const mg = this.data.state.minigame;
    if (!mg) return;
    if (mg.type === "reflex") {
      this.setState({
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
      this.setState({
        phase: "tiebreaker-play",
        minigame: { ...mg, startedAt: nowMs(), duration: TIEBREAKER_MS, progress: { p1: 0, p2: 0 }, winnerId: null, status: "live" },
      });
      this.broadcast();
      this.queueTimer(() => this.endMinigame(), TIEBREAKER_MS);
    } else {
      this.setState({
        phase: "tiebreaker-play",
        minigame: { ...mg, startedAt: nowMs(), duration: TIEBREAKER_MS, typed: { p1: "", p2: "" }, finishedAt: { p1: null, p2: null }, winnerId: null, status: "live" },
      });
      this.broadcast();
      this.queueTimer(() => this.endMinigame(), TIEBREAKER_MS);
    }
  }

  scheduleReflexLight() {
    const delay = REFLEX_LIGHT_DELAY_MIN + Math.random() * (REFLEX_LIGHT_DELAY_MAX - REFLEX_LIGHT_DELAY_MIN);
    this.queueTimer(() => {
      const mg = this.data.state.minigame;
      if (!mg || mg.type !== "reflex" || mg.status !== "live") return;
      this.setState({ minigame: { ...mg, lightsOn: true, lightOnAt: nowMs() } });
      this.broadcast();
      this.queueTimer(() => this.endMinigame(), 1500);
    }, delay);
  }

  endMinigame() {
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
    this.setState({ phase: "tiebreaker-result", minigame: { ...mg, winnerId, status: "done" } });
    this.broadcast();
    this.queueTimer(() => {
      const next = winnerId ?? this.data.state.players[0]?.id ?? null;
      this.endGame(next);
    }, 3000);
  }

  endGame(winnerId: string | null) {
    void winnerId;
    this.clearTimers();
    this.setState({ phase: "final", buzz: null, minigame: null, lastEvent: null });
    this.broadcast();
  }

  onTimerExpire() {
    const phase = this.data.state.phase;
    if (phase === "round1-question") {
      this.setState({
        phase: "round1-reveal",
        buzz: { ...(this.data.state.buzz!), status: "reveal", answerCorrect: false, buzzedBy: this.data.state.buzz?.buzzedBy ?? null },
        lastEvent: { kind: "timeout", playerId: null, delta: 0 },
      });
      this.broadcast();
      this.queueTimer(() => this.nextRound1Question(), REVEAL_MS);
    } else if (phase === "round1-reveal") {
      this.nextRound1Question();
    } else if (phase === "round2-question") {
      this.setState({
        phase: "round2-reveal",
        buzz: { ...(this.data.state.buzz!), status: "reveal", answerCorrect: false },
        lastEvent: { kind: "timeout", playerId: null, delta: 0 },
      });
      this.broadcast();
      this.queueTimer(() => this.nextRound2Question(), REVEAL_MS);
    } else if (phase === "round2-wager") {
      this.beginRound2Question();
    } else if (phase === "tiebreaker-play") {
      this.endMinigame();
    }
  }

  onBuzz(playerId: string) {
    const phase = this.data.state.phase;
    const buzz = this.data.state.buzz;
    if (!buzz || buzz.status !== "buzzing" || buzz.buzzedBy) return;
    if (phase !== "round1-question" && phase !== "round2-question") return;
    const newBuzz = { ...buzz, buzzedBy: playerId, buzzedAt: nowMs(), status: "answering" as const };
    const answerDeadline = nowMs() + ANSWER_SECONDS * 1000;
    newBuzz.timerEndsAt = answerDeadline;
    this.setState({ buzz: newBuzz });
    this.broadcast();
    this.queueTimer(() => {
      const cur = this.data.state.buzz;
      if (cur && cur.status === "answering" && cur.buzzedBy === playerId) {
        this.resolveAnswer(playerId, false);
      }
    }, ANSWER_SECONDS * 1000);
  }

  onAnswer(playerId: string, correct: boolean) {
    const buzz = this.data.state.buzz;
    if (!buzz || buzz.status !== "answering" || buzz.buzzedBy !== playerId) return;
    this.resolveAnswer(playerId, correct);
  }

  resolveAnswer(playerId: string, correct: boolean) {
    const phase = this.data.state.phase;
    const players = this.data.state.players;
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    if (correct) {
      const delta = phase === "round2-question" ? (this.data.state.wagers[playerId] ?? 0) : 1;
      player.score += delta;
      this.setState({
        phase: phase === "round1-question" ? "round1-reveal" : "round2-reveal",
        buzz: { ...(this.data.state.buzz!), status: "reveal", answerCorrect: true },
        lastEvent: { kind: "correct", playerId, delta },
      });
      this.broadcast();
      this.queueTimer(
        () => (phase === "round1-question" ? this.nextRound1Question() : this.nextRound2Question()),
        REVEAL_MS
      );
    } else {
      if (phase === "round1-question") {
        const other = players.find((p) => p.id !== playerId && p.connected);
        if (other) {
          this.setState({
            buzz: {
              ...(this.data.state.buzz!),
              status: "buzzing",
              buzzedBy: null,
              buzzedAt: null,
              timerEndsAt: nowMs() + 4000,
              answerCorrect: null,
            },
            lastEvent: { kind: "wrong", playerId, delta: 0 },
          });
          this.broadcast();
          this.queueTimer(() => this.onTimerExpire(), 4000);
        } else {
          this.setState({
            phase: "round1-reveal",
            buzz: { ...(this.data.state.buzz!), status: "reveal", answerCorrect: false },
            lastEvent: { kind: "wrong", playerId, delta: 0 },
          });
          this.broadcast();
          this.queueTimer(() => this.nextRound1Question(), REVEAL_MS);
        }
      } else {
        const delta = -(this.data.state.wagers[playerId] ?? 0);
        player.score = Math.max(0, player.score + delta);
        this.setState({
          phase: "round2-reveal",
          buzz: { ...(this.data.state.buzz!), status: "reveal", answerCorrect: false },
          lastEvent: { kind: "wrong", playerId, delta },
        });
        this.broadcast();
        this.queueTimer(() => this.nextRound2Question(), REVEAL_MS);
      }
    }
  }

  onSetWager(playerId: string, amount: number) {
    if (this.data.state.phase !== "round2-wager") return;
    const player = this.data.state.players.find((p) => p.id === playerId);
    if (!player) return;
    const max = Math.max(1, player.score);
    const safe = Math.max(0, Math.min(max, Math.floor(amount)));
    this.data.state.wagers = { ...this.data.state.wagers, [playerId]: safe };
    this.broadcast();
    const players = this.data.state.players.filter((p) => p.connected);
    if (players.every((p) => this.data.state.wagers[p.id] !== undefined)) {
      this.clearTimers();
      this.queueTimer(() => this.beginRound2Question(), 800);
    }
  }

  onMinigameInput(playerId: string, payload: unknown) {
    const mg = this.data.state.minigame;
    if (!mg || mg.status !== "live" || this.data.state.phase !== "tiebreaker-play") return;
    const players = this.data.state.players;
    const idx = players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    const key = idx === 0 ? "p1" : "p2";
    if (mg.type === "reflex") {
      if (!mg.lightsOn) return;
      if (typeof payload === "object" && payload && (payload as { tap?: boolean }).tap) {
        this.setState({ minigame: { ...mg, taps: { ...mg.taps, [key]: mg.taps[key] + 1 } } });
        this.broadcast();
      }
    } else if (mg.type === "speed-sort") {
      const p = payload as { itemId: string; correct: boolean };
      if (!p) return;
      const newProgress = { ...mg.progress };
      if (p.correct) newProgress[key] = Math.min(mg.items.length, newProgress[key] + 1);
      this.setState({ minigame: { ...mg, progress: newProgress } });
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
      this.setState({ minigame: { ...mg, typed, finishedAt } });
      this.broadcast();
      if (finishedAt.p1 !== null || finishedAt.p2 !== null) {
        const done = Object.values(finishedAt).filter((v) => v !== null).length;
        if (done === 2) this.endMinigame();
      }
    }
  }

  onPlayAgain() {
    if (this.data.state.phase !== "final") return;
    this.clearTimers();
    for (const id of Object.keys(this.data.playersById)) {
      this.data.playersById[id].score = 0;
    }
    this.data.state.players = Object.values(this.data.playersById).filter((p) => p.connected);
    this.data.state = makeLobbyState(this.data.state.hostId, this.data.state.settings);
    this.data.state.players = Object.values(this.data.playersById).filter((p) => p.connected);
    this.data.photos = [];
    this.broadcast();
  }

  onConnect(conn: Party.Connection) {
    const payload = { ...this.data.state, photos: this.data.photos };
    conn.send(JSON.stringify({ type: "state", state: payload, youId: "" }));
  }

  onClose(conn: Party.Connection) {
    this.removePlayer(conn);
    this.broadcast();
  }

  async onMessage(message: string, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case "host-join":
        if (this.data.state.hostId && this.data.state.hostId !== this.data.connToPlayer[sender.id]) {
          sender.send(JSON.stringify({ type: "error", message: "Host already present" }));
          return;
        }
        this.addPlayer(sender, msg.name, true);
        this.broadcast();
        return;
      case "player-join":
        this.addPlayer(sender, msg.name, false);
        this.broadcast();
        return;
      case "start-game":
        if (this.data.connToPlayer[sender.id] !== this.data.state.hostId) return;
        await this.startGame(msg.settings, msg.photos);
        return;
      case "next-question":
        if (this.data.connToPlayer[sender.id] !== this.data.state.hostId) return;
        if (this.data.state.phase === "round1-reveal") this.nextRound1Question();
        else if (this.data.state.phase === "round2-reveal") this.nextRound2Question();
        else if (this.data.state.phase === "round2-wager") this.beginRound2Question();
        else if (this.data.state.phase === "round3-intro") this.startRound3();
        else if (this.data.state.phase === "round3-reveal") this.onRound3Next();
        else if (this.data.state.phase === "tiebreaker-intro") this.startTiebreaker();
        return;
      case "buzz": {
        const pid = this.data.connToPlayer[sender.id];
        if (!pid) return;
        this.onBuzz(pid);
        return;
      }
      case "answer": {
        const pid = this.data.connToPlayer[sender.id];
        if (!pid) return;
        this.onAnswer(pid, msg.correct);
        return;
      }
      case "set-wager": {
        const pid = this.data.connToPlayer[sender.id];
        if (!pid) return;
        this.onSetWager(pid, msg.amount);
        return;
      }
      case "play-again":
        if (this.data.connToPlayer[sender.id] !== this.data.state.hostId) return;
        this.onPlayAgain();
        return;
      case "minigame-start":
        if (this.data.connToPlayer[sender.id] !== this.data.state.hostId) return;
        this.startTiebreaker();
        return;
      case "minigame-input": {
        const pid = this.data.connToPlayer[sender.id];
        if (!pid) return;
        this.onMinigameInput(pid, msg.payload);
        return;
      }
      case "round3-guess": {
        const pid = this.data.connToPlayer[sender.id];
        if (!pid) return;
        this.onRound3Guess(pid, msg.where, msg.when);
        return;
      }
      case "round3-self-score": {
        const pid = this.data.connToPlayer[sender.id];
        if (!pid) return;
        this.onRound3SelfScore(pid, msg.where, msg.when);
        return;
      }
      case "round3-next": {
        if (this.data.connToPlayer[sender.id] !== this.data.state.hostId) return;
        this.onRound3Next();
        return;
      }
    }
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

async function fetchOpenTdb(count: number, difficulty: string): Promise<Question[]> {
  const url = `https://opentdb.com/api.php?amount=${count}&difficulty=${difficulty}&type=multiple&encode=url3986`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenTDB ${res.status}`);
  const data = (await res.json()) as { response_code: number; results: Array<{ category: string; question: string; correct_answer: string; incorrect_answers: string[] }> };
  if (data.response_code !== 0) throw new Error(`OpenTDB code ${data.response_code}`);
  return data.results.map((r, i) => {
    const correct = decode(decodeURIComponent(r.correct_answer));
    const incorrects = r.incorrect_answers.map((a) => decode(decodeURIComponent(a)));
    const options = shuffle([correct, ...incorrects]);
    return {
      id: `otdb-${i}-${Math.random().toString(36).slice(2, 6)}`,
      prompt: decode(decodeURIComponent(r.question)),
      options,
      correctIndex: options.indexOf(correct),
      category: decode(decodeURIComponent(r.category)),
      source: "opentdb" as const,
    };
  });
}

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&eacute;/g, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export { BuzzerServer };

function parseRoomId(url: URL): string | null {
  const m = url.pathname.match(/^\/parties\/[^/]+\/([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

// Wrap a PartyKit-style server in a Durable Object that exposes fetch().
class PartyDurable {
  private state: DurableObjectState;
  private env: Record<string, unknown>;
  private inner: BuzzerServer;
  private connByWs = new WeakMap<WebSocket, Party.Connection>();
  private messagesBound = new Set<WebSocket>();
  private partyRoom: Party.Room;

  constructor(state: DurableObjectState, env: Record<string, unknown>) {
    this.state = state;
    this.env = env;
    const roomId = state.id.toString();
    const doState = this.state;
    const self = this;
    this.partyRoom = {
      get id() {
        return roomId;
      },
      internalID: roomId,
      name: "main",
      env: {},
      storage: state.storage,
      blockConcurrencyWhile: state.blockConcurrencyWhile?.bind(state) ?? (async () => {}),
      broadcast: (msg: string) => {
        for (const ws of doState.getWebSockets()) {
          try {
            ws.send(msg);
          } catch {}
        }
      },
      getConnection: () => undefined,
      getConnections: function* (this: PartyDurable) {
        for (const ws of doState.getWebSockets()) yield self.wrap(ws);
      }.bind(self) as Party.Room["getConnections"],
      analytics: { writeDataPoint: () => {} },
      context: { parties: {}, vectorize: {}, ai: {}, assets: { fetch: async () => null }, bindings: { r2: {}, kv: {} } },
    } as unknown as Party.Room;
    this.inner = new BuzzerServer(this.partyRoom);
  }

  private wrap(ws: WebSocket): Party.Connection {
    let existing = this.connByWs.get(ws);
    if (existing) return existing;
    const connId = (ws as unknown as { _pkId?: string })._pkId ?? `${this.state.id}-${Math.random().toString(36).slice(2, 8)}`;
    (ws as unknown as { _pkId?: string })._pkId = connId;
    const conn = Object.assign(ws, {
      id: connId,
      socket: ws,
      uri: "",
      state: null,
      setState: function (s: unknown) {
        (this as unknown as { state: unknown }).state = s;
        return s;
      },
    }) as unknown as Party.Connection;
    this.connByWs.set(ws, conn);
    return conn;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Strip the leading /parties/main/<room> prefix
    const m = url.pathname.match(/^\/parties\/[^/]+\/[^/]+(\/.*)?$/);
    const innerPath = m?.[1] ?? "";
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      const conn = this.wrap(server);
      this.state.acceptWebSocket(server);
      const tags = (this.inner as unknown as { getConnectionTags?: (c: Party.Connection, ctx: { request: Request }) => string[] | Promise<string[]> }).getConnectionTags;
      if (typeof tags === "function") {
        try {
          await tags.call(this.inner, conn, { request });
        } catch {}
      }
      if (typeof this.inner.onConnect === "function") {
        try {
          await this.inner.onConnect(conn, { request });
        } catch (err) {
          console.error("onConnect error", err);
        }
      }
      // WS message/close handling is done via the webSocketMessage/webSocketClose
      // methods on this Durable Object class — don't add manual listeners here
      // because acceptWebSocket owns the lifecycle.
      return new Response(null, { status: 101, webSocket: client });
    }
    // HTTP — delegate to onRequest
    if (typeof this.inner.onRequest === "function") {
      const innerUrl = new URL(innerPath + url.search, url.origin);
      const innerReq = new Request(innerUrl.toString(), request);
      return await this.inner.onRequest(innerReq);
    }
    return new Response("OK", { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const conn = this.wrap(ws);
    if (typeof this.inner.onMessage === "function") {
      try {
        await this.inner.onMessage(message, conn);
      } catch (err) {
        console.error("onMessage error", err);
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean) {
    const conn = this.wrap(ws);
    if (typeof this.inner.onClose === "function") {
      try {
        await this.inner.onClose(conn);
      } catch (err) {
        console.error("onClose error", err);
      }
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    const conn = this.wrap(ws);
    if (typeof this.inner.onError === "function") {
      await this.inner.onError(conn, error as Error);
    }
  }
}

const defaultExport = {
  async fetch(request: Request, env: { PARTYKIT_DURABLE: DurableObjectNamespace }, ctx: ExecutionContext): Promise<Response> {
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

export default defaultExport;
export { PartyDurable };
