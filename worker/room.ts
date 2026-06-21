import type { Env } from "./env";
import type {
  BalloonState,
  DoubtGem,
  ECardKind,
  GameSettings,
  GameState,
  MinigameInput,
  MinigameResult,
  MinigameState,
  Player,
  QuizRaceState,
  Question,
} from "@shared/game";
import { isQuizRaceId, mergeSettings } from "@shared/game";
import { fetchTriviaQuestions } from "./trivia";
import {
  BALLOON_MAX_SIZE,
  BALLOON_MS,
  COLOR_LIE_MS,
  DOUBT_CALL_MS,
  DOUBT_CLAIM_MS,
  DOUBT_GEMS,
  DOUBT_REVEAL_MS,
  ECARD_PLAY_MS,
  ECARD_REVEAL_MS,
  IDLE_CLEANUP_MS,
  MEMORY_LANE_ANSWER_MS,
  MEMORY_LANE_REVEAL_MS,
  MIRROR_MS,
  NUMBER_RUSH_MS,
  POST_MINIGAME_MS,
  PLAYER_COLORS,
  QUIZ_RACE_MS,
  RPS_CHOOSE_MS,
  RPS_REVEAL_MS,
  SPEED_SORT_MS,
  STEAL_WINDOW_MS,
  TOWER_CONFESS_MS,
  TOWER_READ_MS,
  TOWER_REVEAL_MS,
  TRIVIA_ANSWER_MS,
  TRIVIA_BUZZ_RAPID_MS,
  TRIVIA_BUZZ_WAGER_MS,
  TRIVIA_REVEAL_MS,
  TRIVIA_WAGER_MS,
  TYPE_RACE_MS,
  WHACK_MS,
  balloonPopChance,
  computeResultDeltas,
  dealECardGame,
  determineWinner,
  doubtTellerSlot,
  makeBalloonState,
  makeColorLieState,
  makeConfessionState,
  makeDoubtState,
  makeECardState,
  makeMemoryLaneState,
  makeMirrorMatchState,
  makeNumberRushState,
  makeQuizRaceState,
  makeReflexState,
  makeRpsState,
  makeSpeedSortState,
  makeTypeRaceState,
  makeWhackState,
  newBuzz,
  nowMs,
  pickNextMinigame,
  randomGem,
  resolveECardTurn,
  rpsRoundWinner,
  slotsFrom,
  towerConfessorSlot,
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
  | { kind: "rps-choose-timeout"; round: number }
  | { kind: "rps-reveal-next"; round: number }
  | { kind: "ecard-play-timeout"; game: number; turn: number }
  | { kind: "ecard-reveal-next"; game: number; turn: number }
  | { kind: "tower-confess-timeout"; round: number }
  | { kind: "tower-read-timeout"; round: number }
  | { kind: "tower-reveal-next"; round: number }
  | { kind: "doubt-claim-timeout"; round: number }
  | { kind: "doubt-call-timeout"; round: number }
  | { kind: "doubt-reveal-next"; round: number }
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
      case "rps-choose-timeout":
        this.onRpsChooseTimeout(spec.round);
        break;
      case "rps-reveal-next":
        this.onRpsRevealNext(spec.round);
        break;
      case "ecard-play-timeout":
        this.onECardPlayTimeout(spec.game, spec.turn);
        break;
      case "ecard-reveal-next":
        this.onECardRevealNext(spec.game, spec.turn);
        break;
      case "tower-confess-timeout":
        this.onTowerConfessTimeout(spec.round);
        break;
      case "tower-read-timeout":
        this.onTowerReadTimeout(spec.round);
        break;
      case "tower-reveal-next":
        this.onTowerRevealNext(spec.round);
        break;
      case "doubt-claim-timeout":
        this.onDoubtClaimTimeout(spec.round);
        break;
      case "doubt-call-timeout":
        this.onDoubtCallTimeout(spec.round);
        break;
      case "doubt-reveal-next":
        this.onDoubtRevealNext(spec.round);
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

  // Build the state to send to one viewer. `viewerId` is the recipient's
  // playerId (null for spectators / the host scoreboard). Hidden-information
  // games mask secrets per viewer so only the player who "owns" a secret sees it.
  private publicState(viewerId: string | null = null): GameState {
    const state = this.data.state;
    const mg = state.minigame;
    if (!mg) return { ...state };

    // Don't leak the answer key: mask every question's correctIndex except the
    // one currently being revealed. (Photos are just R2 keys, safe to send.)
    if (mg.id === "trivia") {
      const revealIndex = mg.phase === "reveal" ? mg.questionIndex : -1;
      const questions = mg.questions.map((q, i) => (i === revealIndex ? q : { ...q, correctIndex: -1 }));
      return { ...state, minigame: { ...mg, questions } };
    }

    // Quiz-race: never ship the answer key to clients.
    if (isQuizRaceId(mg.id)) {
      const q = mg as QuizRaceState;
      const rounds = q.rounds.map((r) => ({ ...r, correctIndex: -1 }));
      return { ...state, minigame: { ...q, rounds } };
    }

    const viewerKey =
      "slots" in mg && viewerId
        ? mg.slots.p1 === viewerId
          ? "p1"
          : mg.slots.p2 === viewerId
            ? "p2"
            : null
        : null;

    if (mg.id === "e-card") {
      // Hide each player's face-down card from the opponent until reveal.
      const played =
        mg.phase === "reveal"
          ? mg.played
          : {
              p1: viewerKey === "p1" ? mg.played.p1 : null,
              p2: viewerKey === "p2" ? mg.played.p2 : null,
            };
      // Only ship a hand to its owner: the cards left would otherwise reveal the
      // face-down play by elimination (e.g. "Emperor still in hand → they played
      // a Citizen"). The opponent/host views never render the other's hand.
      const hands = {
        p1: viewerKey === "p1" ? mg.hands.p1 : [],
        p2: viewerKey === "p2" ? mg.hands.p2 : [],
      };
      return { ...state, minigame: { ...mg, played, hands } };
    }

    if (mg.id === "tower") {
      // Only the confessor (the one who set it) sees the secret before reveal.
      const showSecret = mg.phase === "reveal" || viewerKey === mg.confessorSlot;
      return { ...state, minigame: { ...mg, secret: showSecret ? mg.secret : null } };
    }

    if (mg.id === "doubt") {
      // Only the teller sees the gem before reveal.
      const showSecret = mg.phase === "reveal" || viewerKey === mg.tellerSlot;
      return { ...state, minigame: { ...mg, secret: showSecret ? mg.secret : null } };
    }

    if (mg.id === "color-lie") {
      // Mask the answer key; the revealed prompt's answer rides in lastResult.
      const rounds = mg.rounds.map((r) => ({ ...r, correctIndex: -1 }));
      return { ...state, minigame: { ...mg, rounds } };
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
    for (const ws of this.state.getWebSockets()) {
      const meta = ws.deserializeAttachment() as ConnMeta | null;
      const youId = meta?.playerId ?? "";
      this.sendTo(ws, { type: "state", state: this.publicState(meta?.playerId ?? null), youId });
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
    try {
      void this.clearAlarm();
      this.data.state.settings = mergeSettings(settings);
      await this.beginNextMinigame();
    } finally {
      // Always release the lock, even if beginNextMinigame throws — otherwise
      // the room could never be started again.
      await this.state.storage.delete("starting");
    }
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
    // The intro waits for the host to advance, so no live timer owns the alarm
    // slot here. If everyone has already left, arm idle-cleanup now — otherwise
    // the room would sit orphaned (no further webSocketClose will fire).
    if (this.connectedPlayers().length === 0) await this.maybeScheduleIdleCleanup();
  }

  private async startActiveMinigame() {
    const id = this.data.state.currentMinigame;
    if (!id) return;
    const players = this.connectedPlayers();
    if (players.length < 2) {
      // A player dropped during the intro — don't build slots from a short list
      // (slotsFrom would throw). Stay parked so the host can retry on rejoin.
      this.broadcastError("Need 2 players to continue");
      return;
    }
    const slots = slotsFrom(players);
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
      case "math-duel":
      case "stroop":
      case "odd-one-out":
      case "emoji-decode":
      case "flag-quiz":
      case "word-match":
      case "true-false":
      case "compare":
        state = makeQuizRaceState(id, slots);
        break;
      case "whack":
        state = makeWhackState(slots);
        break;
      case "number-rush":
        state = makeNumberRushState(slots);
        break;
      case "rps":
        state = makeRpsState(slots);
        break;
      case "balloon":
        state = makeBalloonState(slots);
        break;
      case "e-card":
        state = makeECardState(slots);
        break;
      case "tower":
        state = makeConfessionState(slots);
        break;
      case "mirror-match":
        state = makeMirrorMatchState(slots);
        break;
      case "doubt":
        state = makeDoubtState(slots);
        break;
      case "color-lie":
        state = makeColorLieState(slots);
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
      case "math-duel":
      case "stroop":
      case "odd-one-out":
      case "emoji-decode":
      case "flag-quiz":
      case "word-match":
      case "true-false":
      case "compare": {
        this.commit({
          minigame: { ...mg, startedAt: nowMs(), duration: QUIZ_RACE_MS, status: "live" },
        });
        this.broadcast();
        void this.scheduleAlarm({ kind: "minigame-end-timer" }, QUIZ_RACE_MS);
        return;
      }
      case "whack": {
        this.commit({
          minigame: { ...mg, startedAt: nowMs(), duration: WHACK_MS, status: "live" },
        });
        this.broadcast();
        void this.scheduleAlarm({ kind: "minigame-end-timer" }, WHACK_MS);
        return;
      }
      case "number-rush": {
        this.commit({
          minigame: { ...mg, startedAt: nowMs(), duration: NUMBER_RUSH_MS, status: "live" },
        });
        this.broadcast();
        void this.scheduleAlarm({ kind: "minigame-end-timer" }, NUMBER_RUSH_MS);
        return;
      }
      case "balloon": {
        this.commit({
          minigame: { ...mg, startedAt: nowMs(), duration: BALLOON_MS, status: "live" },
        });
        this.broadcast();
        void this.scheduleAlarm({ kind: "minigame-end-timer" }, BALLOON_MS);
        return;
      }
      case "rps": {
        this.commit({ minigame: { ...mg, status: "live", phase: "choosing" } });
        this.broadcast();
        void this.scheduleAlarm({ kind: "rps-choose-timeout", round: mg.round }, RPS_CHOOSE_MS);
        return;
      }
      case "e-card": {
        this.broadcast();
        void this.scheduleAlarm({ kind: "ecard-play-timeout", game: mg.game, turn: mg.turn }, ECARD_PLAY_MS);
        return;
      }
      case "tower": {
        this.broadcast();
        void this.scheduleAlarm({ kind: "tower-confess-timeout", round: mg.round }, TOWER_CONFESS_MS);
        return;
      }
      case "doubt": {
        this.broadcast();
        void this.scheduleAlarm({ kind: "doubt-claim-timeout", round: mg.round }, DOUBT_CLAIM_MS);
        return;
      }
      case "mirror-match": {
        this.commit({
          minigame: { ...mg, startedAt: nowMs(), duration: MIRROR_MS, status: "live" },
        });
        this.broadcast();
        void this.scheduleAlarm({ kind: "minigame-end-timer" }, MIRROR_MS);
        return;
      }
      case "color-lie": {
        this.commit({
          minigame: { ...mg, startedAt: nowMs(), duration: COLOR_LIE_MS, status: "live" },
        });
        this.broadcast();
        void this.scheduleAlarm({ kind: "minigame-end-timer" }, COLOR_LIE_MS);
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

  // ─── Rock-paper-scissors flow ──────────────────────────────────────────

  private onRpsChoose(playerId: string, choice: import("@shared/game").RpsChoice) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "rps" || mg.phase !== "choosing" || mg.status !== "live") return;
    const key = this.slotKey(mg, playerId);
    if (!key) return;
    if (mg.choices[key]) return; // locked in for this round
    const choices = { ...mg.choices, [key]: choice };
    this.commit({ minigame: { ...mg, choices } }, { skipSave: true });
    this.broadcast();
    if (choices.p1 && choices.p2) {
      void this.clearAlarm();
      this.resolveRpsRound();
    }
  }

  private onRpsChooseTimeout(round: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "rps" || mg.phase !== "choosing" || mg.round !== round) return;
    // Anyone who didn't pick forfeits the round with a null choice.
    this.resolveRpsRound();
  }

  private resolveRpsRound() {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "rps") return;
    const winner = rpsRoundWinner(mg.choices.p1, mg.choices.p2);
    const wins = { ...mg.wins };
    if (winner) wins[winner] += 1;
    const need = Math.floor(mg.bestOf / 2) + 1;
    const roundsPlayed = mg.round + 1;
    const decided = wins.p1 >= need || wins.p2 >= need || roundsPlayed >= mg.bestOf;
    this.commit({
      minigame: {
        ...mg,
        wins,
        phase: "reveal",
        reveal: {
          p1: mg.choices.p1 ?? "rock",
          p2: mg.choices.p2 ?? "rock",
          winner,
        },
        winnerId: decided
          ? wins.p1 > wins.p2
            ? mg.slots.p1
            : wins.p2 > wins.p1
              ? mg.slots.p2
              : null
          : null,
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "rps-reveal-next", round: mg.round }, RPS_REVEAL_MS);
  }

  private onRpsRevealNext(round: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "rps" || mg.phase !== "reveal" || mg.round !== round) return;
    const need = Math.floor(mg.bestOf / 2) + 1;
    const roundsPlayed = mg.round + 1;
    if (mg.wins.p1 >= need || mg.wins.p2 >= need || roundsPlayed >= mg.bestOf) {
      this.endMinigame();
      return;
    }
    const nextRound = mg.round + 1;
    this.commit({
      minigame: { ...mg, round: nextRound, phase: "choosing", choices: { p1: null, p2: null }, reveal: null },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "rps-choose-timeout", round: nextRound }, RPS_CHOOSE_MS);
  }

  // ─── E-Card flow ───────────────────────────────────────────────────────
  private onECardPlay(playerId: string, card: ECardKind) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "e-card" || mg.phase !== "playing" || mg.status !== "live") return;
    const key = this.slotKey(mg, playerId);
    if (!key || mg.locked[key]) return;
    const hand = mg.hands[key];
    const idx = hand.indexOf(card);
    if (idx === -1) return; // card not in hand
    const newHand = hand.slice();
    newHand.splice(idx, 1);
    const locked = { ...mg.locked, [key]: true };
    this.commit(
      {
        minigame: {
          ...mg,
          played: { ...mg.played, [key]: card },
          locked,
          hands: { ...mg.hands, [key]: newHand },
        },
      },
      { skipSave: true }
    );
    this.broadcast();
    if (locked.p1 && locked.p2) {
      void this.clearAlarm();
      this.resolveECardSet();
    }
  }

  private onECardPlayTimeout(game: number, turn: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "e-card" || mg.phase !== "playing" || mg.game !== game || mg.turn !== turn) return;
    // Auto-play for anyone who stalled: prefer a citizen, else the first card.
    const played = { ...mg.played };
    const locked = { ...mg.locked };
    const hands = { p1: mg.hands.p1.slice(), p2: mg.hands.p2.slice() };
    for (const key of ["p1", "p2"] as const) {
      if (locked[key]) continue;
      const hand = hands[key];
      if (hand.length === 0) continue;
      const ci = hand.indexOf("citizen");
      const idx = ci !== -1 ? ci : 0;
      played[key] = hand[idx];
      locked[key] = true;
      hand.splice(idx, 1);
    }
    this.data.state.minigame = { ...mg, played, locked, hands };
    this.resolveECardSet();
  }

  private resolveECardSet() {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "e-card") return;
    const slaveSlot = mg.emperorSlot === "p1" ? "p2" : "p1";
    const emperorCard = mg.played[mg.emperorSlot] ?? "citizen";
    const slaveCard = mg.played[slaveSlot] ?? "citizen";
    const outcome = resolveECardTurn(emperorCard, slaveCard);
    this.commit({
      minigame: { ...mg, phase: "reveal", reveal: { emperor: emperorCard, slave: slaveCard, outcome } },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "ecard-reveal-next", game: mg.game, turn: mg.turn }, ECARD_REVEAL_MS);
  }

  private onECardRevealNext(game: number, turn: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "e-card" || mg.phase !== "reveal" || mg.game !== game || mg.turn !== turn) return;
    const reveal = mg.reveal!;
    const slaveSlot = mg.emperorSlot === "p1" ? "p2" : "p1";
    const handsEmpty = mg.hands.p1.length === 0 && mg.hands.p2.length === 0;

    // A draw with cards left → keep playing the same sub-game.
    if (reveal.outcome === "draw" && !handsEmpty) {
      const nextTurn = mg.turn + 1;
      this.commit({
        minigame: {
          ...mg,
          turn: nextTurn,
          phase: "playing",
          played: { p1: null, p2: null },
          locked: { p1: false, p2: false },
          reveal: null,
        },
      });
      this.broadcast();
      void this.scheduleAlarm({ kind: "ecard-play-timeout", game: mg.game, turn: nextTurn }, ECARD_PLAY_MS);
      return;
    }

    // Award the sub-game: Emperor win = 1, Slave upset = 2. (Exhausted → Emperor.)
    const points = { ...mg.points };
    if (reveal.outcome === "slave-win") points[slaveSlot] += 2;
    else points[mg.emperorSlot] += 1;

    if (mg.game + 1 >= mg.totalGames) {
      this.commit({ minigame: { ...mg, points } });
      this.endMinigame();
      return;
    }
    const deal = dealECardGame(mg.emperorSlot === "p1" ? "p2" : "p1");
    this.commit({
      minigame: {
        ...mg,
        game: mg.game + 1,
        turn: 0,
        emperorSlot: deal.emperorSlot,
        hands: deal.hands,
        played: { p1: null, p2: null },
        locked: { p1: false, p2: false },
        reveal: null,
        phase: "playing",
        points,
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "ecard-play-timeout", game: mg.game + 1, turn: 0 }, ECARD_PLAY_MS);
  }

  // ─── Tower of Confession flow ──────────────────────────────────────────
  private onTowerConfess(playerId: string, value: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "tower" || mg.phase !== "confess" || mg.status !== "live") return;
    if (this.slotKey(mg, playerId) !== mg.confessorSlot) return;
    const secret = Math.max(0, Math.min(9, Math.floor(value)));
    void this.clearAlarm();
    this.commit({ minigame: { ...mg, secret, phase: "read" } });
    this.broadcast();
    void this.scheduleAlarm({ kind: "tower-read-timeout", round: mg.round }, TOWER_READ_MS);
  }

  private onTowerConfessTimeout(round: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "tower" || mg.phase !== "confess" || mg.round !== round) return;
    const secret = Math.floor(Math.random() * 10);
    this.commit({ minigame: { ...mg, secret, phase: "read" } });
    this.broadcast();
    void this.scheduleAlarm({ kind: "tower-read-timeout", round: mg.round }, TOWER_READ_MS);
  }

  private onTowerRead(playerId: string, value: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "tower" || mg.phase !== "read" || mg.status !== "live") return;
    const readerSlot = mg.confessorSlot === "p1" ? "p2" : "p1";
    if (this.slotKey(mg, playerId) !== readerSlot) return;
    void this.clearAlarm();
    this.resolveTowerRound(Math.max(0, Math.min(9, Math.floor(value))));
  }

  private onTowerReadTimeout(round: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "tower" || mg.phase !== "read" || mg.round !== round) return;
    // Reader stalled → worst possible guess (max gap from the secret).
    const secret = mg.secret ?? 0;
    this.resolveTowerRound(secret <= 4 ? 9 : 0);
  }

  private resolveTowerRound(guess: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "tower") return;
    const secret = mg.secret ?? 0;
    const readerSlot = mg.confessorSlot === "p1" ? "p2" : "p1";
    const gap = Math.abs(secret - guess);
    const readerGain = 9 - gap; // closer reads score more
    const confessorGain = gap; // a well-hidden secret rewards the confessor
    const points = { ...mg.points };
    points[readerSlot] += readerGain;
    points[mg.confessorSlot] += confessorGain;
    this.commit({
      minigame: {
        ...mg,
        guess,
        phase: "reveal",
        points,
        lastResult: { secret, guess, gap, readerGain, confessorGain },
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "tower-reveal-next", round: mg.round }, TOWER_REVEAL_MS);
  }

  private onTowerRevealNext(round: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "tower" || mg.phase !== "reveal" || mg.round !== round) return;
    if (mg.round + 1 >= mg.totalRounds) {
      this.endMinigame();
      return;
    }
    const nextRound = mg.round + 1;
    this.commit({
      minigame: {
        ...mg,
        round: nextRound,
        confessorSlot: towerConfessorSlot(nextRound),
        secret: null,
        guess: null,
        phase: "confess",
        lastResult: null,
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "tower-confess-timeout", round: nextRound }, TOWER_CONFESS_MS);
  }

  // ─── Doubt flow ────────────────────────────────────────────────────────
  private onDoubtClaim(playerId: string, gem: DoubtGem) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "doubt" || mg.phase !== "claim" || mg.status !== "live") return;
    if (this.slotKey(mg, playerId) !== mg.tellerSlot) return;
    if (!DOUBT_GEMS.includes(gem)) return;
    void this.clearAlarm();
    this.commit({ minigame: { ...mg, claim: gem, phase: "call" } });
    this.broadcast();
    void this.scheduleAlarm({ kind: "doubt-call-timeout", round: mg.round }, DOUBT_CALL_MS);
  }

  private onDoubtClaimTimeout(round: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "doubt" || mg.phase !== "claim" || mg.round !== round) return;
    // Teller stalled → claim the truth.
    this.commit({ minigame: { ...mg, claim: mg.secret, phase: "call" } });
    this.broadcast();
    void this.scheduleAlarm({ kind: "doubt-call-timeout", round: mg.round }, DOUBT_CALL_MS);
  }

  private onDoubtCall(playerId: string, doubt: boolean) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "doubt" || mg.phase !== "call" || mg.status !== "live") return;
    const callerSlot = mg.tellerSlot === "p1" ? "p2" : "p1";
    if (this.slotKey(mg, playerId) !== callerSlot) return;
    void this.clearAlarm();
    this.resolveDoubtRound(doubt);
  }

  private onDoubtCallTimeout(round: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "doubt" || mg.phase !== "call" || mg.round !== round) return;
    this.resolveDoubtRound(false); // stalled → trust
  }

  private resolveDoubtRound(doubted: boolean) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "doubt") return;
    const callerSlot = mg.tellerSlot === "p1" ? "p2" : "p1";
    const secret = mg.secret ?? "ruby";
    const claim = mg.claim ?? secret;
    const lie = claim !== secret;
    const callerWon = doubted === lie; // doubt a lie, or trust the truth → caller wins
    const scores = { ...mg.scores };
    if (callerWon) scores[callerSlot] += 1;
    else scores[mg.tellerSlot] += 1;
    this.commit({
      minigame: {
        ...mg,
        doubted,
        phase: "reveal",
        scores,
        lastResult: { secret, claim, lie, doubted, callerWon },
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "doubt-reveal-next", round: mg.round }, DOUBT_REVEAL_MS);
  }

  private onDoubtRevealNext(round: number) {
    const mg = this.data.state.minigame;
    if (!mg || mg.id !== "doubt" || mg.phase !== "reveal" || mg.round !== round) return;
    if (mg.round + 1 >= mg.totalRounds) {
      this.endMinigame();
      return;
    }
    const nextRound = mg.round + 1;
    this.commit({
      minigame: {
        ...mg,
        round: nextRound,
        tellerSlot: doubtTellerSlot(nextRound),
        secret: randomGem(),
        claim: null,
        doubted: null,
        phase: "claim",
        lastResult: null,
      },
    });
    this.broadcast();
    void this.scheduleAlarm({ kind: "doubt-claim-timeout", round: nextRound }, DOUBT_CLAIM_MS);
  }

  private endMinigame() {
    const mg = this.data.state.minigame;
    if (!mg) return;
    void this.clearAlarm();
    let winnerId: string | null;
    if (mg.id === "balloon") {
      // Balloon scores live (banking adds points, a pop subtracts them), so the
      // winner is whoever netted more this round — no extra flat point.
      winnerId = this.balloonNetWinner(mg);
    } else {
      winnerId = determineWinner(mg);
      if (winnerId) {
        const stored = this.data.playersById[winnerId];
        if (stored) stored.score += 1;
        this.refreshPlayersList();
      }
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

  // Balloon winner = whoever gained the most score this round (banked minus
  // popped), read from the start-of-round snapshot.
  private balloonNetWinner(mg: BalloonState): string | null {
    const start = this.data.minigameScoresAtStart;
    const net = (id: string) => (this.data.playersById[id]?.score ?? 0) - (start[id] ?? 0);
    const d1 = net(mg.slots.p1);
    const d2 = net(mg.slots.p2);
    if (d1 > d2) return mg.slots.p1;
    if (d2 > d1) return mg.slots.p2;
    return null;
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
      case "quiz-answer": {
        if (!isQuizRaceId(mg.id)) return;
        const q = mg as QuizRaceState;
        if (q.status !== "live") return;
        const key = this.slotKey(q, playerId);
        if (!key) return;
        const idx = q.progress[key];
        const round = q.rounds[idx];
        if (!round) return; // ran out of questions (shouldn't happen within the timer)
        const isCorrect = input.index === round.correctIndex;
        const correct = { ...q.correct };
        if (isCorrect) correct[key] += 1;
        this.commit(
          {
            minigame: {
              ...q,
              progress: { ...q.progress, [key]: idx + 1 },
              correct,
              lastCorrect: { ...q.lastCorrect, [key]: isCorrect },
            },
          },
          { skipSave: true }
        );
        this.broadcast();
        return;
      }
      case "whack-tap": {
        if (mg.id !== "whack" || mg.status !== "live") return;
        const key = this.slotKey(mg, playerId);
        if (!key) return;
        // Only a tap on the player's current mole cell counts.
        if (mg.sequence[mg.progress[key]] !== input.cell) return;
        this.commit(
          { minigame: { ...mg, progress: { ...mg.progress, [key]: mg.progress[key] + 1 } } },
          { skipSave: true }
        );
        this.broadcast();
        return;
      }
      case "number-rush-tap": {
        if (mg.id !== "number-rush" || mg.status !== "live") return;
        const key = this.slotKey(mg, playerId);
        if (!key) return;
        // The next number a player needs is progress+1; ignore anything else.
        if (input.value !== mg.progress[key] + 1) return;
        const next = mg.progress[key] + 1;
        this.commit(
          { minigame: { ...mg, progress: { ...mg.progress, [key]: next } } },
          { skipSave: true }
        );
        this.broadcast();
        if (next >= mg.size) this.endMinigame();
        return;
      }
      case "rps-choose":
        this.onRpsChoose(playerId, input.choice);
        return;
      case "balloon-pump": {
        if (mg.id !== "balloon" || mg.status !== "live") return;
        const key = this.slotKey(mg, playerId);
        if (!key) return;
        const popped = Math.random() < balloonPopChance(mg.size[key]);
        if (popped) {
          // A pop costs the un-banked size off the player's real score.
          const lost = mg.size[key];
          const stored = this.data.playersById[playerId];
          if (stored) stored.score = Math.max(0, stored.score - lost);
          this.refreshPlayersList();
          this.commit(
            {
              minigame: {
                ...mg,
                size: { ...mg.size, [key]: 0 },
                pops: { ...mg.pops, [key]: mg.pops[key] + 1 },
                justPopped: { ...mg.justPopped, [key]: true },
                lastPopSize: { ...mg.lastPopSize, [key]: lost },
              },
            },
            { skipSave: true }
          );
        } else {
          this.commit(
            {
              minigame: {
                ...mg,
                size: { ...mg.size, [key]: Math.min(BALLOON_MAX_SIZE, mg.size[key] + 1) },
                justPopped: { ...mg.justPopped, [key]: false },
              },
            },
            { skipSave: true }
          );
        }
        this.broadcast();
        return;
      }
      case "balloon-bank": {
        if (mg.id !== "balloon" || mg.status !== "live") return;
        const key = this.slotKey(mg, playerId);
        if (!key || mg.size[key] === 0) return;
        // Banking locks the un-banked size into the player's real score.
        const gained = mg.size[key];
        const stored = this.data.playersById[playerId];
        if (stored) stored.score += gained;
        this.refreshPlayersList();
        this.commit(
          {
            minigame: {
              ...mg,
              banked: { ...mg.banked, [key]: mg.banked[key] + gained },
              size: { ...mg.size, [key]: 0 },
              justPopped: { ...mg.justPopped, [key]: false },
            },
          },
          { skipSave: true }
        );
        this.broadcast();
        return;
      }
      case "ecard-play":
        this.onECardPlay(playerId, input.card);
        return;
      case "tower-confess":
        this.onTowerConfess(playerId, input.value);
        return;
      case "tower-read":
        this.onTowerRead(playerId, input.value);
        return;
      case "doubt-claim":
        this.onDoubtClaim(playerId, input.gem);
        return;
      case "doubt-call":
        this.onDoubtCall(playerId, input.doubt);
        return;
      case "mirror-tap": {
        if (mg.id !== "mirror-match" || mg.status !== "live") return;
        const key = this.slotKey(mg, playerId);
        if (!key) return;
        if (input.pad === mg.sequence[mg.pos[key]]) {
          const newPos = mg.pos[key] + 1;
          if (newPos >= mg.level[key]) {
            // Cleared the current level → bank it and grow the next one.
            this.commit(
              {
                minigame: {
                  ...mg,
                  cleared: { ...mg.cleared, [key]: mg.level[key] },
                  level: { ...mg.level, [key]: mg.level[key] + 1 },
                  pos: { ...mg.pos, [key]: 0 },
                },
              },
              { skipSave: true }
            );
          } else {
            this.commit({ minigame: { ...mg, pos: { ...mg.pos, [key]: newPos } } }, { skipSave: true });
          }
        } else {
          // Wrong pad → strike and restart the current level.
          this.commit(
            {
              minigame: {
                ...mg,
                strikes: { ...mg.strikes, [key]: mg.strikes[key] + 1 },
                pos: { ...mg.pos, [key]: 0 },
              },
            },
            { skipSave: true }
          );
        }
        this.broadcast();
        return;
      }
      case "color-lie-tap": {
        if (mg.id !== "color-lie" || mg.status !== "live") return;
        const key = this.slotKey(mg, playerId);
        if (!key || input.index !== mg.index || mg.lockedOut[key]) return;
        const round = mg.rounds[mg.index];
        if (!round) return;
        if (input.optionIndex === round.correctIndex) {
          const nextIndex = mg.index + 1;
          this.commit(
            {
              minigame: {
                ...mg,
                scores: { ...mg.scores, [key]: mg.scores[key] + 1 },
                index: nextIndex,
                lockedOut: { p1: false, p2: false },
                lastResult: { winner: key, correctIndex: round.correctIndex },
              },
            },
            { skipSave: true }
          );
          this.broadcast();
          if (nextIndex >= mg.rounds.length) this.endMinigame();
          return;
        }
        // Wrong tap → locked out of this prompt. If both miss, the prompt passes.
        const lockedOut = { ...mg.lockedOut, [key]: true };
        if (lockedOut.p1 && lockedOut.p2) {
          const nextIndex = mg.index + 1;
          this.commit(
            {
              minigame: {
                ...mg,
                index: nextIndex,
                lockedOut: { p1: false, p2: false },
                lastResult: { winner: null, correctIndex: round.correctIndex },
              },
            },
            { skipSave: true }
          );
          this.broadcast();
          if (nextIndex >= mg.rounds.length) this.endMinigame();
          return;
        }
        this.commit({ minigame: { ...mg, lockedOut } }, { skipSave: true });
        this.broadcast();
        return;
      }
    }
  }

  // Which fixed slot a player occupies in a head-to-head minigame, or null if
  // they aren't one of the two competitors.
  private slotKey(mg: MinigameState, playerId: string): "p1" | "p2" | null {
    if (!("slots" in mg)) return null;
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
