import { B } from '../src/game/balance';
import type { Catalog } from '../src/game/catalog';
import * as C from '../src/game/craft';
import * as G from '../src/game/logic';
import * as N from '../src/game/night';
import type { GameState } from '../src/game/state';

/** crafty: careful, and puts goods through the pot whenever that makes something worth more than what goes in. */
/** plain: fair prices. careful: haggles and marks up. kind: pays a little more and sells a little under, for the houses' regard. */
export type Style = 'plain' | 'careful' | 'kind' | 'crafty';

/** Plays one game to the end (deed bought, bankrupt, or `maxDays`). */
export function play(cat: Catalog, seed: number, style: Style, maxDays = 200): GameState {
  const s = G.newGame(seed, cat);
  while (s.phase !== 'lost' && !s.owned && s.day <= maxDays) {
    if (s.perkOffer) G.choosePerk(s, s.perkOffer[0]);
    if (style === 'crafty') craftAll(s, cat);
    G.openShop(s, cat);
    while (s.phase === 'open') {
      const v = G.currentVisitor(s)!;
      if (v.kind === 'sell') serveSeller(s, cat, style);
      else serveBuyer(s, cat, style);
      G.callNext(s, cat);
    }
    // evening
    const reserve = G.daysToRent(s) <= 2 && !s.owned ? s.rent : 0;
    const cost = G.shelfCost(s);
    if (cost !== null && G.freeCells(s, cat) < 6 && s.gum - cost > reserve + 150) G.upgradeShelf(s);
    if (G.isRentDay(s) && s.gum < s.rent) {
      // sell stock back to cover the rent
      for (const item of [...s.stock]) {
        if (s.gum >= s.rent) break;
        G.dispose(s, cat, item.uid);
      }
    }
    if (G.buyDeed(s)) break;
    // a thin shelf and some money: a night at the shop (tomorrow opens late)
    const spare = s.gum - reserve;
    if (s.stock.length < 3 && spare > 120 && N.goShop(s, cat)) {
      s.shop!.goods.forEach((g, i) => {
        if (s.gum - g.price < reserve + 40 || cat.itemById.get(g.itemId)!.wallet) return;
        if (N.shopBuy(s, i) && !N.stow(s, cat, s.shop!.tray.length - 1)) s.shop!.tray.pop(); // does not fit: left behind
      });
      N.goHome(s, cat);
    }
    G.endDay(s);
  }
  return s;
}

/** The pot, greedily: the base and the cheapest partners that are enough, as long as the result is worth more. */
function craftAll(s: GameState, cat: Catalog): void {
  const worth = (x: { itemId: number; cond: number }): number => G.itemValue(cat, x.itemId, x.cond);
  for (let guard = 0; guard < 30; guard++) {
    let best: { uids: number[]; gain: number } | null = null;
    for (const base of s.stock) {
      const item = cat.itemById.get(base.itemId)!;
      const next = C.nextOf(cat, item);
      if (!next) continue;
      const need = C.pointsOf(item);
      const others = s.stock.filter((x) => x !== base).sort((a, b) => worth(a) - worth(b));
      const sets: (typeof others)[] = [];
      const single = others.find((x) => C.pointsOf(cat.itemById.get(x.itemId)!) >= need);
      if (single) sets.push([single]);
      pairs: for (let i = 0; i < others.length; i++) {
        for (let j = i + 1; j < others.length; j++) {
          if (C.pointsOf(cat.itemById.get(others[i].itemId)!) + C.pointsOf(cat.itemById.get(others[j].itemId)!) >= need) {
            sets.push([others[i], others[j]]);
            break pairs;
          }
        }
      }
      for (const partners of sets) {
        const uids = [base.uid, ...partners.map((x) => x.uid)];
        const plan = C.planCraft(s, cat, uids);
        if (plan.block || !plan.result) continue;
        const gain = G.itemValue(cat, plan.result.id, plan.cond) - plan.fee - worth(base) - partners.reduce((sum, x) => sum + worth(x), 0);
        if (gain > 0 && (!best || gain > best.gain)) best = { uids, gain };
      }
    }
    if (!best || !C.craft(s, cat, best.uids).ok) return;
  }
}

function serveSeller(s: GameState, cat: Catalog, style: Style): void {
  const v = G.currentVisitor(s)!;
  const reserve = G.daysToRent(s) <= 1 && !s.owned ? s.rent : 0;
  if ((style === 'careful' || style === 'crafty') && v.temper < 2) {
    const tier = v.temper === 0 ? 1 : 0;
    while (!v.done && !v.haggled && v.patience > 1) G.haggle(s, tier);
  }
  if (style === 'kind' && !v.haggled && s.gum > 400) G.sweeten(s, 0);
  if (v.done) return;
  // everything at once when it is affordable and fits (it may be discounted) …
  const all = G.quoteBuy(s, cat, v, G.allPicks(v));
  if (!all.block && s.gum - all.price >= reserve) {
    G.buy(s, cat, G.allPicks(v));
    return;
  }
  // … otherwise one good at a time, cheapest first, while money and room last
  for (;;) {
    const order = G.allPicks(v).sort((a, b) => v.offers[a].ask - v.offers[b].ask);
    const next = order.find((i) => {
      const q = G.quoteBuy(s, cat, v, [i]);
      return !q.block && s.gum - q.price >= reserve;
    });
    if (next === undefined || !G.buy(s, cat, [next]) || v.done) break;
  }
  if (!v.done) G.pass(s);
}

function serveBuyer(s: GameState, cat: Catalog, style: Style): void {
  const v = G.currentVisitor(s)!;
  // sells one good after another while the customer stays and something fits what they have left
  while (!v.done) {
    const fits = s.stock
      .filter((x) => G.matches(cat, v.want, x.itemId) && G.salePrice(cat, x, 0) <= v.budget)
      .sort((a, b) => G.salePrice(cat, b, 0) - G.salePrice(cat, a, 0));
    if (fits.length === 0) break;
    let item = fits[0];
    let tier = 0;
    if ((style === 'careful' || style === 'crafty')) {
      // a dear price shrinks what the customer can spend, so the good and the markup are chosen together:
      // whatever brings in the most, fits the budget and still has decent odds
      let best = G.quoteSale(s, cat, v, [item.uid], 0).paid;
      for (const x of fits) {
        for (let t = B.markupTiers.length - 1; t > 0; t--) {
          const quote = G.quoteSale(s, cat, v, [x.uid], t);
          if (quote.over === 0 && quote.chance >= 0.45 && quote.paid > best) {
            best = quote.paid;
            item = x;
            tier = t;
          }
        }
      }
    }
    for (;;) {
      const result = G.sell(s, cat, [item.uid], style === 'kind' ? -1 : v.patience > 1 ? tier : 0);
      if (result === 'refused') tier = Math.max(0, tier - 1);
      else break;
    }
  }
  if (!v.done) G.pass(s);
}
