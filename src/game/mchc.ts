import { B } from './balance';
import type { Catalog, Item } from './catalog';
import { currentVisitor, itemsOf, itemValue } from './logic';
import type { GameState, StockItem, Visitor } from './state';

/** The medals: goods that those who deal in MCHC take in place of GUM. */
export const isMedal = (item: Item): boolean => item.series.includes('メダル');

/** The Tuesday caller, while he stands at the counter. */
export const facingSatoshi = (s: GameState): Visitor | null => {
  const v = currentVisitor(s);
  return s.phase === 'open' && v && v.special === 'satoshi' && !v.done ? v : null;
};

/** The exchange has been opened (a favour of the guild): swaps at any time, for a fee. */
export const hasDex = (s: GameState): boolean => s.services.includes('dex');

/** Whether anything can be swapped now, and through whom (the caller takes no fee, and gives MCHC only). */
export const swapVia = (s: GameState): 'satoshi' | 'dex' | null => (facingSatoshi(s) ? 'satoshi' : hasDex(s) ? 'dex' : null);

const feeOf = (s: GameState): number => (swapVia(s) === 'dex' ? B.mchc.dexFee : 0);

/** What an amount of one token gives of the other, now. */
export function quoteSwap(s: GameState, from: 'gum' | 'mchc', amount: number): number {
  const kept = 1 - feeOf(s);
  return Math.max(0, Math.floor(from === 'gum' ? (amount / s.rate) * kept : amount * s.rate * kept));
}

/** The most of a token that can be swapped now (what is held; and, with the caller, what his purse can pay for). */
export function swapMax(s: GameState, from: 'gum' | 'mchc'): number {
  const v = facingSatoshi(s);
  if (from === 'mchc') return v ? 0 : s.mchc;
  return v ? Math.min(s.gum, Math.floor(v.budget * s.rate)) : s.gum;
}

/** Swaps GUM for MCHC, or (through the exchange only) MCHC for GUM. */
export function swap(s: GameState, from: 'gum' | 'mchc', amount: number): boolean {
  const via = swapVia(s);
  const got = quoteSwap(s, from, amount);
  if (!via || amount <= 0 || got <= 0 || amount > swapMax(s, from)) return false;
  if (from === 'gum') {
    s.gum -= amount;
    s.mchc += got;
    const v = facingSatoshi(s);
    if (v) v.budget -= got;
  } else {
    s.mchc -= amount;
    s.gum += got;
  }
  return true;
}

/** What a medal fetches in MCHC, now. */
export function medalQuote(s: GameState, cat: Catalog, x: StockItem): number {
  return Math.max(1, Math.floor(((itemValue(cat, x.itemId, x.cond) * B.mchc.medal) / s.rate) * (1 - feeOf(s))));
}

/** The medals the shop holds (on the shelf, in the showcase, in the wallet). */
export function medalsHeld(s: GameState, cat: Catalog): StockItem[] {
  return (['shelf', 'case', 'wallet'] as const).flatMap((id) => itemsOf(s, id)).filter((x) => isMedal(cat.itemById.get(x.itemId)!) && !x.fake);
}

/** Gives a medal for MCHC. */
export function swapMedal(s: GameState, cat: Catalog, uid: number): boolean {
  const via = swapVia(s);
  const x = medalsHeld(s, cat).find((it) => it.uid === uid);
  if (!via || !x) return false;
  const got = medalQuote(s, cat, x);
  const v = facingSatoshi(s);
  if (v && v.budget < got) return false;
  for (const id of ['shelf', 'case', 'wallet'] as const) {
    const items = itemsOf(s, id);
    const index = items.indexOf(x);
    if (index >= 0) items.splice(index, 1);
  }
  s.mchc += got;
  if (v) v.budget -= got;
  return true;
}
