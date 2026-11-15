import { noFavor } from './factions';
import type { GameState } from './state';

const KEY = 'mycryptotrading.save.v4';

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (!s || s.v !== 4) return null;
    // older saves kept the turn as true / false
    for (const x of [...s.stock, ...s.wallet.items]) x.rot = typeof x.rot === 'number' ? x.rot & 3 : x.rot ? 1 : 0;
    // saves from before streaks, orders and 商才
    s.combo ??= 0;
    s.order ??= null;
    s.perks ??= [];
    s.perkOffer ??= null;
    s.last ??= { bonus: 0, orderReward: 0 };
    s.totals.orders ??= 0;
    s.totals.bestCombo ??= 0;
    for (const v of s.queue) v.deals ??= 0;
    // saves from before the showcase and the guild
    // (saves from before the showcase was a grid: what was marked as shown simply stays on the shelf)
    s.showcase ??= [];
    delete (s as { display?: unknown }).display;
    s.seek ??= '';
    s.trust ??= 0;
    s.services ??= [];
    s.supply ??= null;
    s.wanted ??= null;
    s.loan ??= null;
    s.patrolDay ??= false;
    s.patrolSlot ??= 0;
    s.parcel ??= [];
    // saves from before the bin and the wide shelf (the shelf is repacked when the game is entered)
    s.trash ??= [];
    s.trashGum ??= 0;
    s.wide ??= false;
    // saves from before the pot
    s.made ??= [];
    s.crosses ??= [];
    s.today.crafts ??= 0;
    s.today.looks ??= 0;
    s.totals.crafts ??= 0;
    // saves from before the houses
    s.favor = { ...noFavor(), ...(s.favor ?? {}) };
    for (const v of s.queue) {
      v.nego ??= 0;
      v.faction ??= null;
    }
    return s;
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
