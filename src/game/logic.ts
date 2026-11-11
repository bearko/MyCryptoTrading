import { B } from './balance';
import type { Catalog, Item } from './catalog';
import { lines } from './lines';
import { pick, pickWeighted, rand, randRange } from './rng';
import { SHAPES, TURNED, type Shape } from './shapes';
import { emptySummary, type DayEvent, type GameState, type Offer, type StockItem, type Visitor, type Want } from './state';

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
export const discountedAsk = (ask: number, tier: number): number => Math.max(1, Math.round(ask * (1 - B.discountTiers[tier])));

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
  if (want.type === 'param') return item.params.includes(want.param);
  if (want.type === 'role') return item.roles.includes(want.role);
  if (want.type === 'rarity') return item.rarity >= want.min;
  return true;
}

// ---------------------------------------------------------------- grids (the shelf and the wallet)

export const shapeOf = (cat: Catalog, itemId: number, rot = false): Shape => (rot ? TURNED : SHAPES)[cat.itemById.get(itemId)!.shape];

/** A grid of cells holding goods: the shop's shelf, or the wallet. */
export interface Grid {
  cols: number;
  rows: number;
  items: StockItem[];
}
export type GridId = 'shelf' | 'wallet';

export function walletSize(s: GameState, cat: Catalog): { cols: number; rows: number } {
  const [cols, rows] = B.walletSizes[cat.itemById.get(s.wallet.itemId)?.rarity ?? 1];
  return { cols, rows };
}

export function gridOf(s: GameState, cat: Catalog, id: GridId): Grid {
  return id === 'shelf' ? { cols: B.gridCols, rows: s.rows, items: s.stock } : { ...walletSize(s, cat), items: s.wallet.items };
}

/** Cells taken, as "x,y" keys. `ignoreUid` leaves one good out (the one being moved). */
function takenCells(g: Grid, cat: Catalog, ignoreUid = -1): Set<string> {
  const taken = new Set<string>();
  for (const stock of g.items) {
    if (stock.uid === ignoreUid) continue;
    for (const [cx, cy] of shapeOf(cat, stock.itemId, stock.rot).cells) taken.add(`${stock.x + cx},${stock.y + cy}`);
  }
  return taken;
}

function fitsAt(g: Grid, shape: Shape, x: number, y: number, taken: Set<string>): boolean {
  return shape.cells.every(([cx, cy]) => x + cx >= 0 && x + cx < g.cols && y + cy >= 0 && y + cy < g.rows && !taken.has(`${x + cx},${y + cy}`));
}

export function canPlaceIn(g: Grid, cat: Catalog, itemId: number, x: number, y: number, rot: boolean, ignoreUid = -1): boolean {
  return fitsAt(g, shapeOf(cat, itemId, rot), x, y, takenCells(g, cat, ignoreUid));
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
export function findSlotIn(g: Grid, cat: Catalog, itemId: number, ignoreUid = -1, only?: boolean): Slot | null {
  const taken = takenCells(g, cat, ignoreUid);
  for (const rot of only === undefined ? [false, true] : [only]) {
    const shape = shapeOf(cat, itemId, rot);
    for (let y = 0; y <= g.rows - shape.h; y++) {
      for (let x = 0; x <= g.cols - shape.w; x++) {
        if (fitsAt(g, shape, x, y, taken)) return { x, y, rot };
      }
    }
  }
  return null;
}

export const findSlot = (s: GameState, cat: Catalog, itemId: number): Slot | null => findSlotIn(gridOf(s, cat, 'shelf'), cat, itemId);

export function moveStock(s: GameState, cat: Catalog, uid: number, x: number, y: number, id: GridId = 'shelf'): boolean {
  const g = gridOf(s, cat, id);
  const stock = g.items.find((it) => it.uid === uid);
  if (!stock || !canPlaceIn(g, cat, stock.itemId, x, y, stock.rot, uid)) return false;
  stock.x = x;
  stock.y = y;
  return true;
}

/** Turns a good a quarter turn: where it stands if it fits, else at the first spot that takes it. */
export function turnStock(s: GameState, cat: Catalog, uid: number, id: GridId = 'shelf'): boolean {
  const g = gridOf(s, cat, id);
  const stock = g.items.find((it) => it.uid === uid);
  if (!stock) return false;
  const rot = !stock.rot;
  const slot = canPlaceIn(g, cat, stock.itemId, stock.x, stock.y, rot, uid) ? { x: stock.x, y: stock.y, rot } : findSlotIn(g, cat, stock.itemId, uid, rot);
  if (!slot) return false;
  Object.assign(stock, slot);
  return true;
}

export const freeCells = (s: GameState, cat: Catalog, id: GridId = 'shelf'): number => {
  const g = gridOf(s, cat, id);
  return g.cols * g.rows - takenCells(g, cat).size;
};

/** Puts a good on a grid at the first free spot. Returns its uid, or null when it does not fit. */
export function addTo(s: GameState, cat: Catalog, id: GridId, itemId: number, cond: number, paid: number): number | null {
  const g = gridOf(s, cat, id);
  const slot = findSlotIn(g, cat, itemId);
  if (!slot) return null;
  const uid = s.nextUid++;
  g.items.push({ uid, itemId, cond, paid, ...slot });
  return uid;
}

// ---------------------------------------------------------------- calendar and rent

export const isRentDay = (s: GameState): boolean => !s.owned && s.day % B.rentEvery === 0;
/** 0 on the rent day itself */
export const daysToRent = (s: GameState): number => (B.rentEvery - (s.day % B.rentEvery)) % B.rentEvery;
export const visitorsFor = (rep: number): number => B.visitorsBase + Math.floor(rep / B.visitorsPerRep);
/** Customers expected today: reputation, today's event, and a late opening after a night out. */
export function visitorsExpected(s: GameState): number {
  const event = s.event.id === 'caravan' ? B.caravanVisitors : s.event.id === 'rain' ? B.rainVisitors : 0;
  return Math.max(B.visitorsMin, visitorsFor(s.rep) + event - (s.lateOpen ? B.lateOpenLoss : 0));
}
export const shelfCost = (s: GameState): number | null => B.shelfCost[s.shelfLevel] ?? null;

export function addRep(s: GameState, delta: number): void {
  s.rep = clamp(s.rep + delta, 0, 100);
}

// ---------------------------------------------------------------- new game and mornings

export function rollRarity(s: GameState, heroBonus: number): number {
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

const addStock = (s: GameState, cat: Catalog, itemId: number, cond: number, paid: number): boolean => addTo(s, cat, 'shelf', itemId, cond, paid) !== null;

function rollEvent(s: GameState): DayEvent {
  const id = (['none', 'demand', 'caravan', 'rain', 'bargain'] as const)[pickWeighted(s, B.eventWeights)];
  return id === 'demand' ? { id, param: pick(s, ['phy', 'int', 'agi'] as const) } : { id };
}

/** A new day: the shutter is still down, today's event is decided, and last night's outing costs a customer. */
function startMorning(s: GameState): void {
  s.phase = 'morning';
  s.today = emptySummary();
  s.queue = [];
  s.cursor = -1;
  s.event = s.day === 1 ? { id: 'none' } : rollEvent(s);
  s.lateOpen = s.wentOut;
  s.wentOut = false;
  s.shop = null;
  s.quest = null;
}

export function newGame(seed: number, cat: Catalog): GameState {
  const s: GameState = {
    v: 4,
    rng: seed | 0,
    day: 1,
    gum: B.startGum,
    rep: B.startRep,
    rows: B.startRows,
    shelfLevel: 0,
    stock: [],
    nextUid: 1,
    wallet: { itemId: cat.wallets[0].id, items: [] },
    equip: { head: null, body: null, arm: null, leg: null, special1: null, special2: null },
    rent: B.rentFirst,
    graceLeft: B.grace,
    owned: false,
    ownedDay: 0,
    phase: 'morning',
    event: { id: 'none' },
    lateOpen: false,
    wentOut: false,
    shop: null,
    quest: null,
    queue: [],
    cursor: -1,
    visitorsToday: 0,
    today: emptySummary(),
    nightNote: '',
    totals: { sold: 0, bought: 0, bestSale: 0, deepest: 0 },
  };
  for (let i = 0; i < B.startStock; i++) {
    const item = pick(s, cat.itemsByRarity[i < 3 ? 1 : 2]);
    addStock(s, cat, item.id, 1, 0);
  }
  startMorning(s);
  return s;
}

// ---------------------------------------------------------------- customers

function makeVisitor(s: GameState, cat: Catalog): Visitor {
  const hero = pick(s, cat.heroes);
  const heroBonus = hero.rarity - 1;
  const temper = pickWeighted(s, B.temperWeights);
  let sellerShare: number = B.sellerShare;
  if (s.stock.length === 0) sellerShare = 0.85;
  else if (freeCells(s, cat) < 4) sellerShare = 0.2;
  const base = {
    heroId: hero.id,
    temper,
    patience: B.temperPatience[temper],
    haggled: false,
    mood: 'neutral' as const,
    done: false,
    offers: [] as Offer[],
    bundleRate: 0,
  };

  if (rand(s) < sellerShare) {
    const count = 1 + pickWeighted(s, B.offerCountWeights);
    const [lo, hi] = B.askRange[temper];
    const offers: Offer[] = [];
    for (let i = 0; i < count; i++) {
      const item = pick(s, cat.itemsByRarity[rollRarity(s, heroBonus)]);
      const cond = pickWeighted(s, B.condWeights);
      const hurry = s.event.id === 'bargain' ? B.bargainAsk : 1;
      offers.push({ itemId: item.id, cond, ask: Math.max(1, Math.round(itemValue(cat, item.id, cond) * randRange(s, lo, hi) * hurry)) });
    }
    const bundleRate = count >= 2 ? B.bundleRates[pickWeighted(s, B.bundleWeights)] : 0;
    return { ...base, kind: 'sell', offers, bundleRate, want: { type: 'any' }, budget: 0, line: lines.sellOpen(s, temper) };
  }

  let want: Want;
  let ref: number;
  if (s.stock.length > 0 && rand(s) < B.buyerKnowsStock) {
    const target = pick(s, s.stock);
    const item = cat.itemById.get(target.itemId)!;
    const roll = rand(s);
    if (roll < 0.35) want = { type: 'param', param: pick(s, item.params) };
    else if (roll < 0.6 && item.roles.length > 0) want = { type: 'role', role: pick(s, item.roles) };
    else if (roll < 0.8 && item.rarity >= 2) want = { type: 'rarity', min: Math.min(item.rarity, 4) };
    else want = { type: 'any' };
    ref = itemValue(cat, target.itemId, target.cond);
  } else {
    const rarity = rollRarity(s, heroBonus);
    const roll = rand(s);
    if (roll < 0.4) want = { type: 'param', param: pick(s, ['phy', 'int', 'agi'] as const) };
    else if (roll < 0.65) want = { type: 'role', role: pick(s, ['atk', 'buff', 'debuff', 'heal', 'status'] as const) };
    else if (roll < 0.85) want = { type: 'rarity', min: clamp(rarity, 2, 4) };
    else want = { type: 'any' };
    ref = B.rarityValue[rarity];
  }
  // on a demand day, most buyers are after that parameter line and bring more money for it
  let demand = 1;
  if (s.event.id === 'demand' && s.event.param && rand(s) < 0.6) {
    want = { type: 'param', param: s.event.param };
    demand = B.demandBudget;
  }
  // some customers carry enough for two or three goods; rarer heroes more often
  const goods = 1 + pickWeighted(s, [B.budgetCountWeights[0], B.budgetCountWeights[1] + heroBonus * 4, B.budgetCountWeights[2] + heroBonus * 4]);
  const budget = Math.round(ref * B.retail * randRange(s, 1.05, 1.55) * (1 + heroBonus * 0.05) * goods * demand);
  return { ...base, kind: 'buy', want, budget, line: lines.buyOpen(s, want) };
}

export function openShop(s: GameState, cat: Catalog): void {
  if (s.phase !== 'morning') return;
  s.phase = 'open';
  s.visitorsToday = visitorsExpected(s);
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

export interface BuyQuote {
  /** how many goods */
  count: number;
  /** what the shop pays */
  price: number;
  /** the same goods without the bundle discount */
  full: number;
  /** discount applied (0 when none) */
  rate: number;
  /** why the shop cannot buy them: no room on the shelf, or not enough GUM */
  block: 'gum' | 'shelf' | null;
}

/** True when every one of these goods finds a place on the shelf together. */
function fitsAll(s: GameState, cat: Catalog, itemIds: readonly number[]): boolean {
  const before = s.stock.length;
  let ok = true;
  for (const itemId of itemIds) {
    const slot = findSlot(s, cat, itemId);
    if (!slot) {
      ok = false;
      break;
    }
    s.stock.push({ uid: -1 - s.stock.length, itemId, cond: 1, paid: 0, ...slot });
  }
  s.stock.length = before;
  return ok;
}

/**
 * Works out buying some of a seller's goods (`picks` are indexes into `v.offers`), without doing it.
 * Taking everything the seller brought at once earns their bundle discount.
 */
export function quoteBuy(s: GameState, cat: Catalog, v: Visitor, picks: readonly number[]): BuyQuote {
  const chosen = [...new Set(picks)].map((i) => v.offers[i]).filter((o): o is Offer => !!o);
  const full = chosen.reduce((sum, o) => sum + o.ask, 0);
  const rate = chosen.length === v.offers.length && chosen.length >= 2 ? v.bundleRate : 0;
  const price = Math.round(full * (1 - rate));
  let block: BuyQuote['block'] = null;
  if (chosen.length > 0 && !fitsAll(s, cat, chosen.map((o) => o.itemId))) block = 'shelf';
  else if (s.gum < price) block = 'gum';
  return { count: chosen.length, price, full, rate, block };
}

/** All the goods a seller still has, as picks. */
export const allPicks = (v: Visitor): number[] => v.offers.map((_, i) => i);

/**
 * Buys the picked goods. The seller stays while goods remain, and leaves once everything is bought.
 */
export function buy(s: GameState, cat: Catalog, picks: readonly number[]): boolean {
  const v = currentVisitor(s);
  if (!v || v.done || v.kind !== 'sell') return false;
  const quote = quoteBuy(s, cat, v, picks);
  if (quote.count === 0 || quote.block) return false;
  const chosen = new Set(picks);
  const taken = v.offers.filter((_, i) => chosen.has(i));
  // the discount is shared out so each good remembers what it really cost
  let left = quote.price;
  taken.forEach((o, i) => {
    const paid = i === taken.length - 1 ? left : Math.round(o.ask * (1 - quote.rate));
    left -= paid;
    addStock(s, cat, o.itemId, o.cond, paid);
  });
  s.gum -= quote.price;
  s.today.spend += quote.price;
  s.today.bought += taken.length;
  s.totals.bought += taken.length;
  v.offers = v.offers.filter((_, i) => !chosen.has(i));
  v.bundleRate = 0;
  v.mood = 'happy';
  if (v.offers.length === 0) {
    v.done = true;
    v.line = lines.dealSeller(v.temper);
  } else {
    v.line = lines.moreSeller(v.temper);
  }
  return true;
}

/** Asks for a discount on everything the seller still has. Works once per customer; a refusal costs patience. */
export function haggle(s: GameState, tier: number): boolean {
  const v = currentVisitor(s);
  if (!v || v.done || v.kind !== 'sell' || v.haggled) return false;
  if (rand(s) < discountChance(s, v, tier)) {
    for (const o of v.offers) o.ask = discountedAsk(o.ask, tier);
    v.haggled = true;
    v.mood = 'neutral';
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
 * and the rest is lost. A refusal costs patience. The customer stays while they have money left.
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
    v.budget -= quote.paid;
    v.mood = 'happy';
    if (v.budget < B.budgetFloor) {
      v.done = true;
      v.line = lines.dealBuyer(v.temper);
    } else {
      v.line = lines.moreBuyer(v.temper);
    }
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

/** Sends the customer away (the bell). No penalty. */
export function pass(s: GameState): void {
  const v = currentVisitor(s);
  if (!v || v.done) return;
  v.done = true;
  v.line = lines.pass(v.temper);
}

// ---------------------------------------------------------------- shop management

export function dispose(s: GameState, cat: Catalog, uid: number, id: GridId = 'shelf'): boolean {
  const items = id === 'shelf' ? s.stock : s.wallet.items;
  const index = items.findIndex((x) => x.uid === uid);
  if (index < 0) return false;
  const price = disposePrice(cat, items[index]);
  items.splice(index, 1);
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
export function endDay(s: GameState): void {
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
  startMorning(s);
}

export const findItem = (cat: Catalog, itemId: number): Item => cat.itemById.get(itemId)!;
