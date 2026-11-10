import { B } from './balance';
import type { Catalog, Item } from './catalog';
import { lines } from './lines';
import { pick, pickWeighted, rand, randRange } from './rng';
import { SHAPES, TURNED, type Shape } from './shapes';
import { emptySummary, type GameState, type StockItem, type Visitor, type Want } from './state';

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

// ---------------------------------------------------------------- prices

/** Market value of a good in a given condition. Fixed per good, so players can learn prices. */
export function itemValue(cat: Catalog, itemId: number, cond: number): number {
  const item = cat.itemById.get(itemId)!;
  const hash = (Math.imul(item.id, 2654435761) >>> 0) % 1000;
  const spread = 1 + (hash / 999 - 0.5) * 2 * B.itemSpread;
  return Math.max(1, Math.round(B.rarityValue[item.rarity] * spread * B.condMult[cond]));
}

/** What a customer is asked to pay at a markup tier. */
export function salePrice(cat: Catalog, stock: StockItem, tier: number): number {
  return Math.round(itemValue(cat, stock.itemId, stock.cond) * B.retail * (1 + B.markupTiers[tier]));
}

export const disposePrice = (cat: Catalog, stock: StockItem): number => Math.round(itemValue(cat, stock.itemId, stock.cond) * B.disposeRate);
export const tipPrice = (v: Visitor): number => Math.round(v.ask * (1 + B.tipRate));
export const discountedAsk = (v: Visitor, tier: number): number => Math.max(1, Math.round(v.ask * (1 - B.discountTiers[tier])));

function chance(s: GameState, base: number, temper: number): number {
  if (base >= 1) return 1;
  return clamp(base + B.temperMod[temper] + (s.rep - 50) / B.repDivisor, 0.05, 0.95);
}
export const discountChance = (s: GameState, v: Visitor, tier: number): number => chance(s, B.discountChance[tier], v.temper);

/** How often a customer accepts paying `markup` over the fair price (0.15 = +15%). */
function markupBase(markup: number): number {
  const xs = B.markupTiers;
  const ys = B.markupChance;
  if (markup <= xs[0] + 1e-9) return 1;
  for (let i = 1; i < xs.length; i++) {
    if (markup <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (markup - xs[i - 1])) / (xs[i] - xs[i - 1]);
  }
  return ys[ys.length - 1];
}

export function matches(cat: Catalog, want: Want, itemId: number): boolean {
  const item = cat.itemById.get(itemId)!;
  if (want.type === 'kind') return item.kind === want.kind;
  if (want.type === 'rarity') return item.rarity >= want.min;
  return true;
}

// ---------------------------------------------------------------- the shelf grid

export const shapeOf = (cat: Catalog, itemId: number, rot = false): Shape => (rot ? TURNED : SHAPES)[cat.itemById.get(itemId)!.shape];

/** Cells taken on the shelf, as "x,y" keys. `ignoreUid` leaves one good out (the one being moved). */
function takenCells(s: GameState, cat: Catalog, ignoreUid = -1): Set<string> {
  const taken = new Set<string>();
  for (const stock of s.stock) {
    if (stock.uid === ignoreUid) continue;
    for (const [cx, cy] of shapeOf(cat, stock.itemId, stock.rot).cells) taken.add(`${stock.x + cx},${stock.y + cy}`);
  }
  return taken;
}

function fitsAt(s: GameState, shape: Shape, x: number, y: number, taken: Set<string>): boolean {
  return shape.cells.every(([cx, cy]) => x + cx >= 0 && x + cx < B.gridCols && y + cy >= 0 && y + cy < s.rows && !taken.has(`${x + cx},${y + cy}`));
}

export function canPlace(s: GameState, cat: Catalog, itemId: number, x: number, y: number, rot: boolean, ignoreUid = -1): boolean {
  return fitsAt(s, shapeOf(cat, itemId, rot), x, y, takenCells(s, cat, ignoreUid));
}

export interface Slot {
  x: number;
  y: number;
  rot: boolean;
}

/**
 * First free spot for a good, scanning row by row: as it is first, then turned.
 * Null when it does not fit anywhere. `only` limits the search to one orientation.
 */
export function findSlot(s: GameState, cat: Catalog, itemId: number, ignoreUid = -1, only?: boolean): Slot | null {
  const taken = takenCells(s, cat, ignoreUid);
  for (const rot of only === undefined ? [false, true] : [only]) {
    const shape = shapeOf(cat, itemId, rot);
    for (let y = 0; y <= s.rows - shape.h; y++) {
      for (let x = 0; x <= B.gridCols - shape.w; x++) {
        if (fitsAt(s, shape, x, y, taken)) return { x, y, rot };
      }
    }
  }
  return null;
}

export function moveStock(s: GameState, cat: Catalog, uid: number, x: number, y: number): boolean {
  const stock = s.stock.find((it) => it.uid === uid);
  if (!stock || !canPlace(s, cat, stock.itemId, x, y, stock.rot, uid)) return false;
  stock.x = x;
  stock.y = y;
  return true;
}

/** Turns a good a quarter turn: where it stands if it fits, else at the first spot that takes it. */
export function turnStock(s: GameState, cat: Catalog, uid: number): boolean {
  const stock = s.stock.find((it) => it.uid === uid);
  if (!stock) return false;
  const rot = !stock.rot;
  const slot = canPlace(s, cat, stock.itemId, stock.x, stock.y, rot, uid) ? { x: stock.x, y: stock.y, rot } : findSlot(s, cat, stock.itemId, uid, rot);
  if (!slot) return false;
  Object.assign(stock, slot);
  return true;
}

export const freeCells = (s: GameState, cat: Catalog): number => B.gridCols * s.rows - takenCells(s, cat).size;

// ---------------------------------------------------------------- calendar and rent

export const isRentDay = (s: GameState): boolean => !s.owned && s.day % B.rentEvery === 0;
/** 0 on the rent day itself */
export const daysToRent = (s: GameState): number => (B.rentEvery - (s.day % B.rentEvery)) % B.rentEvery;
export const visitorsFor = (rep: number): number => B.visitorsBase + Math.floor(rep / B.visitorsPerRep);
export const shelfCost = (s: GameState): number | null => B.shelfCost[s.shelfLevel] ?? null;

function addRep(s: GameState, delta: number): void {
  s.rep = clamp(s.rep + delta, 0, 100);
}

// ---------------------------------------------------------------- new game and mornings

function rollRarity(s: GameState, heroBonus: number): number {
  return (
    1 +
    pickWeighted(s, [
      50 - s.rep * 0.25,
      30,
      14 + s.rep * 0.1 + heroBonus * 2,
      5 + s.rep * 0.1 + heroBonus * 2,
      1 + s.rep * 0.05 + heroBonus,
    ])
  );
}

/** Puts a good on the shelf at the first free spot. False when it does not fit. */
function addStock(s: GameState, cat: Catalog, itemId: number, cond: number, paid: number): boolean {
  const slot = findSlot(s, cat, itemId);
  if (!slot) return false;
  s.stock.push({ uid: s.nextUid++, itemId, cond, paid, ...slot });
  return true;
}

function startMorning(s: GameState, cat: Catalog): void {
  s.phase = 'morning';
  s.today = emptySummary();
  s.queue = [];
  s.cursor = -1;
  s.wholesale = [];
  for (let i = 0; i < B.wholesaleCount; i++) {
    const item = pick(s, cat.itemsByRarity[1 + pickWeighted(s, [60, 32, 8])]);
    const price = Math.round(itemValue(cat, item.id, 1) * randRange(s, B.wholesaleRate[0], B.wholesaleRate[1]));
    s.wholesale.push({ itemId: item.id, cond: 1, price, sold: false });
  }
}

export function newGame(seed: number, cat: Catalog): GameState {
  const s: GameState = {
    v: 2,
    rng: seed | 0,
    day: 1,
    gum: B.startGum,
    rep: B.startRep,
    rows: B.startRows,
    shelfLevel: 0,
    stock: [],
    nextUid: 1,
    rent: B.rentFirst,
    graceLeft: B.grace,
    owned: false,
    ownedDay: 0,
    phase: 'morning',
    wholesale: [],
    queue: [],
    cursor: -1,
    visitorsToday: 0,
    today: emptySummary(),
    nightNote: '',
    totals: { sold: 0, bought: 0, bestSale: 0 },
  };
  for (let i = 0; i < B.startStock; i++) {
    const item = pick(s, cat.itemsByRarity[i < 3 ? 1 : 2]);
    addStock(s, cat, item.id, 1, 0);
  }
  startMorning(s, cat);
  return s;
}

export function buyWholesale(s: GameState, cat: Catalog, index: number): boolean {
  const offer = s.wholesale[index];
  if (s.phase !== 'morning' || !offer || offer.sold || s.gum < offer.price) return false;
  if (!addStock(s, cat, offer.itemId, offer.cond, offer.price)) return false;
  s.gum -= offer.price;
  offer.sold = true;
  s.today.spend += offer.price;
  return true;
}

// ---------------------------------------------------------------- customers

function makeVisitor(s: GameState, cat: Catalog): Visitor {
  const hero = pick(s, cat.heroes);
  const heroBonus = hero.rarity - 1;
  const temper = pickWeighted(s, B.temperWeights);
  let sellerShare: number = B.sellerShare;
  if (s.stock.length === 0) sellerShare = 0.85;
  else if (freeCells(s, cat) < 4) sellerShare = 0.2;
  const base = { heroId: hero.id, temper, patience: B.temperPatience[temper], haggled: false, mood: 'neutral' as const, done: false };

  if (rand(s) < sellerShare) {
    const item = pick(s, cat.itemsByRarity[rollRarity(s, heroBonus)]);
    const cond = pickWeighted(s, B.condWeights);
    const [lo, hi] = B.askRange[temper];
    const ask = Math.max(1, Math.round(itemValue(cat, item.id, cond) * randRange(s, lo, hi)));
    return { ...base, kind: 'sell', itemId: item.id, cond, ask, want: { type: 'any' }, budget: 0, line: lines.sellOpen(s, temper) };
  }

  let want: Want;
  let ref: number;
  if (s.stock.length > 0 && rand(s) < B.buyerKnowsStock) {
    const target = pick(s, s.stock);
    const item = cat.itemById.get(target.itemId)!;
    const roll = rand(s);
    if (roll < 0.55) want = { type: 'kind', kind: item.kind };
    else if (roll < 0.8 && item.rarity >= 2) want = { type: 'rarity', min: Math.min(item.rarity, 4) };
    else want = { type: 'any' };
    ref = itemValue(cat, target.itemId, target.cond);
  } else {
    const rarity = rollRarity(s, heroBonus);
    const roll = rand(s);
    if (roll < 0.6) want = { type: 'kind', kind: pick(s, ['phy', 'int', 'agi'] as const) };
    else if (roll < 0.85) want = { type: 'rarity', min: clamp(rarity, 2, 4) };
    else want = { type: 'any' };
    ref = B.rarityValue[rarity];
  }
  const budget = Math.round(ref * B.retail * randRange(s, 1.05, 1.55) * (1 + heroBonus * 0.05));
  return { ...base, kind: 'buy', itemId: 0, cond: 1, ask: 0, want, budget, line: lines.buyOpen(s, want) };
}

export function openShop(s: GameState, cat: Catalog): void {
  if (s.phase !== 'morning') return;
  s.phase = 'open';
  s.visitorsToday = visitorsFor(s.rep);
  s.cursor = -1;
  callNext(s, cat);
}

/** Brings the next customer to the counter, or closes the shop when the day's line is done. */
export function callNext(s: GameState, cat: Catalog): void {
  if (s.phase !== 'open') return;
  if (s.cursor + 1 >= s.visitorsToday) {
    s.phase = 'evening';
    return;
  }
  s.queue.push(makeVisitor(s, cat));
  s.cursor += 1;
}

export const currentVisitor = (s: GameState): Visitor | null => (s.phase === 'open' ? (s.queue[s.cursor] ?? null) : null);
export const visitorsLeft = (s: GameState): number => Math.max(0, s.visitorsToday - s.cursor - 1);

function strike(s: GameState, v: Visitor, refusal: string): void {
  v.patience -= 1;
  v.mood = 'annoyed';
  if (v.patience <= 0) {
    v.done = true;
    v.line = lines.leaveAngry(v.temper);
    addRep(s, B.angryLeaveRep);
    s.today.walkouts += 1;
  } else {
    v.line = refusal;
  }
}

// ---------------------------------------------------------------- buying from a customer

export type BuyBlock = 'gum' | 'shelf' | null;
export function buyBlock(s: GameState, cat: Catalog, itemId: number, price: number): BuyBlock {
  if (!findSlot(s, cat, itemId)) return 'shelf';
  if (s.gum < price) return 'gum';
  return null;
}

/** Buys the good at the current asking price, or a bit over it (`tip`) to earn goodwill. */
export function acceptAsk(s: GameState, cat: Catalog, tip: boolean): boolean {
  const v = currentVisitor(s);
  if (!v || v.done || v.kind !== 'sell') return false;
  const price = tip ? tipPrice(v) : v.ask;
  if (buyBlock(s, cat, v.itemId, price)) return false;
  s.gum -= price;
  addStock(s, cat, v.itemId, v.cond, price);
  s.today.spend += price;
  s.today.bought += 1;
  s.totals.bought += 1;
  if (tip) addRep(s, B.tipRep);
  else if (!v.haggled) addRep(s, B.payAskRep);
  v.done = true;
  v.mood = 'happy';
  v.line = lines.dealSeller(v.temper, tip);
  return true;
}

/** Asks for a discount. Works once per customer; a refusal costs patience. */
export function haggle(s: GameState, tier: number): boolean {
  const v = currentVisitor(s);
  if (!v || v.done || v.kind !== 'sell' || v.haggled) return false;
  if (rand(s) < discountChance(s, v, tier)) {
    v.ask = discountedAsk(v, tier);
    v.haggled = true;
    v.line = lines.haggleOk(v.temper);
    addRep(s, B.discountRep[tier]);
    return true;
  }
  strike(s, v, lines.haggleNg(v.temper));
  return false;
}

// ---------------------------------------------------------------- selling to a customer

export interface SaleQuote {
  /** the goods at the fair price */
  fair: number;
  /** the price the shop names */
  asked: number;
  /** what the customer actually pays: never more than the budget */
  paid: number;
  /** how far the named price is over the budget (0 when it fits) */
  over: number;
  /** how often the customer agrees */
  chance: number;
  /** false when a good on the counter is not what the customer wants */
  matches: boolean;
}

/** Works out a sale of the goods on the counter at a markup tier, without doing it. */
export function quoteSale(s: GameState, cat: Catalog, v: Visitor, uids: readonly number[], tier: number): SaleQuote {
  const goods = uids.map((uid) => s.stock.find((x) => x.uid === uid)).filter((x): x is StockItem => !!x);
  const fair = goods.reduce((sum, x) => sum + salePrice(cat, x, 0), 0);
  const asked = goods.reduce((sum, x) => sum + salePrice(cat, x, tier), 0);
  const paid = Math.min(asked, v.budget);
  const markup = fair > 0 ? paid / fair - 1 : 0;
  return {
    fair,
    asked,
    paid,
    over: Math.max(0, asked - v.budget),
    chance: chance(s, markupBase(markup), v.temper),
    matches: goods.length > 0 && goods.every((x) => matches(cat, v.want, x.itemId)),
  };
}

export type SellResult = 'sold' | 'refused' | 'left' | 'nomatch' | 'invalid';

/**
 * Sells the goods on the counter. A price over the budget is allowed: the customer pays the budget
 * and the rest is lost. A refusal costs patience.
 */
export function sell(s: GameState, cat: Catalog, uids: readonly number[], tier: number): SellResult {
  const v = currentVisitor(s);
  if (!v || v.done || v.kind !== 'buy' || uids.length === 0 || uids.some((uid) => !s.stock.some((x) => x.uid === uid))) return 'invalid';
  const quote = quoteSale(s, cat, v, uids, tier);
  if (!quote.matches) {
    v.line = lines.noMatch();
    return 'nomatch';
  }
  if (rand(s) < quote.chance) {
    s.gum += quote.paid;
    s.stock = s.stock.filter((x) => !uids.includes(x.uid));
    s.today.revenue += quote.paid;
    s.today.sold += uids.length;
    s.totals.sold += uids.length;
    s.totals.bestSale = Math.max(s.totals.bestSale, quote.paid);
    const markup = quote.paid / quote.fair - 1;
    addRep(s, markup <= 1e-9 ? B.saleRep[0] : markup <= 0.3 ? B.saleRep[1] : B.saleRep[2]);
    v.done = true;
    v.mood = 'happy';
    v.line = lines.dealBuyer(v.temper);
    return 'sold';
  }
  strike(s, v, lines.markupNg(v.temper));
  return v.done ? 'left' : 'refused';
}

/** The customer turns down a good that is not what they asked for (no penalty). */
export function refuseGood(s: GameState): void {
  const v = currentVisitor(s);
  if (v && !v.done) v.line = lines.noMatch();
}

/** Sends the customer away without a deal. No penalty. */
export function pass(s: GameState): void {
  const v = currentVisitor(s);
  if (!v || v.done) return;
  v.done = true;
  v.line = lines.pass(v.temper);
}

// ---------------------------------------------------------------- shop management

export function dispose(s: GameState, cat: Catalog, uid: number): boolean {
  const index = s.stock.findIndex((x) => x.uid === uid);
  if (index < 0) return false;
  const price = disposePrice(cat, s.stock[index]);
  s.stock.splice(index, 1);
  s.gum += price;
  s.today.revenue += price;
  return true;
}

export function upgradeShelf(s: GameState): boolean {
  const cost = shelfCost(s);
  if (cost === null || s.gum < cost) return false;
  s.gum -= cost;
  s.shelfLevel += 1;
  s.rows += 1;
  return true;
}

export function buyDeed(s: GameState): boolean {
  if (s.owned || s.gum < B.deedPrice || (s.phase !== 'evening' && s.phase !== 'morning')) return false;
  s.gum -= B.deedPrice;
  s.owned = true;
  s.ownedDay = s.day;
  s.phase = 'won';
  return true;
}

/** After the ending screen the shop keeps running, rent-free. */
export function continueAfterWin(s: GameState): void {
  if (s.phase === 'won') s.phase = 'evening';
}

/** Closes the day: collects rent on rent days, then starts the next morning. */
export function endDay(s: GameState, cat: Catalog): void {
  if (s.phase !== 'evening') return;
  s.nightNote = '';
  if (isRentDay(s)) {
    if (s.gum >= s.rent) {
      s.gum -= s.rent;
      s.nightNote = `家賃 ${s.rent} GUM を支払いました。`;
      s.rent = Math.round(s.rent * B.rentGrowth);
    } else if (s.graceLeft > 0) {
      s.graceLeft -= 1;
      const unpaid = s.rent;
      s.rent = Math.round(s.rent * B.rentGrowth) + unpaid;
      s.nightNote = `家賃を払えず、猶予を使いました。未払いの ${unpaid} GUM は次回の家賃に上乗せされます。`;
    } else {
      s.phase = 'lost';
      return;
    }
  }
  s.day += 1;
  startMorning(s, cat);
}

export const findItem = (cat: Catalog, itemId: number): Item => cat.itemById.get(itemId)!;
