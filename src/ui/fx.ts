/**
 * Visual effects over the whole game: particles, flying numbers, shakes, flashes, screen wipes.
 * Screens call only this API (docs/UI_DIRECTION.md §6).
 * STUB: the signatures are the contract; the implementation is replaced by the effects work.
 *
 * Coordinates are in px relative to the game root (#app). `Target` may also be an element or a CSS
 * selector inside the root: its centre is used.
 */
export type Target = { x: number; y: number } | Element | string;

export type BurstKind = 'coins' | 'sparks' | 'stars' | 'dust' | 'smoke' | 'confetti' | 'heal' | 'hit' | 'shards' | 'ring';

export interface BurstOptions {
  /** how many particles (default depends on the kind) */
  count?: number;
  /** CSS colour, for kinds that take one */
  color?: string;
  /** 0.5 small … 2 big */
  scale?: number;
}

export interface TextOptions {
  /** gain: +GUM (yellow) / loss: −GUM / dmg / heal / crit (bigger) / info */
  kind?: 'gain' | 'loss' | 'dmg' | 'heal' | 'crit' | 'info';
  /** px */
  size?: number;
}

export const fx = {
  /** Creates the overlay canvas inside the game root. Call once at start-up. */
  mount(_root: HTMLElement): void {},
  /** A burst of particles at a place. */
  burst(_kind: BurstKind, _at: Target, _opts?: BurstOptions): void {},
  /** Coins (or other bits) that fly from one place to another along an arc, then call `onArrive` once. */
  fly(_kind: 'coins' | 'stars', _from: Target, _to: Target, _opts?: { count?: number; onArrive?: () => void }): void {},
  /** A number or short word that pops and floats away. */
  text(_text: string, _at: Target, _opts?: TextOptions): void {},
  /** A big stamp slammed onto the screen (SOLD, DEAL, WIN …), gone after ~900ms. */
  stamp(_text: string, _at: Target, _opts?: { color?: string; size?: number }): void {},
  /** A band with big type sweeping across the screen (OPEN, CLOSED, a skill's name …). Resolves when it has left. */
  banner(_text: string, _opts?: { sub?: string; color?: string; ms?: number }): Promise<void> {
    return Promise.resolve();
  },
  /** Shakes the whole game. intensity in px. */
  shake(_intensity?: number, _ms?: number): void {},
  /** A full-screen flash of a colour. */
  flash(_color?: string, _ms?: number): void {},
  /** Freezes all motion for a few frames (hit-stop). */
  hitStop(_ms?: number): void {},
  /**
   * Covers the screen with a slanted ink wipe, calls `swap` while it is covered (change the screen there),
   * then uncovers. Resolves when done. With reduced motion: a quick fade.
   */
  transition(swap: () => void, _kind?: 'slash' | 'bars' | 'iris'): Promise<void> {
    swap();
    return Promise.resolve();
  },
  /** Slow drifting particles behind everything: dust by day, fireflies at night, embers in the dungeon. */
  ambient(_mode: 'day' | 'night' | 'dungeon' | 'none'): void {},
  /** 演出をひかえる: true stops shakes, flashes and travelling particles (text still shows). */
  setCalm(_on: boolean): void {},
  get calm(): boolean {
    return false;
  },
};
