import morphdom from 'morphdom';
import * as G from '../game/logic';
import type { GameState } from '../game/state';
import { act } from './actions';
import { audio, haptic, type BgmName, type SfxName } from './audio';
import { ctx, ui } from './core';
import { dragging, mountDrag } from './drag';
import { front } from './front';
import { fx } from './fx';
import { gearEffects, gearModal, pickModal } from './gear';
import { gridSection, measure } from './grid';
import { hud, hudEffects } from './hud';
import { hookEffects, perkModal } from './hooks';
import { destModal, ending, helpModal, inspectModal, leaveModal, menuModal, overModal, settingsModal } from './modals';
import { nope } from './motion';
import { questEffects, questScreen } from './quest';
import { sceneEffects } from './scene';
import { display } from './settings';
import { shopScreen } from './shop';
import { title } from './title';
import { clampWindow, customerWindow } from './window';

function screenHtml(): string {
  const g = ctx.s;
  let html: string;
  if (ui.screen === 'title' || !g) {
    html = title();
  } else {
    measure(g);
    const v = G.currentVisitor(g);
    ui.counter = v && !v.done && v.kind === 'buy' ? ui.counter.filter((uid) => g.stock.some((x) => x.uid === uid)) : [];
    ui.picked = v && !v.done && v.kind === 'sell' ? ui.picked.filter((i) => i < v.offers.length) : [];
    if (g.phase === 'won' || g.phase === 'lost') {
      html = `${hud(g)}${ending(g)}`;
    } else {
      let top: string;
      let side = '';
      if (g.phase === 'shop') ({ top, side } = shopScreen(g));
      else if (g.phase === 'quest') top = questScreen(g);
      else top = front(g, v, ui.lateKey === ui.custKey);
      html = `${hud(g)}${top}${gridSection(g, side)}${v ? customerWindow(g, v) : ''}`;
    }
    if (ui.modal === 'inspect') html += inspectModal(g);
    if (ui.modal === 'menu') html += menuModal(g);
    if (ui.modal === 'over' && v) html += overModal(g, v);
    if (ui.modal === 'dest') html += destModal();
    if (ui.modal === 'leave') html += leaveModal();
    if (ui.modal === 'gear') html += gearModal(g);
    if (ui.modal === 'pick') html += pickModal(g);
  }
  if (ctx.s?.perkOffer && ctx.s.phase === 'morning' && ui.screen === 'game' && ui.modal === 'none') html += perkModal(ctx.s);
  if (ui.modal === 'help') html += helpModal();
  if (ui.modal === 'settings') html += settingsModal();
  return html;
}

/** The mood of the place: music, drifting particles and the colour grade follow the phase. */
let mood = '';
function setMood(g: GameState | null): void {
  const phase = ui.screen === 'title' || !g ? 'title' : g.phase;
  if (phase === mood) return;
  mood = phase;
  const root = ctx.root;
  root.dataset.phase = phase;
  // the quest screen runs its own music and particles
  if (phase === 'quest') return;
  const bgm: Record<string, BgmName | null> = { title: 'title', morning: 'night', open: 'day', evening: 'night', shop: 'shop', won: 'ending', lost: null };
  audio.bgm(bgm[phase] ?? null);
  fx.ambient(phase === 'open' || phase === 'morning' ? 'day' : phase === 'evening' || phase === 'shop' ? 'night' : 'none');
}

/** the top-level elements the redraw itself has put into the root */
const drawn = new WeakSet<Node>();

/**
 * Redraws the screen in place: the new HTML is compared with what is there, and only what differs is
 * touched. Elements that stay keep their running animations; new ones play their entry animation once.
 */
function render(): void {
  const root = ctx.root;
  const next = root.cloneNode(false) as HTMLElement;
  next.innerHTML = screenHtml();
  morphdom(root, next, {
    childrenOnly: true,
    getNodeKey: (node) => (node as HTMLElement).id || undefined,
    onNodeAdded: (node) => {
      if (node.parentNode === root) drawn.add(node);
      return node;
    },
    onBeforeElUpdated: (from, to) => {
      // driven by hand (rolling numbers, the typed bubble, sliders): the redraw leaves them alone
      if (from.hasAttribute('data-live')) return false;
      if (from.isEqualNode(to)) return false;
      return true;
    },
    // anything in the root that the redraw did not put there (the overlay for dragged and flying goods,
    // layers an effect may add) is not the redraw's to remove
    onBeforeNodeDiscarded: (node) => !(node.parentNode === root && node.nodeType === 1 && !drawn.has(node)),
  });
  const g = ctx.s;
  setMood(g);
  if (g && ui.screen === 'game') {
    if (g.phase === 'quest') questEffects(g, root);
    clampWindow();
    hudEffects(g);
    if (g.phase === 'open') hookEffects(g);
    sceneEffects(g, ui.lateKey === ui.custKey);
    if (ui.modal === 'gear') gearEffects(g);
  }
}

const CLOSE_ACTS = new Set(['modal-close', 'gear-back', 'win-close']);

/** The sound of a press, from what was pressed: no button is silent. */
function pressSound(el: HTMLElement): void {
  const named = el.dataset.sfx;
  if (named === 'none') return;
  if (named) audio.sfx(named as SfxName);
  else if (CLOSE_ACTS.has(el.dataset.act ?? '')) audio.sfx('close');
  else if (el.classList.contains('ghost')) audio.sfx('cancel');
  else if (el.classList.contains('primary') || el.classList.contains('gold')) audio.sfx('confirm');
  else audio.sfx('tap');
  haptic('light');
}

export function mount(el: HTMLElement): void {
  ctx.root = el;
  ctx.render = render;
  display.init();
  fx.mount(el);

  // sound is allowed only after a gesture
  const unlock = (): void => audio.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  // Escape closes the window on top (not the ones that ask a question: they have their own Cancel)
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || ui.modal === 'none' || ctx.busy > 0) return;
    audio.sfx('cancel');
    act(ui.modal === 'pick' ? 'gear-back' : 'modal-close', undefined, null);
  });

  el.addEventListener('click', (event) => {
    const hit = event.target as HTMLElement;
    // a tap on the dark around a window closes it (not the ones that ask a question)
    if (hit.classList.contains('modal') && ctx.busy === 0 && ui.modal !== 'over' && ui.modal !== 'leave' && ui.modal !== 'dest') {
      audio.sfx('cancel');
      act(ui.modal === 'pick' ? 'gear-back' : 'modal-close', undefined, null);
      return;
    }
    const target = hit.closest<HTMLElement>('[data-act]');
    if (!target || (target as HTMLButtonElement).disabled) return;
    if (ctx.busy > 0 || dragging()) return;
    pressSound(target);
    act(target.dataset.act!, target.dataset.arg, target);
  });
  // a press on something that cannot be done right now still answers
  el.addEventListener('pointerdown', (event) => {
    const off = (event.target as HTMLElement).closest<HTMLElement>('button:disabled');
    if (!off) return;
    nope(off);
    audio.sfx('error');
    haptic('double');
  });
  // the volume sliders
  el.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    const kind = input.dataset?.vol as 'bgm' | 'se' | undefined;
    if (!kind) return;
    const value = Number(input.value) / 100;
    audio.setVolume(kind, value);
    input.style.setProperty('--v', `${input.value}%`);
    const label = el.querySelector(`#vol-${kind}-n`);
    if (label) label.textContent = input.value;
  });
  el.addEventListener('change', (event) => {
    const kind = (event.target as HTMLInputElement).dataset?.vol;
    if (kind) audio.sfx(kind === 'se' ? 'coin' : 'tap');
  });
  mountDrag(el);
  window.addEventListener('resize', () => {
    if (!dragging()) render();
  });
  render();
}
