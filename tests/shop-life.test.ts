import { describe, expect, it } from 'vitest';
import { B } from '../src/game/balance';
import { catalog } from '../src/game/catalog';
import * as C from '../src/game/craft';
import * as G from '../src/game/logic';
import * as N from '../src/game/network';
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
