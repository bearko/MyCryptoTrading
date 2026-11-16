import { describe, expect, it } from 'vitest';
import { B } from '../src/game/balance';
import { catalog } from '../src/game/catalog';
import * as C from '../src/game/craft';
import * as G from '../src/game/logic';
import * as N from '../src/game/network';
import * as N2 from '../src/game/night';
import { FACTIONS, factionOfName } from '../src/game/factions';
import { favourites, HOUSE_LINES } from '../src/game/kinds';
import type { GameState, Visitor } from '../src/game/state';
import { seeOff } from './util';

/** Many customers of one day, without playing the day. */
function visitors(s: GameState, count: number): Visitor[] {
  const out: Visitor[] = [];
  G.openShop(s, catalog);
  for (let n = 0; n < count; n++) {
    s.queue = [];
    s.cursor = -1;
    s.visitorsToday = 5;
    G.callNext(s, catalog);
    const v = G.currentVisitor(s);
    if (v) out.push(v);
  }
  return out;
}

describe('the showcase', () => {
  const ofShape = (shape: string, rarity = 1) => catalog.itemsByRarity[rarity].find((i) => i.shape === shape)!;

  it('is a grid of its own: goods are fitted into it by their shape, and it grows by columns', () => {
    const s = G.newGame(51, catalog);
    s.stock = [];
    s.rows = 8;
    expect(G.gridOf(s, catalog, 'case')).toMatchObject({ cols: B.caseCols[0], rows: B.caseDepth });
    // four squares fill the four-by-four window; nothing else goes in beside them
    const sqs = [0, 1, 2, 3].map(() => G.addTo(s, catalog, 'shelf', ofShape('2x2').id, 1, 0)!);
    const one = G.addTo(s, catalog, 'shelf', ofShape('1x1').id, 1, 0)!;
    const long = G.addTo(s, catalog, 'shelf', ofShape('2x6', 5).id, 1, 0)!;
    for (const sq of sqs) expect(N2.transfer(s, catalog, 'shelf', sq, 'case')).toBe(true);
    expect(s.stock.some((x) => x.uid === sqs[0])).toBe(false);
    expect(G.caseFull(s, catalog)).toBe(true);
    expect(N2.transfer(s, catalog, 'shelf', one, 'case')).toBe(false);
    // a good six cells long does not fit a window four wide, whichever way it is turned
    for (const sq of sqs) expect(N2.transfer(s, catalog, 'case', sq, 'shelf')).toBe(true);
    expect(N2.transfer(s, catalog, 'shelf', long, 'case')).toBe(false);
    // two more columns from the guild, and it lies on its side
    s.services.push('case1');
    expect(G.gridOf(s, catalog, 'case').cols).toBe(B.caseCols[1]);
    expect(N2.transfer(s, catalog, 'shelf', long, 'case')).toBe(true);
    expect(s.showcase[0].rot % 2).toBe(1);
    // … and four more with the second favour
    s.services.push('case2');
    expect(G.gridOf(s, catalog, 'case').cols).toBe(B.caseCols[2]);
    // a cell placed by hand, like on the shelf
    expect(N2.transfer(s, catalog, 'shelf', one, 'case', 7, 1)).toBe(true);
    expect(s.showcase.find((x) => x.uid === one)).toMatchObject({ x: 7, y: 1 });
    expect(G.moveStock(s, catalog, one, 6, 0, 'case')).toBe(true);
    expect(G.moveStock(s, catalog, one, 0, 0, 'case')).toBe(false);
  });

  it('a save from before the large shelf is laid out again, once, with nothing lost or overlapping', () => {
    const s = G.newGame(77, catalog);
    const ids = catalog.itemsByRarity[5].slice(0, 6).map((i) => i.id);
    // (as an old save had it: a small shelf, goods packed a cell apart)
    s.big = false;
    s.rows = 4;
    s.stock = ids.map((itemId, n) => ({ uid: 500 + n, itemId, cond: 1, paid: 0, x: n, y: 0, rot: 0 }));
    s.showcase = [{ uid: 600, itemId: ids[0], cond: 1, paid: 0, x: 0, y: 0, rot: 0 }];
    s.wallet.items = [{ uid: 700, itemId: ids[1], cond: 1, paid: 0, x: 0, y: 0, rot: 0 }];
    G.enlarge(s, catalog);
    expect(s.big).toBe(true);
    expect(G.gridOf(s, catalog, 'shelf')).toMatchObject({ cols: 24, rows: 10 });
    // a good left below the foot of the shelf (a save from when it was deeper) is seen, and laid out again
    s.stock[0].y = 14;
    expect(G.shelfSpills(s, catalog)).toBe(true);
    G.repackShelf(s, catalog);
    expect(G.shelfSpills(s, catalog)).toBe(false);
    expect(s.stock.length + s.showcase.length + s.wallet.items.length).toBe(8);
    for (const id of ['shelf', 'case', 'wallet'] as const) {
      const grid = G.gridOf(s, catalog, id);
      const seen = new Set<string>();
      for (const x of grid.items) {
        for (const [cx, cy] of G.shapeOf(catalog, x.itemId, x.rot).cells) {
          const key = `${x.x + cx},${x.y + cy}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
          expect(x.x + cx).toBeLessThan(grid.cols);
          expect(x.y + cy).toBeLessThan(grid.rows);
        }
      }
    }
  });

  it('only novice heroes come at first; dealing in rarer goods, or showing them, draws the next class', () => {
    const s = G.newGame(81, catalog);
    expect(s.clientele).toBe(1);
    // many mornings of first customers: novices only
    for (let n = 0; n < 40; n++) {
      G.openShop(s, catalog);
      const v = G.currentVisitor(s)!;
      if (v.special !== 'rich') expect(catalog.heroById.get(v.heroId)!.rarity).toBe(1);
      s.phase = 'morning';
      s.queue = [];
    }
    // uncommon goods through the shop's hands: uncommon heroes are due, and come as the shop next opens
    expect(G.clienteleDue(s, catalog)).toBe(false);
    G.handle(s, catalog, Array.from({ length: B.clienteleNeed[2] }, () => catalog.itemsByRarity[2][0].id));
    expect(G.clienteleDue(s, catalog)).toBe(true);
    G.openShop(s, catalog);
    expect(s.clientele).toBe(2);
    // a rare good in the showcase counts for more than one handled
    const before = G.clienteleScore(s, catalog, 3);
    G.addTo(s, catalog, 'case', catalog.itemsByRarity[3][0].id, 1, 0);
    expect(G.clienteleScore(s, catalog, 3)).toBe(before + B.clienteleShow);
  });

  it('what a hero brings is of the hero\'s own rarity, now and then one off', () => {
    const s = G.newGame(83, catalog);
    for (const rarity of [1, 3, 4]) {
      const seen = [0, 0, 0, 0, 0, 0];
      for (let n = 0; n < 2000; n++) seen[G.broughtRarity(s, rarity)] += 1;
      expect(seen[rarity]).toBeGreaterThan(1300);
      // nothing more than one step away
      seen.forEach((count, r) => {
        if (Math.abs(r - rarity) > 1) expect(count).toBe(0);
      });
      if (rarity > 1) expect(seen[rarity - 1]).toBeGreaterThan(seen[rarity + 1]);
    }
  });

  it('on a rent day the dealer calls after the line, and takes anything under the list price as far as his purse goes', () => {
    const s = G.newGame(84, catalog);
    s.day = B.rentEvery;
    G.openShop(s, catalog);
    const line = s.visitorsToday;
    for (let n = 0; n < line; n++) {
      expect(G.currentVisitor(s)!.special === 'dealer').toBe(false);
      G.pass(s);
      G.callNext(s, catalog);
    }
    const v = G.currentVisitor(s)!;
    expect(v.special).toBe('dealer');
    expect(v.budget).toBe(Math.max(B.dealerFloor, Math.round(s.rent * B.dealerPurse)));
    const x = G.forSale(s)[0];
    const list = G.salePrice(catalog, x, 0);
    const gum = s.gum;
    expect(G.sell(s, catalog, [x.uid], 2)).toBe('sold'); // (whatever is asked, his price is his own)
    expect(s.gum).toBe(gum + Math.round(list * (1 - B.dealerCut)));
    // an ordinary day has no such callers
    const t = G.newGame(84, catalog);
    G.openShop(t, catalog);
    while (t.phase === 'open') {
      expect(G.currentVisitor(t)!.special === 'dealer' || G.currentVisitor(t)!.special === 'landlord').toBe(false);
      G.pass(t);
      G.callNext(t, catalog);
    }
  });

  it('the window draws the day\'s customers as it stood when the shop opened; rearranged, it tells from the next opening', () => {
    const s = G.newGame(85, catalog);
    const rare = catalog.itemsByRarity[3][0];
    // dressed before opening: it tells today
    G.addTo(s, catalog, 'case', rare.id, 1, 0);
    expect(G.forecast(s, catalog).count).toBe(1);
    G.openShop(s, catalog);
    const appeal = G.showAppeal(s, catalog);
    expect(appeal).toBe(2);
    // more put in while the shop is open: today's customers are not moved by it, the forecast is
    G.addTo(s, catalog, 'case', rare.id, 1, 0);
    expect(G.showAppeal(s, catalog)).toBe(appeal);
    expect(G.shownGoods(s)).toHaveLength(1);
    const next = 4 + (G.caseFull(s, catalog) ? B.showFull : 0);
    expect(G.forecast(s, catalog).appeal).toBe(next);
    // the next opening takes it up
    s.phase = 'morning';
    G.openShop(s, catalog);
    expect(G.showAppeal(s, catalog)).toBe(next);
    expect(G.shownGoods(s)).toHaveLength(2);
  });

  it('a window with no cell left empty counts for more; what is shown can be sold straight from it', () => {
    const s = G.newGame(54, catalog);
    s.stock = [];
    const a = G.addTo(s, catalog, 'case', ofShape('2x2', 2).id, 1, 0)!;
    expect(G.showAppeal(s, catalog)).toBe(1);
    const rest = [0, 1, 2].map(() => G.addTo(s, catalog, 'case', ofShape('2x2', 3).id, 1, 0)!);
    expect(G.caseFull(s, catalog)).toBe(true);
    expect(G.showAppeal(s, catalog)).toBe(1 + 3 * 2 + B.showFull);
    // sold from the window: it is gone from there
    s.day = 2;
    G.openShop(s, catalog);
    const v = G.currentVisitor(s)!;
    Object.assign(v, { kind: 'buy', offers: [], want: { type: 'any' }, budget: 99999, done: false, temper: 0, special: undefined, wanted: false });
    expect(G.quoteSale(s, catalog, v, [a], 0).asked).toBeGreaterThan(0);
    expect(G.sell(s, catalog, [a], 0)).toBe('sold');
    expect(s.showcase.map((x) => x.uid)).toEqual(rest);
    expect(G.caseFull(s, catalog)).toBe(false);
  });

  it('draws buyers after what is shown, and richer heroes the rarer it is', () => {
    const plain = G.newGame(52, catalog);
    plain.clientele = 5;
    plain.day = 6;
    const shown = G.newGame(52, catalog);
    shown.clientele = 5;
    shown.day = 6;
    shown.stock = [];
    shown.services.push('case1', 'case2');
    // legendary goods of one parameter line in the window, as many as fit
    const int = catalog.itemsByRarity[5].filter((i) => i.params.length === 1 && i.params[0] === 'int');
    for (const item of int) G.addTo(shown, catalog, 'case', item.id, 1, 0);
    expect(shown.showcase.length).toBeGreaterThanOrEqual(3);
    expect(G.showAppeal(shown, catalog)).toBeGreaterThanOrEqual(shown.showcase.length * 4);

    const wantsInt = (vs: Visitor[]) => vs.filter((v) => v.kind === 'buy' && v.want.type === 'param' && v.want.param === 'int').length / Math.max(1, vs.filter((v) => v.kind === 'buy').length);
    const rare = (vs: Visitor[]) => vs.filter((v) => catalog.heroById.get(v.heroId)!.rarity >= 4).length / vs.length;
    const a = visitors(plain, 1500);
    const b = visitors(shown, 1500);
    expect(wantsInt(b)).toBeGreaterThan(wantsInt(a) + 0.25);
    expect(rare(b)).toBeGreaterThan(rare(a) * 1.5);
  });

  it('a "wanted" sign brings sellers with goods of that parameter line', () => {
    const share = (s: GameState) => {
      const offers = visitors(s, 1500).filter((v) => v.kind === 'sell' && !v.special).flatMap((v) => v.offers);
      return offers.filter((o) => catalog.itemById.get(o.itemId)!.params.includes('agi')).length / offers.length;
    };
    const plain = G.newGame(53, catalog);
    plain.day = 6;
    const sign = G.newGame(53, catalog);
    sign.day = 6;
    sign.services.push('sign');
    sign.seek = 'agi';
    expect(share(sign)).toBeGreaterThan(share(plain) + 0.3);
  });
});

describe('the guild', () => {
  it('a favour is paid for in GUM or in trust, and trust grows by the day', () => {
    const s = G.newGame(54, catalog);
    const guest = N.serviceById('guest1');
    expect(N.serviceBlock(s, 'guest2', 'gum')).toBe('needs');
    expect(N.serviceBlock(s, 'guest1', 'trust')).toBe('short');
    s.gum = guest.gum;
    const before = G.visitorsExpected(s);
    expect(N.buyService(s, 'guest1', 'gum')).toBe(true);
    expect(s.gum).toBe(0);
    expect(G.visitorsExpected(s)).toBe(before + 1);
    expect(N.buyService(s, 'guest1', 'gum')).toBe(false);

    // trust: a night's sleep adds to it; enough of it pays instead of GUM
    s.phase = 'evening';
    s.gum = 5000;
    const trust = s.trust;
    G.endDay(s);
    expect(s.trust).toBe(trust + N.trustDaily(s));
    s.trust = N.serviceById('pot').trust;
    const gum = s.gum;
    const left = C.craftsLeft(s);
    expect(N.buyService(s, 'pot', 'trust')).toBe(true);
    expect(s.gum).toBe(gum);
    expect(s.trust).toBe(0);
    expect(C.craftsLeft(s)).toBe(left + 1);
  });

  it('goods ordered by telephone come the next morning, and wait at the door until there is room', () => {
    const s = G.newGame(55, catalog);
    s.gum = 1000;
    expect(N.supplyBlock(s, 'epic', 'trust')).toBe('short');
    expect(G.placeSupply(s, catalog, 'lot', 'agi', 'gum')).toBe(true);
    expect(s.gum).toBe(1000 - B.supplies.lot.gum);
    // one order at a time
    expect(N.supplyBlock(s, 'rare', 'gum')).toBe('busy');
    expect(G.placeSupply(s, catalog, 'rare', 'int', 'gum')).toBe(false);
    expect(s.parcel).toHaveLength(0);

    s.phase = 'evening';
    G.endDay(s);
    expect(s.supply).toBeNull();
    expect(s.parcel).toHaveLength(B.supplies.lot.count);
    for (const x of s.parcel) {
      const item = catalog.itemById.get(x.itemId)!;
      expect(item.params).toContain('agi');
      expect(item.rarity).toBeLessThanOrEqual(2);
    }
    // with trust, and an epic this time: it costs no GUM
    s.trust = B.supplies.epic.trust;
    const gum = s.gum;
    expect(G.placeSupply(s, catalog, 'epic', 'phy', 'trust')).toBe(true);
    expect(s.gum).toBe(gum);
    expect(s.trust).toBe(0);
    expect(catalog.itemById.get(s.supply!.goods[0].itemId)!.rarity).toBe(4);
    expect(catalog.itemById.get(s.supply!.goods[0].itemId)!.limited).toBeFalsy();

    // an empty shelf takes everything in; a full shop takes nothing, and the goods stay at the door
    s.stock = [];
    const before = s.parcel.length;
    expect(G.unpackAll(s, catalog)).toBe(before);
    expect(s.stock).toHaveLength(before);
    expect(s.parcel).toHaveLength(0);
    s.parcel.push({ itemId: s.stock[0].itemId, cond: 1, paid: 0 });
    s.rows = 0;
    s.wallet.items = [];
    const room = G.gridOf(s, catalog, 'wallet');
    for (let y = 0; y < room.rows; y++) for (let x = 0; x < room.cols; x++) s.wallet.items.push({ uid: 9000 + y * 20 + x, itemId: catalog.itemsByRarity[1].find((i) => i.shape === '1x1')!.id, cond: 1, paid: 0, x, y, rot: 0 });
    expect(G.unpack(s, catalog, 0)).toBe(false);
    expect(s.parcel).toHaveLength(1);
  });
});

describe('the five houses', () => {
  const house = (v: Visitor) => factionOfName(catalog.heroById.get(v.heroId)!.ja);

  it('every hero has a house', () => {
    for (const h of catalog.heroes) expect(factionOfName(h.ja), h.ja).not.toBeNull();
    expect(FACTIONS.map((f) => f.ja)).toEqual(['覇王', '武勇', '叡智', '風雅', '無法']);
  });

  it('rulers above the novice come only to a window that shows goods fit for them', () => {
    const bare = G.newGame(91, catalog);
    bare.clientele = 5;
    bare.day = 6;
    for (const v of visitors(bare, 1200)) if (house(v) === 'haou') expect(catalog.heroById.get(v.heroId)!.rarity).toBe(1);
    const fine = G.newGame(91, catalog);
    fine.clientele = 5;
    fine.day = 6;
    G.addTo(fine, catalog, 'case', catalog.itemsByRarity[4][0].id, 1, 0);
    const kings = visitors(fine, 1200).filter((v) => house(v) === 'haou' && catalog.heroById.get(v.heroId)!.rarity >= 2);
    expect(kings.length).toBeGreaterThan(20);
    // the monitor says as much: no rulers above the novice to a bare window, and what would bring them
    const before = G.forecast(bare, catalog);
    const after = G.forecast(fine, catalog);
    expect(before.rulersNeed).toBe(2 - B.house.haouShown);
    expect(after.houses.haou).toBeGreaterThan(before.houses.haou * 3);
    expect(Object.values(after.houses).reduce((a, n) => a + n, 0)).toBeCloseTo(1, 5);
    // … and they seldom sell
    expect(kings.filter((v) => v.kind === 'sell').length / kings.length).toBeLessThan(0.25);
  });

  it('a house is after the kinds of goods it is fond of, and brings them', () => {
    const s = G.newGame(92, catalog);
    s.clientele = 5;
    s.day = 6;
    const vs = visitors(s, 3000).filter((v) => !v.special);
    for (const id of ['buyu', 'eichi', 'fuga'] as const) {
      const fond = favourites(id);
      const buyers = vs.filter((v) => house(v) === id && v.kind === 'buy');
      expect(buyers.filter((v) => v.want.type === 'kind' && fond.includes(v.want.kind)).length / buyers.length).toBeGreaterThan(0.4);
      const offers = vs.filter((v) => house(v) === id && v.kind === 'sell').flatMap((v) => v.offers);
      const liked = (itemId: number) => {
        const item = catalog.itemById.get(itemId)!;
        return fond.includes(item.kind) || item.also.some((kind) => fond.includes(kind));
      };
      expect(offers.filter((o) => liked(o.itemId)).length / offers.length).toBeGreaterThan(0.6);
    }
    // a scholar brings no replica; an outlaw brings hot goods far more often than the rest
    const offersOf = (id: string) => vs.filter((v) => house(v) === id && v.kind === 'sell').flatMap((v) => v.offers);
    expect(offersOf('eichi').some((o) => o.fake)).toBe(false);
    const hot = (id: string) => offersOf(id).filter((o) => o.hot).length / offersOf(id).length;
    expect(hot('muhou')).toBeGreaterThan(hot('buyu') * 2);
  });
});

describe('the lines of goods', () => {
  it('a new shop deals only in goods with no mark; a line taken up brings its goods in', () => {
    const s = G.newGame(95, catalog);
    s.clientele = 5;
    s.day = 6;
    expect(s.lines).toEqual([]);
    for (const x of s.stock) expect(catalog.itemById.get(x.itemId)!.effect || x.bag || catalog.itemById.get(x.itemId)!.marks.length === 0).toBeTruthy();
    const marked = (vs: Visitor[]) => vs.flatMap((v) => v.offers).filter((o) => catalog.itemById.get(o.itemId)!.marks.length > 0);
    expect(marked(visitors(s, 600))).toHaveLength(0);
    // the guild opens the eastern goods
    const svc = N.serviceById('line-east');
    s.gum = svc.gum;
    expect(N.buyService(s, 'line-east', 'gum')).toBe(true);
    expect(s.lines).toEqual(['east']);
    expect(N.serviceBlock(s, 'line-east', 'gum')).toBe('owned');
    const now = marked(visitors(s, 600));
    expect(now.length).toBeGreaterThan(20);
    for (const o of now) expect(catalog.itemById.get(o.itemId)!.marks).toContain('east');
  });

  it('a house\'s regard opens a line with each rank, overnight', () => {
    const s = G.newGame(96, catalog);
    s.favor.buyu = B.favorRanks[1];
    s.phase = 'evening';
    G.endDay(s);
    expect(s.lines).toEqual(HOUSE_LINES.buyu.slice(0, 2));
    expect(s.linesNew).toEqual(s.lines);
    // (had once, kept: regard lost does not close a line)
    s.favor.buyu = 0;
    s.phase = 'evening';
    G.endDay(s);
    expect(s.lines).toHaveLength(2);
  });

  it('a house pays more for goods to its taste, and less for those it has little use for', () => {
    const blade = catalog.items.find((i) => i.series === 'ブレード')!;
    expect(G.taste('buyu', blade)).toBe(B.taste.fond + B.taste.liked); // a close weapon, western
    expect(G.taste('eichi', blade)).toBe(B.taste.cold);
    expect(G.taste(null, blade)).toBe(0);
    const s = G.newGame(97, catalog);
    s.day = 2;
    G.openShop(s, catalog);
    const v = G.currentVisitor(s)!;
    const uid = G.addTo(s, catalog, 'shelf', blade.id, 1, 0)!;
    const x = s.stock.find((y) => y.uid === uid)!;
    Object.assign(v, { kind: 'buy', offers: [], want: { type: 'any' }, budget: 99999, done: false, special: undefined, faction: 'buyu' });
    expect(G.quoteSale(s, catalog, v, [uid], 0).asked).toBe(Math.round(G.salePrice(catalog, x, 0) * (1 + B.taste.fond + B.taste.liked)));
  });
});

describe('the wanted notice', () => {
  /** Plays mornings (without serving anyone) until a notice is up and its hero is at the counter. */
  function untilWanted(seed: number): GameState {
    const s = G.newGame(seed, catalog);
    s.clientele = 5;
    for (let day = 0; day < 60; day++) {
      G.openShop(s, catalog);
      while (s.phase === 'open') {
        if (G.currentVisitor(s)?.wanted) return s;
        seeOff(s);
        G.callNext(s, catalog);
      }
      s.gum = 99999;
      G.endDay(s);
      if (s.perkOffer) G.choosePerk(s, s.perkOffer[0]);
    }
    throw new Error('no wanted hero came');
  }

  it('a house posts it for a hero of its rival, and the hero comes by', () => {
    const s = untilWanted(61);
    const w = s.wanted!;
    const v = G.currentVisitor(s)!;
    expect(s.day).toBeGreaterThanOrEqual(B.wantedFromDay);
    expect(v.heroId).toBe(w.heroId);
    expect(v.faction).toBe(FACTIONS.find((f) => f.id === w.by)!.rival);
    expect(w.bounty).toBe(B.wantedBounty[catalog.heroById.get(w.heroId)!.rarity]);
  });

  it('turning the hero in pays the bounty and takes a side', () => {
    const s = untilWanted(62);
    const w = { ...s.wanted! };
    const v = G.currentVisitor(s)!;
    const gum = s.gum;
    const favor = { ...s.favor };
    expect(G.report(s)).toBe('caught');
    expect(s.gum).toBe(gum + w.bounty);
    expect(s.favor[w.by]).toBe(favor[w.by] + B.wantedFavor);
    expect(s.favor[v.faction!]).toBe(favor[v.faction!] - B.wantedGrudge);
    expect(v.done).toBe(true);
    expect(s.wanted).toBeNull();
    // nobody to turn in any more
    expect(G.report(s)).toBe('');
  });

  it('turning in the wrong customer costs a fine; dealing with the hero takes the other side', () => {
    const s = untilWanted(63);
    const w = { ...s.wanted! };
    const v = G.currentVisitor(s)!;
    const favor = { ...s.favor };
    // deal with them: once is enough to be seen taking their side
    s.gum = 99999;
    if (v.kind === 'sell') expect(G.buy(s, catalog, [0])).toBe(true);
    else {
      const uid = G.addTo(s, catalog, 'shelf', catalog.itemsByRarity[1][0].id, 1, 0)!;
      v.want = { type: 'any' };
      v.budget = 99999;
      expect(G.sell(s, catalog, [uid], 0)).toBe('sold');
    }
    expect(s.favor[v.faction!]).toBe(favor[v.faction!] + B.harbourFavor + B.favorDeal);
    expect(s.favor[w.by]).toBe(favor[w.by] - B.harbourGrudge);
    // the notice comes down that night
    while (s.phase === 'open') {
      seeOff(s);
      G.callNext(s, catalog);
      const next = G.currentVisitor(s);
      if (s.phase === 'open' && next && !next.wanted && s.wanted) {
        // (still up today: somebody else is turned in by mistake)
        const gum = s.gum;
        expect(G.report(s)).toBe('wrong');
        expect(s.gum).toBe(gum - B.wantedFine);
        break;
      }
    }
    while (s.phase === 'open') {
      seeOff(s);
      G.callNext(s, catalog);
    }
    G.endDay(s);
    expect(s.wanted).toBeNull();
  });
});

describe('replicas and the loupe', () => {
  /** A seller at the counter who has brought a replica (after the day replicas start). */
  function sellerWithFake(seed: number): { s: GameState; v: Visitor; index: number } {
    const s = G.newGame(seed, catalog);
    s.day = B.fakeFromDay;
    s.gum = 99999;
    for (const v of visitors(s, 3000)) {
      const index = v.kind === 'sell' && !v.special ? v.offers.findIndex((o) => o.fake) : -1;
      if (index < 0) continue;
      s.queue = [v];
      s.cursor = 0;
      s.stock = [];
      s.phase = 'open';
      return { s, v, index };
    }
    throw new Error('no replica came');
  }

  it('no replicas in the first days; later, some of what sellers bring', () => {
    const early = G.newGame(71, catalog);
    early.day = B.fakeFromDay - 1;
    expect(visitors(early, 800).flatMap((v) => v.offers).some((o) => o.fake)).toBe(false);
    const late = G.newGame(71, catalog);
    late.day = B.fakeFromDay;
    late.clientele = 5;
    const offers = visitors(late, 2000).flatMap((v) => v.offers);
    const share = offers.filter((o) => o.fake).length / offers.length;
    expect(share).toBeGreaterThan(0.02);
    expect(share).toBeLessThan(0.12);
  });

  it('the loupe tells, a few times a day; a seller found out lets the replica go for little', () => {
    const { s, v, index } = sellerWithFake(72);
    const ask = v.offers[index].ask;
    expect(G.looksLeft(s)).toBe(B.looksPerDay);
    expect(G.examineOffer(s, catalog, index)).toBe('fake');
    expect(v.offers[index].ask).toBeLessThan(ask * 0.5);
    expect(G.examineOffer(s, catalog, index)).toBe('');
    expect(G.looksLeft(s)).toBe(B.looksPerDay - 1);
    // bought knowing what it is: worth a replica's price on the shelf, wherever it is carried
    expect(G.buy(s, catalog, [index])).toBe(true);
    const x = s.stock[s.stock.length - 1];
    expect(x.fake && x.seen).toBe(true);
    expect(G.stockValue(catalog, x)).toBe(Math.round(G.itemValue(catalog, x.itemId, x.cond) * B.fakeValue));
    // the looks run out
    s.today.looks = B.looksPerDay;
    expect(G.examineStock(s, s.stock[0].uid)).toBe('');
  });

  it('a replica sold as the real thing is sometimes found out, and costs the shop its name', () => {
    let found = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { s, v, index } = sellerWithFake(100 + seed);
      expect(G.buy(s, catalog, [index])).toBe(true);
      const x = s.stock[s.stock.length - 1];
      expect(x.fake).toBe(true);
      expect(x.seen).toBeFalsy();
      // unknown to the shop: priced like the real thing
      expect(G.stockValue(catalog, x)).toBe(G.itemValue(catalog, x.itemId, x.cond));
      const buyer: Visitor = { ...v, kind: 'buy', offers: [], want: { type: 'any' }, budget: 999999, done: false, deals: 0, faction: 'haou', temper: 0 };
      s.queue = [buyer];
      s.cursor = 0;
      s.rep = 50;
      const favor = s.favor.haou;
      expect(G.sell(s, catalog, [x.uid], 0)).toBe('sold');
      if (s.lastFake) {
        found += 1;
        expect(s.rep).toBeLessThan(50);
        expect(s.favor.haou).toBe(favor + B.favorDeal - B.fakeFavor);
      }
    }
    expect(found).toBeGreaterThan(8);
    expect(found).toBeLessThan(32);
  });
});

describe('hot goods and the patrol', () => {
  it('hot goods come cheap from a certain day; a patrol takes those on the shelf and leaves the wallet alone', () => {
    const early = G.newGame(81, catalog);
    early.day = B.hotFromDay - 1;
    expect(visitors(early, 600).flatMap((v) => v.offers).some((o) => o.hot)).toBe(false);
    const s = G.newGame(81, catalog);
    s.day = B.hotFromDay;
    const offers = visitors(s, 2000).flatMap((v) => v.offers);
    const share = offers.filter((o) => o.hot).length / offers.length;
    expect(share).toBeGreaterThan(B.hotOdds * 0.6);
    expect(share).toBeLessThan(B.hotOdds * 1.4);
    expect(offers.some((o) => o.hot && o.fake)).toBe(false);

    // one hot good on the shelf, one in the wallet; a patrol is first in line today
    const t = G.newGame(82, catalog);
    t.day = B.hotFromDay;
    t.gum = 500;
    t.rep = 50;
    const onShelf = t.stock[0];
    onShelf.hot = true;
    // (a hot good in the window is in plain sight too)
    const inWindow = G.addTo(t, catalog, 'case', catalog.itemsByRarity[1].find((i) => i.shape === '1x1')!.id, 1, 0)!;
    t.showcase.find((x) => x.uid === inWindow)!.hot = true;
    const hidden = G.addTo(t, catalog, 'wallet', catalog.itemsByRarity[1].find((i) => i.shape === '1x1')!.id, 1, 0)!;
    t.wallet.items.find((x) => x.uid === hidden)!.hot = true;
    const before = t.stock.length;
    t.patrolDay = true;
    G.openShop(t, catalog);
    t.queue = [];
    t.cursor = -1;
    t.patrolSlot = 0;
    G.callNext(t, catalog);
    const v = G.currentVisitor(t)!;
    expect(v.special).toBe('patrol');
    expect(v.seized).toHaveLength(2);
    expect(v.seized).toContain(onShelf.itemId);
    expect(t.stock).toHaveLength(before - 1);
    expect(t.showcase).toEqual([]);
    expect(t.gum).toBe(500 - B.patrolFine * 2);
    expect(t.rep).toBe(50 - B.patrolRep);
    expect(t.wallet.items.some((x) => x.uid === hidden && x.hot)).toBe(true);
    // nothing can be sold to a patrol, and seeing it off does not break the streak
    t.combo = 3;
    expect(G.sell(t, catalog, [t.stock[0].uid], 0)).not.toBe('sold');
    G.pass(t);
    expect(t.combo).toBe(3);

    // a clean shelf: nothing is taken, nothing is paid
    const c = G.newGame(83, catalog);
    c.day = B.hotFromDay;
    c.patrolDay = true;
    const gum = c.gum;
    G.openShop(c, catalog);
    c.queue = [];
    c.cursor = -1;
    c.patrolSlot = 0;
    G.callNext(c, catalog);
    expect(G.currentVisitor(c)!.special).toBe('patrol');
    expect(G.currentVisitor(c)!.seized).toEqual([]);
    expect(c.gum).toBe(gum);
  });
});

describe('a loan from the guild', () => {
  it('is paid back by the night, with interest; a night that cannot be paid makes it grow', () => {
    const s = G.newGame(91, catalog);
    s.rep = B.loanRep[0];
    expect(N.loanBlock(s, 1)).toBe('rep');
    const gum = s.gum;
    expect(N.borrow(s, 0)).toBe(true);
    expect(s.gum).toBe(gum + B.loans[0]);
    expect(s.loan!.left).toBe(N.loanTotal(B.loans[0]));
    expect(N.borrow(s, 0)).toBe(false);
    // the deed is out of reach while money is owed
    s.phase = 'evening';
    s.gum = B.deedPrice + 5000;
    expect(G.rentChoices(s).buy).toBe(false);

    // the instalment goes out each night
    const before = s.gum;
    G.endDay(s);
    expect(before - s.gum).toBe(N.loanNightly(B.loans[0]));
    expect(s.nightNote).toContain('融資');

    // a night with nothing to pay with: the debt grows, the guild trusts the shop less
    s.phase = 'evening';
    s.gum = 0;
    s.trust = 30;
    const left = s.loan!.left;
    const rep = s.rep;
    G.endDay(s);
    expect(s.loan!.left).toBe(Math.round(left * (1 + B.loanLate)));
    expect(s.trust).toBe(30 + N.trustDaily(s) - B.loanLateTrust);
    expect(s.rep).toBe(rep - B.loanLateRep);

    // paid off at once, and the deed can be bought again
    s.gum = 1;
    expect(N.repayAll(s)).toBe(false);
    s.gum = s.loan!.left + B.deedPrice;
    expect(N.repayAll(s)).toBe(true);
    expect(s.loan).toBeNull();
    expect(G.rentChoices(s).buy).toBe(true);
  });

  it('is gone after the last night', () => {
    const s = G.newGame(92, catalog);
    s.rep = 100;
    s.gum = 99999;
    expect(N.borrow(s, 2)).toBe(true);
    for (let night = 0; night < B.loanNights; night++) {
      expect(s.loan).not.toBeNull();
      s.phase = 'evening';
      G.endDay(s);
      if (s.perkOffer) G.choosePerk(s, s.perkOffer[0]);
    }
    expect(s.loan).toBeNull();
    expect(s.nightNote).toContain('返しおえました');
  });
});
