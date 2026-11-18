/**
 * What a mouse and a keyboard add (a phone needs none of it):
 *  - resting the pointer on a good shows a small card about it;
 *  - keys: Space moves the customer's line on, B rings the bell, Enter presses the main button, Esc closes what is open,
 *    1–3 switch between shelf, wallet and gear, R turns the good being dragged.
 * The right button (a good's menu, or a turn while dragging) is in drag.ts, with the rest of the pointer handling.
 */
import { candidateCard } from './craft';
import { advanceLine } from './scene';
import { catalog as cat } from '../game/catalog';
import * as G from '../game/logic';
import { ctx, ui, popsOn } from './core';
import { dragging, rotateDragged } from './drag';
import { closeOverlay, overlayOpen, toggleOverlay } from './overlay';
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
  // (a good on the night shop's floor, or in the box to be sent)
  const onFloor = el.closest<HTMLElement>('.sgood[data-good]');
  const o = onFloor ? s.shop?.goods[Number(onFloor.dataset.good)] : undefined;
  if (o) {
    const item = G.findItem(cat, o.itemId);
    const fits = !!G.findSlotIn(G.gridOf(s, cat, 'wallet'), cat, o.itemId);
    return { key: `s${onFloor!.dataset.good}:${s.wallet.items.length}`, html: `${itemCard(o.itemId, o.cond)}<p class="tip-skill"><b>${o.price} MCHC</b>${fits ? 'ウォレットに入ります' : 'いまのウォレットには入りません'}</p><p class="tip-skill"><b>${esc(item.skill)}</b>${esc(item.skillText)}</p>` };
  }
  const inBox = el.closest<HTMLElement>('.bgood[data-boxed]');
  const boxed = inBox ? s.shop?.box?.items.find((it) => it.uid === Number(inBox.dataset.boxed)) : undefined;
  if (boxed) return { key: `b${boxed.uid}`, html: itemCard(boxed.itemId, boxed.cond) };
  // (what the pot could make: the good itself, or only its shadow)
  const cand = el.closest<HTMLElement>('.pcand[data-cand]');
  if (cand) {
    const html = candidateCard(s, Number(cand.dataset.cand));
    return html ? { key: `c${cand.dataset.cand}:${ui.craft.join(',')}`, html } : null;
  }
  // (the goods in and under the pot)
  const potGood = el.closest<HTMLElement>('.pgood, .pslot:not(.empty)');
  if (potGood) {
    const uid = Number(potGood.id.split('-')[1]);
    const x = s.stock.find((it) => it.uid === uid) ?? s.wallet.items.find((it) => it.uid === uid);
    if (!x) return null;
    const item = G.findItem(cat, x.itemId);
    return { key: `p${uid}`, html: `${itemCard(x.itemId, x.cond)}<p class="tip-skill"><b>${esc(item.skill)}</b>${esc(item.skillText)}</p>` };
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

/** Whether a window was open when the key went down (another listener may close it before this one runs). */
let hadModal = false;
window.addEventListener('keydown', () => (hadModal = ui.modal !== 'none' || !!ctx.root?.querySelector('.modal')), true);

function onKey(event: KeyboardEvent): void {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || ui.screen !== 'game') return;
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
  // the guide lies over everything: any key puts it away (O is its own key)
  if (overlayOpen()) {
    closeOverlay();
    event.preventDefault();
    return;
  }
  const modal = ui.modal !== 'none' || !!ctx.root.querySelector('.modal');
  let done = false;
  switch (event.key) {
    case 'r':
    case 'R':
      done = rotateDragged();
      break;
    case 'q':
    case 'Q':
      done = rotateDragged(-1);
      break;
    case 'e':
    case 'E':
      done = rotateDragged(1);
      break;
    case 'o':
    case 'O':
      if (!modal) done = toggleOverlay();
      break;
    case 'Escape':
      // closes what is open; with nothing open, it opens the settings (the game's menu)
      done = press('.modal [data-act="dispose-no"]', '.modal [data-act="modal-close"]', '#nego [data-act="haggle-close"]', '#win [data-act="win-close"]');
      if (!done && !modal && !hadModal && !dragging()) {
        // (a moment later: the same key press must not close the window it has just opened)
        window.setTimeout(() => press('[data-act="settings"]'), 0);
        done = true;
      }
      break;
    case 'Enter':
      // the one button the moment is about: a window's main button, the sale, the purchase, opening and closing the shop
      done = modal
        ? press('.modal .btn.primary:not(.danger)', '.modal .btn.gold')
        : press('#win [data-act="sell"]', '#win [data-act="buy-picked"]', '#greet-skip', '.cta .btn', '#take-all');
      break;
    case ' ':
      // the line moves on: a greeting gives way to the slip, a line being typed is shown whole, a finished line is put away
      if (!modal) done = press('#cameo') || press('#greet-skip') || advanceLine();
      break;
    case 'b':
    case 'B':
      if (!modal) done = press('[data-act="bell"]');
      break;
    case '1':
    case '2':
    case '3':
      if (!modal && ctx.s && popsOn(ctx.s)) {
        // (no tabs on a wide screen: 2 and 3 open and shut the wallet's and the gear's windows)
        if (event.key !== '1') ctx.act('pop', event.key === '2' ? 'wallet' : 'gear');
        done = event.key !== '1';
      } else if (!modal) done = press(`#inv [data-act="grid"][data-arg="${['shelf', 'wallet', 'gear'][Number(event.key) - 1]}"]`);
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
