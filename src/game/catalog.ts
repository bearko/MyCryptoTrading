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
  icons: { gum: string };
  backdrop: string;
  dungeon: string;
  player: { ja: string; img: string; stats: number[] };
  enemies: Enemy[];
  bosses: Enemy[];
}

export interface Catalog extends CatalogData {
  itemById: Map<number, Item>;
  heroById: Map<number, Hero>;
  /** items grouped by rarity (index 1–5) */
  itemsByRarity: Item[][];
  wallets: Item[];
}

export function buildCatalog(data: CatalogData): Catalog {
  const itemsByRarity: Item[][] = [[], [], [], [], [], []];
  // wallets are not ordinary goods: customers do not bring them, the night shop sells them
  for (const item of data.items) if (!item.wallet) itemsByRarity[item.rarity].push(item);
  return {
    ...data,
    itemById: new Map(data.items.map((i) => [i.id, i])),
    heroById: new Map(data.heroes.map((h) => [h.id, h])),
    itemsByRarity,
    wallets: data.items.filter((i) => i.wallet).sort((a, b) => a.rarity - b.rarity),
  };
}

export const catalog: Catalog = buildCatalog(raw as unknown as CatalogData);

export const RARITY_JA = ['', 'コモン', 'アンコモン', 'レア', 'エピック', 'レジェンダリー'];
export const PARAM_JA: Record<Param, string> = { phy: 'PHY系', int: 'INT系', agi: 'AGI系', hp: 'HP系' };
export const ROLE_JA: Record<Role, string> = { atk: '攻撃', buff: 'バフ', debuff: 'デバフ', heal: '回復', status: '状態異常' };
export const COND_JA = ['傷あり', '並品', '美品'];
export const SLOT_JA: Record<SlotKind, string> = { head: '頭', body: '胴体', arm: '腕', leg: '足', special: '特殊' };
