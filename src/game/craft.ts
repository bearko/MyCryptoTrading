import { B } from './balance';
import type { Catalog, Item } from './catalog';
import { addTo, gridOf, type GridId } from './logic';
import type { GameState, StockItem } from './state';

/**
 * The pot: two or three goods go in, one comes out.
 *
 * The first good is the base. It comes out as the next good of its own line — one rarity up
 * (a legendary comes out as the line's limited legendary, where the line has one).
 * The others are partners: what they count for (by rarity) must add up to what the base itself counts for.
 * Partners of the base's own parameter line make a good match, and the result comes out one grade better kept.
 */

/** The good a base turns into, or null at the top of its line. */
export function nextOf(cat: Catalog, item: Item): Item | null {
  if (item.wallet || item.limited) return null;
  return cat.itemById.get(item.id + (item.rarity === 5 ? 500 : 1000)) ?? null;
}

/** A line from its first good up (for the recipe book). */
export function lineOf(cat: Catalog, item: Item): Item[] {
  let first = item;
  for (;;) {
    const below = cat.itemById.get(first.id - (first.limited ? 500 : 1000));
    if (!below || below.wallet) break;
    first = below;
  }
  const line = [first];
  for (let next = nextOf(cat, first); next; next = nextOf(cat, next)) line.push(next);
  return line;
}

export const pointsOf = (item: Item): number => B.craftPoints[item.rarity];

export interface CraftPlan {
  base: Item | null;
  result: Item | null;
  /** how well the result is kept (condition) */
  cond: number;
  need: number;
  have: number;
  /** every partner shares a parameter line with the base */
  match: boolean;
  /** the offering the pot takes */
  fee: number;
  /** why it cannot be made yet: nothing in, at the top of its line, no partner, partners too weak, the pot is spent for today, not enough GUM */
  block: '' | 'empty' | 'top' | 'alone' | 'short' | 'spent' | 'poor';
}

/** The offering for a result: a share of what it is worth at its rarity (the same for every good of that rarity). */
export const feeOf = (item: Item): number => Math.round((item.limited ? B.limitedValue : B.rarityValue[item.rarity]) * B.craftFee);
export const craftsLeft = (s: GameState): number => Math.max(0, B.craftPerDay - s.today.crafts);

function find(s: GameState, uid: number): { grid: GridId; stock: StockItem } | null {
  const shelf = s.stock.find((x) => x.uid === uid);
  if (shelf) return { grid: 'shelf', stock: shelf };
  const bag = s.wallet.items.find((x) => x.uid === uid);
  return bag ? { grid: 'wallet', stock: bag } : null;
}

/** What the goods in the pot would make (the first one is the base). */
export function planCraft(s: GameState, cat: Catalog, uids: readonly number[]): CraftPlan {
  const inputs = uids.map((uid) => find(s, uid)?.stock).filter((x): x is StockItem => !!x);
  const none: CraftPlan = { base: null, result: null, cond: 1, need: 0, have: 0, match: false, fee: 0, block: 'empty' };
  if (inputs.length === 0) return none;
  const base = cat.itemById.get(inputs[0].itemId)!;
  const partners = inputs.slice(1).map((x) => cat.itemById.get(x.itemId)!);
  const result = nextOf(cat, base);
  const need = pointsOf(base);
  const have = partners.reduce((sum, p) => sum + pointsOf(p), 0);
  const match = partners.length > 0 && partners.every((p) => p.params.some((param) => base.params.includes(param)));
  const cond = Math.min(B.condMult.length - 1, inputs[0].cond + (match ? 1 : 0));
  const fee = result ? feeOf(result) : 0;
  const block = !result ? 'top' : partners.length === 0 ? 'alone' : have < need ? 'short' : craftsLeft(s) === 0 ? 'spent' : s.gum < fee ? 'poor' : '';
  return { base, result, cond, need, have, match, fee, block };
}

export const CRAFT_MAX = 3;

/** Makes it: the goods are used up and the result is put on the shelf (in the wallet when the shelf has no room). */
export function craft(s: GameState, cat: Catalog, uids: readonly number[]): { ok: true; uid: number; item: Item; first: boolean } | { ok: false; reason: 'plan' | 'room' } {
  const plan = planCraft(s, cat, uids);
  const found = uids.map((uid) => find(s, uid));
  if (plan.block || !plan.result || uids.length > CRAFT_MAX || new Set(uids).size !== uids.length || found.some((f) => !f)) return { ok: false, reason: 'plan' };
  const used = found.map((f) => f!);
  const paid = used.reduce((sum, f) => sum + f.stock.paid, 0) + plan.fee;
  // taken out first: the room they leave is room for the result
  const before = { stock: [...s.stock], bag: [...s.wallet.items] };
  for (const f of used) {
    const list = gridOf(s, cat, f.grid).items;
    list.splice(list.indexOf(f.stock), 1);
  }
  const uid = addTo(s, cat, 'shelf', plan.result.id, plan.cond, paid) ?? addTo(s, cat, 'wallet', plan.result.id, plan.cond, paid);
  if (uid === null) {
    s.stock = before.stock;
    s.wallet.items = before.bag;
    return { ok: false, reason: 'room' };
  }
  s.gum -= plan.fee;
  s.today.spend += plan.fee;
  s.today.crafts += 1;
  const first = !s.made.includes(plan.result.id);
  if (first) s.made.push(plan.result.id);
  s.totals.crafts += 1;
  return { ok: true, uid, item: plan.result, first };
}
