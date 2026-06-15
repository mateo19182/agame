"use client";

import { use, useEffect, useState } from "react";
import { useRoom } from "@/lib/useRoom";
import { GameView } from "@/components/GameView";

function readName(code: string): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(`agame:name:${code}`) ?? "";
}

function readStoredId(code: string): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(`agame:youId:${code}`) ?? "";
}

function writeStoredId(code: string, id: string) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(`agame:youId:${code}`, id); } catch {}
}

export default function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [name] = useState(() => readName(code));
  const room = useRoom(code);

  useEffect(() => {
    if (name && room.connected && !room.youId) {
      const stored = readStoredId(code);
      if (stored) {
        room.send({ type: "rejoin", playerId: stored });
      } else {
        room.send({ type: "player-join", name });
      }
    }
  }, [name, code, room.connected, room.youId, room]);

  useEffect(() => {
    if (room.youId) writeStoredId(code, room.youId);
  }, [code, room.youId]);

  if (!room.state) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div className="text-[color:var(--muted)] animate-pulse">Joining {code}…</div>
      </main>
    );
  }

  return <GameView role="player" code={code} state={room.state} youId={room.youId} connected={room.connected} send={room.send} />;
}
