import type { Kind } from './catalog';

export interface StockItem {
  uid: number;
  itemId: number;
  /** 0 傷あり / 1 並品 / 2 美品 */
  cond: number;
  /** what the shop paid for it */
  paid: number;
  /** top-left cell of its footprint on the shelf grid */
  x: number;
  y: number;
  /** turned a quarter turn on the shelf */
  rot: boolean;
}

export type Want = { type: 'kind'; kind: Kind } | { type: 'rarity'; min: number } | { type: 'any' };

/** One good a customer has brought to sell. */
export interface Offer {
  itemId: number;
  cond: number;
  /** the current asking price */
  ask: number;
}

export interface Visitor {
  heroId: number;
  /** 0 気さく / 1 ふつう / 2 頑固 */
  temper: number;
  patience: number;
  kind: 'sell' | 'buy';
  /** seller: the goods still on offer (bought ones are removed) */
  offers: Offer[];
  /** seller: discount for taking everything they brought at once (0.1 = 10% off); 0 after a partial buy */
  bundleRate: number;
  /** a seller's prices can be talked down only once */
  haggled: boolean;
  /** buyer */
  want: Want;
  /** buyer: what they can still spend */
  budget: number;
  /** what the customer is saying right now */
  line: string;
  mood: 'neutral' | 'happy' | 'annoyed';
  /** the customer is leaving: sent away, everything bought, budget spent, or out of patience */
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
  v: 3;
  rng: number;
  day: number;
  gum: number;
  /** 0–100 */
  rep: number;
  /** rows of the shelf grid (columns are fixed) */
  rows: number;
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
