import type { GameSettings } from "@shared/game";
import { defaultSettings, mergeSettings } from "@shared/game";

const SETTINGS_KEY = "agame:v2:settings";

/** Load persisted match settings, merged onto defaults (and clamped). */
export function loadSettings(): GameSettings {
  if (typeof window === "undefined") return defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return mergeSettings(JSON.parse(raw) as Partial<GameSettings>);
  } catch {
    // ignore malformed / unavailable storage
  }
  return defaultSettings();
}

/** Persist settings. Returns false if storage is full (too many/large photos). */
export function saveSettings(settings: GameSettings): boolean {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
