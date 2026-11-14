import { B } from './balance';

/** The five houses the heroes belong to. Dealing kindly with a house's heroes earns its regard. */
export type FactionId = 'suzaku' | 'seiryu' | 'genbu' | 'koryu' | 'byakko';

export interface Faction {
  id: FactionId;
  ja: string;
  /** the house it is at odds with: what pleases one sours the other (the house in the middle has none) */
  rival: FactionId | null;
  /** the name of what the house grants */
  boon: string;
  /** what it grants at a rank (1–3), or takes away when it has turned against the shop (−1, −2) */
  text: (rank: number) => string;
}

const signed = (n: number, unit = ''): string => `${n < 0 ? '−' : '+'}${Math.abs(n)}${unit}`;
const pct = (n: number): number => Math.round(n * 100);

export const FACTIONS: Faction[] = [
  { id: 'suzaku', ja: '朱雀', rival: 'genbu', boon: 'にぎわい', text: (r) => `毎日の客 ${signed(B.boonVisitors * r)} 人` },
  { id: 'seiryu', ja: '青龍', rival: 'byakko', boon: '太っ腹', text: (r) => `買い客の予算 ${signed(pct(B.boonBudget * r), '%')}` },
  { id: 'genbu', ja: '玄武', rival: 'suzaku', boon: '実直', text: (r) => `売り客の言い値 ${signed(-pct(B.boonAsk * r), '%')}` },
  { id: 'byakko', ja: '白虎', rival: 'seiryu', boon: '胆力', text: (r) => `値切り・上乗せの成功率 ${signed(pct(B.boonChance * r), '%')}` },
  { id: 'koryu', ja: '黄竜', rival: null, boon: '目利き', text: (r) => (r > 0 ? `珍しい品が集まりやすい（${r} 段）` : `珍しい品が集まりにくい（${-r} 段）`) },
];

const RANK_JA = ['—', '顔なじみ', 'お得意さま', '盟友'] as const;
const LOW_JA = ['—', '不仲', '険悪'] as const;
/** The name of a rank, from −2 to 3. */
export const rankName = (rank: number): string => (rank < 0 ? LOW_JA[-rank] : RANK_JA[rank]);

const BY_JA = new Map<string, FactionId>(FACTIONS.map((f) => [f.ja, f.id]));
const BY_ID = new Map<FactionId, Faction>(FACTIONS.map((f) => [f.id, f]));

/** The house a hero belongs to (from the name in the catalogue), or null. */
export const factionOfName = (ja: string): FactionId | null => BY_JA.get(ja) ?? null;
export const factionById = (id: FactionId): Faction => BY_ID.get(id)!;

export const rivalOf = (id: FactionId): FactionId | null => BY_ID.get(id)!.rival;

/** Regard in points → rank: 0–3, or −1 and −2 for a house that has turned against the shop. */
export function rankOf(points: number): number {
  let rank = 0;
  for (const need of B.favorRanks) if (points >= need) rank += 1;
  for (const low of B.favorLow) if (points <= low) rank -= 1;
  return rank;
}

export const noFavor = (): Record<FactionId, number> => ({ suzaku: 0, seiryu: 0, genbu: 0, koryu: 0, byakko: 0 });
