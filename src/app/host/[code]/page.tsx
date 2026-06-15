"use client";

import { use, useEffect, useState } from "react";
import { useRoom } from "@/lib/useRoom";
import { GameView } from "@/components/GameView";
import type { GameSettings, PhotoEntry } from "@/lib/game";
import { loadPhotos } from "@/lib/photos";

const SETTINGS_KEY = "agame:settings";
const DEFAULT_SETTINGS: GameSettings = {
  pack: "general",
  difficulty: "medium",
  round1Questions: 8,
  round2Questions: 3,
  playTiebreaker: true,
  photos: [],
};

function loadSettings(): GameSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

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

export default function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [name] = useState(() => readName(code));
  const room = useRoom(code);

  useEffect(() => {
    if (name && room.connected && !room.youId) {
      const stored = readStoredId(code);
      if (stored) {
        room.send({ type: "rejoin", playerId: stored });
      } else {
        room.send({ type: "host-join", name });
      }
    }
  }, [name, code, room.connected, room.youId, room]);

  useEffect(() => {
    if (room.youId) writeStoredId(code, room.youId);
  }, [code, room.youId]);

  if (!room.state) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-[color:var(--muted)] animate-pulse">Connecting to room {code}…</div>
      </main>
    );
  }

  const sendWithSettings: typeof room.send = (msg) => {
    if (msg.type === "start-game") {
      const settings = loadSettings();
      const photos: PhotoEntry[] = loadPhotos();
      room.send({ ...msg, settings, photos });
      return;
    }
    room.send(msg);
  };

  return <GameView role="host" code={code} state={room.state} youId={room.youId} connected={room.connected} send={sendWithSettings} />;
}
