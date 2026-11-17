import { B } from './balance';
import type { Catalog, Item } from './catalog';
import { addTo, canPlaceIn, disposePrice, findSlotIn, gridOf, packInto, hasPerk, itemsOf, goodsOf, itemValue, rollRarity, walletSize, type GridId } from './logic';
import { pick, pickWeighted, rand, randRange } from './rng';
import { SLOT_IDS, type GameState, type LooseItem, type SlotId, type StockItem } from './state';

/** One outing a night: allowed after closing, while not gone out yet. */
export const canGoOut = (s: GameState): boolean => s.phase === 'evening' && !s.wentOut;

// ---------------------------------------------------------------- the night shop

/** Walks to the night shop. Its goods cost a little under market value; all the shop's GUM comes along. */
export function goShop(s: GameState, cat: Catalog): boolean {
  if (!canGoOut(s)) return false;
  s.wentOut = true;
  s.phase = 'shop';
  const goods = [];
  for (let i = 0; i < B.shopCount; i++) {
    const item = pick(s, goodsOf(s, cat, rollRarity(s, 0)));
    const cond = pickWeighted(s, B.condWeights);
    goods.push({ itemId: item.id, cond, price: inMchc(itemValue(cat, item.id, cond) * randRange(s, B.shopRate[0], B.shopRate[1]) * (hasPerk(s, 'eye') ? B.perkEye : 1)), sold: false });
  }
  // sometimes the next wallet up is on sale: a bigger wallet carries more home
  const now = cat.itemById.get(s.wallet.itemId)!.rarity;
  const next = cat.wallets.find((w) => w.rarity === now + 1);
  if (next && rand(s) < B.shopWalletChance) goods.push({ itemId: next.id, cond: 1, price: inMchc(itemValue(cat, next.id, 1)), sold: false });
  s.shop = { goods, tray: [], box: null };
  layShop(s, cat);
  return true;
}

/**
 * Stands the shop's goods on its floor, each at its real size, in rows with room between them (so how much room
 * a good will take in the wallet is plain before it is bought). A good that finds no room is not put out.
 */
export function layShop(s: GameState, cat: Catalog): void {
  const shop = s.shop;
  if (!shop || shop.goods.every((g) => g.x !== undefined)) return;
  const gap = 2;
  let x = 1;
  let y = 1;
  let tall = 0;
  shop.goods = shop.goods.filter((g) => {
    const size = cat.itemById.get(g.itemId)!.shape.split('x').map(Number);
    if (x + size[0] > B.shopFloor - 1) {
      x = 1;
      y += tall + gap + 1;
      tall = 0;
    }
    if (y + size[1] > B.shopFloor - 1) return false;
    g.x = x;
    g.y = y;
    x += size[0] + gap;
    tall = Math.max(tall, size[1]);
    return true;
  });
}

/** What a box costs: the box and the postage. A larger box in place of the one bought costs the difference. */
export function boxCost(s: GameState, size: number): number {
  const full = (n: number): number => B.boxes[n].price + B.boxes[n].post;
  const now = s.shop?.box;
  return full(size) - (now ? full(now.size) : 0);
}

/** Buys a box to send goods home in (or a larger one in place of it: what is in it stays where it lies). */
export function buyBox(s: GameState, size: number): boolean {
  const shop = s.shop;
  if (s.phase !== 'shop' || !shop || !B.boxes[size] || (shop.box && size <= shop.box.size)) return false;
  const cost = boxCost(s, size);
  if (s.mchc < cost) return false;
  s.mchc -= cost;
  shop.box = { size, items: shop.box?.items ?? [] };
  return true;
}

/** The night shop's price for a worth in GUM: in MCHC, at the price MCHC rests at (so MCHC bought cheap buys more). */
const inMchc = (gum: number): number => Math.max(1, Math.round(gum / B.mchc.base));

/** Pays for a good (in MCHC). It is not in the wallet yet: it has to be put in to be carried home. */
export function shopBuy(s: GameState, index: number): boolean {
  const good = s.shop?.goods[index];
  if (s.phase !== 'shop' || !good || good.sold || s.mchc < good.price) return false;
  s.mchc -= good.price;
  good.sold = true;
  // (what it cost, in GUM, for the shop's books)
  s.shop!.tray.push({ itemId: good.itemId, cond: good.cond, paid: Math.round(good.price * B.mchc.base) });
  return true;
}

/** Puts a bought good from the tray into the wallet (first free spot). False when it does not fit. */
export function stow(s: GameState, cat: Catalog, trayIndex: number, to: 'wallet' | 'box' = 'wallet'): boolean {
  const loose = s.shop?.tray[trayIndex];
  if (!loose || addTo(s, cat, to, loose.itemId, loose.cond, loose.paid) === null) return false;
  s.shop!.tray.splice(trayIndex, 1);
  return true;
}

/** Takes a good back out of the wallet onto the tray (to make room for another). */
export function unstow(s: GameState, uid: number): boolean {
  // (out of the wallet, or out of the box)
  const from = s.wallet.items.some((x) => x.uid === uid) ? s.wallet.items : (s.shop?.box?.items ?? []);
  const index = from.findIndex((x) => x.uid === uid);
  if (s.phase !== 'shop' || !s.shop || index < 0) return false;
  const [x] = from.splice(index, 1);
  s.shop.tray.push({ itemId: x.itemId, cond: x.cond, paid: x.paid });
  return true;
}

/** Goes home. Whatever was bought and is not in the wallet is left behind; what lies in the box is sent, and comes at the end of the next day. */
export function goHome(s: GameState, cat: Catalog): void {
  if (s.phase !== 'shop' && s.phase !== 'quest') return;
  const boxed = s.shop?.box?.items ?? [];
  if (boxed.length > 0) s.post.push({ due: s.day + 1, items: boxed.map((x) => ({ itemId: x.itemId, cond: x.cond, paid: x.paid })) });
  s.shop = null;
  s.quest = null;
  s.phase = 'evening';
  unloadWallet(s, cat);
}

// ---------------------------------------------------------------- the wallet at home

/** Moves one good from the wallet to the shelf. False when the shelf has no room for it. */
export function unload(s: GameState, cat: Catalog, uid: number): boolean {
  const index = s.wallet.items.findIndex((x) => x.uid === uid);
  if (index < 0) return false;
  const x = s.wallet.items[index];
  const slot = findSlotIn(gridOf(s, cat, 'shelf'), cat, x.itemId);
  if (!slot) return false;
  s.wallet.items.splice(index, 1);
  s.stock.push({ ...x, ...slot });
  return true;
}

/** Moves everything that fits from the wallet to the shelf. What does not fit stays in the wallet. */
export function unloadWallet(s: GameState, cat: Catalog): void {
  for (const x of [...s.wallet.items]) unload(s, cat, x.uid);
}

// ---------------------------------------------------------------- gear

/** Which slot a good goes to. Special goods fill the first free special slot, else replace the first. */
export function slotFor(s: GameState, item: Item): SlotId {
  if (item.slot !== 'special') return item.slot;
  return !s.equip.special1 ? 'special1' : !s.equip.special2 ? 'special2' : 'special1';
}

/** Takes a good off a grid and returns it (null when it is not there). */
function take(s: GameState, id: GridId, uid: number): LooseItem | null {
  const items = itemsOf(s, id);
  const index = items.findIndex((x) => x.uid === uid);
  // (the wallet in use stays on the shelf)
  if (index < 0 || items[index].bag) return null;
  const [x] = items.splice(index, 1);
  return { itemId: x.itemId, cond: x.cond, paid: x.paid, ...(x.fake ? { fake: true } : {}), ...(x.seen ? { seen: true } : {}), ...(x.hot ? { hot: true } : {}) };
}

/**
 * Moves a good between the shelf and the wallet. With a cell it lands there as it is turned (or not at all);
 * without one it takes the first spot that fits. False when there is no room.
 */
export function transfer(s: GameState, cat: Catalog, from: GridId, uid: number, to: GridId, x?: number, y?: number): boolean {
  if (from === to) return false;
  const source = itemsOf(s, from);
  const index = source.findIndex((it) => it.uid === uid);
  // (the wallet in use stays on the shelf)
  if (index < 0 || source[index].bag) return false;
  const stock = source[index];
  const target = gridOf(s, cat, to);
  const slot = x === undefined || y === undefined ? findSlotIn(target, cat, stock.itemId) : canPlaceIn(target, cat, stock.itemId, x, y, stock.rot) ? { x, y, rot: stock.rot } : null;
  if (!slot) return false;
  source.splice(index, 1);
  target.items.push({ ...stock, ...slot });
  binned(s, cat, stock, from, to);
  return true;
}

/** Keeps the bin's tally when a good goes into it or comes out of it. */
function binned(s: GameState, cat: Catalog, x: StockItem, from: GridId, to: GridId): void {
  if (to === 'trash') s.trashGum += disposePrice(cat, x);
  if (from === 'trash') s.trashGum = Math.max(0, s.trashGum - disposePrice(cat, x));
}

export type ManyResult = { ok: true; moved: number[] } | { ok: false; fit: number[]; left: number[] };

/**
 * Moves several goods at once to a grid (the same one tidies them). They are not kept in the arrangement they
 * had: each takes the first free spot from the top-left. When they do not all fit, nothing moves, and the answer
 * tells which of them would fit if the rest stayed behind.
 */
export function moveMany(s: GameState, cat: Catalog, from: GridId, uids: readonly number[], to: GridId): ManyResult {
  const source = itemsOf(s, from);
  const goods = source.filter((x) => uids.includes(x.uid) && !x.bag);
  const target = gridOf(s, cat, to);
  const others = from === to ? target.items.filter((x) => !goods.includes(x)) : target.items;
  const { spots, left } = packInto({ cols: target.cols, rows: target.rows, items: others }, cat, goods);
  if (left.length > 0) return { ok: false, fit: goods.filter((x) => spots.has(x.uid)).map((x) => x.uid), left };
  for (const x of goods) {
    Object.assign(x, spots.get(x.uid));
    if (from === to) continue;
    source.splice(source.indexOf(x), 1);
    target.items.push(x);
    binned(s, cat, x, from, to);
  }
  return { ok: true, moved: goods.map((x) => x.uid) };
}

/** True when a good may be worn in a slot (a special good in either special slot). */
export function fitsSlot(item: Item, slot: SlotId): boolean {
  if (item.wallet) return false;
  return item.slot === 'special' ? slot.startsWith('special') : item.slot === slot;
}

export type EquipResult = 'ok' | 'noroom' | 'walletfull' | 'invalid';

/**
 * Wears a good from the shelf or the wallet. What was worn there goes back to where the good came from.
 * A wallet replaces the wallet (from the shelf only); a smaller one is refused while the wallet holds goods.
 */
export function equip(s: GameState, cat: Catalog, uid: number, slot?: SlotId, from: GridId = 'shelf'): EquipResult {
  const source = itemsOf(s, from);
  const stock = source.find((x) => x.uid === uid);
  if (!stock) return 'invalid';
  const item = cat.itemById.get(stock.itemId)!;
  const backup = { ...stock };
  if (item.wallet) {
    if (from !== 'shelf') return 'invalid';
    const [cols, rows] = B.walletSizes[item.rarity];
    const now = walletSize(s, cat);
    if (s.wallet.items.length > 0 && (cols < now.cols || rows < now.rows)) return 'walletfull';
    // the wallet in use is a good on the shelf: the new one takes its place where it stands, and the old
    // one is a good like any other again
    if (stock.bag) return 'invalid';
    const old = s.stock.find((x) => x.bag);
    if (old) old.bag = false;
    stock.bag = true;
    s.wallet.itemId = item.id;
    return 'ok';
  }
  const target = slot ?? slotFor(s, item);
  if (!fitsSlot(item, target)) return 'invalid';
  const old = s.equip[target];
  const worn = take(s, from, uid)!;
  const backUid = old ? addTo(s, cat, from, old.itemId, old.cond, old.paid) : null;
  // (what comes off keeps what is known about it)
  const back = backUid === null ? undefined : gridOf(s, cat, from).items.find((x) => x.uid === backUid);
  if (back && old?.fake) back.fake = true;
  if (back && old?.seen) back.seen = true;
  if (back && old?.hot) back.hot = true;
  if (old && backUid === null) {
    source.push(backup);
    return 'noroom';
  }
  s.equip[target] = worn;
  return 'ok';
}

/**
 * Takes gear off and puts it on the shelf or in the wallet: at a cell when one is given, else at the first
 * spot that fits. False when there is no room.
 */
export function unequip(s: GameState, cat: Catalog, slot: SlotId, to: GridId = 'shelf', x?: number, y?: number): boolean {
  const old = s.equip[slot];
  if (!old) return false;
  const target = gridOf(s, cat, to);
  const spot = x === undefined || y === undefined ? findSlotIn(target, cat, old.itemId) : canPlaceIn(target, cat, old.itemId, x, y, 0) ? { x, y, rot: 0 } : null;
  if (!spot) return false;
  target.items.push({ uid: s.nextUid++, itemId: old.itemId, cond: old.cond, paid: old.paid, ...(old.fake ? { fake: true } : {}), ...(old.seen ? { seen: true } : {}), ...(old.hot ? { hot: true } : {}), ...spot });
  s.equip[slot] = null;
  return true;
}

/** The player's [hp, phy, int, agi]: the warrior's own plus everything worn. */
export function playerStats(s: GameState, cat: Catalog): number[] {
  const stats = [...cat.player.stats];
  for (const slot of SLOT_IDS) {
    const worn = s.equip[slot];
    if (worn) cat.itemById.get(worn.itemId)!.stats.forEach((v, i) => (stats[i] += v));
  }
  return stats;
}
