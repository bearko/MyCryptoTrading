/**
 * Writes a staged save for the promotional pictures (scripts/promo.py): a busy shop, well into the game,
 * with a grand customer at the counter. Run through esbuild (see promo.py); prints the save as JSON.
 */
import { catalog } from '../src/game/catalog';
import * as G from '../src/game/logic';

const s = G.newGame(20261120, catalog);
s.day = 12;
s.gum = 4820;
s.mchc = 64;
s.clientele = 5;
s.reputation = 78;
s.phase = 'morning';
// a full, colourful shelf: a few of each rarity, the grand ones first
let seed = 7;
const pick = <T,>(list: T[]): T => list[(seed = (seed * 16807) % 2147483647) % list.length];
for (const [rarity, count] of [[5, 3], [4, 5], [3, 8], [2, 10], [1, 12]] as const)
  for (let i = 0; i < count; i++) G.addTo(s, catalog, 'shelf', pick(catalog.itemsByRarity[rarity]).id, 1, 10);
for (const rarity of [5, 4, 3, 3]) G.addTo(s, catalog, 'case', pick(catalog.itemsByRarity[rarity]).id, 1, 10);
G.openShop(s, catalog);
const v = s.queue[0];
v.heroId = Number(process.argv[2] ?? 5001);
v.special = undefined;
v.done = false;
console.log(JSON.stringify(s));
