import { B, WEEKDAYS } from '../game/balance';
import { catalog as cat } from '../game/catalog';
import * as G from '../game/logic';
import type { GameState } from '../game/state';
import { audio } from './audio';
import { ctx } from './core';
import { fx } from './fx';
import { goalChips, houseDots } from './hooks';
import { num } from './html';
import { ICON } from './icons';
import { anim, rollNumber } from './motion';

/** What the HUD shows right now (it trails the game while a number rolls or coins are still in the air). */
const shown = { gum: -1, rep: -1, held: 0, rolling: false };

/** Snaps the HUD to the game (new game, loading): nothing rolls. */
export function resetHud(g: GameState | null): void {
  shown.gum = g ? g.gum : -1;
  shown.rep = g ? g.rep : -1;
  shown.held = 0;
  shown.rolling = false;
}

/**
 * Keeps the GUM number where it is until the returned function is called (coins are on their way).
 * It lets go by itself after `ms`, so a lost callback cannot freeze the number.
 */
export function holdGum(ms = 1400): () => void {
  shown.held += 1;
  let open = true;
  const release = (): void => {
    if (!open) return;
    open = false;
    shown.held = Math.max(0, shown.held - 1);
    if (ctx.s) hudEffects(ctx.s);
  };
  window.setTimeout(release, ms);
  return release;
}

export function hud(g: GameState): string {
  if (shown.gum < 0) resetHud(g);
  const weekday = WEEKDAYS[(g.day - 1) % 7];
  let rent: string;
  if (g.owned) {
    rent = `<div class="rent owned" id="rent"><span class="rent-k">自分の店</span><span class="rent-v">家賃なし。この店はあなたのものです</span></div>`;
  } else {
    const left = G.daysToRent(g);
    const done = B.rentEvery - left;
    const segs = Array.from({ length: B.rentEvery }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('');
    const short = g.gum < g.rent;
    rent = `<div class="rent ${left <= 1 ? 'hot' : ''} ${left === 0 ? 'due' : ''}" id="rent" aria-label="家賃 ${g.rent} GUM、${left === 0 ? '今夜' : `あと${left}日`}">
      <span class="rent-k">家賃</span><b class="rent-n ${short && left <= 1 ? 'short' : ''}">${num(g.rent)}</b>
      <span class="rent-gauge">${segs}</span>
      <span class="rent-left">${left === 0 ? '今夜' : `あと<b>${left}</b>日`}</span>
    </div>`;
  }
  const stars = Math.max(0, Math.min(100, g.rep));
  return `<header class="hud" id="hud" data-ui>
    <div class="hud-row">
      <div class="day-tag" id="day-tag"><small>DAY</small><b>${g.day}</b><i>${weekday}</i></div>
      <div class="hud-gum" id="hud-gum" aria-label="所持 GUM"><img src="${cat.icons.gum}" alt="" /><b id="gum-num" data-live>${num(shown.gum)}</b><small>GUM</small></div>
      <button class="hud-rep" id="hud-rep" data-act="houses" data-sfx="open" aria-label="評判 ${g.rep}（タップで派閥の評価を見る）">
        <span class="rep-top"><small>評判</small><b id="rep-num">${g.rep}</b></span>
        <span class="rep-stars"><span class="rep-fill" style="width:${stars}%">★★★★★</span>★★★★★</span>
        ${houseDots(g)}
      </button>
      <button class="hud-btn" data-act="settings" data-sfx="open" aria-label="設定と遊びかた">${ICON.gearCog}</button>
    </div>
    ${rent}
    ${goalChips(g)}
  </header>`;
}

/** After a redraw: roll the GUM number to its new value, and answer a change of reputation. */
export function hudEffects(g: GameState): void {
  const root = ctx.root;
  const gumEl = root.querySelector<HTMLElement>('#gum-num');
  if (gumEl && shown.held === 0 && shown.gum !== g.gum) {
    const from = shown.gum;
    const to = g.gum;
    shown.gum = to;
    const box = root.querySelector<HTMLElement>('#hud-gum');
    const delta = to - from;
    fx.text(`${delta > 0 ? '+' : '−'}${num(Math.abs(delta))}`, { x: (box?.offsetLeft ?? 100) + (box?.offsetWidth ?? 100) / 2, y: (box?.offsetTop ?? 20) + 46 }, { kind: delta > 0 ? 'gain' : 'loss', size: 22 });
    box?.classList.remove('up', 'down');
    void box?.offsetWidth;
    box?.classList.add(delta > 0 ? 'up' : 'down');
    shown.rolling = true;
    rollNumber(gumEl, from, to, 520, {
      onStep: (t) => audio.sfx('tap', { volume: 0.22, pitch: delta > 0 ? 1.5 + t * 0.9 : 1.3 - t * 0.5 }),
      done: () => {
        shown.rolling = false;
        box?.classList.remove('up', 'down');
      },
    });
  } else if (gumEl && !shown.rolling && shown.held === 0 && gumEl.textContent !== num(shown.gum)) {
    // the number is never redrawn by the screen update (it is rolled by hand), so set it straight here
    gumEl.textContent = num(shown.gum);
  }
  if (shown.rep !== g.rep) {
    const delta = g.rep - shown.rep;
    const first = shown.rep < 0;
    shown.rep = g.rep;
    if (!first) {
      const rep = root.querySelector<HTMLElement>('#hud-rep');
      fx.text(`評判 ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`, { x: (rep?.offsetLeft ?? 300) + 20, y: (rep?.offsetTop ?? 20) + 44 }, { kind: delta > 0 ? 'heal' : 'dmg', size: 15 });
      rep?.classList.remove('up', 'down');
      void rep?.offsetWidth;
      rep?.classList.add(delta > 0 ? 'up' : 'down');
      anim(rep, [{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(-4deg)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(.2,1.4,.3,1)' });
      window.setTimeout(() => rep?.classList.remove('up', 'down'), 900);
    }
  }
}
