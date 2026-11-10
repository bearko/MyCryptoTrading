import { describe, expect, it } from 'vitest';
import { B } from '../src/game/balance';
import { catalog } from '../src/game/catalog';
import * as G from '../src/game/logic';
import type { GameState } from '../src/game/state';

/** Opens the shop and steps through customers until one of the wanted kind is at the counter. */
function until(s: GameState, kind: 'sell' | 'buy'): void {
  if (s.phase === 'morning') G.openShop(s, catalog);
  for (let guard = 0; guard < 500; guard++) {
    if (s.phase === 'evening') {
      G.endDay(s, catalog);
      G.openShop(s, catalog);
    }
    if (G.currentVisitor(s)?.kind === kind) return;
    G.pass(s);
    G.callNext(s, catalog);
  }
  throw new Error('no such customer');
}

describe('game rules', () => {
  it('starts with stock, money and a wholesale offer', () => {
    const s = G.newGame(1, catalog);
    expect(s.gum).toBe(B.startGum);
    expect(s.stock).toHaveLength(B.startStock);
    expect(s.wholesale).toHaveLength(B.wholesaleCount);
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

  it('buying at the asking price moves money and stock', () => {
    const s = G.newGame(3, catalog);
    s.gum = 100000;
    until(s, 'sell');
    const v = G.currentVisitor(s)!;
    const before = { gum: s.gum, stock: s.stock.length };
    expect(G.acceptAsk(s, catalog, false)).toBe(true);
    expect(s.gum).toBe(before.gum - v.ask);
    expect(s.stock).toHaveLength(before.stock + 1);
    expect(v.done).toBe(true);
  });

  it('cannot buy with a full shelf or an empty purse', () => {
    const s = G.newGame(4, catalog);
    until(s, 'sell');
    s.gum = 0;
    expect(G.acceptAsk(s, catalog, false)).toBe(false);
    s.gum = 100000;
    s.rows = 0; // no shelf at all
    expect(G.acceptAsk(s, catalog, false)).toBe(false);
  });

  it('a discount can be won only once, and refusals cost patience', () => {
    const s = G.newGame(5, catalog);
    s.gum = 100000;
    until(s, 'sell');
    const v = G.currentVisitor(s)!;
    const ask = v.ask;
    let guard = 0;
    while (!v.done && !v.haggled && guard++ < 10) G.haggle(s, 0);
    if (v.haggled) {
      expect(v.ask).toBeLessThan(ask);
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
        const result = G.sell(s, catalog, [item.uid], 0);
        if (!G.matches(catalog, v.want, item.itemId)) {
          expect(result).toBe('nomatch');
          expect(s.gum).toBe(gum);
          continue;
        }
        // at the fair price the customer always agrees; over the budget they pay the budget
        expect(result).toBe('sold');
        expect(s.gum - gum).toBe(Math.min(fair, v.budget));
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
  });

  it('goods on the shelf never overlap and stay inside the grid', () => {
    const s = G.newGame(12, catalog);
    s.gum = 1_000_000;
    for (let n = 0; n < 60; n++) {
      until(s, 'sell');
      G.acceptAsk(s, catalog, false);
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
      G.endDay(s, catalog);
    }
    s.phase = 'evening';
    const gum = s.gum;
    G.endDay(s, catalog);
    expect(s.gum).toBe(gum - B.rentFirst);
    expect(s.rent).toBe(Math.round(B.rentFirst * B.rentGrowth));
    expect(s.day).toBe(B.rentEvery + 1);
  });

  it('a missed rent uses the grace once, then ends the game', () => {
    const s = G.newGame(8, catalog);
    s.gum = 0;
    s.day = B.rentEvery;
    s.phase = 'evening';
    G.endDay(s, catalog);
    expect(s.graceLeft).toBe(0);
    expect(s.rent).toBe(Math.round(B.rentFirst * B.rentGrowth) + B.rentFirst);
    s.gum = 0;
    s.day = B.rentEvery * 2;
    s.phase = 'evening';
    G.endDay(s, catalog);
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
});
