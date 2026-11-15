import { catalog } from '../src/game/catalog';
import * as G from '../src/game/logic';
import type { GameState, Visitor } from '../src/game/state';

/** Sees the customer at the counter off: the landlord is paid (or, failing that, refused), anyone else is sent away. */
export function seeOff(s: GameState): void {
  if (G.currentVisitor(s)?.special === 'landlord') {
    if (!G.payRent(s)) G.refuseRent(s);
  } else G.pass(s);
}

/** Runs a rent day's line down to the landlord at the counter (the dealer has called just before). */
export function untilLandlord(s: GameState): Visitor {
  s.day = Math.ceil(s.day / 7) * 7;
  s.phase = 'morning';
  G.openShop(s, catalog);
  for (let n = 0; n < 40; n++) {
    const v = G.currentVisitor(s);
    if (!v) break;
    if (v.special === 'landlord') return v;
    G.pass(s);
    G.callNext(s, catalog);
  }
  throw new Error('the landlord did not come');
}
