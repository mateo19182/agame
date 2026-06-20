import type { ClientMessage, GameState } from "@shared/game";

export type Send = (msg: ClientMessage) => void;
export type Role = "host" | "player";

/** Props shared by the active-minigame views. */
export type ActiveProps = { state: GameState; role: Role; send: Send; youId: string };

export function nameOf(state: GameState, id: string | null): string {
  if (!id) return "Someone";
  return state.players.find((p) => p.id === id)?.name ?? "Someone";
}
