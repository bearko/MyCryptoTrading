import { B } from './balance';
import { HOUSE_MEMBERS } from './houses';
import { MARK_JA, type Mark } from './kinds';

/**
 * The five houses the heroes belong to, by what kind of person the hero is. Dealing kindly with a house's
 * heroes earns its regard. Each house also trades in its own way (`trait`).
 */
export type FactionId = 'haou' | 'buyu' | 'eichi' | 'fuga' | 'muhou';

/** What a rung of a house's ladder does (several keys can stand on one rung). */
export interface RungEffect {
  /** a bonus on what this house's buyers pay */
  tip?: number;
  /** this house's buyers carry this much more */
  purse?: number;
  /** each morning, this chance of one customer more */
  extra?: number;
  /** each morning, this chance that a patron sends a good */
  gift?: number;
  /** customers a day */
  visitors?: number;
  /** bargaining, either way */
  chance?: number;
  /** every customer's patience */
  patience?: number;
  /** rarer goods are brought (steps) */
  rarity?: number;
  /** uses of the loupe a day */
  looks?: number;
  /** sellers' asks (negative: lower) */
  ask?: number;
  /** a line of goods the shop takes up */
  line?: Mark;
  /** the patrol's day is known in the morning */
  news?: 1;
  /** the patrol fines nothing for what it takes */
  lenient?: 1;
  /** the dealer's cut is this much smaller */
  dealer?: number;
  /** each night, the shop's standing rises by this */
  fame?: number;
  /** this house's heroes come this much less often */
  shun?: number;
  /** the patrol comes this much more often */
  patrol?: number;
  /** replicas are brought this much more often */
  fakes?: number;
  /** nobody brings hot goods */
  noHot?: 1;
  /** each night, this chance that a good is taken from the shelf by a thief */
  theft?: number;
  /** the end of the shop */
  dead?: 1;
}

export type RungIcon = 'gum' | 'purse' | 'crowd' | 'gift' | 'line' | 'talk' | 'clock' | 'gem' | 'loupe' | 'tag' | 'news' | 'shield' | 'star' | 'shun' | 'patrol' | 'fake' | 'thief' | 'skull';

export interface Rung {
  /** the regard at which it holds, as shown: ±20 … ±100 (a rung below zero holds at that regard or lower) */
  at: number;
  name: string;
  text: string;
  icon: RungIcon;
  effect: RungEffect;
}

export interface Faction {
  id: FactionId;
  ja: string;
  /** who they are */
  who: string;
  /** the house it is at odds with: what pleases one sours the other (the house in the middle has none) */
  rival: FactionId | null;
  /** how its heroes trade */
  trait: string;
  /** the rungs of its ladder, from the top down */
  rungs: Rung[];
}

const R = B.rung;
const pc = (n: number): number => Math.round(n * 100);
const line = (mark: Mark): string => `${MARK_JA[mark]}の品を扱えるようになる`;

export const FACTIONS: Faction[] = [
  {
    id: 'haou',
    ja: '覇王',
    who: '王・皇帝・建国者',
    rival: 'muhou',
    trait: `予算が多い（${B.house.haouPurse} 倍）。レアリティの高い品や、芸術・神獣・兵器を求める。ショーケースに見合う品がないと来ない。売りには来ない`,
    rungs: [
      { at: 100, name: '大絶賛', text: `覇王の客の予算 +${pc(R.purse)}%`, icon: 'star', effect: { purse: R.purse } },
      { at: 80, name: 'おなじみの店', text: `毎朝 ${pc(R.extra)}% で、客が 1 人増える。${line('holy')}`, icon: 'crowd', effect: { extra: R.extra, line: 'holy' } },
      { at: 60, name: '王の慈悲', text: `毎朝 ${pc(R.gift)}% で、支援者から品が届く。${line('luxury')}`, icon: 'gift', effect: { gift: R.gift, line: 'luxury' } },
      { at: 40, name: '御用達', text: line('royal'), icon: 'line', effect: { line: 'royal' } },
      { at: 20, name: 'ご祝儀', text: `覇王の客に売ると、+${pc(R.tip)}% のご祝儀`, icon: 'gum', effect: { tip: R.tip } },
      { at: -40, name: '悪評', text: '覇王の客が、あまり来なくなる', icon: 'shun', effect: { shun: R.shun } },
      { at: -60, name: 'お触れ', text: `見回りが ${1 + R.patrol} 倍、来やすくなる`, icon: 'patrol', effect: { patrol: R.patrol } },
      { at: -100, name: 'お取り潰し', text: '店を取り上げられる（ゲームオーバー）', icon: 'skull', effect: { dead: 1 } },
    ],
  },
  {
    id: 'buyu',
    ja: '武勇',
    who: '名将・剣豪・決闘者',
    rival: 'eichi',
    trait: `武器・防具・生き物を求め、持ちこむ。払いがいい（予算 ${B.house.buyuPurse} 倍）が、気が短い`,
    rungs: [
      { at: 100, name: '武名', text: `値切り・上乗せの成功率 さらに +${pc(R.chance[1])}%`, icon: 'star', effect: { chance: R.chance[1] } },
      { at: 80, name: '一目おかれる', text: `どの客も、我慢が 1 回ぶん増える。${line('east')}`, icon: 'clock', effect: { patience: 1, line: 'east' } },
      { at: 60, name: '武具の目録', text: line('west'), icon: 'line', effect: { line: 'west' } },
      { at: 40, name: '胆力', text: `値切り・上乗せの成功率 +${pc(R.chance[0])}%`, icon: 'talk', effect: { chance: R.chance[0] } },
      { at: 20, name: '古強者の紹介', text: line('ancient'), icon: 'line', effect: { line: 'ancient' } },
      { at: -40, name: '腰抜けの店', text: '武勇の客が、あまり来なくなる', icon: 'shun', effect: { shun: R.shun } },
      { at: -60, name: 'なめられる', text: `値切り・上乗せの成功率 ${pc(R.chanceLow)}%`, icon: 'talk', effect: { chance: R.chanceLow } },
      { at: -100, name: '討ち入り', text: '武勇の者たちが店に押しいる（ゲームオーバー）', icon: 'skull', effect: { dead: 1 } },
    ],
  },
  {
    id: 'eichi',
    ja: '叡智',
    who: '学者・発明家・軍師',
    rival: 'buyu',
    trait: '道具・魔法・神獣を求め、持ちこむ。持ちこむ品にレプリカはない。値切り・上乗せが通りにくい',
    rungs: [
      { at: 100, name: '碩学の友', text: '珍しい品が、さらに集まりやすくなる', icon: 'star', effect: { rarity: 1 } },
      { at: 80, name: '鑑定の手ほどき', text: `ルーペを 1 日に ${R.looks} 回多く使える。${line('occult')}`, icon: 'loupe', effect: { looks: R.looks, line: 'occult' } },
      { at: 60, name: '先読み', text: `見回りの来る日が、朝にわかる。${line('science')}`, icon: 'news', effect: { news: 1, line: 'science' } },
      { at: 40, name: '目利き', text: '珍しい品が集まりやすくなる', icon: 'gem', effect: { rarity: 1 } },
      { at: 20, name: '書庫の鍵', text: line('book'), icon: 'line', effect: { line: 'book' } },
      { at: -40, name: '浅学の店', text: '叡智の客が、あまり来なくなる', icon: 'shun', effect: { shun: R.shun } },
      { at: -60, name: '鑑定おことわり', text: `ルーペを使える回数が ${R.looks} 回減る`, icon: 'loupe', effect: { looks: -R.looks } },
      { at: -80, name: 'まがい物の的', text: `レプリカが ${1 + R.fakes} 倍、持ちこまれやすくなる`, icon: 'fake', effect: { fakes: R.fakes } },
    ],
  },
  {
    id: 'fuga',
    ja: '風雅',
    who: '芸術家・文学者・美の象徴',
    rival: null,
    trait: '芸術・食べ物・飲み物・日用品・生き物を求め、持ちこむ。持ちこむ品は状態がいい。まとめて買っていく',
    rungs: [
      { at: 100, name: '噂の名店', text: '毎晩、店の評判が 1 上がる', icon: 'star', effect: { fame: 1 } },
      { at: 80, name: '人だかり', text: `毎日の客 さらに +1 人。${line('east')}`, icon: 'crowd', effect: { visitors: 1, line: 'east' } },
      { at: 60, name: '野の便り', text: line('nature'), icon: 'line', effect: { line: 'nature' } },
      { at: 40, name: '楽の音', text: line('music'), icon: 'line', effect: { line: 'music' } },
      { at: 20, name: 'にぎわい', text: '毎日の客 +1 人', icon: 'crowd', effect: { visitors: 1 } },
      { at: -20, name: '野暮な店', text: '毎日の客 −1 人', icon: 'shun', effect: { visitors: -1 } },
      { at: -60, name: '悪い噂', text: '毎日の客 さらに −1 人', icon: 'shun', effect: { visitors: -1 } },
    ],
  },
  {
    id: 'muhou',
    ja: '無法',
    who: '海賊・盗賊・謀反人',
    rival: 'haou',
    trait: `武器・魔法・生き物を好み、何でも買うが、予算は少ない（${B.house.muhouPurse} 倍）。安く持ちこむが、訳ありの品とレプリカが多い`,
    rungs: [
      { at: 100, name: '闇の元締め', text: `引取の商人の値引きが ${pc(R.dealer)}% ぶん小さくなる`, icon: 'star', effect: { dealer: R.dealer } },
      { at: 80, name: '抜け荷', text: `売り客の言い値 さらに −${pc(R.ask)}%。${line('ride')}`, icon: 'tag', effect: { ask: -R.ask, line: 'ride' } },
      { at: 60, name: '見逃し', text: `見回りに訳ありの品を取られても、罰金がない。${line('occult')}`, icon: 'shield', effect: { lenient: 1, line: 'occult' } },
      { at: 40, name: '呪いの市', text: line('cursed'), icon: 'line', effect: { line: 'cursed' } },
      { at: 20, name: '裏の仕入れ', text: `売り客の言い値 −${pc(R.ask)}%`, icon: 'tag', effect: { ask: -R.ask } },
      { at: -40, name: 'ブラックリスト', text: `訳ありの品が持ちこまれなくなる。売り客の言い値 +${pc(R.ask)}%`, icon: 'shun', effect: { noHot: 1, ask: R.ask } },
      { at: -60, name: '標的', text: `毎晩 ${pc(R.theft)}% で、棚の品が 1 つ盗まれる`, icon: 'thief', effect: { theft: R.theft } },
      { at: -100, name: '襲撃', text: '無法者が店を襲う（ゲームオーバー）', icon: 'skull', effect: { dead: 1 } },
    ],
  },
];

/** How a regard reads, as shown (−100 … +100). */
export const shown = (points: number): number => Math.round((points / (B.favorStep * 5)) * 100);
/** Regard in points → the rung it has reached: −5 … 5 (the tenth of a rung's `at`, in steps of two). */
export const rankOf = (points: number): number => Math.trunc(points / B.favorStep);
/** True when a rung holds at this regard (in points). */
export const holds = (rung: Rung, points: number): boolean => (rung.at > 0 ? rankOf(points) * 20 >= rung.at : rankOf(points) * 20 <= rung.at);
/** The name of where a house stands with the shop: the rung last reached, or nothing in particular. */
export function standing(f: Faction, points: number): string {
  const held = f.rungs.filter((rung) => holds(rung, points));
  if (held.length === 0) return 'ふつうの仲';
  return (points > 0 ? held[0] : held[held.length - 1]).name;
}

const BY_HERO = new Map<string, FactionId>((Object.keys(HOUSE_MEMBERS) as FactionId[]).flatMap((id) => HOUSE_MEMBERS[id].map((name): [string, FactionId] => [name, id])));
const BY_ID = new Map<FactionId, Faction>(FACTIONS.map((f) => [f.id, f]));

/** The house a hero belongs to (by the hero's name in the catalogue), or null. */
export const factionOfName = (ja: string): FactionId | null => BY_HERO.get(ja) ?? null;
export const factionById = (id: FactionId): Faction => BY_ID.get(id)!;

export const rivalOf = (id: FactionId): FactionId | null => BY_ID.get(id)!.rival;

export const noFavor = (): Record<FactionId, number> => ({ haou: 0, buyu: 0, eichi: 0, fuga: 0, muhou: 0 });
