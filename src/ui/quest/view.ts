/**
 * What the quest screen is showing right now. The rules resolve a step at once (src/game/quest.ts);
 * the screen then plays the step's events one by one, and this state follows that playback — so the
 * HP bars, stats and statuses on screen lag behind the game state until the round has been shown.
 */
import type { BattleEvent, QuestEvent, Side } from '../../game/quest';
import type { Fighter, GameState, Quest } from '../../game/state';

export type AnyEvent = BattleEvent | QuestEvent;

export interface StageBattle {
  enemyId: number;
  boss: boolean;
  turn: number;
  runs: number;
  /** intro: the enemy is arriving · fight: waiting for / playing a round · the rest: how it ended */
  state: 'intro' | 'fight' | 'won' | 'lost' | 'fled';
  /** GUM won from this enemy (shown with the WIN band) */
  reward: number;
}

export interface CutIn {
  key: number;
  who: Side;
  kind: 'skill' | 'blocked' | 'run' | 'fail';
  text: string;
  itemId: number;
}

export interface View {
  /** the run this view belongs to (a loaded save is a new object) */
  q: Quest | null;
  /** id of the last event that has been shown */
  seen: number;
  playing: boolean;
  /** the player tapped during playback: finish the rest at once */
  skip: boolean;
  depth: number;
  me: Fighter;
  foe: Fighter | null;
  battle: StageBattle | null;
  /** whose action is being shown */
  actor: Side | null;
  cutin: CutIn | null;
  /** the encounter warning (stripes and "!") */
  warn: { key: number; boss: boolean } | null;
  /** a hit mark on a fighter */
  impact: { key: number; side: Side; big: boolean; tone: 'hit' | 'heal' | 'tick' } | null;
  /** what the last step outside a battle brought (the card in the corridor) */
  card: QuestEvent | null;
  ended: null | 'home' | 'lost' | 'cleared';
  /** what a defeat cost */
  lost: { itemId: number; cond: number }[];
  gumFound: number;
  /** index of the skill card just played (-1: ran) */
  picked: number | null;
  /** lines of the accessible log */
  tape: string[];
}

const copy = (f: Fighter): Fighter => ({ ...f, base: { ...f.base }, status: { ...f.status } });
const blank: Fighter = { hp: 1, maxHp: 1, phy: 1, int: 1, agi: 1, base: { phy: 1, int: 1, agi: 1 }, status: {} };

export const view: View = {
  q: null,
  seen: 0,
  playing: false,
  skip: false,
  depth: 0,
  me: copy(blank),
  foe: null,
  battle: null,
  actor: null,
  cutin: null,
  warn: null,
  impact: null,
  card: null,
  ended: null,
  lost: [],
  gumFound: 0,
  picked: null,
  tape: [],
};

let keys = 0;
/** A fresh number for a one-shot element, so the page treats it as new and plays its entry animation. */
export const nextKey = (): number => (keys += 1);

/** Events of the run that have not been shown yet, oldest first. */
export function pending(g: GameState): AnyEvent[] {
  const q = g.quest;
  if (!q) return [];
  const all: AnyEvent[] = [...(q.events ?? []), ...(q.battle?.events ?? [])];
  return all.filter((e) => e.id > view.seen).sort((a, b) => a.id - b.id);
}

/** Makes the view say exactly what the game state says (the end of every playback, and a loaded save). */
export function sync(g: GameState): void {
  const q = g.quest;
  if (!q) return;
  const b = q.battle;
  view.depth = q.depth;
  view.me = copy(q.me);
  view.foe = b ? copy(b.foe) : null;
  const reward = b?.events?.find((e) => e.t === 'reward');
  view.battle = b ? { enemyId: b.enemyId, boss: b.boss, turn: b.turn, runs: b.runs, state: b.over ?? 'fight', reward: reward?.t === 'reward' ? reward.gum : 0 } : null;
  view.actor = null;
  view.cutin = null;
  view.warn = null;
  view.impact = null;
  view.picked = null;
  view.ended = q.ended;
  const lost = b?.events?.find((e) => e.t === 'lost');
  view.lost = lost?.t === 'lost' ? lost.items : [];
  view.gumFound = q.gumFound;
  const cards = (q.events ?? []).filter((e) => e.t !== 'floor' && e.t !== 'encounter' && e.t !== 'home' && e.t !== 'cleared');
  view.card = b ? null : (cards[cards.length - 1] ?? null);
  // a good that would not fit and has since been taken or left is no longer news
  if (view.card?.t === 'found' && !view.card.stowed && !q.found) view.card = null;
  view.tape = [...(b ? b.log : q.log)];
  view.seen = Math.max(view.seen, q.eid ?? 0);
}

/**
 * Called before drawing and before acting: a different run (a new outing, a loaded save) starts from
 * the game state as it is, with nothing left to play — except the first step of a brand-new outing.
 */
export function adopt(g: GameState): void {
  const q = g.quest;
  if (!q || view.q === q) return;
  view.q = q;
  view.playing = false;
  view.skip = false;
  view.seen = 0;
  const fresh = q.depth === 0 && !q.ended && !q.battle && q.events?.length === 1 && q.events[0].t === 'enter';
  sync(g);
  if (fresh) {
    view.seen = q.events[0].id - 1;
    view.card = null;
  }
}

export function fighterOf(side: Side): Fighter {
  return side === 'me' ? view.me : (view.foe ?? view.me);
}
