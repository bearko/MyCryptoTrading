import type { Param, Role } from './catalog';

export interface StockItem {
  uid: number;
  itemId: number;
  /** 0 傷あり / 1 並品 / 2 美品 */
  cond: number;
  /** what the shop paid for it */
  paid: number;
  /** top-left cell of its footprint on the grid it lies on */
  x: number;
  y: number;
  /** turned a quarter turn */
  rot: boolean;
}

/** A good that is not on a grid: worn, or bought and not yet put in the wallet. */
export interface LooseItem {
  itemId: number;
  cond: number;
  paid: number;
}

export type Want = { type: 'param'; param: Param } | { type: 'role'; role: Role } | { type: 'rarity'; min: number } | { type: 'any' };

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

export interface DaySummary {
  revenue: number;
  spend: number;
  bought: number;
  sold: number;
  walkouts: number;
}

/** The six places gear is worn. */
export type SlotId = 'head' | 'body' | 'arm' | 'leg' | 'special1' | 'special2';
export const SLOT_IDS: SlotId[] = ['head', 'body', 'arm', 'leg', 'special1', 'special2'];

/** What is special about today (shown on waking). */
export interface DayEvent {
  id: 'none' | 'demand' | 'caravan' | 'rain' | 'bargain';
  param?: Param;
}

/** A night visit to the shop: what is for sale, and what was bought but is not in the wallet yet. */
export interface ShopVisit {
  goods: { itemId: number; cond: number; price: number; sold: boolean }[];
  tray: LooseItem[];
}

export interface Fighter {
  hp: number;
  maxHp: number;
  /** current values (buffs and debuffs included) */
  phy: number;
  int: number;
  agi: number;
  /** values at the start of the battle */
  base: { phy: number; int: number; agi: number };
  /** status name → turns left */
  status: Record<string, number>;
}

export interface Battle {
  enemyId: number;
  boss: boolean;
  foe: Fighter;
  /** the enemy's next action (index into its acts) */
  foeAct: number;
  /** how often the player has tried to run from this enemy */
  runs: number;
  turn: number;
  log: string[];
  over: null | 'won' | 'lost' | 'fled';
  /** what happened in the last round, in order, for the screen to stage (the log says the same in words) */
  events: import('./quest').BattleEvent[];
}

/** A night in the dungeon. */
export interface Quest {
  depth: number;
  me: Fighter;
  battle: Battle | null;
  /** what just happened (shown above the choices) */
  log: string[];
  /** a good lying on the ground that did not fit in the wallet */
  found: LooseItem | null;
  /** uids of the goods picked up on this run (lost on defeat) */
  loot: number[];
  gumFound: number;
  /** the run is over: walked home, beaten, or the deepest floor is cleared */
  ended: null | 'home' | 'lost' | 'cleared';
  /** what happened on the last step outside a battle, in order, for the screen to stage */
  events: import('./quest').QuestEvent[];
  /** the id of the newest event of this run (battle and exploration share the counter; it only grows) */
  eid: number;
}

export type Phase = 'morning' | 'open' | 'evening' | 'shop' | 'quest' | 'won' | 'lost';

export interface GameState {
  v: 4;
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
  /** the wallet is also the bag: what is bought at night or picked up on a quest comes home in it */
  wallet: { itemId: number; items: StockItem[] };
  equip: Record<SlotId, LooseItem | null>;
  rent: number;
  graceLeft: number;
  owned: boolean;
  /** the day the deed was bought (the score) */
  ownedDay: number;
  phase: Phase;
  event: DayEvent;
  /** the shop opened late today, because of last night's outing */
  lateOpen: boolean;
  /** went out tonight (one outing a night) */
  wentOut: boolean;
  shop: ShopVisit | null;
  quest: Quest | null;
  queue: Visitor[];
  cursor: number;
  /** how many customers come today */
  visitorsToday: number;
  today: DaySummary;
  /** what happened when the day closed (rent paid, grace used …) */
  nightNote: string;
  totals: { sold: number; bought: number; bestSale: number; deepest: number };
}

export const emptySummary = (): DaySummary => ({ revenue: 0, spend: 0, bought: 0, sold: 0, walkouts: 0 });
