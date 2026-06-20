import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import type { GameState } from "@shared/game";
import { sounds } from "@/lib/sounds";
import type { RoomError } from "@/lib/useRoom";
import { ErrorToast, Header, ScoreBar } from "./Chrome";
import { Lobby } from "./Lobby";
import { MinigameIntro } from "./MinigameIntro";
import { MinigameEnd } from "./MinigameEnd";
import { FinalView } from "./FinalView";
import { TriviaActive } from "./TriviaActive";
import { MemoryLaneActive } from "./MemoryLaneActive";
import { ReflexActive } from "./ReflexActive";
import { SpeedSortActive } from "./SpeedSortActive";
import { TypeRaceActive } from "./TypeRaceActive";
import type { ActiveProps, Role, Send } from "./types";

type Props = {
  role: Role;
  code: string;
  state: GameState;
  youId: string;
  connected: boolean;
  error?: RoomError | null;
  send: Send;
};

export function GameView({ role, code, state, youId, connected, error, send }: Props) {
  const me = state.players.find((p) => p.id === youId);
  const isHost = role === "host" || Boolean(me?.isHost);

  const lastPhase = useRef(state.phase);
  useEffect(() => {
    if (lastPhase.current !== state.phase) {
      if (state.phase === "final") {
        sounds.win();
        confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
      }
      lastPhase.current = state.phase;
    }
  }, [state.phase]);

  return (
    <main className="flex-1 flex flex-col">
      <ErrorToast error={error} />
      <Header code={code} state={state} connected={connected} />
      <div className="flex-1 flex flex-col px-4 sm:px-6 pb-6 max-w-6xl w-full mx-auto">
        {state.phase === "lobby" && <Lobby state={state} isHost={isHost} send={send} youId={youId} code={code} />}
        {state.phase === "minigame-intro" && state.currentMinigame && (
          <MinigameIntro state={state} isHost={isHost} send={send} />
        )}
        {state.phase === "minigame-active" && state.minigame && (
          <MinigameActive state={state} role={role} send={send} youId={youId} />
        )}
        {state.phase === "minigame-end" && state.minigameResult && (
          <MinigameEnd state={state} isHost={isHost} send={send} />
        )}
        {state.phase === "final" && <FinalView state={state} isHost={isHost} send={send} />}
      </div>
      <ScoreBar state={state} youId={youId} />
    </main>
  );
}

function MinigameActive(props: ActiveProps) {
  const mg = props.state.minigame!;
  if (mg.id === "trivia") return <TriviaActive {...props} />;
  if (mg.id === "memory-lane") return <MemoryLaneActive {...props} />;
  if (mg.id === "reflex") return <ReflexActive {...props} />;
  if (mg.id === "speed-sort") return <SpeedSortActive {...props} />;
  return <TypeRaceActive {...props} />;
}

export type { Props as GameViewProps, Send };
