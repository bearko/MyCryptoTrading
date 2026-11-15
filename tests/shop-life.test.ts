import { describe, expect, it } from 'vitest';
import { B } from '../src/game/balance';
import { catalog } from '../src/game/catalog';
import * as C from '../src/game/craft';
import * as G from '../src/game/logic';
import * as N from '../src/game/network';
import { FACTIONS } from '../src/game/factions';
import type { GameState, Visitor } from '../src/game/state';

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
  it('holds as many goods as it has room for, and only goods that are in the shop', () => {
    const s = G.newGame(51, catalog);
    const [a, b, c] = s.stock;
    expect(G.showSlots(s)).toBe(B.showSlots[0]);
    expect(G.setShown(s, a.uid, true)).toBe(true);
    expect(G.setShown(s, b.uid, true)).toBe(true);
    expect(G.setShown(s, c.uid, true)).toBe(false);
    expect(G.setShown(s, 9999, true)).toBe(false);
    // a good that is sold or thrown away is no longer shown
    G.toTrash(s, catalog, a.uid);
    expect(G.shownGoods(s).map((x) => x.uid)).toEqual([b.uid]);
    s.services.push('case1');
    expect(G.showSlots(s)).toBe(B.showSlots[1]);
  });

  it('draws buyers after what is shown, and richer heroes the rarer it is', () => {
    const plain = G.newGame(52, catalog);
    plain.day = 6;
    const shown = G.newGame(52, catalog);
    shown.day = 6;
    shown.stock = [];
    shown.services.push('case1', 'case2');
    // six legendary goods of one parameter line in the window
    const int = catalog.itemsByRarity[5].filter((i) => i.params.length === 1 && i.params[0] === 'int').slice(0, 6);
    shown.rows = 8;
    for (const item of int) G.setShown(shown, G.addTo(shown, catalog, 'shelf', item.id, 1, 0)!, true);
    expect(G.showAppeal(shown, catalog)).toBe(6 * 4);

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
    for (let y = 0; y < room.rows; y++) for (let x = 0; x < room.cols; x++) s.wallet.items.push({ uid: 9000 + y * 20 + x, itemId: catalog.itemsByRarity[1].find((i) => i.shape === 's1')!.id, cond: 1, paid: 0, x, y, rot: 0 });
    expect(G.unpack(s, catalog, 0)).toBe(false);
    expect(s.parcel).toHaveLength(1);
  });
});

describe('the wanted notice', () => {
  /** Plays mornings (without serving anyone) until a notice is up and its hero is at the counter. */
  function untilWanted(seed: number): GameState {
    const s = G.newGame(seed, catalog);
    for (let day = 0; day < 60; day++) {
      G.openShop(s, catalog);
      while (s.phase === 'open') {
        if (G.currentVisitor(s)?.wanted) return s;
        G.pass(s);
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
      G.pass(s);
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
      G.pass(s);
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
      const buyer: Visitor = { ...v, kind: 'buy', offers: [], want: { type: 'any' }, budget: 999999, done: false, deals: 0, faction: 'suzaku', temper: 0 };
      s.queue = [buyer];
      s.cursor = 0;
      s.rep = 50;
      const favor = s.favor.suzaku;
      expect(G.sell(s, catalog, [x.uid], 0)).toBe('sold');
      if (s.lastFake) {
        found += 1;
        expect(s.rep).toBeLessThan(50);
        expect(s.favor.suzaku).toBe(favor + B.favorDeal - B.fakeFavor);
      }
    }
    expect(found).toBeGreaterThan(8);
    expect(found).toBeLessThan(32);
  });
});
