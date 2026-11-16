import { B } from './balance';
import { HOUSE_MEMBERS } from './houses';

/**
 * The five houses the heroes belong to, by what kind of person the hero is. Dealing kindly with a house's
 * heroes earns its regard. Each house also trades in its own way (`trait`).
 */
export type FactionId = 'haou' | 'buyu' | 'eichi' | 'fuga' | 'muhou';

export interface Faction {
  id: FactionId;
  ja: string;
  /** who they are */
  who: string;
  /** the house it is at odds with: what pleases one sours the other (the house in the middle has none) */
  rival: FactionId | null;
  /** how its heroes trade */
  trait: string;
  /** the name of what the house grants */
  boon: string;
  /** what it grants at a rank (1–3), or takes away when it has turned against the shop (−1, −2) */
  text: (rank: number) => string;
}

const signed = (n: number, unit = ''): string => `${n < 0 ? '−' : '+'}${Math.abs(n)}${unit}`;
const pct = (n: number): number => Math.round(n * 100);

export const FACTIONS: Faction[] = [
  {
    id: 'haou',
    ja: '覇王',
    who: '王・皇帝・建国者',
    rival: 'muhou',
    trait: `予算が多い（${B.house.haouPurse} 倍）。レアリティの高い品を求める。ショーケースに見合う品がないと来ない。売りには来ない`,
    boon: '太っ腹',
    text: (r) => `買い客の予算 ${signed(pct(B.boonBudget * r), '%')}`,
  },
  {
    id: 'buyu',
    ja: '武勇',
    who: '名将・剣豪・決闘者',
    rival: 'eichi',
    trait: `PHY 系の品を求め、持ちこむ。払いがいい（予算 ${B.house.buyuPurse} 倍）が、気が短い`,
    boon: '胆力',
    text: (r) => `値切り・上乗せの成功率 ${signed(pct(B.boonChance * r), '%')}`,
  },
  {
    id: 'eichi',
    ja: '叡智',
    who: '学者・発明家・軍師',
    rival: 'buyu',
    trait: 'INT 系の品を求め、持ちこむ。持ちこむ品にレプリカはない。値切り・上乗せが通りにくい',
    boon: '目利き',
    text: (r) => (r > 0 ? `珍しい品が集まりやすい（${r} 段）` : `珍しい品が集まりにくい（${-r} 段）`),
  },
  {
    id: 'fuga',
    ja: '風雅',
    who: '芸術家・文学者・美の象徴',
    rival: null,
    trait: 'AGI 系の品を求め、持ちこむ。持ちこむ品は状態がいい。まとめて買っていく',
    boon: 'にぎわい',
    text: (r) => `毎日の客 ${signed(B.boonVisitors * r)} 人`,
  },
  {
    id: 'muhou',
    ja: '無法',
    who: '海賊・盗賊・謀反人',
    rival: 'haou',
    trait: `何でも買うが、予算は少ない（${B.house.muhouPurse} 倍）。安く持ちこむが、訳ありの品とレプリカが多い`,
    boon: '裏の仕入れ',
    text: (r) => `売り客の言い値 ${signed(-pct(B.boonAsk * r), '%')}`,
  },
];

const RANK_JA = ['—', '顔なじみ', 'お得意さま', '盟友'] as const;
const LOW_JA = ['—', '不仲', '険悪'] as const;
/** The name of a rank, from −2 to 3. */
export const rankName = (rank: number): string => (rank < 0 ? LOW_JA[-rank] : RANK_JA[rank]);

const BY_HERO = new Map<string, FactionId>((Object.keys(HOUSE_MEMBERS) as FactionId[]).flatMap((id) => HOUSE_MEMBERS[id].map((name): [string, FactionId] => [name, id])));
const BY_ID = new Map<FactionId, Faction>(FACTIONS.map((f) => [f.id, f]));

/** The house a hero belongs to (by the hero's name in the catalogue), or null. */
export const factionOfName = (ja: string): FactionId | null => BY_HERO.get(ja) ?? null;
export const factionById = (id: FactionId): Faction => BY_ID.get(id)!;

export const rivalOf = (id: FactionId): FactionId | null => BY_ID.get(id)!.rival;

/** Regard in points → rank: 0–3, or −1 and −2 for a house that has turned against the shop. */
export function rankOf(points: number): number {
  let rank = 0;
  for (const need of B.favorRanks) if (points >= need) rank += 1;
  for (const low of B.favorLow) if (points <= low) rank -= 1;
  return rank;
}

export const noFavor = (): Record<FactionId, number> => ({ haou: 0, buyu: 0, eichi: 0, fuga: 0, muhou: 0 });
