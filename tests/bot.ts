import { B } from '../src/game/balance';
import type { Catalog } from '../src/game/catalog';
import * as G from '../src/game/logic';
import type { GameState } from '../src/game/state';

export type Style = 'plain' | 'careful';

/** Plays one game to the end (deed bought, bankrupt, or `maxDays`). */
export function play(cat: Catalog, seed: number, style: Style, maxDays = 200): GameState {
  const s = G.newGame(seed, cat);
  while (s.phase !== 'lost' && !s.owned && s.day <= maxDays) {
    // morning: restock from the wholesaler when the shelf is thin
    s.wholesale.forEach((o, i) => {
      if (s.stock.length < 4 && s.gum - o.price > 60) G.buyWholesale(s, i);
    });
    G.openShop(s, cat);
    while (s.phase === 'open') {
      const v = G.currentVisitor(s)!;
      if (v.kind === 'sell') serveSeller(s, style);
      else serveBuyer(s, cat, style);
      G.callNext(s, cat);
    }
    // evening
    const reserve = G.daysToRent(s) <= 2 && !s.owned ? s.rent : 0;
    const cost = G.shelfCost(s);
    if (cost !== null && s.stock.length >= s.capacity - 1 && s.gum - cost > reserve + 150) G.upgradeShelf(s);
    if (G.isRentDay(s) && s.gum < s.rent) {
      // sell stock back to cover the rent
      for (const item of [...s.stock]) {
        if (s.gum >= s.rent) break;
        G.dispose(s, cat, item.uid);
      }
    }
    if (G.buyDeed(s)) break;
    G.endDay(s, cat);
  }
  return s;
}

function serveSeller(s: GameState, style: Style): void {
  const v = G.currentVisitor(s)!;
  const reserve = G.daysToRent(s) <= 1 && !s.owned ? s.rent : 0;
  if (style === 'careful' && v.temper < 2) {
    const tier = v.temper === 0 ? 1 : 0;
    while (!v.done && !v.haggled && v.patience > 1) G.haggle(s, tier);
  }
  if (v.done) return;
  if (s.gum - v.ask >= reserve && !G.buyBlock(s, v.ask)) G.acceptAsk(s, false);
  else G.pass(s);
}

function serveBuyer(s: GameState, cat: Catalog, style: Style): void {
  const v = G.currentVisitor(s)!;
  const fits = s.stock
    .filter((x) => G.matches(cat, v.want, x.itemId) && G.salePrice(cat, x, 0) <= v.budget)
    .sort((a, b) => G.salePrice(cat, b, 0) - G.salePrice(cat, a, 0));
  if (fits.length === 0) return G.pass(s);
  const item = fits[0];
  let tier = 0;
  if (style === 'careful') {
    // the highest markup that fits the budget and still has decent odds, while patience lasts
    for (let t = B.markupTiers.length - 1; t > 0; t--) {
      if (G.salePrice(cat, item, t) <= v.budget && G.markupChance(s, v, t) >= 0.45) {
        tier = t;
        break;
      }
    }
  }
  while (!v.done) {
    const result = G.offer(s, cat, item.uid, v.patience > 1 ? tier : 0);
    if (result === 'refused') tier = Math.max(0, tier - 1);
    else if (result !== 'sold') break;
  }
  if (!v.done) G.pass(s);
}
