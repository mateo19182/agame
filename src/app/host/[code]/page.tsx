"use client";

import { use, useEffect, useState } from "react";
import { useRoom } from "@/lib/useRoom";
import { GameView } from "@/components/GameView";
import type { GameSettings } from "@/lib/game";
import { defaultSettings } from "@/lib/game";

const SETTINGS_KEY = "agame:v2:settings";

function loadSettings(): GameSettings {
  if (typeof window === "undefined") return defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        ...defaultSettings(),
        ...parsed,
        minigames: { ...defaultSettings().minigames, ...(parsed.minigames ?? {}) },
      } as GameSettings;
    }
  } catch {}
  return defaultSettings();
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
      room.send({ ...msg, settings });
      return;
    }
    room.send(msg);
  };

  return <GameView role="host" code={code} state={room.state} youId={room.youId} connected={room.connected} send={sendWithSettings} />;
}
