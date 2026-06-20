import { useState } from "react";
import { useParams } from "react-router-dom";
import { GameView } from "@/components/game/GameView";
import { useRoomSession, readName, readHostPlays } from "@/lib/roomSession";

export default function Host() {
  const { code = "" } = useParams();
  const [name] = useState(() => readName(code));
  const [hostPlays] = useState(() => readHostPlays(code));
  const room = useRoomSession(code, "host", name, hostPlays);

  if (!room.state) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-[color:var(--muted)] animate-pulse">Connecting to room {code}…</div>
      </main>
    );
  }

  return (
    <GameView
      role="host"
      code={code}
      state={room.state}
      youId={room.youId}
      connected={room.connected}
      error={room.error}
      send={room.send}
    />
  );
}
