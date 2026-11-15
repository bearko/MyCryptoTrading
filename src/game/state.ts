import type { Param, Role } from './catalog';
import type { FactionId } from './factions';
import type { ServiceId, SupplyId } from './network';
import type { PerkId } from './perks';

/** A good that has come from the guild and is not on a shelf yet. */
export interface Parcel {
  itemId: number;
  cond: number;
  paid: number;
}

export interface StockItem {
  uid: number;
  itemId: number;
  /** 0 傷あり / 1 並品 / 2 美品 */
  cond: number;
  /** what the shop paid for it */
  paid: number;
  /** a replica, and whether the shop knows what it is (looked at through the loupe) */
  fake?: boolean;
  seen?: boolean;
  /** a hot good (see Offer) */
  hot?: boolean;
  /** the wallet in use: it stands on the shelf, and what it holds is `wallet.items` (it is not sold, binned or carried off) */
  bag?: boolean;
  /** top-left cell of its footprint on the grid it lies on */
  x: number;
  y: number;
  /** quarter turns clockwise: 0–3 */
  rot: number;
}

/** A good that is not on a grid: worn, or bought and not yet put in the wallet. */
export interface LooseItem {
  itemId: number;
  cond: number;
  paid: number;
  /** (a replica stays one wherever it is carried or worn; so does a hot good) */
  fake?: boolean;
  seen?: boolean;
  hot?: boolean;
}

export type Want = { type: 'param'; param: Param } | { type: 'role'; role: Role } | { type: 'rarity'; min: number } | { type: 'any' };

/** One good a customer has brought to sell. */
export interface Offer {
  itemId: number;
  cond: number;
  /** the current asking price */
  ask: number;
  /** a replica (the shop does not know until it has looked through the loupe) */
  fake?: boolean;
  /** looked at through the loupe: the shop knows what it is */
  seen?: boolean;
  /** a hot good: cheap, and taken away if a patrol finds it on the shelf */
  hot?: boolean;
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
  /** a seller's prices can be bargained over only once */
  haggled: boolean;
  /** seller: how that bargain went — 0 none, 1–2 the shop added to the price (a kind tier), −1 to −3 it talked the price down */
  nego: number;
  /** buyer */
  want: Want;
  /** buyer: what they can still spend */
  budget: number;
  /** what the customer is saying right now */
  line: string;
  mood: 'neutral' | 'happy' | 'annoyed';
  /** the customer is leaving: sent away, everything bought, budget spent, or out of patience */
  done: boolean;
  /** the house the hero belongs to (null for a hero without one) */
  faction: FactionId | null;
  /** deals closed with this customer (a customer who leaves with none breaks the streak) */
  deals: number;
  /** an unusual customer: 大富豪 / 急ぎの旅人 / 収集家 */
  special?: 'rich' | 'hurry' | 'collector' | 'patrol' | 'dealer' | 'landlord';
  /** a patrol: the hot goods it took from the shelf, and the fine */
  seized?: number[];
  fine?: number;
  /** the hero on the wanted notice */
  wanted?: boolean;
}

/** A notice on the shop's wall: a house wants a hero of its rival house. */
export interface Wanted {
  heroId: number;
  /** the house that posted it */
  by: FactionId;
  bounty: number;
  /** the day the hero comes, and from which place in the line */
  day: number;
  slot: number;
  came: boolean;
}

/** Today's order: a small goal for the day, paid at once when it is met. */
export interface DayOrder {
  kind: 'sellParam' | 'sellCount' | 'buyCount' | 'earn';
  param?: Param;
  need: number;
  have: number;
  /** GUM paid on completion */
  reward: number;
  done: boolean;
}

export interface DaySummary {
  revenue: number;
  spend: number;
  bought: number;
  sold: number;
  walkouts: number;
  /** how many times the pot was used today */
  crafts: number;
  /** looks through the loupe today */
  looks: number;
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
  /** on a rent day, how many of the two callers after the line have come (the dealer, then the landlord) */
  callers: number;
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
  /** deals closed in a row without a customer leaving empty-handed (earns a bonus on sales) */
  combo: number;
  order: DayOrder | null;
  /** 商才 owned, and the three on offer after a rent payment (pick one) */
  perks: PerkId[];
  perkOffer: PerkId[] | null;
  /** each house's regard for the shop, in points (ranks at B.favorRanks) */
  favor: Record<FactionId, number>;
  /** what the last sale added on top: the streak bonus, and an order's reward (for the screen; 0 when none) */
  last: { bonus: number; orderReward: number };
  totals: { sold: number; bought: number; bestSale: number; deepest: number; orders: number; bestCombo: number; crafts: number };
  /** every good that has come out of the pot (item ids): the recipe book marks them */
  made: number[];
  /** the showcase: a grid of its own on the wall; goods are moved into it from the shelf or the wallet */
  showcase: StockItem[];
  /** the parameter line on the "wanted" sign ('' when none) */
  seek: Param | '';
  /** the guild's trust, and the favours had from it */
  trust: number;
  services: ServiceId[];
  /** goods on order from the guild (they come tomorrow morning), and goods that have come and wait at the door */
  supply: { id: SupplyId; param: Param; goods: Parcel[] } | null;
  /** the last sale ended with the buyer finding a replica (the screen makes a show of it, then clears it) */
  lastFake?: boolean;
  /** what is owed to the guild, and what is paid back each night */
  loan: { left: number; nightly: number } | null;
  /** a patrol comes by today, and at which place in the line */
  patrolDay: boolean;
  patrolSlot: number;
  /** the wanted notice on the wall, if one is up */
  wanted: Wanted | null;
  parcel: Parcel[];
  /** goods dropped in the bin: they can be taken back until the night, when they are carried off and paid for */
  trash: StockItem[];
  /** what the night's collection will pay for them */
  trashGum: number;
  /** the shelf is laid out wide (saves from before are repacked once) */
  /**
   * What stood in the showcase as the shop opened, and whether it was full: this is what draws the day's
   * customers (rearranging the window during the day tells from the next opening).
   */
  display: { goods: StockItem[]; full: boolean } | null;
  /** the shopkeeper has been told that (the first time the window is touched while the shop is open) */
  caseTold: boolean;
  /** how many goods of each rarity (index 1–5) the shop has bought, sold or made */
  handled: number[];
  /** the rarest class of hero that comes to the shop (1 = novices only … 5 = everyone) */
  clientele: number;
  wide: boolean;
  /** the shelf is the large one, with goods at their larger sizes (saves from before are laid out again once) */
  big: boolean;
  /** the shop has been handed its pot (saves from before the pot was a good get one, once) */
  potGiven: boolean;
  /** the special pairings found so far (their keys, see craft.ts) */
  crosses: string[];
}

export const emptySummary = (): DaySummary => ({ revenue: 0, spend: 0, bought: 0, sold: 0, walkouts: 0, crafts: 0, looks: 0 });
