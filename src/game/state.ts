import type { Kind } from './catalog';

export interface StockItem {
  uid: number;
  itemId: number;
  /** 0 傷あり / 1 並品 / 2 美品 */
  cond: number;
  /** what the shop paid for it */
  paid: number;
}

export type Want = { type: 'kind'; kind: Kind } | { type: 'rarity'; min: number } | { type: 'any' };

export interface Visitor {
  heroId: number;
  /** 0 気さく / 1 ふつう / 2 頑固 */
  temper: number;
  patience: number;
  kind: 'sell' | 'buy';
  /** seller: the good on offer and the current asking price */
  itemId: number;
  cond: number;
  ask: number;
  /** a seller's price can be talked down only once */
  haggled: boolean;
  /** buyer */
  want: Want;
  budget: number;
  /** what the customer is saying right now */
  line: string;
  mood: 'neutral' | 'happy' | 'annoyed';
  done: boolean;
}

export interface WholesaleOffer {
  itemId: number;
  cond: number;
  price: number;
  sold: boolean;
}

export interface DaySummary {
  revenue: number;
  spend: number;
  bought: number;
  sold: number;
  walkouts: number;
}

export type Phase = 'morning' | 'open' | 'evening' | 'won' | 'lost';

export interface GameState {
  v: 1;
  rng: number;
  day: number;
  gum: number;
  /** 0–100 */
  rep: number;
  capacity: number;
  shelfLevel: number;
  stock: StockItem[];
  nextUid: number;
  rent: number;
  graceLeft: number;
  owned: boolean;
  /** the day the deed was bought (the score) */
  ownedDay: number;
  phase: Phase;
  wholesale: WholesaleOffer[];
  queue: Visitor[];
  cursor: number;
  /** how many customers come today */
  visitorsToday: number;
  today: DaySummary;
  /** what happened when the day closed (rent paid, grace used …) */
  nightNote: string;
  totals: { sold: number; bought: number; bestSale: number };
}

export const emptySummary = (): DaySummary => ({ revenue: 0, spend: 0, bought: 0, sold: 0, walkouts: 0 });
