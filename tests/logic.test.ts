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
    expect(G.acceptAsk(s, false)).toBe(true);
    expect(s.gum).toBe(before.gum - v.ask);
    expect(s.stock).toHaveLength(before.stock + 1);
    expect(v.done).toBe(true);
  });

  it('cannot buy with a full shelf or an empty purse', () => {
    const s = G.newGame(4, catalog);
    until(s, 'sell');
    s.gum = 0;
    expect(G.acceptAsk(s, false)).toBe(false);
    s.gum = 100000;
    s.capacity = s.stock.length;
    expect(G.acceptAsk(s, false)).toBe(false);
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
        const result = G.offer(s, catalog, item.uid, 0);
        if (!G.matches(catalog, v.want, item.itemId)) expect(result).toBe('nomatch');
        else if (G.salePrice(catalog, item, 0) > v.budget) expect(result).toBe('over');
        else expect(result).toBe('sold');
        if (result === 'sold') {
          expect(s.gum - gum).toBeGreaterThan(0);
          expect(s.gum - gum).toBeLessThanOrEqual(v.budget);
          break;
        }
        expect(s.gum).toBe(gum);
      }
      G.pass(s);
      G.callNext(s, catalog);
    }
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
