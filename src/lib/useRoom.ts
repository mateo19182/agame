import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientMessage, ServerErrorCode, GameState, ServerMessage } from "@shared/game";

// The realtime room lives on the same origin as the app, served by the Worker
// under /api/room/<code> (auth-gated, then upgraded to a Durable Object socket).
function wsUrl(code: string): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/room/${code}`;
}

const MAX_BACKOFF_MS = 30_000;

export type RoomError = { message: string; code?: ServerErrorCode; seq: number };

export type RoomConnection = {
  state: GameState | null;
  youId: string;
  connected: boolean;
  error: RoomError | null;
  send: (msg: ClientMessage) => void;
};

export function useRoom(code: string | null): RoomConnection {
  const [state, setState] = useState<GameState | null>(null);
  const [youId, setYouId] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<RoomError | null>(null);
  const errSeqRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!code) return;
    cancelledRef.current = false;
    attemptRef.current = 0;

    const connect = () => {
      if (cancelledRef.current) return;
      const ws = new WebSocket(wsUrl(code));
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        attemptRef.current = 0;
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!cancelledRef.current) {
          const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attemptRef.current);
          attemptRef.current++;
          reconnectRef.current = setTimeout(connect, delay);
        }
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
      ws.onmessage = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(ev.data) as ServerMessage;
          if (msg.type === "state") {
            setState(msg.state);
            setYouId(msg.youId);
          } else if (msg.type === "error") {
            errSeqRef.current += 1;
            setError({ message: msg.message, code: msg.code, seq: errSeqRef.current });
          }
        } catch {
          // ignore malformed frames
        }
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
  }, [code]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return { state, youId, connected, error, send };
}
