import { describe, expect, it } from 'vitest';
import { B } from '../src/game/balance';
import { catalog } from '../src/game/catalog';
import * as G from '../src/game/logic';
import * as N from '../src/game/night';
import type { GameState } from '../src/game/state';

/** Opens the shop and steps through customers until one of the wanted kind is at the counter. */
function until(s: GameState, kind: 'sell' | 'buy'): void {
  if (s.phase === 'morning') G.openShop(s, catalog);
  for (let guard = 0; guard < 500; guard++) {
    if (s.phase === 'evening') {
      G.endDay(s);
      G.openShop(s, catalog);
    }
    if (G.currentVisitor(s)?.kind === kind) return;
    G.pass(s);
    G.callNext(s, catalog);
  }
  throw new Error('no such customer');
}

describe('game rules', () => {
  it('starts with stock, money, a common wallet and nothing worn', () => {
    const s = G.newGame(1, catalog);
    expect(s.gum).toBe(B.startGum);
    expect(s.stock).toHaveLength(B.startStock);
    expect(G.walletSize(s, catalog)).toEqual({ cols: 4, rows: 5 });
    expect(Object.values(s.equip).every((x) => x === null)).toBe(true);
    expect(s.phase).toBe('morning');
  });

  it('is deterministic for a seed', () => {
    const a = G.newGame(42, catalog);
    const b = G.newGame(42, catalog);
    G.openShop(a, catalog);
    G.openShop(b, catalog);
    expect(a).toEqual(b);
  });

  it('a good has one market value, scaled by condition', () => {
    const item = catalog.items[0];
    expect(G.itemValue(catalog, item.id, 1)).toBe(G.itemValue(catalog, item.id, 1));
    expect(G.itemValue(catalog, item.id, 2)).toBeGreaterThan(G.itemValue(catalog, item.id, 0));
  });

  it('buying a seller\'s goods moves money and stock, and the seller stays while goods remain', () => {
    const s = G.newGame(3, catalog);
    s.gum = 100000;
    s.rows = 8;
    for (;;) {
      until(s, 'sell');
      if (G.currentVisitor(s)!.offers.length >= 2) break;
      G.pass(s);
      G.callNext(s, catalog);
    }
    const v = G.currentVisitor(s)!;
    const count = v.offers.length;
    const first = v.offers[0];
    const before = { gum: s.gum, stock: s.stock.length };
    expect(G.buy(s, catalog, [0])).toBe(true);
    expect(s.gum).toBe(before.gum - first.ask);
    expect(s.stock).toHaveLength(before.stock + 1);
    expect(v.offers).toHaveLength(count - 1);
    expect(v.done).toBe(false);
    expect(v.bundleRate).toBe(0); // the bundle discount is gone after a partial buy
    expect(G.buy(s, catalog, G.allPicks(v))).toBe(true);
    expect(v.done).toBe(true);
    expect(s.stock).toHaveLength(before.stock + count);
  });

  it('taking everything at once earns the bundle discount', () => {
    const s = G.newGame(14, catalog);
    s.gum = 100000;
    s.rows = 8;
    until(s, 'sell');
    const v = G.currentVisitor(s)!;
    v.offers = [
      { itemId: catalog.items[0].id, cond: 1, ask: 100 },
      { itemId: catalog.items[1].id, cond: 1, ask: 60 },
    ];
    v.bundleRate = 0.1;
    expect(G.quoteBuy(s, catalog, v, [0])).toMatchObject({ price: 100, rate: 0 });
    expect(G.quoteBuy(s, catalog, v, [0, 1])).toMatchObject({ count: 2, full: 160, price: 144, rate: 0.1 });
    const gum = s.gum;
    expect(G.buy(s, catalog, [0, 1])).toBe(true);
    expect(s.gum).toBe(gum - 144);
    expect(s.stock.slice(-2).reduce((sum, x) => sum + x.paid, 0)).toBe(144);
  });

  it('cannot buy with a full shelf or an empty purse', () => {
    const s = G.newGame(4, catalog);
    until(s, 'sell');
    const v = G.currentVisitor(s)!;
    s.gum = 0;
    expect(G.quoteBuy(s, catalog, v, [0]).block).toBe('gum');
    expect(G.buy(s, catalog, [0])).toBe(false);
    s.gum = 100000;
    s.rows = 0; // no shelf at all
    expect(G.quoteBuy(s, catalog, v, [0]).block).toBe('shelf');
    expect(G.buy(s, catalog, [0])).toBe(false);
  });

  it('a discount can be won only once, and refusals cost patience', () => {
    const s = G.newGame(5, catalog);
    s.gum = 100000;
    until(s, 'sell');
    const v = G.currentVisitor(s)!;
    const asks = v.offers.map((o) => o.ask);
    let guard = 0;
    while (!v.done && !v.haggled && guard++ < 10) G.haggle(s, 0);
    if (v.haggled) {
      v.offers.forEach((o, i) => expect(o.ask).toBeLessThanOrEqual(asks[i]));
      expect(v.offers.reduce((sum, o) => sum + o.ask, 0)).toBeLessThan(asks.reduce((a, b) => a + b, 0));
      expect(G.haggle(s, 0)).toBe(false);
    } else {
      expect(v.patience).toBe(0);
      expect(s.today.walkouts).toBe(1);
    }
  });

  it('a buyer never pays over budget and never takes the wrong kind of good', () => {
    const s = G.newGame(6, catalog);
    s.gum = 1_000_000; // rent is never a problem here
    for (let n = 0; n < 40; n++) {
      until(s, 'buy');
      const v = G.currentVisitor(s)!;
      for (const item of [...s.stock]) {
        const gum = s.gum;
        const fair = G.salePrice(catalog, item, 0);
        const budget = v.budget;
        const result = G.sell(s, catalog, [item.uid], 0);
        if (!G.matches(catalog, v.want, item.itemId)) {
          expect(result).toBe('nomatch');
          expect(s.gum).toBe(gum);
          continue;
        }
        // at the fair price the customer always agrees; over the budget they pay the budget
        expect(result).toBe('sold');
        expect(s.gum - gum).toBe(Math.min(fair, budget));
        expect(v.budget).toBe(budget - (s.gum - gum));
        // the customer leaves once the money is (nearly) gone, and stays otherwise
        expect(v.done).toBe(v.budget < B.budgetFloor);
        break;
      }
      G.pass(s);
      G.callNext(s, catalog);
    }
  });

  it('several goods can be sold at once, and the total is capped by the budget', () => {
    const s = G.newGame(11, catalog);
    s.gum = 1_000_000;
    until(s, 'buy');
    const v = G.currentVisitor(s)!;
    v.want = { type: 'any' };
    v.budget = 10;
    const uids = s.stock.slice(0, 2).map((x) => x.uid);
    const quote = G.quoteSale(s, catalog, v, uids, 0);
    expect(quote.over).toBe(quote.asked - 10);
    expect(quote.paid).toBe(10);
    const gum = s.gum;
    const count = s.stock.length;
    expect(G.sell(s, catalog, uids, 0)).toBe('sold');
    expect(s.gum).toBe(gum + 10);
    expect(s.stock).toHaveLength(count - 2);
    expect(v.done).toBe(true); // the budget is spent
  });

  it('goods on the shelf never overlap and stay inside the grid', () => {
    const s = G.newGame(12, catalog);
    s.gum = 1_000_000;
    for (let n = 0; n < 60; n++) {
      until(s, 'sell');
      G.buy(s, catalog, [0]);
      G.pass(s);
      G.callNext(s, catalog);
    }
    const seen = new Set<string>();
    for (const item of s.stock) {
      for (const [cx, cy] of G.shapeOf(catalog, item.itemId, item.rot).cells) {
        const key = `${item.x + cx},${item.y + cy}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        expect(item.x + cx).toBeLessThan(B.gridCols);
        expect(item.y + cy).toBeLessThan(s.rows);
      }
    }
    expect(seen.size).toBeGreaterThan(B.gridCols * s.rows * 0.6); // the shelf really fills up
    // a good cannot be moved onto another one; moving it to where it already is works
    const [a, b] = s.stock;
    const bCell = G.shapeOf(catalog, b.itemId, b.rot).cells[0];
    const from = { x: a.x, y: a.y };
    expect(G.moveStock(s, catalog, a.uid, b.x + bCell[0], b.y + bCell[1])).toBe(false);
    expect({ x: a.x, y: a.y }).toEqual(from);
    expect(G.moveStock(s, catalog, a.uid, a.x, a.y)).toBe(true);
  });

  it('a long good is turned to fit a low shelf', () => {
    const s = G.newGame(13, catalog);
    s.stock = [];
    s.rows = 2;
    s.gum = 1_000_000;
    const long = catalog.items.find((i) => i.shape === 'v3')!;
    const slot = G.findSlot(s, catalog, long.id);
    expect(slot).toEqual({ x: 0, y: 0, rot: true });
    s.rows = 4;
    s.stock.push({ uid: 99, itemId: long.id, cond: 1, paid: 0, x: 0, y: 0, rot: false });
    expect(G.turnStock(s, catalog, 99)).toBe(true);
    expect(s.stock[0].rot).toBe(true);
    expect(G.shapeOf(catalog, long.id, true)).toMatchObject({ w: 3, h: 1 });
  });

  it('collects rent every seventh night, then raises it', () => {
    const s = G.newGame(7, catalog);
    s.gum = 100000;
    while (s.day < B.rentEvery) {
      s.phase = 'evening';
      G.endDay(s);
    }
    s.phase = 'evening';
    const gum = s.gum;
    G.endDay(s);
    expect(s.gum).toBe(gum - B.rentFirst);
    expect(s.rent).toBe(Math.round(B.rentFirst * B.rentGrowth));
    expect(s.day).toBe(B.rentEvery + 1);
  });

  it('a missed rent uses the grace once, then ends the game', () => {
    const s = G.newGame(8, catalog);
    s.gum = 0;
    s.day = B.rentEvery;
    s.phase = 'evening';
    G.endDay(s);
    expect(s.graceLeft).toBe(0);
    expect(s.rent).toBe(Math.round(B.rentFirst * B.rentGrowth) + B.rentFirst);
    s.gum = 0;
    s.day = B.rentEvery * 2;
    s.phase = 'evening';
    G.endDay(s);
    expect(s.phase).toBe('lost');
  });

  it('buying the deed ends the rent', () => {
    const s = G.newGame(9, catalog);
    s.gum = B.deedPrice;
    expect(G.buyDeed(s)).toBe(true);
    expect(s.phase).toBe('won');
    G.continueAfterWin(s);
    s.day = B.rentEvery;
    expect(G.isRentDay(s)).toBe(false);
  });

  it('a night at the shop: bought goods come home only in the wallet, and tomorrow opens late', () => {
    const s = G.newGame(21, catalog);
    s.gum = 1_000_000;
    s.phase = 'evening';
    expect(N.goShop(s, catalog)).toBe(true);
    expect(N.goShop(s, catalog)).toBe(false); // one outing a night
    const gum = s.gum;
    expect(N.shopBuy(s, 0)).toBe(true);
    expect(N.shopBuy(s, 1)).toBe(true);
    expect(s.gum).toBe(gum - s.shop!.goods[0].price - s.shop!.goods[1].price);
    expect(s.shop!.tray).toHaveLength(2);
    expect(N.stow(s, catalog, 0)).toBe(true);
    expect(s.wallet.items).toHaveLength(1);
    const stock = s.stock.length;
    N.goHome(s, catalog); // the good left on the tray is lost
    expect(s.phase).toBe('evening');
    expect(s.stock.length + s.wallet.items.length).toBe(stock + 1);
    const usual = G.visitorsFor(s.rep);
    G.endDay(s);
    expect(s.lateOpen).toBe(true);
    s.event = { id: 'none' };
    expect(G.visitorsExpected(s)).toBe(usual - B.lateOpenLoss);
  });

  it('the wallet holds only what fits its grid', () => {
    const s = G.newGame(22, catalog);
    const big = catalog.items.find((i) => i.shape === 'sq' && !i.wallet)!;
    let n = 0;
    while (G.addTo(s, catalog, 'wallet', big.id, 1, 0) !== null) n += 1;
    expect(n).toBe(4); // 4×5 cells take four 2×2 goods (two rows of two)
    expect(G.freeCells(s, catalog, 'wallet')).toBe(4);
  });

  it('gear is worn from the shelf, adds its stats, and swaps back to the shelf', () => {
    const s = G.newGame(23, catalog);
    s.stock = [];
    const sword = catalog.items.find((i) => i.slot === 'arm')!;
    const sword2 = catalog.items.filter((i) => i.slot === 'arm')[5];
    const a = G.addTo(s, catalog, 'shelf', sword.id, 1, 10)!;
    const b = G.addTo(s, catalog, 'shelf', sword2.id, 1, 20)!;
    const base = N.playerStats(s, catalog);
    expect(N.equip(s, catalog, a)).toBe('ok');
    expect(s.equip.arm?.itemId).toBe(sword.id);
    expect(N.playerStats(s, catalog)).toEqual(base.map((v, i) => v + sword.stats[i]));
    expect(N.equip(s, catalog, b)).toBe('ok'); // the first sword goes back to the shelf
    expect(s.equip.arm?.itemId).toBe(sword2.id);
    expect(s.stock.map((x) => x.itemId)).toEqual([sword.id]);
    expect(N.unequip(s, catalog, 'arm')).toBe(true);
    expect(s.stock).toHaveLength(2);
  });

  it('a bigger wallet replaces the wallet and grows the bag', () => {
    const s = G.newGame(24, catalog);
    s.stock = [];
    const uid = G.addTo(s, catalog, 'shelf', catalog.wallets[1].id, 1, 0)!;
    expect(N.equip(s, catalog, uid)).toBe('ok');
    expect(G.walletSize(s, catalog)).toEqual({ cols: 5, rows: 5 });
    expect(s.stock.map((x) => x.itemId)).toEqual([catalog.wallets[0].id]);
  });

  it('labels: a good can sit on several parameter and skill lines', () => {
    const sword = catalog.items.find((i) => i.ja === '魔法剣')!;
    expect(sword.params).toEqual(['phy', 'int']);
    expect(sword.roles).toContain('atk');
    expect(sword.roles).not.toContain('buff'); // raising and lowering its own PHY is a stat swap, not a buff
    expect(G.matches(catalog, { type: 'param', param: 'int' }, sword.id)).toBe(true);
    expect(G.matches(catalog, { type: 'role', role: 'heal' }, sword.id)).toBe(false);
  });
});
