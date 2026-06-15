"use client";

import PartySocket from "partysocket";
import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientMessage, GameState, ServerMessage } from "./game";

const HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST ??
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "localhost:1999"
    : "agame.partyskit.dev");

export type RoomConnection = {
  state: GameState | null;
  youId: string;
  connected: boolean;
  send: (msg: ClientMessage) => void;
};

export function useRoom(roomId: string | null): RoomConnection {
  const [state, setState] = useState<GameState | null>(null);
  const [youId, setYouId] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const s = new PartySocket({
      host: HOST,
      room: roomId,
      party: "main",
    });
    socketRef.current = s;
    const onOpen = () => setConnected(true);
    const onClose = () => setConnected(false);
    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.type === "state") {
          setState(msg.state);
          setYouId(msg.youId);
        }
      } catch {}
    };
    s.addEventListener("open", onOpen);
    s.addEventListener("close", onClose);
    s.addEventListener("message", onMessage);
    return () => {
      s.removeEventListener("open", onOpen);
      s.removeEventListener("close", onClose);
      s.removeEventListener("message", onMessage);
      s.close();
      socketRef.current = null;
    };
  }, [roomId]);

  const send = useCallback((msg: ClientMessage) => {
    socketRef.current?.send(JSON.stringify(msg));
  }, []);

  return { state, youId, connected, send };
}
