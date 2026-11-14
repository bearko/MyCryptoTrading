import { describe, expect, it } from 'vitest';
import { catalog } from '../src/game/catalog';
import { play, type Style } from './bot';

const RUNS = 300;

function measure(style: Style) {
  const days: number[] = [];
  let lost = 0;
  for (let seed = 1; seed <= RUNS; seed++) {
    const s = play(catalog, seed * 7919, style);
    if (s.owned) days.push(s.ownedDay);
    else if (s.phase === 'lost') lost += 1;
  }
  days.sort((a, b) => a - b);
  const at = (q: number) => days[Math.min(days.length - 1, Math.floor(days.length * q))] ?? NaN;
  return { won: days.length / RUNS, lost: lost / RUNS, p10: at(0.1), median: at(0.5), p90: at(0.9) };
}

describe('economy', () => {
  const plain = measure('plain');
  const careful = measure('careful');
  console.log('plain  ', JSON.stringify(plain));
  console.log('careful', JSON.stringify(careful));
  console.log('kind   ', JSON.stringify(measure('kind')));
  console.log('crafty ', JSON.stringify(measure('crafty')));

  it('a careful shopkeeper usually buys the shop in 4–9 weeks', () => {
    expect(careful.won).toBeGreaterThan(0.85);
    expect(careful.median).toBeGreaterThanOrEqual(28);
    expect(careful.median).toBeLessThanOrEqual(63);
  });

  it('haggling pays: careful play finishes clearly sooner than plain play', () => {
    // (a dear price now shrinks the budget, so a markup trades volume for unit price: the edge comes mostly from haggling when buying)
    expect(careful.median).toBeLessThan(plain.median * 0.95);
    // the pot adds value: putting goods through it finishes clearly sooner still, without breaking the game open
    const crafty = measure('crafty');
    expect(crafty.median).toBeLessThan(careful.median * 0.9);
    expect(crafty.median).toBeGreaterThan(careful.median * 0.55);
  });

  it('playing without haggling is still survivable most of the time', () => {
    expect(plain.lost).toBeLessThan(0.35);
  });
});
