/**
 * The quest screen: the dungeon crawl and its turn-based battle.
 *
 * The rules (src/game/quest.ts) resolve every step at once and say what happened as a list of events.
 * This screen keeps its own picture of the fight (src/ui/quest/view.ts) and plays those events one by one
 * (src/ui/quest/play.ts); the HTML (src/ui/quest/render.ts) is drawn from that picture.
 */
import { catalog as cat } from '../game/catalog';
import * as Q from '../game/quest';
import type { GameState } from '../game/state';
import { audio } from './audio';
import { bind, music, play, skip } from './quest/play';
import { screen } from './quest/render';
import { adopt, pending, sync, view } from './quest/view';

/** things to do right after the next render (a sound, a shake of the card that would not go in) */
const after: ((root: HTMLElement) => void)[] = [];

/** The dungeon: the stage (corridor or enemy), the player's strip, and the cards or choices. */
export function questScreen(g: GameState): string {
  if (!g.quest) return '';
  adopt(g);
  if (!view.playing) {
    if (pending(g).length > 0) view.playing = true;
    else sync(g);
  }
  return screen(g, view);
}

/** Handles the quest's buttons. Returns true when the action was one of them. */
export function questAct(g: GameState, name: string, n: number): boolean {
  if (!name.startsWith('q-') || g.phase !== 'quest' || !g.quest) return false;
  adopt(g);
  // a round is being shown: the tap only hurries it along
  if (view.playing) {
    skip();
    return true;
  }
  const b = g.quest.battle;
  switch (name) {
    case 'q-advance':
      Q.advance(g, cat);
      break;
    case 'q-back':
      Q.turnBack(g);
      break;
    case 'q-skill':
      if (!b || b.over) return true;
      view.picked = n;
      Q.fight(g, cat, n);
      break;
    case 'q-run':
      if (!b || b.over) return true;
      view.picked = -1;
      Q.fight(g, cat, -1);
      break;
    case 'q-after':
      Q.afterBattle(g, cat);
      if (g.quest?.ended === 'lost') Q.finishQuest(g, cat);
      break;
    case 'q-take':
      if (!Q.takeFound(g, cat)) {
        after.push((root) => {
          audio.sfx('error');
          root.querySelector('.q-card-stuck')?.animate([{ translate: '0 0' }, { translate: '-8px 0' }, { translate: '7px 0' }, { translate: '-5px 0' }, { translate: '0 0' }], { duration: 280 });
        });
      }
      break;
    case 'q-leave':
      Q.leaveFound(g);
      after.push(() => audio.sfx('cancel'));
      break;
    case 'q-finish':
      Q.finishQuest(g, cat);
      break;
    default:
      return false;
  }
  if (g.phase === 'quest' && g.quest && pending(g).length > 0) view.playing = true;
  return true;
}

/**
 * Called by the app after every render while the quest is on screen: starts the playback of whatever
 * has not been shown yet, and keeps the music right.
 */
export function questEffects(g: GameState, root: HTMLElement): void {
  if (!g.quest) return;
  bind(g, root);
  adopt(g);
  for (const fn of after.splice(0)) {
    try {
      fn(root);
    } catch {
      // decoration only
    }
  }
  if (view.playing) void play(g);
  else music();
}
