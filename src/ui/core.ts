import type * as G from '../game/logic';
import type { GameState, SlotId } from '../game/state';

export type Modal = 'none' | 'help' | 'settings' | 'inspect' | 'menu' | 'over' | 'dest' | 'leave' | 'gear' | 'pick' | 'houses';

/** Screen state that is not part of the saved game. */
export interface Ui {
  screen: 'title' | 'game';
  modal: Modal;
  /** the good a detail or menu window is about */
  sel: { grid: G.GridId; uid: number } | null;
  confirmDispose: boolean;
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
  gridView: G.GridId | 'gear';
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
  /** the customer who came while the shutter was still rising (they wait for it) */
  lateKey: number;
}

export const ui: Ui = {
  screen: 'title',
  modal: 'none',
  sel: null,
  confirmDispose: false,
  confirmReset: false,
  haggleOpen: false,
  counter: [],
  picked: [],
  tier: 0,
  win: { x: 6, y: 0, size: 's', open: false, moved: false },
  greeting: false,
  custKey: 0,
  gridView: 'shelf',
  gearSlot: null,
  departing: false,
  beat: null,
  struck: null,
  printDay: 0,
  gearBefore: null,
  gearFlash: null,
  lateKey: -1,
};

/** The slip starts small on a phone (the customer stays in view) and large where there is a mouse and room. */
export const defaultWinSize = (): 's' | 'l' => (typeof window !== 'undefined' && window.innerWidth >= 700 && window.matchMedia('(hover: hover) and (pointer: fine)').matches ? 'l' : 's');

/** What every module shares: the game, the root element, the cell size, and the way to redraw. */
export const ctx = {
  s: null as GameState | null,
  root: null as unknown as HTMLElement,
  /** size of one grid cell in px (fits the screen) */
  cell: 48,
  /** input is ignored while this is above zero (beats, transitions) */
  busy: 0,
  render: (): void => {},
};

/** At home the shelf or the wallet is shown; out at night, always the wallet. */
/** The grid the cells are sized for (the gear tab keeps the shelf's room). */
export const shownGrid = (g: GameState): G.GridId => (g.phase === 'shop' || g.phase === 'quest' ? 'wallet' : ui.gridView === 'gear' ? 'shelf' : ui.gridView);
/** The tab on screen: a grid, or the gear. */
export const shownTab = (g: GameState): G.GridId | 'gear' => (g.phase === 'shop' || g.phase === 'quest' ? 'wallet' : ui.gridView);
export const atHome = (g: GameState): boolean => g.phase === 'morning' || g.phase === 'open' || g.phase === 'evening';

export const TEMPER_JA = ['気さく', 'ふつう', '頑固'];
/** the voice blips are higher for easy-going customers and lower for stubborn ones */
export const TEMPER_PITCH = [1.25, 1, 0.78];
