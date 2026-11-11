import { describe, expect, it } from 'vitest';
import { B } from '../src/game/balance';
import { catalog } from '../src/game/catalog';
import * as G from '../src/game/logic';
import * as N from '../src/game/night';
import * as Q from '../src/game/quest';
import type { Fighter, GameState } from '../src/game/state';

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

describe('events for the screen', () => {
  /** Plays a geared run and hands every step's state to `see`. */
  function watch(seed: number, see: (s: GameState, step: 'advance' | 'fight' | 'after') => void, before?: (s: GameState) => void): GameState {
    const s = G.newGame(seed, catalog);
    s.stock = [];
    gearUp(s, 3, seed);
    s.phase = 'evening';
    Q.startQuest(s, catalog);
    const q = s.quest!;
    for (let guard = 0; guard < 600 && !q.ended; guard++) {
      if (q.battle?.over) {
        Q.afterBattle(s, catalog);
        see(s, 'after');
      } else if (q.battle) {
        before?.(s);
        Q.fight(s, catalog, guard % Q.skills(s, catalog).length);
        see(s, 'fight');
      } else {
        Q.advance(s, catalog);
        see(s, 'advance');
      }
    }
    return s;
  }

  it('starts with an entrance event, and ids only grow across exploration and battle', () => {
    const fresh = G.newGame(3, catalog);
    fresh.phase = 'evening';
    Q.startQuest(fresh, catalog);
    expect(fresh.quest!.events.map((e) => e.t)).toEqual(['enter']);
    let last = fresh.quest!.eid;
    expect(last).toBe(1);
    let total = 0;
    watch(21, (s, step) => {
      const q = s.quest!;
      const list = step === 'fight' ? q.battle!.events : q.events;
      for (const e of list) {
        expect(e.id).toBeGreaterThan(last);
        last = e.id;
        total += 1;
      }
      expect(q.eid).toBe(last);
    });
    expect(total).toBeGreaterThan(20);
  });

  it('every step deeper tells the floor and exactly what was met there', () => {
    const kinds = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      watch(seed * 17, (s, step) => {
        if (step !== 'advance') return;
        const q = s.quest!;
        expect(q.events[0]).toMatchObject({ t: 'floor', depth: q.depth });
        expect(q.events).toHaveLength(2);
        const e = q.events[1];
        kinds.add(e.t);
        if (e.t === 'encounter') expect(q.battle).toMatchObject({ enemyId: e.enemyId, boss: e.boss, events: [] });
        else expect(q.battle).toBeNull();
        if (e.t === 'found') {
          expect(e.stowed).toBe(q.found === null);
          if (e.stowed) expect(s.wallet.items.find((x) => x.uid === e.uid)?.itemId).toBe(e.itemId);
          else expect(q.found).toMatchObject({ itemId: e.itemId, cond: e.cond });
        }
        if (e.t === 'heal' || e.t === 'trap') expect(e.hp).toBe(q.me.hp);
      });
    }
    for (const t of ['encounter', 'found', 'quiet', 'gum', 'trap']) expect(kinds).toContain(t);
  });

  it('a round can be replayed from its events: HP, stats and statuses end where the rules left them', () => {
    let rounds = 0;
    const kinds = new Set<string>();
    for (const seed of [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
      let shown: { me: Fighter; foe: Fighter } | null = null;
      watch(
        seed * 7,
        (s, step) => {
          if (step !== 'fight') return;
          const q = s.quest!;
          const b = q.battle!;
          const view = shown!;
          for (const e of b.events) {
            kinds.add(e.t);
            if (e.t === 'dmg' || e.t === 'heal' || e.t === 'tick') {
              const f = view[e.target];
              expect(e.hp).toBe(e.t === 'heal' ? f.hp + e.amount : Math.max(0, f.hp - e.amount));
              f.hp = e.hp;
            } else if (e.t === 'stat') {
              expect(e.value).toBe(view[e.target][e.stat] + e.delta);
              view[e.target][e.stat] = e.value;
            } else if (e.t === 'status') view[e.target].status[e.name] = e.turns;
            else if (e.t === 'statusEnd') delete view[e.target].status[e.name];
          }
          expect({ hp: view.me.hp, phy: view.me.phy, int: view.me.int, agi: view.me.agi }).toEqual({ hp: q.me.hp, phy: q.me.phy, int: q.me.int, agi: q.me.agi });
          expect({ hp: view.foe.hp, phy: view.foe.phy, int: view.foe.int, agi: view.foe.agi }).toEqual({ hp: b.foe.hp, phy: b.foe.phy, int: b.foe.int, agi: b.foe.agi });
          expect(Object.keys(view.me.status).sort()).toEqual(Object.keys(q.me.status).sort());
          expect(Object.keys(view.foe.status).sort()).toEqual(Object.keys(b.foe.status).sort());
          // the words and the events tell the same story
          expect(b.log.length).toBeGreaterThan(0);
          expect(b.events.filter((e) => e.t === 'skill').length).toBe(b.log.filter((line) => line.includes('の「')).length);
          if (b.over === 'won') expect(b.events.slice(-2).map((e) => e.t)).toEqual(['ko', 'reward']);
          if (b.over === 'lost') expect(b.events.slice(-2).map((e) => e.t)).toEqual(['ko', 'lost']);
          rounds += 1;
        },
        (s) => {
          shown = structuredClone({ me: s.quest!.me, foe: s.quest!.battle!.foe });
        },
      );
    }
    expect(rounds).toBeGreaterThan(40);
    for (const t of ['skill', 'dmg', 'ko', 'reward']) expect(kinds).toContain(t);
  });

  it('the forecast brackets what a skill then really does', () => {
    let checked = 0;
    for (const seed of [31, 32, 33, 34, 35, 36]) {
      const s = G.newGame(seed, catalog);
      s.stock = [];
      gearUp(s, 4, seed);
      s.phase = 'evening';
      Q.startQuest(s, catalog);
      const q = s.quest!;
      while (!q.battle) Q.advance(s, catalog);
      q.battle.foe.agi = 1; // the player acts first, so the forecast is for the state on screen
      q.battle.foe.hp = q.battle.foe.maxHp = 99999;
      q.me.hp = Math.ceil(q.me.maxHp / 2);
      Q.skills(s, catalog).forEach((skill, index) => {
        const twin = structuredClone(s);
        const tq = twin.quest!;
        const plan = Q.forecast(skill.fx, tq.me, tq.battle!.foe);
        const before = JSON.stringify([tq.me, tq.battle!.foe]);
        Q.forecast(skill.fx, tq.me, tq.battle!.foe);
        expect(JSON.stringify([tq.me, tq.battle!.foe])).toBe(before);
        Q.fight(twin, catalog, index);
        const events = tq.battle!.events;
        const mine = events.slice(0, events.findIndex((e, i) => i > 0 && (e.t === 'skill' || e.t === 'blocked')) >>> 0);
        const hits = mine.filter((e) => e.t === 'dmg');
        const want = plan.filter((p) => p.t === 'dmg');
        expect(hits.length).toBe(want.length);
        hits.forEach((e, i) => {
          const p = want[i];
          if (e.t !== 'dmg' || p.t !== 'dmg') return;
          expect(e.amount).toBeGreaterThanOrEqual(p.lo);
          expect(e.amount).toBeLessThanOrEqual(p.hi);
          expect(e.stat).toBe(p.stat);
          checked += 1;
        });
        const heals = mine.filter((e) => e.t === 'heal');
        const mend = plan.filter((p) => p.t === 'heal');
        heals.forEach((e, i) => {
          const p = mend[i];
          if (e.t !== 'heal' || p.t !== 'heal') return;
          expect(e.amount).toBeGreaterThanOrEqual(p.lo);
          expect(e.amount).toBeLessThanOrEqual(p.hi);
        });
        const shifts = mine.filter((e) => e.t === 'stat');
        const moves = plan.filter((p) => p.t === 'stat');
        expect(shifts.length).toBe(moves.length);
        shifts.forEach((e, i) => {
          const p = moves[i];
          if (e.t === 'stat' && p.t === 'stat') expect(e.delta).toBe(p.delta);
        });
      });
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('a failed run and a won run are told apart, with the chance that was rolled against', () => {
    const s = G.newGame(5, catalog);
    s.phase = 'evening';
    Q.startQuest(s, catalog);
    const q = s.quest!;
    while (!q.battle) Q.advance(s, catalog);
    q.battle.foe.phy = 1;
    q.battle.foe.int = 1;
    const tries: boolean[] = [];
    for (let i = 0; i < 3 && !q.battle.over; i++) {
      Q.fight(s, catalog, -1);
      const e = q.battle.events.find((x) => x.t === 'run');
      expect(e).toBeDefined();
      if (e?.t === 'run') {
        tries.push(e.ok);
        expect(e.tries).toBe(i + 1);
        if (i === 2) expect(e.chance).toBe(1);
      }
    }
    expect(tries[tries.length - 1]).toBe(true);
    Q.afterBattle(s, catalog);
    expect(q.events.map((e) => e.t)).toEqual(['fled']);
  });

  it('a defeat lists what was lost, and walking home says so', () => {
    const s = G.newGame(6, catalog);
    s.phase = 'evening';
    Q.startQuest(s, catalog);
    const q = s.quest!;
    q.loot.push(G.addTo(s, catalog, 'wallet', catalog.items[1].id, 2, 0)!);
    while (!q.battle) Q.advance(s, catalog);
    q.me.hp = 1;
    q.battle.foe.agi = 999;
    q.battle.foe.phy = 999;
    const carried = s.wallet.items.filter((x) => q.loot.includes(x.uid)).map((x) => ({ itemId: x.itemId, cond: x.cond }));
    expect(carried).toContainEqual({ itemId: catalog.items[1].id, cond: 2 });
    for (let i = 0; i < 20 && !q.ended; i++) Q.fight(s, catalog, 0);
    const lost = q.battle.events.find((e) => e.t === 'lost');
    expect(lost).toMatchObject({ t: 'lost', items: carried });
    expect(s.wallet.items).toHaveLength(0);

    const t = G.newGame(8, catalog);
    t.phase = 'evening';
    Q.startQuest(t, catalog);
    Q.turnBack(t);
    expect(t.quest!.events.map((e) => e.t)).toEqual(['home']);
  });

  it('the same seed tells the same story', () => {
    const tale = (): string => {
      const all: unknown[] = [];
      watch(77, (s, step) => all.push(...(step === 'fight' ? s.quest!.battle!.events : s.quest!.events)));
      return JSON.stringify(all);
    };
    expect(tale()).toBe(tale());
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
