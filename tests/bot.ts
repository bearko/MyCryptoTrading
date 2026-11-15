import { B } from '../src/game/balance';
import type { Catalog } from '../src/game/catalog';
import * as C from '../src/game/craft';
import * as G from '../src/game/logic';
import * as N from '../src/game/night';
import { buyService, serviceBlock, serviceById, type ServiceId } from '../src/game/network';
import type { GameState } from '../src/game/state';

/** crafty: careful, and puts goods through the pot whenever that makes something worth more than what goes in. */
/** plain: fair prices. careful: haggles and marks up. kind: pays a little more and sells a little under, for the houses' regard. */
/** keeper: careful, and uses the things of the shop — the showcase, the guild's favours, goods by telephone. master: keeper with the pot. */
export type Style = 'plain' | 'careful' | 'kind' | 'crafty' | 'partisan' | 'keeper' | 'master';

/** partisan: sides with two houses (kind to them), and drives hard bargains with their rivals. */
const FRIENDS = ['suzaku', 'seiryu'];
const FOES = ['genbu', 'byakko'];
/** The way a customer is treated: a style, seen through the customer's house. */
function stance(style: Style, v: { faction: string | null }): Style {
  if (style === 'keeper') return 'careful';
  if (style === 'master') return 'crafty';
  if (style !== 'partisan') return style;
  return v.faction && FRIENDS.includes(v.faction) ? 'kind' : v.faction && FOES.includes(v.faction) ? 'careful' : 'plain';
}

/** Plays one game to the end (deed bought, bankrupt, or `maxDays`). */
export function play(cat: Catalog, seed: number, style: Style, maxDays = 200): GameState {
  const s = G.newGame(seed, cat);
  while (s.phase !== 'lost' && !s.owned && s.day <= maxDays) {
    if (s.perkOffer) G.choosePerk(s, s.perkOffer[0]);
    if (style === 'keeper' || style === 'master') keepShop(s, cat, style === 'master');
    if (style === 'crafty' || style === 'master') craftAll(s, cat);
    G.openShop(s, cat);
    while (s.phase === 'open') {
      const v = G.currentVisitor(s)!;
      if (v.special === 'landlord') {
        // the shop when it can be had, the rent otherwise (and when there is no rent to give, the guild's word or the street)
        if (G.buyDeed(s)) break;
        if (!G.payRent(s)) G.refuseRent(s);
      } else if (v.special === 'dealer') {
        // short of the rent: goods go to the dealer, the cheapest first (never the pot)
        const goods = G.forSale(s)
          .filter((x) => !cat.itemById.get(x.itemId)!.effect)
          .sort((x, y) => G.salePrice(cat, x, 0) - G.salePrice(cat, y, 0));
        for (const x of goods) {
          if (s.gum >= s.rent || v.done) break;
          G.sell(s, cat, [x.uid], 0);
        }
        G.pass(s);
      } else if (v.kind === 'sell') serveSeller(s, cat, style);
      else serveBuyer(s, cat, style);
      G.callNext(s, cat);
    }
    // evening
    const reserve = G.daysToRent(s) <= 2 && !s.owned ? s.rent : 0;
    const cost = G.shelfCost(s);
    if (cost !== null && G.freeCells(s, cat) < 6 && s.gum - cost > reserve + 150) G.upgradeShelf(s);
    // a thin shelf and some money: a night at the shop (tomorrow opens late)
    const spare = s.gum - reserve;
    if (s.stock.filter((x) => !x.bag && !cat.itemById.get(x.itemId)!.effect).length < 3 && spare > 120 && N.goShop(s, cat)) {
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

/** The favours a shopkeeper asks of the guild, in the order they are wanted. */
const WANTED: ServiceId[] = ['case1', 'guest1', 'vip', 'eye', 'guest2', 'case2'];

/** The morning round of the shop's things: the parcel, the guild, the showcase, and an order when the shelf is thin. */
function keepShop(s: GameState, cat: Catalog, pot: boolean): void {
  G.unpackAll(s, cat);
  const reserve = G.daysToRent(s) <= 2 && !s.owned ? s.rent : 0;
  // the guild: with trust when there is enough of it, with GUM only when money is plentiful
  for (const id of pot ? [...WANTED.slice(0, 2), 'pot' as const, ...WANTED.slice(2)] : WANTED) {
    if (serviceBlock(s, id, 'trust') === '') buyService(s, id, 'trust');
    else if (serviceBlock(s, id, 'gum') === '' && s.gum - serviceById(id).gum > reserve + serviceById(id).gum * 2) buyService(s, id, 'gum');
  }
  // the showcase: the rarest goods of the shop, as many as fit (they are sold from there like any other)
  // (the pot stays on the shelf: that is where it works from)
  const rarest = s.stock.filter((x) => !x.bag && !cat.itemById.get(x.itemId)!.effect).sort((a, b) => cat.itemById.get(b.itemId)!.rarity - cat.itemById.get(a.itemId)!.rarity);
  for (const x of rarest) {
    if (G.freeCells(s, cat, 'case') === 0) break;
    N.transfer(s, cat, 'shelf', x.uid, 'case');
  }
  // a thin shelf: a lot by telephone, of the line in demand today if there is one
  if (!s.supply && s.stock.filter((x) => !x.bag && !cat.itemById.get(x.itemId)!.effect).length < 5 && s.gum - B.supplies.lot.gum > reserve + 100) {
    G.placeSupply(s, cat, 'lot', s.event.id === 'demand' && s.event.param ? s.event.param : 'phy', 'gum');
  }
}

/** The pot, greedily: the base and the cheapest partners that are enough, as long as the result is worth more. */
function craftAll(s: GameState, cat: Catalog): void {
  const worth = (x: { itemId: number; cond: number }): number => G.itemValue(cat, x.itemId, x.cond);
  for (let guard = 0; guard < 30; guard++) {
    let best: { uids: number[]; gain: number } | null = null;
    for (const base of s.stock) {
      const item = cat.itemById.get(base.itemId)!;
      if (item.effect || base.bag) continue;
      const next = C.nextOf(cat, item);
      if (!next) continue;
      const need = C.pointsOf(item);
      const others = s.stock.filter((x) => x !== base && !x.bag && !cat.itemById.get(x.itemId)!.effect).sort((a, b) => worth(a) - worth(b));
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

function serveSeller(s: GameState, cat: Catalog, base: Style): void {
  const v = G.currentVisitor(s)!;
  const style = stance(base, v);
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

function serveBuyer(s: GameState, cat: Catalog, base: Style): void {
  const v = G.currentVisitor(s)!;
  const style = stance(base, v);
  // sells one good after another while the customer stays and something fits what they have left
  while (!v.done) {
    // (the pot is a good too: a shopkeeper who uses it keeps it; one who does not sells it like anything else)
    const fits = G.forSale(s)
      .filter((x) => !(base === 'crafty' || base === 'master') || !cat.itemById.get(x.itemId)!.effect)
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
