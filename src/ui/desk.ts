/**
 * What a mouse and a keyboard add (a phone needs none of it):
 *  - resting the pointer on a good shows a small card about it;
 *  - keys: Space rings the bell, Enter presses the main button, Esc closes what is open,
 *    1–3 switch between shelf, wallet and gear, R turns the good being dragged.
 * The right button (a good's menu, or a turn while dragging) is in drag.ts, with the rest of the pointer handling.
 */
import { catalog as cat } from '../game/catalog';
import * as G from '../game/logic';
import { ctx, ui } from './core';
import { dragging, rotateDragged } from './drag';
import { esc, itemCard } from './html';

let tip: HTMLElement | null = null;
let tipFor = '';
let timer = 0;

function hideTip(): void {
  window.clearTimeout(timer);
  tipFor = '';
  tip?.classList.remove('show');
}

/** The card for whatever is under the pointer: a good on a grid, or one a customer has put on the counter. */
function cardFor(el: HTMLElement): { key: string; html: string } | null {
  const s = ctx.s;
  if (!s) return null;
  const good = el.closest<HTMLElement>('.inv-item[data-item]');
  if (good) {
    const uid = Number(good.dataset.item);
    const x = s.stock.find((it) => it.uid === uid) ?? s.wallet.items.find((it) => it.uid === uid);
    if (!x) return null;
    const item = G.findItem(cat, x.itemId);
    return { key: `i${uid}`, html: `${itemCard(x.itemId, x.cond)}<p class="tip-skill"><b>${esc(item.skill)}</b>${esc(item.skillText)}</p>` };
  }
  const offer = el.closest<HTMLElement>('.offer[data-offer]');
  const v = G.currentVisitor(s);
  if (offer && v && v.kind === 'sell') {
    const o = v.offers[Number(offer.dataset.offer)];
    if (!o) return null;
    const item = G.findItem(cat, o.itemId);
    return { key: `o${offer.id}`, html: `${itemCard(o.itemId, o.cond)}<p class="tip-skill"><b>${esc(item.skill)}</b>${esc(item.skillText)}</p>` };
  }
  return null;
}

function place(x: number, y: number): void {
  if (!tip) return;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  // beside the pointer, on whichever side has the room
  const left = x + 18 + w > window.innerWidth - 8 ? x - 18 - w : x + 18;
  const top = Math.max(8, Math.min(y + 14, window.innerHeight - h - 8));
  tip.style.transform = `translate(${Math.round(Math.max(8, left))}px, ${Math.round(top)}px)`;
}

function onHover(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') return;
  if (event.buttons !== 0 || dragging() || ui.modal !== 'none' || ui.screen !== 'game') return hideTip();
  const card = cardFor(event.target as HTMLElement);
  if (!card) return hideTip();
  if (card.key === tipFor) return place(event.clientX, event.clientY);
  hideTip();
  tipFor = card.key;
  const x = event.clientX;
  const y = event.clientY;
  // a short rest, so that the card does not flicker while the pointer only passes over
  timer = window.setTimeout(() => {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'hover-tip paper';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    tip.innerHTML = card.html;
    tip.classList.add('show');
    place(x, y);
  }, 260);
}

/** Presses the first of these that is on screen and can be pressed. */
function press(...selectors: string[]): boolean {
  for (const selector of selectors) {
    for (const el of ctx.root.querySelectorAll<HTMLButtonElement>(selector)) {
      if (el.disabled || el.offsetParent === null) continue;
      el.click();
      return true;
    }
  }
  return false;
}

function onKey(event: KeyboardEvent): void {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || ui.screen !== 'game') return;
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
  const modal = ui.modal !== 'none' || !!ctx.root.querySelector('.modal');
  let done = false;
  switch (event.key) {
    case 'r':
    case 'R':
      done = rotateDragged();
      break;
    case 'Escape':
      done = press('.modal [data-act="dispose-no"]', '.modal [data-act="modal-close"]', '#nego [data-act="haggle-close"]', '#win [data-act="win-close"]');
      break;
    case 'Enter':
      // the one button the moment is about: a window's main button, the sale, the purchase, opening and closing the shop
      done = modal
        ? press('.modal .btn.primary:not(.danger)', '.modal .btn.gold')
        : press('#win [data-act="sell"]', '#win [data-act="buy-picked"]', '#greet-skip', '.cta .btn', '#take-all');
      break;
    case ' ':
      if (!modal) done = press('#greet-skip', '[data-act="bell"]');
      break;
    case '1':
    case '2':
    case '3':
      if (!modal) done = press(`#inv [data-act="grid"][data-arg="${['shelf', 'wallet', 'gear'][Number(event.key) - 1]}"]`);
      break;
    default:
      return;
  }
  if (done) {
    event.preventDefault();
    // (a button that kept the focus from an earlier click must not be pressed by the same key as well)
    (document.activeElement as HTMLElement | null)?.blur?.();
    hideTip();
  }
}

export function mountDesk(root: HTMLElement): void {
  root.addEventListener('pointermove', onHover);
  root.addEventListener('pointerleave', hideTip);
  root.addEventListener('pointerdown', hideTip);
  window.addEventListener('keydown', onKey);
  window.addEventListener('blur', hideTip);
}
