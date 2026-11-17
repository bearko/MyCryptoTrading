import { describe, expect, it } from 'vitest';
import { B } from '../src/game/balance';
import { catalog, POT_ID } from '../src/game/catalog';
import * as C from '../src/game/craft';
import * as G from '../src/game/logic';
import * as M from '../src/game/mchc';
import * as N from '../src/game/night';
import { seeOff } from './util';

const item = (id: number) => catalog.itemById.get(id)!;

function shopWith(ids: [number, number][]) {
  const s = G.newGame(5, catalog);
  s.stock = [];
  s.rows = 8;
  s.gum = 100_000;
  const uids = ids.map(([id, cond]) => G.addTo(s, catalog, 'shelf', id, cond, 10)!);
  // (the pot stands on the shelf: without it, nothing can be made)
  G.addTo(s, catalog, 'shelf', POT_ID, 1, 0);
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
    expect(s.stock.map((x) => x.itemId).filter((id) => id !== POT_ID)).toEqual([4001]);
    expect(s.gum).toBe(gum - plan.fee);
    expect(s.made).toEqual([4001]);
    // what went in and the offering are what the result cost
    expect(s.stock.find((x) => x.itemId === 4001)!.paid).toBe(30 + plan.fee);
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
    s.clientele = 5;
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
  it('a special pairing turns the base into a good of a third line, in the best condition', () => {
    // every pairing in the table names lines that exist, and its result has goods to give
    for (const [a, b, out] of C.CROSSES) {
      for (const line of [a, b, out]) expect(C.goodOfLine(catalog, line, 1) ?? C.goodOfLine(catalog, line, 2)).toBeTruthy();
      expect(C.goodOfLine(catalog, out, 3)).toBeTruthy();
    }
    expect(new Set(C.CROSSES.map(([a, b]) => C.crossKey(a, b))).size).toBe(C.CROSSES.length);

    // a blade (line 1) with a katana (line 6): twin blades (line 82), one rarity above the base — either way round
    const { s, uids } = shopWith([[1001, 0], [1006, 1]]);
    const plan = C.planCraft(s, catalog, uids);
    expect(plan).toMatchObject({ cross: C.crossKey(1, 6), cond: 2, block: '' });
    expect(plan.result!.id).toBe(2082);
    expect(C.planCraft(s, catalog, [uids[1], uids[0]]).result!.id).toBe(2082);
    const rep = s.rep;
    const made = C.craft(s, catalog, uids);
    expect(made).toMatchObject({ ok: true, cross: true, found: true });
    expect(s.crosses).toEqual([C.crossKey(1, 6)]);
    expect(s.rep).toBe(rep + B.crossRep);

    // a legendary base comes out as the other line's limited legendary, where it has one
    const top = shopWith([[5001, 1], [5006, 1]]);
    expect(C.planCraft(top.s, catalog, top.uids).result!.id).toBe(5582);
    // without a pairing, the base stays in its own line
    const plain = shopWith([[1001, 1], [1002, 1]]);
    expect(C.planCraft(plain.s, catalog, plain.uids)).toMatchObject({ cross: '' });
    expect(C.planCraft(plain.s, catalog, plain.uids).result!.id).toBe(2001);
    // an epic never comes out as a limited legendary by the back door
    expect(C.nextOf(catalog, item(4600))).toBeNull();
  });

  it('the pot is a good of its own: no pot on the shelf, no synthesis; it is worth more, and it does not go into itself', () => {
    const { s, uids } = shopWith([
      [1001, 1],
      [1002, 1],
    ]);
    expect(C.planCraft(s, catalog, uids).block).toBe('');
    const pot = s.stock.find((x) => x.itemId === POT_ID)!;
    expect(item(POT_ID).effect).toBe('pot');
    // worth more than a plain good of its rarity
    const plain = catalog.itemsByRarity[item(POT_ID).rarity].filter((i) => !i.effect).map((i) => G.itemValue(catalog, i.id, 1));
    expect(G.itemValue(catalog, POT_ID, 1)).toBeGreaterThan(Math.max(...plain));
    // it is not an ingredient
    expect(C.planCraft(s, catalog, [uids[0], pot.uid]).block).toBe('special');
    // in the wallet it does nothing; sold or thrown away, there is no pot
    expect(N.transfer(s, catalog, 'shelf', pot.uid, 'wallet')).toBe(true);
    expect(G.hasEffect(s, catalog, 'pot')).toBe(false);
    expect(C.planCraft(s, catalog, uids).block).toBe('nopot');
    expect(C.craft(s, catalog, uids).ok).toBe(false);
    // a new shop starts with one; an old save is handed one, once
    const fresh = G.newGame(9, catalog);
    expect(G.hasEffect(fresh, catalog, 'pot')).toBe(true);
    fresh.stock = fresh.stock.filter((x) => x.itemId !== POT_ID);
    fresh.potGiven = false;
    G.givePot(fresh, catalog);
    G.givePot(fresh, catalog);
    expect(fresh.stock.filter((x) => x.itemId === POT_ID)).toHaveLength(1);
  });

  it('the goods in the pot give candidates to choose from: any of them can be the one that grows', () => {
    const s = G.newGame(41, catalog);
    s.stock = [];
    G.addTo(s, catalog, 'shelf', POT_ID, 1, 0);
    s.gum = 99999;
    const blade = catalog.itemById.get(1001)!; // ブレード（コモン）
    const katana = catalog.itemById.get(1006)!; // カタナ（コモン）
    const a = G.addTo(s, catalog, 'shelf', blade.id, 1, 0)!;
    const b = G.addTo(s, catalog, 'shelf', katana.id, 1, 0)!;
    // one good alone: its own next, not yet makeable
    const alone = C.candidates(s, catalog, [a]);
    expect(alone).toHaveLength(1);
    expect(alone[0].plan.block).toBe('alone');
    // the two together: the special pairing first (not told, as it was never made), then each one grown
    const both = C.candidates(s, catalog, [a, b]);
    expect(both).toHaveLength(3);
    expect(both[0].secret).toBe(true);
    expect(both[0].plan.cross).toBe(C.crossKey(1, 6));
    expect(both.slice(1).map((c) => c.plan.result!.id).sort()).toEqual([2001, 2006]);
    expect(both.every((c) => !c.plan.block)).toBe(true);
    // the plain result of a base is on offer though a pairing was possible
    const grown = both.find((c) => c.plan.result!.id === 2006)!;
    expect(grown.plain).toBe(true);
    expect(grown.order[0]).toBe(b);
    const made = C.craft(s, catalog, grown.order, grown.plain);
    expect(made.ok && made.item.id).toBe(2006);
    expect(s.crosses).toHaveLength(0);
    // once made, the pairing is told
    const c2 = G.addTo(s, catalog, 'shelf', blade.id, 1, 0)!;
    const d2 = G.addTo(s, catalog, 'shelf', katana.id, 1, 0)!;
    s.today.crafts = 0;
    const again = C.candidates(s, catalog, [c2, d2]);
    const pair = again[0];
    expect(C.craft(s, catalog, pair.order, pair.plain).ok).toBe(true);
    const e2 = G.addTo(s, catalog, 'shelf', blade.id, 1, 0)!;
    const f2 = G.addTo(s, catalog, 'shelf', katana.id, 1, 0)!;
    s.today.crafts = 0;
    expect(C.candidates(s, catalog, [e2, f2])[0].secret).toBe(false);
  });

});

describe('moving many goods at once, and the bin as a grid', () => {
  const fresh = () => {
    const s = G.newGame(7, catalog);
    s.stock = [];
    s.wallet.items = [];
    return s;
  };
  const sq = catalog.items.find((i) => G.shapeOf(catalog, i.id, 0).w === 2 && G.shapeOf(catalog, i.id, 0).h === 2 && !i.effect)!;

  it('goods moved together are laid out from the top-left, not as they stood', () => {
    const s = fresh();
    const uids = [0, 1].map(() => G.addTo(s, catalog, 'shelf', sq.id, 1, 0)!);
    s.stock.forEach((x, i) => Object.assign(x, { x: 6 + i * 4, y: 5 }));
    const done = N.moveMany(s, catalog, 'shelf', uids, 'wallet');
    expect(done.ok).toBe(true);
    expect(s.stock).toHaveLength(0);
    expect(s.wallet.items.map((x) => [x.x, x.y])).toEqual([[0, 0], [2, 0]]);
  });

  it('when they do not all fit nothing moves, and it tells which would fit', () => {
    const s = fresh();
    const cols = G.caseCols(s);
    const room = Math.floor(cols / 2) * Math.floor(B.caseDepth / 2);
    const uids = Array.from({ length: room + 2 }, () => G.addTo(s, catalog, 'shelf', sq.id, 1, 0)!);
    const done = N.moveMany(s, catalog, 'shelf', uids, 'case');
    expect(done.ok).toBe(false);
    if (done.ok) return;
    expect(done.fit).toHaveLength(room);
    expect(done.left).toHaveLength(2);
    expect(s.showcase).toHaveLength(0);
    expect(N.moveMany(s, catalog, 'shelf', done.fit, 'case').ok).toBe(true);
    expect(s.stock).toHaveLength(2);
  });

  it('the bin holds only what fits its grid, and gives goods back', () => {
    const s = fresh();
    const room = (B.trashCols / 2) * (B.trashRows / 2);
    const uids = Array.from({ length: room + 1 }, () => G.addTo(s, catalog, 'shelf', sq.id, 1, 0)!);
    for (const uid of uids.slice(0, room)) expect(G.toTrash(s, catalog, uid)).toBe(true);
    expect(G.toTrash(s, catalog, uids[room])).toBe(false);
    expect(s.trashGum).toBeGreaterThan(0);
    expect(N.transfer(s, catalog, 'trash', uids[0], 'shelf')).toBe(true);
    expect(s.trash).toHaveLength(room - 1);
    expect(G.toTrash(s, catalog, uids[room])).toBe(true);
  });
});

describe('the night shop: goods on a floor, and a box to send home', () => {
  it('goods stand on the floor at their size without touching, and a box sends what the wallet cannot carry', () => {
    const s = G.newGame(31, catalog);
    s.phase = 'evening';
    s.mchc = 99999;
    expect(N.goShop(s, catalog)).toBe(true);
    const shop = s.shop!;
    const taken = new Set<string>();
    for (const g of shop.goods) {
      const [w, h] = catalog.itemById.get(g.itemId)!.shape.split('x').map(Number);
      expect(g.x! + w).toBeLessThanOrEqual(B.shopFloor);
      expect(g.y! + h).toBeLessThanOrEqual(B.shopFloor);
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
        expect(taken.has(`${g.x! + x},${g.y! + y}`)).toBe(false);
        taken.add(`${g.x! + x},${g.y! + y}`);
      }
    }
    // everything is bought: the wallet takes what it can, the rest waits
    shop.goods.forEach((g, i) => {
      if (!catalog.itemById.get(g.itemId)!.wallet && N.shopBuy(s, i)) N.stow(s, catalog, shop.tray.length - 1);
    });
    expect(shop.tray.length).toBeGreaterThan(0);
    const before = s.mchc;
    expect(N.buyBox(s, 0)).toBe(true);
    expect(before - s.mchc).toBe(B.boxes[0].price + B.boxes[0].post);
    // a larger box costs the difference, and a smaller one is refused
    expect(N.buyBox(s, 0)).toBe(false);
    expect(N.buyBox(s, 2)).toBe(true);
    expect(before - s.mchc).toBe(B.boxes[2].price + B.boxes[2].post);
    let sent = 0;
    for (let i = shop.tray.length - 1; i >= 0; i--) if (N.stow(s, catalog, i, 'box')) sent += 1;
    expect(sent).toBeGreaterThan(0);
    const day = s.day;
    N.goHome(s, catalog);
    expect(s.post).toEqual([{ due: day + 1, size: 2, items: expect.any(Array) }]);
    expect(s.post[0].items).toHaveLength(sent);
    // the next day: the keeper brings it as the last caller, and it lies by the telephone
    G.endDay(s);
    s.phase = 'morning';
    G.openShop(s, catalog);
    s.stock = s.stock.filter((x) => x.bag);
    let courier = false;
    for (let n = 0; n < 60 && (s.phase as string) === 'open'; n++) {
      if (G.currentVisitor(s)?.special === 'courier') courier = true;
      seeOff(s);
      G.callNext(s, catalog);
    }
    expect(courier).toBe(true);
    expect(s.post).toHaveLength(0);
    expect(s.crates).toHaveLength(1);
    expect(s.crates[0].items).toHaveLength(sent);
    // the box goes on the shelf shut, as large as it holds; it is not for sale, and not thrown away
    expect(G.shelveCrate(s, catalog, 0)).toBe(true);
    const box = s.stock.find((x) => x.crate)!;
    const shape = G.shapeOf(catalog, box.itemId, 0);
    expect([shape.w, shape.h]).toEqual([B.boxes[2].cols, B.boxes[2].rows]);
    expect(G.forSale(s).includes(box)).toBe(false);
    expect(G.toTrash(s, catalog, box.uid)).toBe(false);
    expect(N.transfer(s, catalog, 'shelf', box.uid, 'case')).toBe(false);
    // opened, its goods take the room it stood in
    const at = { x: box.x, y: box.y };
    expect(G.unboxCrate(s, catalog, box.uid)).toBe(sent);
    const out = s.stock.filter((x) => !x.bag);
    expect(out).toHaveLength(sent);
    for (const x of out) {
      expect(x.x).toBeGreaterThanOrEqual(at.x);
      expect(x.x).toBeLessThan(at.x + B.boxes[2].cols);
      expect(x.y).toBeLessThan(at.y + B.boxes[2].rows);
    }
  });
});

describe('MCHC', () => {
  it('the night shop takes MCHC only; the Tuesday caller gives it for GUM and medals; the exchange swaps both ways for a fee', () => {
    const s = G.newGame(52, catalog);
    s.stock = [];
    // the price moves from day to day, within its bounds
    const seen = new Set<number>();
    for (let n = 0; n < 40; n++) {
      G.stepRate(s);
      seen.add(s.rate);
      expect(s.rate).toBeGreaterThanOrEqual(B.mchc.min);
      expect(s.rate).toBeLessThanOrEqual(B.mchc.max);
    }
    expect(seen.size).toBeGreaterThan(10);
    // no caller, no exchange: nothing to swap with
    s.gum = 1000;
    expect(M.swapVia(s)).toBeNull();
    expect(M.swap(s, 'gum', 100)).toBe(false);
    // Tuesday: he comes after the day's line, and gives MCHC for GUM as far as his purse goes
    s.day = 2;
    s.phase = 'morning';
    G.openShop(s, catalog);
    for (let n = 0; n < 60 && G.currentVisitor(s)?.special !== 'satoshi'; n++) {
      seeOff(s);
      G.callNext(s, catalog);
    }
    const v = G.currentVisitor(s)!;
    expect(v.special).toBe('satoshi');
    const gum = s.gum;
    const had = s.mchc;
    const purse = v.budget;
    expect(M.swap(s, 'mchc', 1)).toBe(false);
    expect(M.swap(s, 'gum', 100)).toBe(true);
    expect(s.gum).toBe(gum - 100);
    expect(s.mchc - had).toBe(Math.floor(100 / s.rate));
    expect(v.budget).toBe(purse - (s.mchc - had));
    expect(M.swap(s, 'gum', M.swapMax(s, 'gum') + 1)).toBe(false);
    // a medal goes for MCHC too
    const medal = catalog.items.find((i) => M.isMedal(i))!;
    const uid = G.addTo(s, catalog, 'shelf', medal.id, 1, 0)!;
    const before = s.mchc;
    const quote = M.medalQuote(s, catalog, s.stock.find((x) => x.uid === uid)!);
    expect(M.swapMedal(s, catalog, uid)).toBe(true);
    expect(s.mchc).toBe(before + quote);
    expect(s.stock.some((x) => x.uid === uid)).toBe(false);
    G.pass(s);
    expect(M.swapVia(s)).toBeNull();
    // the exchange: both ways, and it keeps its fee
    s.services.push('dex');
    const m = s.mchc;
    const g2 = s.gum;
    expect(M.swap(s, 'mchc', 10)).toBe(true);
    expect(s.mchc).toBe(m - 10);
    expect(s.gum - g2).toBe(Math.floor(10 * s.rate * (1 - B.mchc.dexFee)));
    // the night shop: MCHC is what is paid
    s.phase = 'evening';
    s.wentOut = false;
    s.mchc = 0;
    expect(N.goShop(s, catalog)).toBe(true);
    expect(N.shopBuy(s, 0)).toBe(false);
    s.mchc = s.shop!.goods[0].price;
    const gumNow = s.gum;
    expect(N.shopBuy(s, 0)).toBe(true);
    expect(s.mchc).toBe(0);
    expect(s.gum).toBe(gumNow);
  });
});
