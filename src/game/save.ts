import type { GameState } from './state';

const KEY = 'mycryptotrading.save.v4';

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s && s.v === 4 ? s : null;
  } catch {
    return null;
  }
}

export function save(s: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private browsing or a full disk: the game still runs, it just is not kept
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
