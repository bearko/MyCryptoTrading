import { B } from './balance';
import type { Catalog, Item } from './catalog';
import { lines } from './lines';
import { pick, pickWeighted, rand, randRange } from './rng';
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
export const markupChance = (s: GameState, v: Visitor, tier: number): number => chance(s, B.markupChance[tier], v.temper);

export function matches(cat: Catalog, want: Want, itemId: number): boolean {
  const item = cat.itemById.get(itemId)!;
  if (want.type === 'kind') return item.kind === want.kind;
  if (want.type === 'rarity') return item.rarity >= want.min;
  return true;
}

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

function addStock(s: GameState, itemId: number, cond: number, paid: number): void {
  s.stock.push({ uid: s.nextUid++, itemId, cond, paid });
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
    v: 1,
    rng: seed | 0,
    day: 1,
    gum: B.startGum,
    rep: B.startRep,
    capacity: B.startCapacity,
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
    addStock(s, item.id, 1, 0);
  }
  startMorning(s, cat);
  return s;
}

export function buyWholesale(s: GameState, index: number): boolean {
  const offer = s.wholesale[index];
  if (s.phase !== 'morning' || !offer || offer.sold || s.gum < offer.price || s.stock.length >= s.capacity) return false;
  s.gum -= offer.price;
  offer.sold = true;
  addStock(s, offer.itemId, offer.cond, offer.price);
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
  else if (s.stock.length >= s.capacity) sellerShare = 0.2;
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
export function buyBlock(s: GameState, price: number): BuyBlock {
  if (s.stock.length >= s.capacity) return 'shelf';
  if (s.gum < price) return 'gum';
  return null;
}

/** Buys the good at the current asking price, or a bit over it (`tip`) to earn goodwill. */
export function acceptAsk(s: GameState, tip: boolean): boolean {
  const v = currentVisitor(s);
  if (!v || v.done || v.kind !== 'sell') return false;
  const price = tip ? tipPrice(v) : v.ask;
  if (buyBlock(s, price)) return false;
  s.gum -= price;
  addStock(s, v.itemId, v.cond, price);
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

export type OfferResult = 'sold' | 'refused' | 'left' | 'nomatch' | 'over' | 'invalid';

export function offer(s: GameState, cat: Catalog, uid: number, tier: number): OfferResult {
  const v = currentVisitor(s);
  const index = s.stock.findIndex((x) => x.uid === uid);
  if (!v || v.done || v.kind !== 'buy' || index < 0) return 'invalid';
  const stock = s.stock[index];
  if (!matches(cat, v.want, stock.itemId)) {
    v.line = lines.noMatch();
    return 'nomatch';
  }
  const price = salePrice(cat, stock, tier);
  if (price > v.budget) return 'over';
  if (rand(s) < markupChance(s, v, tier)) {
    s.gum += price;
    s.stock.splice(index, 1);
    s.today.revenue += price;
    s.today.sold += 1;
    s.totals.sold += 1;
    s.totals.bestSale = Math.max(s.totals.bestSale, price);
    addRep(s, B.markupRep[tier]);
    v.done = true;
    v.mood = 'happy';
    v.line = lines.dealBuyer(v.temper);
    return 'sold';
  }
  strike(s, v, lines.markupNg(v.temper));
  return v.done ? 'left' : 'refused';
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
  s.capacity += B.shelfStep;
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
