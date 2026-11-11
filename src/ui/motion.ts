import { ctx } from './core';
import { display } from './settings';

export const wait = (ms: number): Promise<void> => new Promise((done) => window.setTimeout(done, ms));

/** Blocks input for a while (a beat or a scene change). Always released, even if the work throws. */
export async function locked<T>(work: () => Promise<T> | T): Promise<T> {
  ctx.busy += 1;
  ctx.root.classList.add('busy');
  try {
    return await work();
  } finally {
    ctx.busy -= 1;
    if (ctx.busy <= 0) {
      ctx.busy = 0;
      ctx.root.classList.remove('busy');
    }
  }
}

/** Resolves when `p` does, or after `ms` at the latest (effects must never be able to stall the game). */
export const within = (p: Promise<unknown>, ms: number): Promise<void> => Promise.race([p.then(() => undefined, () => undefined), wait(ms)]);

/** A point in px relative to the game root: the centre of an element. */
export function centre(el: Element | null | undefined): { x: number; y: number } {
  const base = ctx.root.getBoundingClientRect();
  if (!el) return { x: base.width / 2, y: base.height / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 };
}

/** A point on an element, by fractions of its box (0,0 top-left … 1,1 bottom-right). */
export function pointOn(el: Element | null | undefined, fx: number, fy: number): { x: number; y: number } {
  const base = ctx.root.getBoundingClientRect();
  if (!el) return { x: base.width / 2, y: base.height / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left - base.left + r.width * fx, y: r.top - base.top + r.height * fy };
}

/** Web-animation with the calm setting respected (it jumps to the end instead). */
export function anim(el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions & { duration: number }): Animation | null {
  if (!el || typeof el.animate !== 'function') return null;
  return el.animate(frames, display.still ? { ...opts, duration: 1, delay: 0, iterations: 1 } : opts);
}

const rolls = new WeakMap<Element, number>();

/**
 * Rolls a number shown in an element from one value to another. `onStep` is called as the shown value
 * changes (at most about 16 times a second), for tick sounds.
 */
export function rollNumber(el: HTMLElement, from: number, to: number, ms: number, opts: { onStep?: (t: number) => void; onShow?: (value: number) => void; done?: () => void } = {}): void {
  cancelAnimationFrame(rolls.get(el) ?? 0);
  const show = (value: number): void => {
    el.textContent = value.toLocaleString('ja-JP');
    opts.onShow?.(value);
  };
  if (display.still || from === to) {
    show(to);
    opts.done?.();
    return;
  }
  const start = performance.now();
  let lastTick = 0;
  const frame = (now: number): void => {
    const t = Math.min(1, (now - start) / ms);
    // fast at first, settling at the end
    const eased = 1 - Math.pow(1 - t, 3);
    show(Math.round(from + (to - from) * eased));
    if (now - lastTick > 60 && t < 1) {
      lastTick = now;
      opts.onStep?.(t);
    }
    if (t < 1) rolls.set(el, requestAnimationFrame(frame));
    else opts.done?.();
  };
  rolls.set(el, requestAnimationFrame(frame));
}

/**
 * Flies a copy of something from one box to another over the game (both in viewport coordinates).
 * Resolves on arrival. With calm on, it resolves at once.
 */
export function flyGhost(html: string, from: DOMRect, to: DOMRect, opts: { ms?: number; delay?: number; arc?: number; spin?: number; cls?: string } = {}): Promise<void> {
  if (display.still) return Promise.resolve();
  const base = ctx.root.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = `flyer ${opts.cls ?? ''}`;
  ghost.innerHTML = html;
  ghost.style.left = `${from.left - base.left}px`;
  ghost.style.top = `${from.top - base.top}px`;
  ghost.style.width = `${from.width}px`;
  ghost.style.height = `${from.height}px`;
  layer().appendChild(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = Math.min(to.width / from.width, to.height / from.height);
  const arc = opts.arc ?? -60;
  const spin = opts.spin ?? 12;
  const a = ghost.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + arc}px) scale(${(1 + scale) / 2 + 0.25}) rotate(${spin}deg)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)`, offset: 1 },
    ],
    { duration: opts.ms ?? 420, delay: opts.delay ?? 0, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' },
  );
  return new Promise((done) => {
    const end = (): void => {
      ghost.remove();
      done();
    };
    a.onfinish = end;
    a.oncancel = end;
    window.setTimeout(end, (opts.ms ?? 420) + (opts.delay ?? 0) + 200);
  });
}

/**
 * A layer above the screens that the redraw does not touch (flying goods, the dragged good, the hold ring,
 * notes). It sits inside the game root, so positions are relative to the root.
 */
export function layer(): HTMLElement {
  let el = document.getElementById('over-layer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'over-layer';
    el.className = 'over-layer';
    ctx.root.appendChild(el);
  }
  return el;
}

const tokens = new Map<string, string>();
/** The value of a design token (e.g. '--hot'), for effects that draw on a canvas and cannot read CSS variables. */
export function tok(name: string): string {
  let value = tokens.get(name);
  if (value === undefined) {
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';
    tokens.set(name, value);
  }
  return value;
}

/**
 * First-last-invert-play: remembers where some elements are, lets `change` redraw the screen, then slides
 * each from where it was to where it is now.
 */
export function flip(ids: readonly string[], change: () => void, ms = 240): void {
  const before = new Map<string, DOMRect>();
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) before.set(id, el.getBoundingClientRect());
  }
  change();
  for (const [id, was] of before) {
    const el = document.getElementById(id);
    if (!el) continue;
    const now = el.getBoundingClientRect();
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if (Math.abs(dx) + Math.abs(dy) < 2) continue;
    anim(el, [{ transform: `translate(${dx}px, ${dy}px) scale(1.08)`, zIndex: 5 }, { transform: 'translate(0,0) scale(1)', zIndex: 5 }], { duration: ms, easing: 'cubic-bezier(.2,1.3,.3,1)' });
  }
}

/** A settle after landing: a small squash and bounce. */
export function settle(el: Element | null | undefined): void {
  anim(el, [{ transform: 'scale(1.12,.86)' }, { transform: 'scale(.95,1.06)', offset: 0.45 }, { transform: 'scale(1.02,.98)', offset: 0.75 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
}

/** A refusal: two quick shakes. */
export function nope(el: Element | null | undefined): void {
  anim(el, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 300 });
}
