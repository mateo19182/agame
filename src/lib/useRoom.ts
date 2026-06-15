"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientMessage, GameState, ServerMessage } from "./game";

function resolveHost(): string {
  const envHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  if (envHost) return envHost;
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "localhost:1999";
  }
  return "agame-party.mateoamadoares.workers.dev";
}

function wsUrl(roomId: string): string {
  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${resolveHost()}/parties/main/${roomId}`;
}

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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!roomId) return;
    cancelledRef.current = false;

    const connect = () => {
      if (cancelledRef.current) return;
      const ws = new WebSocket(wsUrl(roomId));
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!cancelledRef.current) {
          reconnectRef.current = setTimeout(connect, 1000);
        }
      };
      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
      ws.onmessage = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(ev.data) as ServerMessage;
          if (msg.type === "state") {
            setState(msg.state);
            setYouId(msg.youId);
          }
        } catch {}
      };
    };

    connect();

    return () => {
      cancelledRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [roomId]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return { state, youId, connected, send };
}
