import type { FactionId } from '../game/factions';
import { catalog as cat } from '../game/catalog';
import * as G from '../game/logic';
import type { GameState, SlotId } from '../game/state';

export type Modal = 'none' | 'help' | 'settings' | 'inspect' | 'menu' | 'over' | 'dest' | 'leave' | 'gear' | 'pick' | 'houses' | 'recipes' | 'trash' | 'spill' | 'ship' | 'dex' | 'memo' | 'binder' | 'intro' | 'network' | 'parcel' | 'wanted' | 'calendar' | 'forecast' | 'casetold';

/** Screen state that is not part of the saved game. */
export interface Ui {
  screen: 'title' | 'game';
  modal: Modal;
  /** the good a detail or menu window is about */
  sel: { grid: G.GridId; uid: number } | null;
  confirmDispose: boolean;
  /** the landlord's slip asks once more before the rent is refused */
  rentAsk: boolean;
  confirmReset: boolean;
  haggleOpen: boolean;
  /** goods put on the counter for the customer at the counter (uids of stock) */
  counter: number[];
  /** a seller's goods pulled to the near side of the counter (indexes into the customer's offers) */
  picked: number[];
  /** markup tier chosen for the sale */
  tier: number;
  /** the customer window: where it is, its size, and whether it is open */
  /** size: s 小 / m 中 / l 大 */
  win: { x: number; y: number; size: 's' | 'm' | 'l'; open: boolean; moved: boolean };
  /** a newcomer is still saying their first line: the customer window opens when it is said */
  greeting: boolean;
  /** counts the customers that have stepped up (a new number is a new sprite, so it walks in) */
  custKey: number;
  /** at home: which grid is shown under the counter */
  /** at home: which tab is shown under the counter — the shelf, the wallet, or what is worn */
  gridView: G.GridId | 'gear' | 'craft';
  /** the windows that float over the shop on a wide screen (the pot, the wallet, the gear): open or not, where, and which is on top */
  pops: Record<PopId, { open: boolean; x: number; y: number; placed: boolean }>;
  popOrder: PopId[];
  /** the goods put in the pot (uids; the first is the base) */
  /** the goods picked out together by dragging a box round them (all on one grid) */
  marked: { grid: 'shelf' | 'wallet' | 'case' | 'trash' | 'box'; uids: number[] } | null;
  /** several goods that did not all fit where they were dropped: which would, and which would stay */
  spill: { from: 'shelf' | 'wallet' | 'case' | 'trash' | 'box'; to: 'shelf' | 'wallet' | 'case' | 'trash' | 'box'; fit: number[]; left: number[] } | null;
  craft: number[];
  /** which of the pot's candidates is picked out */
  craftPick: number;
  /** the parameter line picked for an order to the guild */
  supplyParam: 'phy' | 'int' | 'agi';
  /** the gear window: the slot being filled ('wallet' for the wallet), and whether it leads to the quest */
  gearSlot: SlotId | 'wallet' | null;
  departing: boolean;
  /** a suspense beat in the customer window: the customer is thinking the offer over */
  beat: { kind: 'haggle' | 'sell'; tier: number } | null;
  /** asking prices before a successful haggle (shown struck through), by itemId order of the offers then */
  struck: number[] | null;
  /** the day whose closing receipt is printed line by line (0: shown at once) */
  printDay: number;
  /** stats before the last change of gear, to show what it added */
  gearBefore: number[] | null;
  /** the slot that was just filled (it flashes) */
  gearFlash: string | null;
  /** the gear window's words of explanation are shown (the ? button) */
  gearHelp: boolean;
  /** the notes on the sending service are open */
  shipHelp: boolean;
  /** the note being read, and how far the opening has been told (−1: not showing) */
  memo: string | null;
  /** the note being read was taken out of the binder (closing it goes back to the binder) */
  memoBack: boolean;
  intro: number;
  parcelHelp: boolean;
  /** the swap panel: which token is given, and how much of it */
  dex: { from: 'gum' | 'mchc'; amount: number };
  /** where a bought good goes at a click, at the night shop */
  stowTo: 'wallet' | 'box';
  /** the regard window: the rung picked out, and whether its words of explanation are shown */
  rung: { house: FactionId; at: number } | null;
  housesHelp: boolean;
  /** the guild's board: the tile picked out ('service:<id>', 'supply:<id>', 'shelf', 'loan:<n>') */
  ask: string;
  /** the customer who came while the shutter was still rising (they wait for it) */
  lateKey: number;
}

export const ui: Ui = {
  screen: 'title',
  modal: 'none',
  sel: null,
  confirmDispose: false,
  rentAsk: false,
  confirmReset: false,
  haggleOpen: false,
  counter: [],
  picked: [],
  tier: 0,
  win: { x: 6, y: 0, size: 's', open: false, moved: false },
  greeting: false,
  custKey: 0,
  gridView: 'shelf',
  pops: { craft: { open: false, x: 0, y: 0, placed: false }, wallet: { open: false, x: 0, y: 0, placed: false }, gear: { open: false, x: 0, y: 0, placed: false }, trash: { open: false, x: 0, y: 0, placed: false } },
  popOrder: ['craft', 'wallet', 'gear'],
  marked: null,
  spill: null,
  craft: [],
  craftPick: 0,
  supplyParam: 'phy',
  gearSlot: null,
  departing: false,
  beat: null,
  struck: null,
  printDay: 0,
  gearBefore: null,
  gearFlash: null,
  gearHelp: false,
  shipHelp: false,
  memo: null,
  memoBack: false,
  intro: -1,
  parcelHelp: false,
  dex: { from: 'gum', amount: 0 },
  stowTo: 'wallet',
  rung: null,
  housesHelp: false,
  ask: '',
  lateKey: -1,
};

/**
 * A wide screen (a PC, a tablet on its side): the shop stands on the left and the shelf on the right
 * (src/styles/wide.css holds the same condition).
 */
export const WIDE_QUERY = '(min-width: 900px) and (min-height: 520px)';
export const isWide = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches;

/** True where there is a mouse (hover cards, the right button and the keys are worth mentioning). */
export const hasMouse = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** The width of the shop's side of the screen (the slip and its panel keep inside it): the whole screen. */
export const stageWidth = (): number => ctx.root.clientWidth;
/** How wide the game is on a wide screen (it is narrower on the title screen, so this is not read off the page). */
export const APP_MAX = 2200;
const appWidth = (): number => Math.min(document.documentElement.clientWidth, APP_MAX) - 6;
/** The width of the things beside the shelf on a wide screen (the bin, the bed), and of the shelf between them. */
export const PROP_W = 128;
/** The gear rack stands between the shelf and the bed. */
export const RACK_W = 104;
export const deckWidth = (): number => appWidth() - PROP_W * 2 - RACK_W;

/**
 * The slip starts small on a phone (the customer stays in view). With a mouse and room it starts large;
 * on a wide screen that is narrow for it, it starts at the middle size so that it does not cover the customer.
 */
export function defaultWinSize(): 's' | 'm' | 'l' {
  if (typeof window === 'undefined') return 's';
  if (isWide()) return 'l';
  return window.innerWidth >= 700 && window.matchMedia('(hover: hover) and (pointer: fine)').matches ? 'l' : 's';
}

/** What every module shares: the game, the root element, the cell size, and the way to redraw. */
export const ctx = {
  s: null as GameState | null,
  root: null as unknown as HTMLElement,
  /** size of one grid cell in px (fits the screen) */
  cell: 48,
  caseCell: 30,
  /** input is ignored while this is above zero (beats, transitions) */
  busy: 0,
  /** a window was just opened from under the finger: the click that the same touch still sends is not for it */
  swallowClick: false,
  render: (): void => {},
  act: (_name: string, _arg: string): void => {},
};

/** At home the shelf or the wallet is shown; out at night, always the wallet. */
/** The grid the cells are sized for (the gear tab keeps the shelf's room). */
/** The size of a cell of the showcase at its largest (it is set into the left wall, and shrinks to fit a narrow one). */
export const CASE_CELL = 30;
/** The left wall reaches from the screen's edge to the left end of the shelf (so the street's opening is as wide as the shelf). */
export const leftWall = (shelfWidth: number): number => (appWidth() + 6) / 2 - 52 - (shelfWidth + 6) / 2;
/** The showcase's cell for this many columns: as large as the left wall lets it be. */
export const caseCellFor = (cols: number, shelfWidth: number): number => Math.max(14, Math.min(CASE_CELL, Math.floor((leftWall(shelfWidth) - 44) / cols)));

/** The windows that float over the shop. */
export type PopId = 'craft' | 'wallet' | 'gear' | 'trash';
/** At home on a wide screen there are no tabs: the deck always shows the shelf, and the rest opens in windows. */
export const popsOn = (g: GameState): boolean => isWide() && atHome(g);

export const shownGrid = (g: GameState): G.GridId => (g.phase === 'shop' || g.phase === 'quest' ? 'wallet' : popsOn(g) || ui.gridView === 'gear' || ui.gridView === 'craft' ? 'shelf' : ui.gridView);
export const shownTab = (g: GameState): G.GridId | 'gear' | 'craft' =>
  g.phase === 'shop' || g.phase === 'quest' ? 'wallet' : popsOn(g) ? 'shelf' : ui.gridView === 'craft' && !G.hasEffect(g, cat, 'pot') ? 'shelf' : ui.gridView;
export const atHome = (g: GameState): boolean => g.phase === 'morning' || g.phase === 'open' || g.phase === 'evening';

export const TEMPER_JA = ['気さく', 'ふつう', '頑固'];
/** the voice blips are higher for easy-going customers and lower for stubborn ones */
export const TEMPER_PITCH = [1.25, 1, 0.78];
