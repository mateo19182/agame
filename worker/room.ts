import type { Env } from "./env";
import type {
  GameSettings,
  GameState,
  MinigameInput,
  MinigameResult,
  MinigameState,
  Player,
  Question,
} from "@shared/game";
import { mergeSettings } from "@shared/game";
import { fetchTriviaQuestions } from "./trivia";
import {
  IDLE_CLEANUP_MS,
  MEMORY_LANE_ANSWER_MS,
  MEMORY_LANE_REVEAL_MS,
  POST_MINIGAME_MS,
  PLAYER_COLORS,
  SPEED_SORT_MS,
  STEAL_WINDOW_MS,
  TRIVIA_ANSWER_MS,
  TRIVIA_BUZZ_RAPID_MS,
  TRIVIA_BUZZ_WAGER_MS,
  TRIVIA_REVEAL_MS,
  TRIVIA_WAGER_MS,
  TYPE_RACE_MS,
  computeResultDeltas,
  determineWinner,
  makeMemoryLaneState,
  makeReflexState,
  makeSpeedSortState,
  makeTypeRaceState,
  newBuzz,
  nowMs,
  pickNextMinigame,
  slotsFrom,
} from "./minigames";

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
    settings,
  };
}

function defaultRoomData(): RoomData {
  return {
    state: makeLobbyState(mergeSettings(undefined)),
    playersById: {},
    questionsRef: { trivia: [] },
    minigameScoresAtStart: {},
    playerIdCounter: 0,
    dirty: false,
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
    if (existing) return; // a live timer already owns the alarm slot
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
    const state = this.data.state;
    const mg = state.minigame;

    // Don't leak the answer key: mask every question's correctIndex except the
    // one currently being revealed. (Photos are just R2 keys, safe to send.)
    if (mg && mg.id === "trivia") {
      const revealIndex = mg.phase === "reveal" ? mg.questionIndex : -1;
      const questions = mg.questions.map((q, i) => (i === revealIndex ? q : { ...q, correctIndex: -1 }));
      return { ...state, minigame: { ...mg, questions } };
    }

    return { ...state };
  }

  private sendTo(ws: WebSocket, payload: unknown) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // socket already closing; ignore
    }
  }

  private sendError(ws: WebSocket, message: string, code?: "rejoin-failed") {
    this.sendTo(ws, { type: "error", message, code });
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

  // Is another live connection already acting as the controller (big screen)?
  // Works for both host modes: a scoreboard-only host has no playerId, so we
  // can't rely on `hostId` — we check the per-connection `isHost` flag instead.
  private hasOtherController(self: WebSocket): boolean {
    for (const ws of this.state.getWebSockets()) {
      if (ws === self) continue;
      const meta = ws.deserializeAttachment() as ConnMeta | null;
      if (meta?.isHost) return true;
    }
    return false;
  }

  private refreshPlayersList() {
    this.data.state.players = this.connectedPlayers();
  }

  private snapshotScores() {
    const snap: Record<string, number> = {};
    for (const p of Object.values(this.data.playersById)) snap[p.id] = p.score;
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
    const slots = slotsFrom(this.connectedPlayers());
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
            // Disable trivia for the rest of the match so we don't loop on the
            // same failure, then move on to the next minigame.
            this.data.state.settings.enabledMinigames =
              this.data.state.settings.enabledMinigames.filter((m) => m !== "trivia");
            this.data.state.currentMinigame = null;
            this.commit({ minigame: null, minigameResult: null, settings: this.data.state.settings });
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
      case "memory-lane":
        state = makeMemoryLaneState(this.data.state.settings.minigames["memory-lane"]);
        break;
      case "reflex":
        state = makeReflexState(slots);
        break;
      case "speed-sort":
        state = makeSpeedSortState(this.data.state.settings.minigames["speed-sort"], slots);
        break;
      case "type-race":
        state = makeTypeRaceState(slots);
        break;
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
      case "memory-lane":
        void this.scheduleAlarm({ kind: "memory-lane-answer" }, MEMORY_LANE_ANSWER_MS);
        return;
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
    const winnerId = determineWinner(mg);
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
      scoreDeltas: computeResultDeltas(this.data.state.players, this.data.minigameScoresAtStart),
    };
    this.commit({
      phase: "minigame-end",
      minigameResult: result,
      playedMinigames: this.data.state.playedMinigames,
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
    const buzz = {
      ...mg.buzz,
      buzzedBy: playerId,
      buzzedAt: nowMs(),
      status: "answering" as const,
      timerEndsAt: nowMs() + TRIVIA_ANSWER_MS,
    };
    this.commit({ minigame: { ...mg, phase: "answering", buzz } });
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
      { minigame: { ...mg, wagers: { ...mg.wagers, [playerId]: safe } } },
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
      minigame: { ...mg, phase: "reveal", timerEndsAt: nowMs() + MEMORY_LANE_REVEAL_MS },
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
      { minigame: { ...mg, guesses: { ...mg.guesses, [playerId]: { where, when } } } },
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
      { minigame: { ...mg, selfScored: { ...mg.selfScored, [playerId]: { where, when } } } },
      { skipSave: true }
    );
    this.broadcast();
    const players = this.connectedPlayers();
    if (players.every((p) => mg.selfScored[p.id])) {
      void this.clearAlarm();
      this.endMemoryLanePhoto();
    }
  }

  // ─── Generic minigame input ────────────────────────────────────────────

  private onMinigameInput(playerId: string, input: MinigameInput) {
    const mg = this.data.state.minigame;
    if (!mg) return;

    switch (input.kind) {
      case "trivia-answer": {
        if (mg.id !== "trivia" || mg.phase !== "answering" || !mg.buzz || mg.buzz.buzzedBy !== playerId) return;
        const q = mg.questions[mg.questionIndex];
        // Resolve correctness on the server — never trust a client-sent boolean.
        const correct = !!q && input.answerIndex === q.correctIndex;
        this.resolveTriviaAnswer(playerId, correct);
        return;
      }
      case "trivia-wager":
        this.onSetWager(playerId, input.amount);
        return;
      case "memory-lane-guess":
        this.onMemoryLaneGuess(playerId, input.where, input.when);
        return;
      case "memory-lane-score":
        this.onMemoryLaneScore(playerId, input.where, input.when);
        return;
      case "memory-lane-next": {
        if (mg.id !== "memory-lane" || mg.phase !== "reveal") return;
        void this.clearAlarm();
        this.endMemoryLanePhoto();
        return;
      }
      case "reflex-tap": {
        if (mg.id !== "reflex" || !mg.lightsOn || mg.status !== "live") return;
        const key = this.slotKey(mg, playerId);
        if (!key) return;
        this.commit({ minigame: { ...mg, taps: { ...mg.taps, [key]: mg.taps[key] + 1 } } }, { skipSave: true });
        this.broadcast();
        return;
      }
      case "speed-sort-place": {
        if (mg.id !== "speed-sort" || mg.status !== "live") return;
        const key = this.slotKey(mg, playerId);
        if (!key) return;
        const item = mg.items.find((it) => it.id === input.itemId);
        if (!item) return;
        const newProgress = { ...mg.progress };
        if (input.correct) newProgress[key] = Math.min(mg.items.length, newProgress[key] + 1);
        this.commit({ minigame: { ...mg, progress: newProgress } }, { skipSave: true });
        this.broadcast();
        if (newProgress.p1 >= mg.items.length || newProgress.p2 >= mg.items.length) {
          this.endMinigame();
        }
        return;
      }
      case "type-race-typed": {
        if (mg.id !== "type-race" || mg.status !== "live") return;
        const key = this.slotKey(mg, playerId);
        if (!key) return;
        const typed = { ...mg.typed, [key]: input.text };
        const finishedAt = { ...mg.finishedAt };
        if (input.text === mg.prompt && finishedAt[key] === null) finishedAt[key] = nowMs();
        this.commit({ minigame: { ...mg, typed, finishedAt } }, { skipSave: true });
        this.broadcast();
        if (finishedAt.p1 !== null && finishedAt.p2 !== null) this.endMinigame();
        return;
      }
    }
  }

  // Which fixed slot a player occupies in a head-to-head minigame, or null if
  // they aren't one of the two competitors.
  private slotKey(mg: MinigameState, playerId: string): "p1" | "p2" | null {
    if (mg.id !== "reflex" && mg.id !== "speed-sort" && mg.id !== "type-race") return null;
    if (mg.slots.p1 === playerId) return "p1";
    if (mg.slots.p2 === playerId) return "p2";
    return null;
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
    const player: Player = { id, name: trimmed, score: 0, color, isHost, connected: true };
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
    // Fresh trivia questions for the rematch instead of replaying the same set.
    this.data.questionsRef.trivia = [];
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
    let msg: import("@shared/game").ClientMessage;
    try {
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case "host-join":
        if (meta.isHost) return;
        if (this.hasOtherController(ws)) {
          this.sendError(ws, "Host already present");
          return;
        }
        if (msg.asPlayer) {
          this.addPlayer(ws, msg.name, true);
        } else {
          ws.serializeAttachment({ playerId: null, isHost: true } satisfies ConnMeta);
        }
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
          this.sendError(ws, "Session expired — rejoining fresh", "rejoin-failed");
          return;
        }
        this.broadcast();
        return;
      }
      case "start-game":
        if (!meta.isHost) return;
        await this.startGame(msg.settings);
        return;
      case "next-question":
        if (!meta.isHost) return;
        this.onHostNext();
        return;
      case "buzz":
        if (meta.playerId) this.onBuzz(meta.playerId);
        return;
      case "minigame-skip":
        if (!meta.isHost) return;
        this.onHostSkip();
        return;
      case "minigame-input":
        if (meta.playerId) this.onMinigameInput(meta.playerId, msg.payload);
        return;
      case "play-again":
        if (!meta.isHost) return;
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
    } catch {
      // already closed
    }
  }
}
