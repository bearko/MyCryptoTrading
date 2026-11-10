import raw from '../generated/catalog.json';
import type { ShapeId } from './shapes';

export type Kind = 'phy' | 'int' | 'agi';

/** A tradable good (an extension). */
export interface Item {
  id: number;
  ja: string;
  en: string;
  /** 1 Common … 5 Legendary */
  rarity: number;
  kind: Kind;
  series: string;
  /** footprint on the shelf grid (see shapes.ts) */
  shape: ShapeId;
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

export interface Catalog {
  items: Item[];
  heroes: Hero[];
  icons: { gum: string };
  backdrop: string;
  itemById: Map<number, Item>;
  heroById: Map<number, Hero>;
  /** items grouped by rarity (index 1–5) */
  itemsByRarity: Item[][];
}

export function buildCatalog(data: Pick<Catalog, 'items' | 'heroes' | 'icons' | 'backdrop'>): Catalog {
  const itemsByRarity: Item[][] = [[], [], [], [], [], []];
  for (const item of data.items) itemsByRarity[item.rarity].push(item);
  return {
    ...data,
    itemById: new Map(data.items.map((i) => [i.id, i])),
    heroById: new Map(data.heroes.map((h) => [h.id, h])),
    itemsByRarity,
  };
}

export const catalog: Catalog = buildCatalog(raw as Pick<Catalog, 'items' | 'heroes' | 'icons' | 'backdrop'>);

export const RARITY_JA = ['', 'コモン', 'アンコモン', 'レア', 'エピック', 'レジェンダリー'];
export const KIND_JA: Record<Kind, string> = { phy: '武具（PHY）', int: '知具（INT）', agi: '軽具（AGI）' };
export const COND_JA = ['傷あり', '並品', '美品'];
