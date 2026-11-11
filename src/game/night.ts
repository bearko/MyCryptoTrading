import { B } from './balance';
import type { Catalog, Item } from './catalog';
import { addTo, canPlaceIn, findSlotIn, gridOf, itemValue, rollRarity, walletSize, type GridId } from './logic';
import { pick, pickWeighted, rand, randRange } from './rng';
import { SLOT_IDS, type GameState, type LooseItem, type SlotId } from './state';

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
    const item = pick(s, cat.itemsByRarity[rollRarity(s, 0)]);
    const cond = pickWeighted(s, B.condWeights);
    goods.push({ itemId: item.id, cond, price: Math.max(1, Math.round(itemValue(cat, item.id, cond) * randRange(s, B.shopRate[0], B.shopRate[1]))), sold: false });
  }
  // sometimes the next wallet up is on sale: a bigger wallet carries more home
  const now = cat.itemById.get(s.wallet.itemId)!.rarity;
  const next = cat.wallets.find((w) => w.rarity === now + 1);
  if (next && rand(s) < B.shopWalletChance) goods.push({ itemId: next.id, cond: 1, price: itemValue(cat, next.id, 1), sold: false });
  s.shop = { goods, tray: [] };
  return true;
}

/** Pays for a good. It is not in the wallet yet: it has to be put in to be carried home. */
export function shopBuy(s: GameState, index: number): boolean {
  const good = s.shop?.goods[index];
  if (s.phase !== 'shop' || !good || good.sold || s.gum < good.price) return false;
  s.gum -= good.price;
  good.sold = true;
  s.today.spend += good.price;
  s.shop!.tray.push({ itemId: good.itemId, cond: good.cond, paid: good.price });
  return true;
}

/** Puts a bought good from the tray into the wallet (first free spot). False when it does not fit. */
export function stow(s: GameState, cat: Catalog, trayIndex: number): boolean {
  const loose = s.shop?.tray[trayIndex];
  if (!loose || addTo(s, cat, 'wallet', loose.itemId, loose.cond, loose.paid) === null) return false;
  s.shop!.tray.splice(trayIndex, 1);
  return true;
}

/** Takes a good back out of the wallet onto the tray (to make room for another). */
export function unstow(s: GameState, uid: number): boolean {
  const index = s.wallet.items.findIndex((x) => x.uid === uid);
  if (s.phase !== 'shop' || !s.shop || index < 0) return false;
  const [x] = s.wallet.items.splice(index, 1);
  s.shop.tray.push({ itemId: x.itemId, cond: x.cond, paid: x.paid });
  return true;
}

/** Goes home. Whatever was bought and is not in the wallet is left behind. */
export function goHome(s: GameState, cat: Catalog): void {
  if (s.phase !== 'shop' && s.phase !== 'quest') return;
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
  const items = id === 'shelf' ? s.stock : s.wallet.items;
  const index = items.findIndex((x) => x.uid === uid);
  if (index < 0) return null;
  const [x] = items.splice(index, 1);
  return { itemId: x.itemId, cond: x.cond, paid: x.paid };
}

/**
 * Moves a good between the shelf and the wallet. With a cell it lands there as it is turned (or not at all);
 * without one it takes the first spot that fits. False when there is no room.
 */
export function transfer(s: GameState, cat: Catalog, from: GridId, uid: number, to: GridId, x?: number, y?: number): boolean {
  if (from === to) return false;
  const source = from === 'shelf' ? s.stock : s.wallet.items;
  const index = source.findIndex((it) => it.uid === uid);
  if (index < 0) return false;
  const stock = source[index];
  const target = gridOf(s, cat, to);
  const slot = x === undefined || y === undefined ? findSlotIn(target, cat, stock.itemId) : canPlaceIn(target, cat, stock.itemId, x, y, stock.rot) ? { x, y, rot: stock.rot } : null;
  if (!slot) return false;
  source.splice(index, 1);
  target.items.push({ ...stock, ...slot });
  return true;
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
  const source = from === 'shelf' ? s.stock : s.wallet.items;
  const stock = source.find((x) => x.uid === uid);
  if (!stock) return 'invalid';
  const item = cat.itemById.get(stock.itemId)!;
  const backup = { ...stock };
  if (item.wallet) {
    if (from !== 'shelf') return 'invalid';
    const [cols, rows] = B.walletSizes[item.rarity];
    const now = walletSize(s, cat);
    if (s.wallet.items.length > 0 && (cols < now.cols || rows < now.rows)) return 'walletfull';
    take(s, 'shelf', uid);
    if (addTo(s, cat, 'shelf', s.wallet.itemId, 1, 0) === null) {
      s.stock.push(backup);
      return 'noroom';
    }
    s.wallet.itemId = item.id;
    return 'ok';
  }
  const target = slot ?? slotFor(s, item);
  if (!fitsSlot(item, target)) return 'invalid';
  const old = s.equip[target];
  const worn = take(s, from, uid)!;
  if (old && addTo(s, cat, from, old.itemId, old.cond, old.paid) === null) {
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
  target.items.push({ uid: s.nextUid++, itemId: old.itemId, cond: old.cond, paid: old.paid, ...spot });
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
