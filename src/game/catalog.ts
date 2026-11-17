import { SERIES_KIND, type Kind, type Mark } from './kinds';
import raw from '../generated/catalog.json';
import type { ShapeId } from './shapes';

/** Parameter line: the stat a good leans on. */
export type Param = 'phy' | 'int' | 'agi' | 'hp';
/** Skill line: what a good's active skill does. */
export type Role = 'atk' | 'buff' | 'debuff' | 'heal' | 'status';
/** Where a good is worn. */
export type SlotKind = 'head' | 'body' | 'arm' | 'leg' | 'special';
export type StatKey = 'phy' | 'int' | 'agi';

/** One effect of an active skill, simplified for the quest battle. */
export type Fx =
  | { t: 'dmg'; stat: 'phy' | 'int'; min: number; max: number; side: 'foe' | 'self' }
  | { t: 'heal'; coef: 'phy' | 'int'; min: number; max: number; side: 'foe' | 'self' }
  | { t: 'stat'; stat: StatKey; dir: 1 | -1; base: string; pct: number; side: 'foe' | 'self' }
  | { t: 'status'; name: string; rate: number; side: 'foe' | 'self' };

/** A tradable good (an extension). */
/** What a special good does when it is used. `pot`: opens the pot — goods are put in, a better one comes out. */
export type Effect = 'pot' | 'crate';

/** The boxes sent home from the night shop, kept shut on the shelf: goods of their own, as large as what they hold (the index is the box's size). */
export const CRATE_IDS = [9001, 9002, 9003];
/** (as large as the boxes of `balance.ts` hold: a box saves no room) */
const CRATE_SHAPES = [['小', '4x4'], ['中', '5x4'], ['大', '6x5']];
const CRATE_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'%3E%3Crect x='1' y='4' width='14' height='11' fill='%23b98a52'/%3E%3Crect x='1' y='4' width='14' height='3' fill='%23d3a86e'/%3E%3Crect x='7' y='4' width='2' height='11' fill='%23e9d7a8'/%3E%3Crect x='1' y='7' width='14' height='1' fill='%238a6236'/%3E%3Cpath d='M1 4h14v11H1z' fill='none' stroke='%231b1b22'/%3E%3C/svg%3E";
/** The goods that have an effect of their own, by id. */
export const EFFECTS: Record<number, Effect> = { 4600: 'pot' };
export const EFFECT_JA: Record<Effect, { name: string; text: string }> = {
  crate: { name: '発送の箱', text: '棚に置いてクリックすると、開けて中の品を棚に出す' },
  pot: { name: '合成の壺', text: '棚に置いてクリックすると、合成ができる（品を 2〜3 個入れて、1 つ上の品にする）' },
};
/** The pot every shop starts with. */
export const POT_ID = 4600;

export interface Item {
  id: number;
  ja: string;
  en: string;
  /** 1 Common … 5 Legendary */
  rarity: number;
  /** one or more: stats tied for the highest count together */
  params: Param[];
  /** none, one or more */
  roles: Role[];
  series: string;
  /** footprint on the shelf grid (see shapes.ts) */
  shape: ShapeId;
  slot: SlotKind;
  /** the 財布 series: worn as the wallet, which is also the bag */
  wallet: boolean;
  /** [hp, phy, int, agi] added while worn */
  stats: number[];
  skill: string;
  skillText: string;
  fx: Fx[];
  img: string;
  /** a limited legendary: the top of a line, above its legendary. Nobody brings one in — it can only be made in the pot */
  limited: boolean;
  /** a good with an effect of its own, used by a double click while it is on the shelf (most goods have none) */
  effect?: Effect;
  /** what kind of thing it is, what else it passes for, and its marks of character (see kinds.ts) */
  kind: Kind;
  also: Kind[];
  marks: Mark[];
}

/** A customer (a hero). */
export interface Hero {
  id: number;
  ja: string;
  en: string;
  rarity: number;
  faction: string;
  img: string;
}

export interface Enemy {
  id: number;
  ja: string;
  img: string;
  /** how its strength is spread over [hp, phy, int, agi] */
  trend: number[];
  acts: { name: string; fx: Fx[] }[];
}

interface CatalogData {
  items: Item[];
  heroes: Hero[];
  icons: { gum: string; mchc: string };
  backdrop: string;
  dungeon: string;
  player: { ja: string; img: string; stats: number[] };
  enemies: Enemy[];
  bosses: Enemy[];
}

export interface Catalog extends CatalogData {
  itemById: Map<number, Item>;
  heroById: Map<number, Hero>;
  /** items that turn up in trade, grouped by rarity (index 1–5): no wallets, no limited legendaries */
  itemsByRarity: Item[][];
  /** customers grouped by rarity (index 1–5) */
  heroesByRarity: Hero[][];
  wallets: Item[];
}

export function buildCatalog(data: CatalogData): Catalog {
  const itemsByRarity: Item[][] = [[], [], [], [], [], []];
  // wallets are not ordinary goods: customers do not bring them, the night shop sells them
  // (ids run in lines: 1001 → 2001 → … → 5001, and a line's limited legendary is 5501)
  const byId = new Map(data.items.map((item) => [item.id, item]));
  for (const item of data.items) item.limited = item.rarity === 5 && item.id % 1000 >= 500 && byId.get(item.id - 500)?.series === item.series;
  for (const item of data.items) if (EFFECTS[item.id]) item.effect = EFFECTS[item.id];
  // (the boxes are not goods anyone brings, sells or draws: they are known by id only)
  const crates: Item[] = CRATE_SHAPES.map(([ja, shape], n) => ({ id: CRATE_IDS[n], ja: `段ボール箱（${ja}）`, en: 'Box', rarity: 1, params: [], roles: [], series: '段ボール箱', shape: shape as ShapeId, slot: data.items[0].slot, wallet: false, stats: [0, 0, 0, 0], skill: '発送の箱', skillText: 'クリックで開けて、中の品を棚に出す。', fx: [], img: CRATE_IMG, limited: false, effect: 'crate', kind: data.items[0].kind, also: [], marks: [] }));
  for (const item of data.items) Object.assign(item, SERIES_KIND[item.series] ?? { kind: 'art', also: [], marks: [] });
  for (const item of data.items) if (!item.wallet && !item.limited) itemsByRarity[item.rarity].push(item);
  const heroesByRarity: Hero[][] = [[], [], [], [], [], []];
  for (const hero of data.heroes) heroesByRarity[hero.rarity].push(hero);
  return {
    ...data,
    heroesByRarity,
    itemById: new Map([...data.items, ...crates].map((i) => [i.id, i])),
    heroById: new Map(data.heroes.map((h) => [h.id, h])),
    itemsByRarity,
    wallets: data.items.filter((i) => i.wallet).sort((a, b) => a.rarity - b.rarity),
  };
}

export const catalog: Catalog = buildCatalog(raw as unknown as CatalogData);

/** The classes of hero, by rarity (a hero of the first class is a novice). */
export const HERO_CLASS_JA = ['', 'ノービス', 'アンコモン', 'レア', 'エピック', 'レジェンダリー'];
export const RARITY_JA = ['', 'コモン', 'アンコモン', 'レア', 'エピック', 'レジェンダリー'];
export const PARAM_JA: Record<Param, string> = { phy: 'PHY系', int: 'INT系', agi: 'AGI系', hp: 'HP系' };
export const ROLE_JA: Record<Role, string> = { atk: '攻撃', buff: 'バフ', debuff: 'デバフ', heal: '回復', status: '状態異常' };
export const COND_JA = ['傷あり', '並品', '美品'];
export const SLOT_JA: Record<SlotKind, string> = { head: '頭', body: '胴体', arm: '腕', leg: '足', special: '特殊' };
