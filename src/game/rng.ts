/** Seeded random numbers (mulberry32). The state is a single integer, so it can be saved. */
export interface RngHolder {
  rng: number;
}

/** Next float in [0, 1). Advances `holder.rng`. */
export function rand(holder: RngHolder): number {
  holder.rng = (holder.rng + 0x6d2b79f5) | 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randRange = (h: RngHolder, min: number, max: number): number => min + rand(h) * (max - min);
export const randInt = (h: RngHolder, n: number): number => Math.floor(rand(h) * n);
export const pick = <T>(h: RngHolder, list: readonly T[]): T => list[randInt(h, list.length)];

/** Picks an index by weight. */
export function pickWeighted(h: RngHolder, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  let roll = rand(h) * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= Math.max(0, weights[i]);
    if (roll < 0) return i;
  }
  return weights.length - 1;
}
