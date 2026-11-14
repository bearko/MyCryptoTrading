import { SPECIAL_JA } from './hooks';
import { B } from '../game/balance';
import { catalog as cat } from '../game/catalog';
import { factionById } from '../game/factions';
import * as G from '../game/logic';
import type { GameState, Visitor } from '../game/state';
import { audio } from './audio';
import { ctx, TEMPER_JA, TEMPER_PITCH, ui } from './core';
import { fx } from './fx';
import { esc } from './html';
import { anim, pointOn, tok } from './motion';
import { display } from './settings';

/** how long a customer takes to walk in or out (matches the CSS) */
export const WALK_MS = 900;
/** the shutter rises first: a customer who comes while it does waits this long */
export const OPEN_MS = 950;

const pipsHtml = (v: Visitor): string => {
  const max = B.temperPatience[v.temper];
  return Array.from({ length: max }, (_, i) => `<i class="${i < v.patience ? 'on' : ''}"></i>`).join('');
};

/** The view over the counter: the customer walks in from the left and leaves to the right. */
export function scene(v: Visitor | null, opening: boolean, far: { html: string; rows: number } = { html: '', rows: 0 }, sky: { dusk: number; rain: boolean } = { dusk: 0, rain: false }): string {
  let inner = '';
  if (v) {
    const hero = cat.heroById.get(v.heroId)!;
    const state = v.done ? 'exit' : 'enter';
    const long = hero.ja.length > 7 ? (hero.ja.length > 10 ? 'xlong' : 'long') : '';
    inner = `<div class="walker ${state} ${opening ? 'late' : ''}" id="cust-${ui.custKey}" data-act="hero" data-sfx="none" role="button" aria-label="${esc(hero.ja)}（タップで伝票を開く）">
        <div class="walker-bob"><img class="hero" src="${hero.img}" alt="${esc(hero.ja)}" draggable="false" /></div>
      </div>
      <div class="plate kind-${v.kind} ${v.special ? 'special' : ''} ${v.done ? 'out' : ''} ${opening ? 'late' : ''}" id="plate-${ui.custKey}">
        <span class="plate-kind">${v.kind === 'sell' ? '売りたい!' : '買いたい!'}</span>${v.special ? `<span class="plate-special">${SPECIAL_JA[v.special]}</span>` : ''}
        <b class="plate-name ${long}">${esc(hero.ja)}</b>
        <span class="plate-sub">${v.faction ? `<em class="fac f-${v.faction}">${factionById(v.faction).ja}</em>` : ''}<em class="temper t${v.temper}">${TEMPER_JA[v.temper]}</em><span class="pips" id="pips" aria-label="我慢 ${v.patience}">${pipsHtml(v)}</span></span>
      </div>
      ${far.html}
      ${ui.greeting && !v.done ? '<button class="greet-skip" id="greet-skip" data-act="bubble" data-sfx="none" aria-label="せりふを飛ばして、伝票を開く"><span>タップでスキップ</span></button>' : ''}`;
  }
  return `<section class="scene ${v ? '' : 'empty'}" id="scene" style="--far-rows:${far.rows}">
    <div class="scene-bg" style="background-image:url('${cat.backdrop}')"></div>
    <div class="scene-tint"></div>
    <div class="scene-dusk" style="opacity:${sky.dusk.toFixed(2)}"></div>
    ${sky.rain ? '<div class="scene-rain"></div>' : ''}
    ${inner}
  </section>`;
}

// ---------------------------------------------------------------- the speech bubble (typed out)

/**
 * The customer's line: on the left, clear of the face. It is said once and goes away — a newcomer's first line
 * comes before the slip, and the slip opens when the line is done (a tap on the bubble skips ahead).
 * It sits in the root, not in the scene, so that a later line can show over the slip for a moment.
 */
export const bubbleHtml = (): string => '<div class="bubble" id="bubble" data-live data-act="bubble" data-sfx="none" role="button" aria-label="せりふ（タップで閉じる）"></div>';

const typing = { key: '', timer: 0, hide: 0, open: 0 };

/** how long a line takes to type out (matches `type`) */
const typeMs = (text: string): number => (display.still ? 0 : 120 + [...text].length * 34 + (text.match(/[、。！？]/g)?.length ?? 0) * 116);

/** Puts the line away now (the slip was opened by hand, or the bubble was tapped). A line cut short is not said again. */
export function hushBubble(): void {
  window.clearTimeout(typing.hide);
  window.clearTimeout(typing.timer);
  const el = ctx.root.querySelector<HTMLElement>('#bubble');
  if (!el) return;
  // skipped before the first letter: it still counts as said (a tap on the customer says it again)
  if (!el.firstChild) el.innerHTML = '<p class="bubble-text"></p>';
  el.classList.add('fade');
}

function type(el: HTMLElement, text: string, pitch: number, delay: number): void {
  window.clearTimeout(typing.timer);
  window.clearTimeout(typing.hide);
  // the bubble takes the size of the whole line first, then the letters come
  const probe = document.createElement('div');
  probe.className = 'bubble probe';
  probe.innerHTML = `<p class="bubble-text">${esc(text)}</p>`;
  el.parentElement!.appendChild(probe);
  // offset sizes: the bubble's own transform (it pops in) must not shrink the measure
  const w = probe.offsetWidth + 1;
  const h = probe.offsetHeight;
  probe.remove();
  const start = (): void => {
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.classList.add('show');
    el.classList.remove('fade');
    el.innerHTML = '<p class="bubble-text"><span class="typed"></span><span class="rest"></span></p>';
    const typed = el.querySelector<HTMLElement>('.typed')!;
    const rest = el.querySelector<HTMLElement>('.rest')!;
    const chars = [...text];
    if (display.still) {
      typed.textContent = text;
      return;
    }
    rest.textContent = text;
    let i = 0;
    const step = (): void => {
      i += 1;
      typed.textContent = chars.slice(0, i).join('');
      rest.textContent = chars.slice(i).join('');
      const ch = chars[i - 1];
      if (i % 2 === 1 && ch && !/[\s、。！？…]/.test(ch)) audio.sfx('voice', { pitch: pitch * (0.94 + Math.random() * 0.12), volume: 0.7 });
      if (i < chars.length) typing.timer = window.setTimeout(step, /[、。！？]/.test(ch ?? '') ? 150 : 34);
    };
    typing.timer = window.setTimeout(step, 120);
  };
  if (delay > 0) {
    el.classList.remove('show');
    typing.timer = window.setTimeout(start, delay);
  } else start();
}

/** Shakes the bubble (a refusal). */
export function bubbleShake(): void {
  anim(ctx.root.querySelector('#bubble'), [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px) rotate(-2deg)' }, { transform: 'translateX(7px) rotate(2deg)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 320 });
}

// ---------------------------------------------------------------- the customer's moves

const heroEl = (): HTMLElement | null => ctx.root.querySelector<HTMLElement>('.walker .hero');

/** A happy hop (a deal). */
export function custHop(): void {
  anim(heroEl(), [{ transform: 'translateY(0) scale(1,1)' }, { transform: 'translateY(2%) scale(1.06,.92)', offset: 0.15 }, { transform: 'translateY(-9%) scale(.96,1.06)', offset: 0.45 }, { transform: 'translateY(0) scale(1.04,.95)', offset: 0.8 }, { transform: 'translateY(0) scale(1,1)' }], { duration: 460, easing: 'ease-out' });
}

/** An annoyed shake of the head (a refusal). */
export function custShake(): void {
  anim(heroEl(), [{ transform: 'translateX(0)' }, { transform: 'translateX(-3%) rotate(-3deg)' }, { transform: 'translateX(3%) rotate(3deg)' }, { transform: 'translateX(-2%) rotate(-2deg)' }, { transform: 'translateX(2%)' }, { transform: 'translateX(0)' }], { duration: 380 });
}

/** Leaning in, thinking an offer over (the suspense beat). */
export function custThink(ms: number): void {
  anim(heroEl(), [{ transform: 'rotate(0) translateY(0)' }, { transform: 'rotate(-4deg) translateY(1%)', offset: 0.3 }, { transform: 'rotate(3deg) translateY(1%)', offset: 0.7 }, { transform: 'rotate(0) translateY(0)' }], { duration: ms, easing: 'ease-in-out' });
}

/** A lost point of patience: the pip at `index` breaks. */
export function pipBreak(index: number): void {
  const pip = ctx.root.querySelectorAll<HTMLElement>('#pips i')[index];
  if (!pip) return;
  fx.burst('shards', pip, { count: 10, color: tok('--hot'), scale: 0.7 });
  anim(pip, [{ transform: 'scale(1.9)', background: 'var(--hot)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
}

let seenCust = -1;

/** After a redraw: type the customer's line, and answer a new customer with steps and dust. */
export function sceneEffects(g: GameState, opening: boolean): void {
  const v = G.currentVisitor(g);
  const bubble = ctx.root.querySelector<HTMLElement>('#bubble');
  if (!v || !bubble) {
    window.clearTimeout(typing.timer);
    window.clearTimeout(typing.hide);
    window.clearTimeout(typing.open);
    typing.open = 0;
    typing.key = '';
    return;
  }
  // the bubble hangs from the top-left corner of the scene
  const sceneEl = ctx.root.querySelector<HTMLElement>('#scene');
  if (sceneEl) bubble.style.top = `${Math.round(sceneEl.getBoundingClientRect().top - ctx.root.getBoundingClientRect().top) + 10}px`;
  const fresh = seenCust !== ui.custKey;
  let arrive = 0;
  if (fresh) {
    seenCust = ui.custKey;
    if (!v.done) {
      arrive = (opening ? OPEN_MS : 0) + WALK_MS;
      if (!display.still) {
        for (let i = 0; i < 4; i++) audio.sfx('step', { delay: (arrive - WALK_MS + 110 + i * 215) / 1000, pitch: 0.9 + (i % 2) * 0.15, volume: 0.6 });
        const key = ui.custKey;
        window.setTimeout(() => {
          if (key !== ui.custKey) return;
          const walker = ctx.root.querySelector('.walker');
          const scene = ctx.root.querySelector('#scene');
          if (walker && scene) fx.burst('dust', { x: pointOn(walker, 0.5, 0).x, y: pointOn(scene, 0, 1).y - 4 }, { count: 10 });
        }, arrive - 80);
      }
    }
  }
  const text = ui.beat ? '………' : v.line;
  const key = `${ui.custKey}|${text}`;
  // the first line was skipped (a tap, or the slip was opened by hand): it is put away at once and not typed again
  if (ui.greeting && ui.win.open && !v.done && key === typing.key) {
    ui.greeting = false;
    window.clearTimeout(typing.open);
    typing.open = 0;
    hushBubble();
    ctx.root.querySelector('#greet-skip')?.remove();
    return;
  }
  const retyped = key !== typing.key || !bubble.firstChild;
  const startIn = display.still ? 0 : Math.max(0, arrive - 120);
  if (retyped) {
    typing.key = key;
    type(bubble, text, TEMPER_PITCH[v.temper] ?? 1, startIn);
  }
  const said = startIn + typeMs(text);
  const chars = [...text].length;
  // the slip was opened by hand before the greeting was over (or the customer is already leaving)
  if (ui.greeting && (ui.win.open || v.done)) {
    ui.greeting = false;
    window.clearTimeout(typing.open);
    typing.open = 0;
    ctx.root.querySelector('#greet-skip')?.remove();
  }
  if (v.done) {
    // once the customer has walked off, the bubble goes with them
    if (!bubble.classList.contains('fade')) {
      window.clearTimeout(typing.hide);
      typing.hide = window.setTimeout(() => bubble.classList.add('fade'), 1500);
    }
  } else if (ui.greeting) {
    // a newcomer: the line first, then the slip
    if (retyped || !typing.open) {
      window.clearTimeout(typing.open);
      const cust = ui.custKey;
      typing.open = window.setTimeout(() => {
        typing.open = 0;
        const now = ctx.s?.phase === 'open' ? G.currentVisitor(ctx.s) : null;
        if (cust !== ui.custKey || !ui.greeting || !now || now.done) return;
        ui.greeting = false;
        ui.win.open = true;
        hushBubble();
        audio.sfx('open');
        ctx.render();
      }, (retyped ? said : 0) + 450 + chars * 35);
    }
  } else if (retyped && !ui.beat) {
    // a line said mid-deal shows over the slip for as long as it takes to read, then steps aside
    // (a tap on the customer says it again)
    window.clearTimeout(typing.hide);
    typing.hide = window.setTimeout(() => bubble.classList.add('fade'), said + 1100 + chars * 55);
  }
}

/** Says the current line again (a tap on the customer). */
export function sayAgain(): void {
  typing.key = '';
  if (ctx.s) sceneEffects(ctx.s, false);
}

/** Forget what was on screen (a new game, or coming back from the title). */
export function resetScene(): void {
  seenCust = -1;
  typing.key = '';
  window.clearTimeout(typing.timer);
  window.clearTimeout(typing.hide);
  window.clearTimeout(typing.open);
  typing.open = 0;
}
