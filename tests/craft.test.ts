import { describe, expect, it } from 'vitest';
import { B } from '../src/game/balance';
import { catalog } from '../src/game/catalog';
import * as C from '../src/game/craft';
import * as G from '../src/game/logic';

const item = (id: number) => catalog.itemById.get(id)!;

function shopWith(ids: [number, number][]) {
  const s = G.newGame(5, catalog);
  s.stock = [];
  s.rows = 8;
  s.gum = 100_000;
  const uids = ids.map(([id, cond]) => G.addTo(s, catalog, 'shelf', id, cond, 10)!);
  return { s, uids };
}

describe('the pot', () => {
  it('a line runs from its common good up to its limited legendary', () => {
    expect(C.nextOf(catalog, item(1001))!.id).toBe(2001);
    expect(C.nextOf(catalog, item(4001))!.id).toBe(5001);
    expect(C.nextOf(catalog, item(5001))!.id).toBe(5501);
    expect(item(5501).limited).toBe(true);
    expect(C.nextOf(catalog, item(5501))).toBeNull();
    expect(C.lineOf(catalog, item(3001)).map((i) => i.id)).toEqual([1001, 2001, 3001, 4001, 5001, 5501]);
    // nobody brings a limited legendary in: they are not among the goods that turn up
    expect(catalog.itemsByRarity[5].some((i) => i.limited)).toBe(false);
    expect(catalog.items.filter((i) => i.limited).length).toBeGreaterThan(40);
    expect(G.itemValue(catalog, 5501, 1)).toBeGreaterThan(G.itemValue(catalog, 5001, 1) * 2);
  });

  it('the base goes one rarity up when the partners count for as much as it does', () => {
    // a rare base (4 points) with one uncommon (2): not enough
    const { s, uids } = shopWith([[3001, 1], [2015, 1], [2028, 1]]);
    expect(C.planCraft(s, catalog, [uids[0], uids[1]]).block).toBe('short');
    // with two uncommons (2 + 2): enough
    const plan = C.planCraft(s, catalog, uids);
    expect(plan.block).toBe('');
    expect(plan.result!.id).toBe(4001);
    expect(plan.fee).toBe(Math.round(B.rarityValue[4] * B.craftFee));
    const gum = s.gum;
    const made = C.craft(s, catalog, uids);
    expect(made.ok).toBe(true);
    expect(s.stock.map((x) => x.itemId)).toEqual([4001]);
    expect(s.gum).toBe(gum - plan.fee);
    expect(s.made).toEqual([4001]);
    // what went in and the offering are what the result cost
    expect(s.stock[0].paid).toBe(30 + plan.fee);
  });

  it('partners of the base\'s own parameter line keep the result one grade better', () => {
    const phy = catalog.itemsByRarity[1].filter((i) => i.params.length === 1 && i.params[0] === 'phy');
    const int = catalog.itemsByRarity[1].find((i) => i.params.length === 1 && i.params[0] === 'int')!;
    const base = phy.find((i) => C.nextOf(catalog, i))!;
    const same = shopWith([[base.id, 1], [phy.find((i) => i !== base)!.id, 1]]);
    expect(C.planCraft(same.s, catalog, same.uids)).toMatchObject({ match: true, cond: 2 });
    const other = shopWith([[base.id, 1], [int.id, 1]]);
    expect(C.planCraft(other.s, catalog, other.uids)).toMatchObject({ match: false, cond: 1 });
  });

  it('the pot is spent after its uses for the day, and asks for its offering', () => {
    const commons = catalog.itemsByRarity[1].filter((i) => C.nextOf(catalog, i)).slice(0, 8);
    const { s, uids } = shopWith(commons.map((i) => [i.id, 1] as [number, number]));
    for (let n = 0; n < B.craftPerDay; n++) expect(C.craft(s, catalog, [uids[n * 2], uids[n * 2 + 1]]).ok).toBe(true);
    expect(C.craftsLeft(s)).toBe(0);
    expect(C.planCraft(s, catalog, [uids[6], uids[7]]).block).toBe('spent');
    expect(C.craft(s, catalog, [uids[6], uids[7]]).ok).toBe(false);
    s.today.crafts = 0;
    s.gum = 0;
    expect(C.planCraft(s, catalog, [uids[6], uids[7]]).block).toBe('poor');
  });

  it('rarer heroes bring more, and a legendary hero is a rich buyer', () => {
    const s = G.newGame(8, catalog);
    s.day = 6;
    G.openShop(s, catalog);
    const byRarity: number[][] = [[], [], [], [], [], []];
    for (let n = 0; n < 4000; n++) {
      s.queue = [];
      s.cursor = -1;
      s.visitorsToday = 5;
      G.callNext(s, catalog);
      const v = G.currentVisitor(s);
      if (!v || v.kind !== 'buy' || (v.special && v.special !== 'rich')) continue;
      const rarity = catalog.heroById.get(v.heroId)!.rarity;
      if (rarity === 5) expect(v.special).toBe('rich');
      byRarity[rarity].push(v.budget);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    for (let r = 1; r < 5; r++) expect(mean(byRarity[r + 1])).toBeGreaterThan(mean(byRarity[r]) * 1.3);
    expect(Math.min(...byRarity[5])).toBeGreaterThanOrEqual(B.richFloor);
  });
});
