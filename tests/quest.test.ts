import { describe, expect, it } from 'vitest';
import { B } from '../src/game/balance';
import { catalog } from '../src/game/catalog';
import * as G from '../src/game/logic';
import * as N from '../src/game/night';
import * as Q from '../src/game/quest';
import type { GameState } from '../src/game/state';

/** Wears a good of the given rarity in every slot (which ones depends on the seed). */
function gearUp(s: GameState, rarity: number, seed: number): void {
  s.rows = 12;
  ['head', 'body', 'arm', 'leg', 'special', 'special'].forEach((slot, n) => {
    const pool = catalog.itemsByRarity[rarity].filter((i) => i.slot === slot);
    const item = pool[(seed * 13 + n * 7) % pool.length];
    N.equip(s, catalog, G.addTo(s, catalog, 'shelf', item.id, 1, 0)!);
  });
}

/** Plays one quest: fights with the hardest-hitting skill, heals when low, walks home when hurt. */
function run(seed: number, rarity: number): { depth: number; ended: string; loot: number } {
  const s = G.newGame(seed, catalog);
  s.stock = [];
  if (rarity > 0) gearUp(s, rarity, seed);
  s.phase = 'evening';
  Q.startQuest(s, catalog);
  const q = s.quest!;
  for (let guard = 0; guard < 2000 && !q.ended; guard++) {
    if (q.battle) {
      if (q.battle.over) Q.afterBattle(s, catalog);
      else {
        const list = Q.skills(s, catalog);
        const hit = (i: number) => list[i].fx.reduce((sum, f) => sum + (f.t === 'dmg' && f.side === 'foe' ? Q.damage(q.me[f.stat], (f.min + f.max) / 2, q.battle!.foe[f.stat]) : 0), 0);
        const heal = list.findIndex((k) => k.fx.some((f) => f.t === 'heal'));
        const best = list.map((_, i) => i).sort((a, b) => hit(b) - hit(a))[0];
        Q.fight(s, catalog, q.me.hp < q.me.maxHp * 0.4 && heal >= 0 ? heal : best);
      }
    } else if (q.me.hp < q.me.maxHp * 0.35) Q.turnBack(s);
    else {
      Q.leaveFound(s);
      Q.advance(s, catalog);
    }
  }
  return { depth: q.depth, ended: q.ended ?? 'stuck', loot: q.loot.length };
}

function measure(rarity: number) {
  const runs = Array.from({ length: 200 }, (_, i) => run(1000 + i * 31, rarity));
  const depths = runs.map((r) => r.depth).sort((a, b) => a - b);
  return {
    median: depths[100],
    lost: runs.filter((r) => r.ended === 'lost').length / 200,
    cleared: runs.filter((r) => r.ended === 'cleared').length / 200,
    loot: runs.reduce((a, r) => a + r.loot, 0) / 200,
  };
}

describe('damage rules', () => {
  it('cuts damage by half the defender\'s stat in %, capped at 40', () => {
    expect(Q.cutRate(10)).toBe(5);
    expect(Q.cutRate(79)).toBe(39);
    expect(Q.cutRate(500)).toBe(40);
    expect(Q.damage(100, 50, 0)).toBe(50);
    expect(Q.damage(100, 50, 40)).toBe(40); // 20% cut
    expect(Q.damage(63, 55, 200)).toBe(20); // floor(63 × 0.55 × 0.6)
  });

  it('the third try to run always works', () => {
    const s = G.newGame(5, catalog);
    s.phase = 'evening';
    Q.startQuest(s, catalog);
    const q = s.quest!;
    while (!q.battle) Q.advance(s, catalog);
    q.me.hp = q.me.maxHp = 100000;
    q.me.agi = 1;
    q.battle.foe.agi = 999;
    expect(Q.runChance(s)).toBe(B.runMin);
    q.battle.runs = 2;
    expect(Q.runChance(s)).toBe(1);
    Q.fight(s, catalog, -1);
    expect(q.battle.over).toBe('fled');
  });

  it('a defeat loses what was picked up on the run, and nothing else', () => {
    const s = G.newGame(6, catalog);
    const kept = G.addTo(s, catalog, 'wallet', catalog.items[0].id, 1, 0)!;
    s.phase = 'evening';
    Q.startQuest(s, catalog);
    const q = s.quest!;
    q.loot.push(G.addTo(s, catalog, 'wallet', catalog.items[1].id, 1, 0)!);
    while (!q.battle) Q.advance(s, catalog);
    q.me.hp = 1;
    q.battle.foe.agi = 999;
    q.battle.foe.phy = 999;
    for (let i = 0; i < 20 && !q.ended; i++) Q.fight(s, catalog, 0);
    expect(q.ended).toBe('lost');
    expect(s.wallet.items.map((x) => x.uid)).toEqual([kept]);
    Q.finishQuest(s, catalog);
    expect(s.phase).toBe('evening');
    expect(s.wentOut).toBe(true);
  });
});

describe('quest difficulty', () => {
  const bare = measure(0);
  const common = measure(1);
  const rare = measure(3);
  const legend = measure(5);
  console.log('bare  ', bare);
  console.log('common', common);
  console.log('rare  ', rare);
  console.log('legend', legend);

  it('better gear gets deeper', () => {
    expect(common.median).toBeGreaterThan(bare.median);
    expect(rare.cleared).toBeGreaterThan(common.cleared);
    expect(legend.cleared).toBeGreaterThan(rare.cleared);
  });
  it('bare hands survive the first floors, and the deepest floor needs real gear', () => {
    expect(bare.median).toBeGreaterThanOrEqual(2);
    expect(bare.cleared).toBeLessThan(0.05);
    expect(legend.cleared).toBeGreaterThan(0.3);
  });
});
