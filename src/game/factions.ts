import { B } from './balance';

/** The five houses the heroes belong to. Dealing kindly with a house's heroes earns its regard. */
export type FactionId = 'suzaku' | 'seiryu' | 'genbu' | 'koryu' | 'byakko';

export interface Faction {
  id: FactionId;
  ja: string;
  /** the name of what the house grants */
  boon: string;
  /** what it grants at a rank (1–3) */
  text: (rank: number) => string;
}

export const FACTIONS: Faction[] = [
  { id: 'suzaku', ja: '朱雀', boon: 'にぎわい', text: (r) => `毎日の客 +${B.boonVisitors * r} 人` },
  { id: 'seiryu', ja: '青龍', boon: '太っ腹', text: (r) => `買い客の予算 +${Math.round(B.boonBudget * r * 100)}%` },
  { id: 'genbu', ja: '玄武', boon: '実直', text: (r) => `売り客の言い値 −${Math.round(B.boonAsk * r * 100)}%` },
  { id: 'byakko', ja: '白虎', boon: '胆力', text: (r) => `値切り・上乗せの成功率 +${Math.round(B.boonChance * r * 100)}%` },
  { id: 'koryu', ja: '黄竜', boon: '目利き', text: (r) => `珍しい品が集まりやすい（${r} 段）` },
];

export const RANK_JA = ['—', '顔なじみ', 'お得意さま', '盟友'] as const;

const BY_JA = new Map<string, FactionId>(FACTIONS.map((f) => [f.ja, f.id]));
const BY_ID = new Map<FactionId, Faction>(FACTIONS.map((f) => [f.id, f]));

/** The house a hero belongs to (from the name in the catalogue), or null. */
export const factionOfName = (ja: string): FactionId | null => BY_JA.get(ja) ?? null;
export const factionById = (id: FactionId): Faction => BY_ID.get(id)!;

/** Regard in points → rank 0–3. */
export function rankOf(points: number): number {
  let rank = 0;
  for (const need of B.favorRanks) if (points >= need) rank += 1;
  return rank;
}

export const noFavor = (): Record<FactionId, number> => ({ suzaku: 0, seiryu: 0, genbu: 0, koryu: 0, byakko: 0 });
