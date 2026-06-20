import { useState } from "react";
import { useParams } from "react-router-dom";
import { GameView } from "@/components/game/GameView";
import { useRoomSession, readName } from "@/lib/roomSession";

export default function Play() {
  const { code = "" } = useParams();
  const [name] = useState(() => readName(code));
  const room = useRoomSession(code, "player", name);

  if (!room.state) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div className="text-[color:var(--muted)] animate-pulse">Joining {code}…</div>
      </main>
    );
  }

  return (
    <GameView
      role="player"
      code={code}
      state={room.state}
      youId={room.youId}
      connected={room.connected}
      error={room.error}
      send={room.send}
    />
  );
}
