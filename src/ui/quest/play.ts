/**
 * Plays what the rules resolved, one event at a time, with rhythm: cut-in → lunge → hit-stop → number → HP.
 * While it plays, input is locked (view.playing) and the picture follows `view`, not the game state;
 * at the end the two are reconciled. A tap during playback skips to the end.
 */
import morphdom from 'morphdom';
import { catalog as cat } from '../../game/catalog';
import * as Q from '../../game/quest';
import type { GameState } from '../../game/state';
import { audio, haptic, type SfxName, type SfxOptions } from '../audio';
import { fx, type BurstKind, type BurstOptions, type Target, type TextOptions } from '../fx';
import { num, screen, STAT_JA } from './render';
import { fighterOf, nextKey, pending, sync, view, type AnyEvent } from './view';

let game: GameState | null = null;
let root: HTMLElement | null = null;
let running = false;
/** resolves the wait in progress (a tap skips ahead) */
let wake: (() => void) | null = null;
/** goods already in the wallet's data that have not "arrived" on screen yet */
const hidden = new Map<number, Animation>();
const hooked = new WeakSet<HTMLElement>();

// ---------------------------------------------------------------- plumbing

export function bind(g: GameState, el: HTMLElement): void {
  game = g;
  root = el;
  if (hooked.has(el)) return;
  hooked.add(el);
  // a tap anywhere on the quest while a round plays: show the rest at once
  el.addEventListener(
    'pointerdown',
    (ev) => {
      if (running && view.playing && ev.target instanceof Element && ev.target.closest('#quest')) skip();
    },
    true,
  );
  // anyone may ask the quest to redraw itself
  el.addEventListener('q-refresh', () => refresh());
}

export function skip(): void {
  if (!running) return;
  view.skip = true;
  wake?.();
}

const $ = <T extends Element = HTMLElement>(sel: string): T | null => root?.querySelector<T>(sel) ?? null;

/** Redraws only the quest's own section, in place. */
export function refresh(): void {
  if (!game || !root || game.phase !== 'quest' || !game.quest) return;
  const el = $('#quest');
  if (!el) return;
  try {
    morphdom(el, screen(game, view));
  } catch {
    // a half-built page (the app is mid-render): the next render catches up
  }
}

const calm = (): boolean => {
  try {
    return fx.calm || document.documentElement.classList.contains('calm') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
/** No travelling motion, no waiting: playback was skipped or the player asked for calm. */
const still = (): boolean => view.skip || calm();

function wait(ms: number): Promise<void> {
  if (view.skip) return Promise.resolve();
  const time = calm() ? Math.min(60, ms * 0.12) : ms;
  return new Promise((done) => {
    const timer = window.setTimeout(finish, time);
    function finish(): void {
      window.clearTimeout(timer);
      if (wake === finish) wake = null;
      done();
    }
    wake = finish;
  });
}

function anim(el: Element | null, frames: Keyframe[], opts: number | KeyframeAnimationOptions): Animation | null {
  if (!el || still()) return null;
  try {
    return el.animate(frames, opts);
  } catch {
    return null;
  }
}

const sfx = (name: SfxName, opts?: SfxOptions): void => {
  try {
    audio.sfx(name, opts);
  } catch {
    // sound never stops the game
  }
};
const buzz = (strength: 'light' | 'medium' | 'heavy' | 'double'): void => {
  try {
    haptic(strength);
  } catch {
    // no vibration here
  }
};
/** Effects are decoration: skipped when fast-forwarding, and never allowed to break playback. */
const show = (fn: () => void, always = false): void => {
  if (view.skip && !always) return;
  try {
    fn();
  } catch {
    // an effect that fails is an effect that does not show
  }
};

const tokens = new Map<string, string>();
/** The value of a design token, for effects that draw on a canvas. */
function token(name: string): string {
  let value = tokens.get(name);
  if (!value) {
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'currentColor';
    tokens.set(name, value);
  }
  return value;
}

/** A point inside an element, in px from the game root's corner. */
function at(el: Element | null, fx_ = 0.5, fy = 0.5): Target {
  const o = root!.getBoundingClientRect();
  if (!el) return { x: o.width / 2, y: o.height * 0.3 };
  const r = el.getBoundingClientRect();
  return { x: r.left - o.left + r.width * fx_, y: r.top - o.top + r.height * fy };
}

/** The HUD's GUM counter (its markup belongs to the app and may change): fall back to the top centre. */
function gumSpot(): Target {
  const el = root?.querySelector('#hud-gum, .hud-gum, [data-hud="gum"], .hud .gum, header .gum');
  return el ? at(el) : { x: (root?.clientWidth ?? 390) / 2, y: 24 };
}
const walletSpot = (uid: number | null): Element | null =>
  (uid !== null ? root?.querySelector(`[data-item="${uid}"]`) : null) ?? root?.querySelector('.inv .grid, [data-grid="wallet"], .inv') ?? null;

const bodyOf = (side: Q.Side): HTMLElement | null => (side === 'foe' ? $('#q-foe-body') : $('#q-me-face'));
/** Where a fighter's numbers and words pop: over the enemy's head, or beside the player's portrait. */
const over = (side: Q.Side): Target => (side === 'foe' ? at(bodyOf('foe'), 0.5, 0.2) : at($('#q-me-face'), 1.9, -0.1));
const skinOf = (side: Q.Side): HTMLElement | null => (side === 'foe' ? $('#q-foe-img') : $('#q-me-face img'));
const nameOf = (side: Q.Side): string => (side === 'me' ? 'あなた' : (enemyName() ?? '敵'));
const enemyName = (): string | null => {
  const b = view.battle;
  return b ? ((b.boss ? cat.bosses : cat.enemies).find((e) => e.id === b.enemyId)?.ja ?? null) : null;
};
const say = (line: string): void => {
  view.tape.push(line);
  if (view.tape.length > 12) view.tape.splice(0, view.tape.length - 12);
};

const burst = (kind: BurstKind, where: Target, opts?: BurstOptions): void => show(() => fx.burst(kind, where, opts));
const text = (what: string, where: Target, opts?: TextOptions): void => show(() => fx.text(what, where, opts));

/** The music for what is on stage. */
export function music(): void {
  try {
    if (view.ended === 'lost') audio.bgm(null);
    else if (view.battle && view.battle.state !== 'fled' && view.battle.state !== 'won') audio.bgm(view.battle.boss ? 'boss' : 'battle');
    else audio.bgm('dungeon');
  } catch {
    // silent
  }
}

// ---------------------------------------------------------------- motion on the fighters

const WHITE = 'contrast(0) brightness(3)';

/** Holds a sprite pure white for the hit-stop, then lets it fade back. */
function whiteOut(side: Q.Side, hold: number): void {
  // fx.hitStop pauses this on its first frame; where nothing pauses it, it holds the white itself
  const frozen = !fx.calm;
  const total = (frozen ? 30 : hold) + 150;
  anim(skinOf(side), [{ filter: WHITE }, { filter: WHITE, offset: (total - 150) / total }, { filter: 'contrast(1) brightness(1)' }], { duration: total, easing: 'linear' });
}

function lunge(side: Q.Side): void {
  if (side === 'foe') {
    anim(
      bodyOf('foe'),
      [
        { transform: 'translate(0,0) scale(1)' },
        { transform: 'translate(6%, -5%) scale(0.94)', offset: 0.28 },
        { transform: 'translate(-22%, 16%) scale(1.34)', offset: 0.62, easing: 'ease-out' },
        { transform: 'translate(0,0) scale(1)' },
      ],
      { duration: 330, easing: 'cubic-bezier(.5,0,.8,.4)' },
    );
  } else {
    anim(
      bodyOf('me'),
      [
        { transform: 'translate(0,0) scale(1)' },
        { transform: 'translate(-5px, 4px) scale(1)', offset: 0.25 },
        { transform: 'translate(22px, -22px) scale(1.12)', offset: 0.6, easing: 'ease-out' },
        { transform: 'translate(0,0) scale(1)' },
      ],
      { duration: 300, easing: 'cubic-bezier(.5,0,.8,.4)', composite: 'add' },
    );
  }
}

/** A small hop for skills that do not strike (a heal, a buff). */
function hop(side: Q.Side): void {
  anim(bodyOf(side), [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-9%) scale(1.05)', offset: 0.4 }, { transform: 'translateY(0) scale(1)' }], { duration: 240, easing: 'ease-out', composite: 'add' });
}

function recoil(side: Q.Side, big: boolean): void {
  const k = big ? 1.7 : 1;
  if (side === 'foe') {
    anim(
      bodyOf('foe'),
      [
        { transform: `translate(${9 * k}%, ${-4 * k}%) rotate(${7 * k}deg) scale(${1 - 0.05 * k})` },
        { transform: `translate(${-4 * k}%, 0) rotate(${-3 * k}deg)`, offset: 0.45 },
        { transform: `translate(${2 * k}%, 0) rotate(${1 * k}deg)`, offset: 0.7 },
        { transform: 'translate(0,0) rotate(0)' },
      ],
      { duration: big ? 380 : 280, easing: 'ease-out' },
    );
  } else {
    anim(
      $('#q-me'),
      [{ transform: `translate(${-7 * k}px, ${5 * k}px)` }, { transform: `translate(${5 * k}px, ${-2 * k}px)`, offset: 0.35 }, { transform: `translate(${-3 * k}px, 0)`, offset: 0.65 }, { transform: 'translate(0,0)' }],
      { duration: big ? 360 : 260, easing: 'ease-out' },
    );
  }
}

function wobble(side: Q.Side): void {
  void side;
  anim(bodyOf(side), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(0deg)' }], { duration: 420, easing: 'ease-in-out', composite: 'add' });
}

/** Pops an element (a stat chip that changed, a node of the track). */
const pop = (el: Element | null, scale = 1.5): void => void anim(el, [{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,1.4,.3,1)', composite: 'add' });

// ---------------------------------------------------------------- the corridor

async function descend(depth: number): Promise<void> {
  sfx('stairs');
  anim(
    $('#q-wipe'),
    [
      { transform: 'translateY(-120%) skewY(-5deg)' },
      { transform: 'translateY(0) skewY(-5deg)', offset: 0.42, easing: 'ease-in' },
      { transform: 'translateY(0) skewY(-5deg)', offset: 0.56 },
      { transform: 'translateY(120%) skewY(-5deg)' },
    ],
    { duration: 430, easing: 'cubic-bezier(.3,0,.2,1)' },
  );
  anim($('#q-bg'), [{ transform: 'scale(1)' }, { transform: 'scale(1.5)' }], { duration: 200, easing: 'ease-in', composite: 'add' });
  await wait(200);
  view.depth = depth;
  view.card = null;
  view.tape = [`地下 ${depth} 階へ進んだ。`];
  refresh();
  anim($('#q-floor-n'), [{ transform: 'skewX(-9deg) translateY(-70%) scale(1.5)', opacity: 0 }, { transform: 'skewX(-9deg) translateY(4%) scale(0.94)', opacity: 1, offset: 0.7 }, { transform: 'skewX(-9deg) translateY(0) scale(1)' }], {
    duration: 320,
    delay: 40,
    easing: 'cubic-bezier(.2,.9,.3,1)',
    fill: 'backwards',
  });
  anim($('#q-fg'), [{ transform: 'skewY(-4deg) translateY(70%)' }, { transform: 'skewY(-4deg) translateY(22%)' }], { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1)' });
  await wait(280);
}

async function flyToWallet(uid: number | null): Promise<void> {
  const from = $('.q-find-img') as HTMLImageElement | null;
  const to = walletSpot(uid);
  const veil = uid !== null ? hidden.get(uid) : undefined;
  const arrive = (): void => {
    veil?.cancel();
    if (uid !== null) hidden.delete(uid);
    if (to && uid !== null && to.matches('[data-item]')) anim(to, [{ transform: 'scale(1.5)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.4,.3,1)' });
    sfx('drop');
    if (to) burst('dust', at(to), { scale: 0.8 });
  };
  if (!from || !to || still()) {
    arrive();
    return;
  }
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const ghost = document.createElement('img');
  ghost.src = from.src;
  ghost.alt = '';
  ghost.className = 'q-flyer';
  ghost.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
  document.body.appendChild(ghost);
  const scale = Math.max(0.5, Math.min(1, Math.min(b.width, b.height) / a.width));
  try {
    ghost.animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0)' },
        { transform: `translate(${dx * 0.25}px, ${Math.min(-50, dy * 0.2 - 70)}px) scale(1.35) rotate(-14deg)`, offset: 0.4, easing: 'ease-in' },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0)` },
      ],
      { duration: 460, easing: 'ease-out', fill: 'forwards' },
    );
  } catch {
    // no animation support: it just arrives
  }
  anim(from, [{ opacity: 0.2 }, { opacity: 0.2, offset: 0.8 }, { opacity: 1 }], { duration: 560 });
  await wait(460);
  ghost.remove();
  arrive();
}

async function encounter(g: GameState, e: Extract<Q.QuestEvent, { t: 'encounter' }>): Promise<void> {
  const b = g.quest?.battle;
  const enemy = (e.boss ? cat.bosses : cat.enemies).find((x) => x.id === e.enemyId);
  if (!b || !enemy) return;
  sfx('encounter');
  buzz('heavy');
  view.warn = { key: nextKey(), boss: e.boss };
  view.card = null;
  say(`${enemy.ja}が現れた！`);
  refresh();
  show(() => fx.flash(token('--hot'), 120));
  show(() => fx.shake(5, 180));
  if (e.boss) {
    try {
      audio.bgm('boss');
    } catch {
      // silent
    }
    await wait(520);
    if (!still()) {
      let banner: Promise<void> = Promise.resolve();
      show(() => (banner = fx.banner('BOSS', { sub: `最深部の主　${enemy.ja}`, color: token('--hot'), ms: 900 })));
      await Promise.race([banner.catch(() => undefined), wait(1100)]);
    }
  } else {
    await wait(520);
  }
  view.warn = null;
  view.foe = { ...b.foe, base: { ...b.foe.base }, status: { ...b.foe.status } };
  view.battle = { enemyId: e.enemyId, boss: e.boss, turn: 1, runs: 0, state: 'intro', reward: 0 };
  refresh();
  music();
  await wait(e.boss ? 300 : 190);
  // the enemy lands
  show(() => fx.shake(e.boss ? 12 : 6, e.boss ? 320 : 200));
  burst('dust', at($('#q-foe'), 0.5, 0.95), { scale: e.boss ? 1.8 : 1.1 });
  if (e.boss) sfx('hitBig', { pitch: 0.7 });
  buzz(e.boss ? 'heavy' : 'medium');
  await wait(e.boss ? 520 : 300);
  view.battle.state = 'fight';
  refresh();
  await wait(120);
}

async function exploring(g: GameState, e: Q.QuestEvent): Promise<void> {
  switch (e.t) {
    case 'enter': {
      music();
      sfx('stairs');
      view.card = e;
      refresh();
      show(() => fx.ambient('dungeon'), true);
      show(() => fx.banner('DUNGEON', { sub: '地下 10 階の主をめざせ', color: token('--violet'), ms: 700 }));
      anim($('#q-floor-n'), [{ transform: 'skewX(-9deg) scale(2.2)', opacity: 0 }, { transform: 'skewX(-9deg) scale(1)', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.2,1.4,.3,1)' });
      await wait(360);
      break;
    }
    case 'floor':
      await descend(e.depth);
      pop($(`#q-node-${e.depth}`), 1.9);
      break;
    case 'encounter':
      await encounter(g, e);
      break;
    case 'quiet':
      view.card = e;
      say('静かな通路が続いている。');
      refresh();
      await wait(180);
      break;
    case 'found': {
      const item = cat.itemById.get(e.itemId);
      view.card = e;
      say(e.stowed ? `「${item?.ja ?? '品'}」をウォレットに入れた。` : `「${item?.ja ?? '品'}」を見つけたが、ウォレットに入らない。`);
      refresh();
      sfx('found');
      buzz('light');
      burst('stars', at($('.q-find')), { scale: 1.2, color: token('--gum') });
      if (e.stowed) {
        await wait(640);
        await flyToWallet(e.uid);
        await wait(120);
      } else {
        await wait(380);
        sfx('dropBad');
        buzz('double');
        anim($(`#q-card-${e.id}`), [{ translate: '0 0' }, { translate: '-7px 0' }, { translate: '6px 0' }, { translate: '-4px 0' }, { translate: '0 0' }], { duration: 260 });
        await wait(200);
      }
      break;
    }
    case 'gum': {
      view.card = e;
      view.gumFound += e.amount;
      say(`ラッキー！ ${e.amount} GUM を拾った。`);
      refresh();
      const from = at($(`#q-card-${e.id}`));
      sfx(e.amount >= 150 ? 'coinBig' : 'coin');
      buzz('light');
      burst('coins', from, { count: Math.min(24, 6 + Math.round(e.amount / 12)) });
      show(() => fx.fly('coins', from, gumSpot(), { count: Math.min(14, 4 + Math.round(e.amount / 20)), onArrive: () => sfx('coin', { pitch: 1.3, volume: 0.6 }) }));
      text(`+${num(e.amount)}`, from, { kind: 'gain' });
      pop($('#q-bag span:last-child'), 1.35);
      await wait(460);
      break;
    }
    case 'heal': {
      if ('target' in e) break;
      view.card = e;
      view.me.hp = e.hp;
      say(`ラッキー！ 泉を見つけた。HP が ${e.amount} 回復。`);
      refresh();
      sfx('heal');
      burst('heal', at($('#q-me-face')), { scale: 1.2 });
      text(`+${num(e.amount)}`, over('me'), { kind: 'heal' });
      await wait(420);
      break;
    }
    case 'trap': {
      view.card = e;
      say(`アンラッキー！ 罠にかかった。${e.amount} ダメージ。`);
      view.impact = { key: nextKey(), side: 'me', big: false, tone: 'hit' };
      view.me.hp = e.hp;
      refresh();
      sfx('hit');
      buzz('medium');
      whiteOut('me', 60);
      recoil('me', true);
      show(() => fx.shake(9, 240));
      show(() => fx.flash(token('--hot'), 110));
      text(`${num(e.amount)}`, over('me'), { kind: 'dmg' });
      await wait(460);
      view.impact = null;
      break;
    }
    case 'beaten':
    case 'fled':
      // back from the battle to the corridor
      view.battle = null;
      view.foe = null;
      view.card = e;
      view.tape = [e.t === 'beaten' ? '敵を倒した。' : '敵から逃げた。'];
      refresh();
      music();
      await wait(140);
      break;
    case 'cleared':
      view.ended = 'cleared';
      refresh();
      sfx('fanfare');
      buzz('heavy');
      show(() => fx.flash(token('--paper'), 160), true);
      burst('confetti', { x: (root?.clientWidth ?? 390) / 2, y: 40 }, { count: 80, scale: 1.4 });
      show(() => fx.banner('CLEAR', { sub: '最深部を制覇した！', color: token('--gum'), ms: 900 }));
      await wait(600);
      break;
    case 'home':
      view.ended = 'home';
      view.card = null;
      refresh();
      sfx('stairs', { pitch: 1.25 });
      await wait(260);
      break;
  }
}

// ---------------------------------------------------------------- the battle

async function strike(e: Extract<Q.BattleEvent, { t: 'dmg' }>): Promise<void> {
  const side = e.target;
  const f = fighterOf(side);
  const spot = (): Target => at(bodyOf(side), 0.5, side === 'foe' ? 0.45 : 0.4);
  if (e.amount <= 0) {
    say(`${nameOf(side)}に ダメージを与えられない`);
    sfx('miss');
    text('0', spot(), { kind: 'info' });
    refresh();
    await wait(260);
    return;
  }
  const lethal = e.hp <= 0;
  const big = lethal || e.amount / f.maxHp >= 0.2;
  const stop = big ? 110 : 60;
  // impact: everything freezes on a white frame
  sfx(big ? 'hitBig' : 'hit');
  buzz(big ? 'heavy' : 'medium');
  view.impact = { key: nextKey(), side, big, tone: 'hit' };
  refresh();
  whiteOut(side, stop);
  show(() => fx.hitStop(stop));
  await wait(stop);
  // release: the number, the recoil, the bar
  f.hp = e.hp;
  say(`${nameOf(side)}に ${e.amount} ダメージ`);
  refresh();
  recoil(side, big);
  burst('hit', spot(), { scale: big ? 1.6 : 1, color: token(e.stat === 'phy' ? '--c-phy' : '--c-int') });
  text(num(e.amount), over(side), { kind: big ? 'crit' : 'dmg' });
  show(() => fx.shake(big ? 12 : 5, big ? 280 : 160));
  if (side === 'me' && big) show(() => fx.flash(token('--hot'), 140));
  await wait(big ? 260 : 200);
  view.impact = null;
}

async function fighting(g: GameState, e: Q.BattleEvent, next: AnyEvent | undefined): Promise<void> {
  switch (e.t) {
    case 'skill': {
      view.actor = e.who;
      view.impact = null;
      view.cutin = { key: nextKey(), who: e.who, kind: 'skill', text: e.name, itemId: e.itemId };
      say(`${nameOf(e.who)}の「${e.name}」`);
      refresh();
      pop($(`#q-tok-${e.who}`), 1.6);
      await wait(170);
      const strikes = next?.t === 'dmg' && next.target !== e.who;
      if (strikes) {
        lunge(e.who);
        await wait(e.who === 'foe' ? 200 : 180);
      } else {
        hop(e.who);
        await wait(150);
      }
      break;
    }
    case 'dmg':
      await strike(e);
      break;
    case 'heal': {
      if (!('target' in e)) break;
      const f = fighterOf(e.target);
      f.hp = e.hp;
      view.impact = { key: nextKey(), side: e.target, big: false, tone: 'heal' };
      say(`${nameOf(e.target)}の HP が ${e.amount} 回復`);
      refresh();
      sfx('heal');
      burst('heal', at(bodyOf(e.target)), { scale: 1.1 });
      text(`+${num(e.amount)}`, over(e.target), { kind: 'heal' });
      await wait(330);
      view.impact = null;
      break;
    }
    case 'stat': {
      const f = fighterOf(e.target);
      f[e.stat] = e.value;
      say(`${nameOf(e.target)}の ${STAT_JA[e.stat]} が ${Math.abs(e.delta)} ${e.delta > 0 ? 'アップ' : 'ダウン'}`);
      refresh();
      sfx(e.delta > 0 ? 'buff' : 'debuff');
      pop($(`#q-${e.target}-st-${e.stat}`), 1.7);
      text(`${STAT_JA[e.stat]} ${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)}`, over(e.target), { kind: 'info' });
      burst(e.delta > 0 ? 'sparks' : 'smoke', at(bodyOf(e.target)), { scale: 0.8, color: token(e.delta > 0 ? '--leaf' : '--violet') });
      await wait(280);
      break;
    }
    case 'status': {
      const f = fighterOf(e.target);
      f.status[e.name] = e.turns;
      say(`${nameOf(e.target)}は${e.name}になった（${Q.STATUS_HELP[e.name] ?? ''}）`);
      refresh();
      sfx('status');
      buzz('light');
      text(e.name, over(e.target), { kind: 'info' });
      burst('ring', at(bodyOf(e.target)), { color: token('--violet') });
      wobble(e.target);
      await wait(340);
      break;
    }
    case 'statusEnd': {
      const f = fighterOf(e.target);
      delete f.status[e.name];
      if (e.name === '睡眠') say(`${nameOf(e.target)}は目を覚ました`);
      refresh();
      await wait(50);
      break;
    }
    case 'blocked': {
      view.actor = e.who;
      view.impact = null;
      view.cutin = { key: nextKey(), who: e.who, kind: 'blocked', text: e.why === '混乱' ? '混乱して動けない' : `${e.why}で動けない`, itemId: 0 };
      say(`${nameOf(e.who)}は${e.why === '混乱' ? '混乱して' : `${e.why}で`}動けない`);
      refresh();
      sfx('miss');
      wobble(e.who);
      await wait(480);
      break;
    }
    case 'tick': {
      const f = fighterOf(e.target);
      f.hp = e.hp;
      view.impact = { key: nextKey(), side: e.target, big: false, tone: 'tick' };
      say(`${nameOf(e.target)}は${e.name}で ${e.amount} ダメージ`);
      refresh();
      sfx('hit', { volume: 0.5, pitch: 1.5 });
      whiteOut(e.target, 30);
      text(num(e.amount), over(e.target), { kind: 'dmg', size: 20 });
      await wait(280);
      view.impact = null;
      break;
    }
    case 'run': {
      view.actor = 'me';
      view.impact = null;
      view.cutin = { key: nextKey(), who: 'me', kind: 'run', text: '逃げる！', itemId: 0 };
      if (view.battle) view.battle.runs = e.tries;
      refresh();
      hop('me');
      await wait(260);
      if (e.ok) {
        say('うまく逃げ切った。');
        sfx('run');
        buzz('light');
        burst('dust', at($('#q-me-face')), { scale: 1.4 });
        burst('smoke', at($('#q-foe'), 0.3, 0.9), { scale: 1.6 });
        // the enemy falls away behind
        anim(bodyOf('foe'), [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(34%, -30%) scale(0.35)', opacity: 0 }], { duration: 360, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' });
        anim($('#q-bg'), [{ transform: 'scale(1)' }, { transform: 'scale(0.9) translateX(-6%)' }], { duration: 360, easing: 'ease-in', composite: 'add' });
        await wait(360);
        view.cutin = null;
        if (view.battle) view.battle.state = 'fled';
        refresh();
        music();
        await wait(300);
      } else {
        say('逃げられなかった！');
        view.cutin = { key: nextKey(), who: 'me', kind: 'fail', text: '逃げられない！', itemId: 0 };
        refresh();
        sfx('miss');
        buzz('double');
        // a stumble
        anim(bodyOf('me'), [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: 'translate(8px, 5px) rotate(24deg)', offset: 0.35 }, { transform: 'translate(2px, 2px) rotate(-6deg)', offset: 0.7 }, { transform: 'translate(0,0) rotate(0deg)' }], {
          duration: 420,
          easing: 'ease-out',
          composite: 'add',
        });
        show(() => fx.shake(4, 160));
        await wait(460);
      }
      break;
    }
    case 'ko': {
      if (e.who === 'foe') {
        const spot = at(bodyOf('foe'));
        view.cutin = null;
        view.impact = null;
        whiteOut('foe', 150);
        show(() => fx.hitStop(150));
        await wait(150);
        show(() => fx.flash(token('--paper'), 220), true);
        sfx('hitBig', { pitch: 0.75 });
        buzz('heavy');
        if (view.battle) {
          view.battle.state = 'won';
          view.battle.reward = next?.t === 'reward' ? next.gum : 0;
        }
        say(`${enemyName() ?? '敵'}を倒した！`);
        refresh();
        music();
        burst('shards', spot, { scale: 1.5, color: token('--paper') });
        burst('ring', spot, { scale: 1.6, color: token('--paper') });
        show(() => fx.shake(10, 260));
        await wait(420);
      } else {
        view.cutin = null;
        show(() => fx.hitStop(160));
        await wait(160);
        show(() => fx.shake(14, 400));
        anim($('#q-me-face img'), [{ transform: 'skewX(8deg) rotate(0deg)', transformOrigin: '50% 64%' }, { transform: 'skewX(8deg) rotate(90deg)', transformOrigin: '50% 64%' }], { duration: 380, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
        say('あなたは倒れた……');
        refresh();
        await wait(420);
      }
      break;
    }
    case 'reward': {
      const from = at($('#q-foe'));
      view.gumFound += e.gum;
      if (view.battle) view.battle.reward = e.gum;
      say(`${num(e.gum)} GUM を手に入れた。`);
      refresh();
      sfx('win', undefined);
      buzz('heavy');
      burst('coins', from, { count: Math.min(30, 8 + Math.round(e.gum / 10)) });
      burst('confetti', { x: (root?.clientWidth ?? 390) / 2, y: 60 }, { count: 50 });
      show(() => fx.fly('coins', from, gumSpot(), { count: Math.min(16, 5 + Math.round(e.gum / 15)), onArrive: () => sfx(e.gum >= 150 ? 'coinBig' : 'coin') }), true);
      text(`+${num(e.gum)}`, at($('#q-foe'), 0.5, 0.2), { kind: 'gain' });
      await wait(900);
      break;
    }
    case 'lost': {
      view.lost = e.items;
      view.ended = 'lost';
      if (view.battle) view.battle.state = 'lost';
      refresh();
      music();
      sfx('lose');
      buzz('heavy');
      await wait(1100);
      break;
    }
  }
  void g;
}

// ---------------------------------------------------------------- the loop

const alive = (g: GameState): boolean => game === g && g.phase === 'quest' && !!g.quest && g.quest === view.q;
const isBattleEvent = (g: GameState, e: AnyEvent): e is Q.BattleEvent => !!g.quest?.battle?.events?.some((x) => x.id === e.id);

/** Keeps a good that was just put in the wallet out of sight until its flight lands. */
function veil(list: AnyEvent[]): void {
  if (still()) return;
  for (const e of list) {
    if (e.t !== 'found' || !e.stowed || e.uid === null || hidden.has(e.uid)) continue;
    const el = root?.querySelector(`[data-item="${e.uid}"]`);
    if (!el) continue;
    try {
      hidden.set(e.uid, el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 20000 }));
    } catch {
      // it is simply visible from the start
    }
  }
}

/** Plays every event that has not been shown yet. Safe to call after every render. */
export async function play(g: GameState): Promise<void> {
  if (running || !root) return;
  running = true;
  try {
    for (let guard = 0; guard < 50 && alive(g); guard++) {
      const list = pending(g);
      if (list.length === 0) break;
      veil(list);
      // the card that was played leaves the hand first
      if (view.picked !== null && view.picked >= 0) {
        sfx('confirm');
        await wait(40);
      }
      for (let i = 0; i < list.length && alive(g); i++) {
        const e = list[i];
        try {
          if (isBattleEvent(g, e)) await fighting(g, e, list[i + 1]);
          else await exploring(g, e as Q.QuestEvent);
        } catch {
          // one broken beat must not freeze the game: the final sync puts everything right
        }
        view.seen = Math.max(view.seen, e.id);
      }
    }
  } finally {
    running = false;
    wake = null;
    for (const a of hidden.values()) a.cancel();
    hidden.clear();
    if (game && root && game.phase === 'quest' && game.quest && game.quest === view.q) {
      view.playing = false;
      view.skip = false;
      sync(game);
      refresh();
      music();
      // let the app know too, in case it wants to redraw around the quest
      try {
        root.dispatchEvent(new CustomEvent('q-refresh', { bubbles: true }));
      } catch {
        // old browsers: our own redraw above is enough
      }
    } else {
      view.playing = false;
      view.skip = false;
    }
  }
}
