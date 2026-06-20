import { useEffect } from "react";
import { useRoom, type RoomConnection } from "./useRoom";

// Per-room session storage shared by the host and play routes (previously
// duplicated in both pages).
const key = (kind: string, code: string) => `agame:${kind}:${code}`;

export function readName(code: string): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(key("name", code)) ?? "";
}

export function writeName(code: string, name: string) {
  try {
    sessionStorage.setItem(key("name", code), name);
  } catch {
    // ignore
  }
}

export function readHostPlays(code: string): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(key("hostMode", code)) === "play";
}

export function writeHostMode(code: string, plays: boolean) {
  try {
    sessionStorage.setItem(key("hostMode", code), plays ? "play" : "scoreboard");
  } catch {
    // ignore
  }
}

function readStoredId(code: string): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(key("youId", code)) ?? "";
}

function writeStoredId(code: string, id: string) {
  try {
    sessionStorage.setItem(key("youId", code), id);
  } catch {
    // ignore
  }
}

function clearStoredId(code: string) {
  try {
    sessionStorage.removeItem(key("youId", code));
  } catch {
    // ignore
  }
}

export type Role = "host" | "player";

/**
 * Connects to a room and manages identity: it rejoins with a stored player id
 * when possible, otherwise joins fresh, recovers from a stale id, and persists
 * the assigned id. Used by both the host and play routes.
 */
export function useRoomSession(
  code: string,
  role: Role,
  name: string,
  hostPlays = false
): RoomConnection {
  const room = useRoom(code);

  // Join / rejoin once connected.
  useEffect(() => {
    if (!room.connected) return;
    if (role === "host") {
      // A scoreboard-only host never gets a player id, so it just re-announces
      // itself as controller; a playing host rejoins like a player.
      if (hostPlays && room.youId) return;
      const stored = hostPlays ? readStoredId(code) : "";
      if (stored) room.send({ type: "rejoin", playerId: stored });
      else room.send({ type: "host-join", name, asPlayer: hostPlays });
    } else {
      if (!name || room.youId) return;
      const stored = readStoredId(code);
      if (stored) room.send({ type: "rejoin", playerId: stored });
      else room.send({ type: "player-join", name });
    }
  }, [room.connected, room.youId, code, role, name, hostPlays, room]);

  // A stale stored id (e.g. after the room was reaped) → drop it and join fresh.
  useEffect(() => {
    if (room.error?.code === "rejoin-failed" && !room.youId) {
      clearStoredId(code);
      if (!room.connected) return;
      if (role === "host") room.send({ type: "host-join", name, asPlayer: hostPlays });
      else if (name) room.send({ type: "player-join", name });
    }
  }, [room.error, room.youId, room.connected, role, name, hostPlays, code, room]);

  // Persist the assigned id so a refresh can rejoin the same slot.
  useEffect(() => {
    if (room.youId) writeStoredId(code, room.youId);
  }, [code, room.youId]);

  return room;
}
