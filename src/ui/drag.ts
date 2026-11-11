import { catalog as cat } from '../game/catalog';
import * as G from '../game/logic';
import * as N from '../game/night';
import * as store from '../game/save';
import type { SlotId } from '../game/state';
import { audio, haptic } from './audio';
import { atHome, ctx, shownTab, ui } from './core';
import { gridItem } from './grid';
import { fx } from './fx';
import { anim, flip, layer, nope, pointOn, settle } from './motion';
import { bubbleShake, custShake } from './scene';
import { note } from './toast';
import { clampWindow } from './window';

/**
 * Dragging and pressing: goods on a grid (tap = detail, hold = menu, drag = move or put on the counter),
 * a seller's goods on the counter (tap or drag between the two sides), and the customer window (by its bar).
 * At home a good can be carried between the shelf, the wallet and the gear: hold it over a tab for a second and
 * that tab opens, then drop it there.
 * While a drag is on, the DOM is moved directly; the screen is redrawn when it ends.
 */
type ItemDrag = {
  kind: 'item';
  /** where the good lies: a grid, or (with `slot`) a place it is worn */
  grid: G.GridId;
  uid: number;
  slot: SlotId | null;
  itemId: number;
  rot: number;
  /** the tab the good is being held over, and the timer that opens it */
  overTab: string;
  dwell: number;
  startX: number;
  startY: number;
  active: boolean;
  ghost: HTMLElement | null;
  offX: number;
  offY: number;
  hold: number;
  ring: number;
  ok: boolean;
};
type OfferDrag = { kind: 'offer'; index: number; id: string; startX: number; startY: number; active: boolean; ghost: HTMLElement | null; offX: number; offY: number };
type Drag = { kind: 'win'; dx: number; dy: number } | OfferDrag | ItemDrag;
let drag: Drag | null = null;

const HOLD_MS = 500;
const inside = (rect: DOMRect, x: number, y: number): boolean => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

/** The cell a dragged good would land on (its top-left cell), or null when off its grid. */
function dropCell(d: ItemDrag, x: number, y: number): { x: number; y: number } | null {
  const grid = ctx.root.querySelector('.grid');
  if (!grid) return null;
  const rect = grid.getBoundingClientRect();
  // a little slack around the board, so the edge cells are easy to hit
  if (x < rect.left - 12 || x > rect.right + 12 || y < rect.top - 12 || y > rect.bottom + 12) return null;
  return { x: Math.floor((x - d.offX + ctx.cell / 2 - rect.left) / ctx.cell), y: Math.floor((y - d.offY + ctx.cell / 2 - rect.top) / ctx.cell) };
}

function ringAt(x: number, y: number): HTMLElement {
  const base = ctx.root.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'hold-ring';
  el.style.left = `${x - base.left}px`;
  el.style.top = `${y - base.top}px`;
  el.innerHTML = `<svg viewBox="0 0 48 48" width="64" height="64"><circle cx="24" cy="24" r="19" class="hold-track"/><circle cx="24" cy="24" r="19" class="hold-fill" style="animation-duration:${HOLD_MS - 140}ms"/></svg>`;
  layer().appendChild(el);
  return el;
}
const clearRing = (): void => {
  for (const el of layer().querySelectorAll('.hold-ring')) el.remove();
};

const TAB_DWELL_MS = 1000;

function endItemTimers(d: ItemDrag): void {
  window.clearTimeout(d.hold);
  window.clearTimeout(d.ring);
  clearRing();
}

function endDwell(d: ItemDrag): void {
  window.clearTimeout(d.dwell);
  d.overTab = '';
  for (const el of ctx.root.querySelectorAll('.tab.dwell')) el.classList.remove('dwell');
}

/** The place for gear under a point, if any. */
function slotAt(x: number, y: number): HTMLElement | null {
  for (const el of ctx.root.querySelectorAll<HTMLElement>('.gslot')) if (inside(el.getBoundingClientRect(), x, y)) return el;
  return null;
}

/** True when the dragged good may go into the place for gear. */
function fitsPlace(d: ItemDrag, place: string): boolean {
  const item = G.findItem(cat, d.itemId);
  if (d.slot) return false; // worn goods come off through a grid
  if (place === 'wallet') return item.wallet && d.grid === 'shelf';
  return N.fitsSlot(item, place as SlotId);
}

/**
 * Held over another tab for a second: that tab opens, and the good stays in the hand. The ghost is redrawn at
 * the new tab's cell size, held by its first cell.
 */
function watchTabs(d: ItemDrag, x: number, y: number): void {
  const s = ctx.s;
  if (!s || !atHome(s)) return;
  let over = '';
  for (const el of ctx.root.querySelectorAll<HTMLElement>('.tab[data-arg]')) {
    if (inside(el.getBoundingClientRect(), x, y)) over = el.dataset.arg ?? '';
  }
  if (over === shownTab(s)) over = '';
  if (over === d.overTab) return;
  endDwell(d);
  if (!over) return;
  d.overTab = over;
  ctx.root.querySelector(`#tab-${over}`)?.classList.add('dwell');
  d.dwell = window.setTimeout(() => {
    if (drag !== d || !ctx.s) return;
    ui.gridView = over as G.GridId | 'gear';
    d.overTab = '';
    ctx.render();
    ctx.root.classList.add('dragging');
    reGhost(d, x, y);
    markPlaces(d);
    audio.sfx('open');
    haptic('light');
  }, TAB_DWELL_MS);
}

/** Redraws the ghost as the good itself at the current cell size. */
function reGhost(d: ItemDrag, x: number, y: number): void {
  d.ghost?.remove();
  const holder = document.createElement('div');
  holder.innerHTML = gridItem({ uid: -1, itemId: d.itemId, x: 0, y: 0, rot: d.rot });
  const ghost = holder.firstElementChild as HTMLElement;
  ghost.removeAttribute('id');
  ghost.classList.add('drag-ghost');
  ghost.style.setProperty('--cell', `${ctx.cell}px`);
  const first = G.shapeOf(cat, d.itemId, d.rot).cells[0];
  d.offX = (first[0] + 0.5) * ctx.cell;
  d.offY = (first[1] + 0.5) * ctx.cell;
  ghost.style.transformOrigin = `${d.offX}px ${d.offY}px`;
  const base = ctx.root.getBoundingClientRect();
  ghost.style.left = `${x - base.left - d.offX}px`;
  ghost.style.top = `${y - base.top - d.offY}px`;
  layer().appendChild(ghost);
  d.ghost = ghost;
}

/** On the gear tab: shows which places would take the dragged good. */
function markPlaces(d: ItemDrag): void {
  for (const el of ctx.root.querySelectorAll<HTMLElement>('.gslot')) el.classList.toggle('can', fitsPlace(d, el.dataset.slot ?? ''));
}

function onDown(event: PointerEvent): void {
  const s = ctx.s;
  if (!s || ui.modal !== 'none' || ctx.busy > 0 || ui.screen !== 'game') return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const target = event.target as HTMLElement;
  const bar = target.closest('.win-bar');
  if (bar && !target.closest('button')) {
    const rect = ctx.root.getBoundingClientRect();
    drag = { kind: 'win', dx: event.clientX - rect.left - ui.win.x, dy: event.clientY - rect.top - ui.win.y };
    ctx.root.querySelector('#win')?.classList.add('held');
    event.preventDefault();
    return;
  }
  const offerEl = target.closest<HTMLElement>('.offer[data-offer]');
  if (offerEl) {
    const rect = offerEl.getBoundingClientRect();
    drag = { kind: 'offer', index: Number(offerEl.dataset.offer), id: offerEl.id, startX: event.clientX, startY: event.clientY, active: false, ghost: null, offX: event.clientX - rect.left, offY: event.clientY - rect.top };
    event.preventDefault();
    return;
  }
  const worn = target.closest<HTMLElement>('.gslot.full');
  if (worn && worn.dataset.slot !== 'wallet') {
    // a worn good: a tap is left to the button (it opens the list); a drag carries it off
    const slot = worn.dataset.slot as SlotId;
    const gear = s.equip[slot];
    if (!gear) return;
    const rect = worn.getBoundingClientRect();
    drag = { kind: 'item', grid: 'shelf', uid: -1, slot, itemId: gear.itemId, rot: 0, overTab: '', dwell: 0, startX: event.clientX, startY: event.clientY, active: false, ghost: null, offX: event.clientX - rect.left, offY: event.clientY - rect.top, ok: false, ring: 0, hold: 0 };
    return;
  }
  const cellEl = target.closest<HTMLElement>('.inv-cell');
  if (!cellEl) return;
  const uid = Number(cellEl.dataset.uid);
  if (ui.counter.includes(uid)) return;
  const grid = (cellEl.closest<HTMLElement>('.grid')?.dataset.grid ?? 'shelf') as G.GridId;
  const stockNow = G.gridOf(s, cat, grid).items.find((it) => it.uid === uid);
  if (!stockNow) return;
  const rect = cellEl.parentElement!.getBoundingClientRect();
  const x = event.clientX;
  const y = event.clientY;
  const d: ItemDrag = {
    kind: 'item',
    grid,
    uid,
    slot: null,
    itemId: stockNow.itemId,
    rot: stockNow.rot,
    overTab: '',
    dwell: 0,
    startX: x,
    startY: y,
    active: false,
    ghost: null,
    offX: x - rect.left,
    offY: y - rect.top,
    ok: false,
    // held still for half a second: the menu (a ring fills while holding)
    ring: window.setTimeout(() => {
      if (drag === d && !d.active) ringAt(x, y);
    }, 140),
    hold: window.setTimeout(() => {
      if (drag !== d || d.active) return;
      drag = null;
      clearRing();
      ui.sel = { grid, uid };
      ui.modal = 'menu';
      audio.sfx('open');
      haptic('medium');
      ctx.render();
    }, HOLD_MS),
  };
  drag = d;
  cellEl.parentElement!.classList.add('pressed');
  event.preventDefault();
}

function lift(d: OfferDrag | ItemDrag): boolean {
  const el = ctx.root.querySelector<HTMLElement>(d.kind === 'offer' ? `#${CSS.escape(d.id)}` : d.slot ? `#gslot-${d.slot}` : `#item-${d.uid}`);
  if (!el) return false;
  if (d.kind === 'item') endItemTimers(d);
  d.active = true;
  const rect = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  ghost.classList.remove('pressed');
  ghost.classList.add('drag-ghost');
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.transformOrigin = `${d.offX}px ${d.offY}px`;
  ghost.style.setProperty('--cell', `${ctx.cell}px`);
  layer().appendChild(ghost);
  d.ghost = ghost;
  el.classList.remove('pressed');
  el.classList.add('lifted');
  ctx.root.classList.add('dragging', d.kind === 'offer' ? 'drag-offer' : `drag-${d.grid}`);
  audio.sfx('pick');
  haptic('light');
  return true;
}

function onMove(event: PointerEvent): void {
  const s = ctx.s;
  if (!drag || !s) return;
  const root = ctx.root;
  if (drag.kind === 'win') {
    const rect = root.getBoundingClientRect();
    ui.win.x = event.clientX - rect.left - drag.dx;
    ui.win.y = event.clientY - rect.top - drag.dy;
    ui.win.moved = true;
    clampWindow();
    return;
  }
  const d = drag;
  if (!d.active) {
    if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < 8) return;
    if (!lift(d)) return;
  }
  const rootRect = root.getBoundingClientRect();
  d.ghost!.style.left = `${event.clientX - rootRect.left - d.offX}px`;
  d.ghost!.style.top = `${event.clientY - rootRect.top - d.offY}px`;
  if (d.kind === 'offer') {
    for (const zone of root.querySelectorAll('#near.take, #far.take')) zone.classList.toggle('hot', inside(zone.getBoundingClientRect(), event.clientX, event.clientY));
    return;
  }
  watchTabs(d, event.clientX, event.clientY);
  const tab = shownTab(s);
  const counter = d.grid === 'shelf' && !d.slot ? root.querySelector('#near.drop') : null;
  const overCounter = !!counter && inside(counter.getBoundingClientRect(), event.clientX, event.clientY);
  counter?.classList.toggle('hot', overCounter);
  if (tab === 'gear') {
    // over the gear: the place under the finger lights up when the good fits it
    const place = overCounter ? null : slotAt(event.clientX, event.clientY);
    for (const el of root.querySelectorAll('.gslot.hot')) if (el !== place) el.classList.remove('hot');
    const fits = !!place && fitsPlace(d, place.dataset.slot ?? '');
    place?.classList.toggle('hot', fits);
    d.ghost!.classList.toggle('bad', !!place && !fits);
    d.ok = overCounter || fits;
    return;
  }
  const preview = root.querySelector<HTMLElement>('#preview');
  const grid = G.gridOf(s, cat, tab);
  const same = !d.slot && tab === d.grid;
  const spot = overCounter ? null : dropCell(d, event.clientX, event.clientY);
  let ok = overCounter;
  if (preview) {
    if (!spot) preview.style.display = 'none';
    else {
      const shape = G.shapeOf(cat, d.itemId, d.rot);
      ok = G.canPlaceIn(grid, cat, d.itemId, spot.x, spot.y, d.rot, same ? d.uid : -1);
      preview.style.display = 'block';
      preview.className = `preview ${ok ? 'ok' : 'ng'}`;
      preview.innerHTML = shape.cells.map(([cx, cy]) => `<i style="left:${(spot.x + cx) * ctx.cell}px;top:${(spot.y + cy) * ctx.cell}px"></i>`).join('');
    }
  }
  d.ghost!.classList.toggle('bad', !!spot && !ok);
  d.ok = ok;
}

function cleanup(): void {
  const root = ctx.root;
  root.classList.remove('dragging', 'drag-offer', 'drag-shelf', 'drag-wallet');
  for (const el of root.querySelectorAll('.hot')) el.classList.remove('hot');
  for (const el of root.querySelectorAll('.gslot.can')) el.classList.remove('can');
  for (const el of root.querySelectorAll('.pressed')) el.classList.remove('pressed');
  root.querySelector('#win')?.classList.remove('held');
  const preview = root.querySelector<HTMLElement>('#preview');
  if (preview) {
    preview.style.display = 'none';
    preview.innerHTML = '';
  }
}

/** Lets a redrawn element take over from the ghost: it starts where the ghost was and settles into place. */
function land(el: HTMLElement | null, from: DOMRect | null, good: boolean): void {
  if (!el) return;
  if (from) {
    const now = el.getBoundingClientRect();
    const dx = from.left - now.left;
    const dy = from.top - now.top;
    if (good) {
      anim(el, [{ transform: `translate(${dx}px, ${dy}px) scale(1.1) rotate(3deg)`, zIndex: 6 }, { transform: 'translate(0,0) scale(1.06,.9)', zIndex: 6, offset: 0.6 }, { transform: 'translate(0,0) scale(.97,1.04)', offset: 0.8 }, { transform: 'translate(0,0) scale(1)' }], { duration: 260, easing: 'ease-out' });
    } else {
      anim(el, [{ transform: `translate(${dx}px, ${dy}px) scale(1.1)`, zIndex: 6 }, { transform: 'translate(0,0)', zIndex: 6, offset: 0.55 }, { transform: 'translateX(-6px)', offset: 0.66 }, { transform: 'translateX(6px)', offset: 0.77 }, { transform: 'translateX(-4px)', offset: 0.88 }, { transform: 'translateX(0)' }], { duration: 420, easing: 'ease-out' });
    }
  } else if (good) settle(el);
  else nope(el);
}

function onUp(event: PointerEvent): void {
  const g = ctx.s;
  if (!drag || !g) return;
  const d = drag;
  const root = ctx.root;
  drag = null;
  if (d.kind === 'win') {
    cleanup();
    return;
  }
  const from = d.ghost ? d.ghost.getBoundingClientRect() : null;
  d.ghost?.remove();

  if (d.kind === 'offer') {
    const v = G.currentVisitor(g);
    const picked = ui.picked.includes(d.index);
    let want = !picked; // a tap moves it to the other side
    if (d.active) {
      const near = root.querySelector('#near.take');
      const far = root.querySelector('#far.take');
      if (near && inside(near.getBoundingClientRect(), event.clientX, event.clientY)) want = true;
      else if (far && inside(far.getBoundingClientRect(), event.clientX, event.clientY)) want = false;
      else want = picked;
    }
    cleanup();
    if (!v || v.done || v.kind !== 'sell') {
      ctx.render();
      return;
    }
    const moved = want !== picked;
    const apply = (): void => {
      ui.picked = want ? [...new Set([...ui.picked, d.index])] : ui.picked.filter((i) => i !== d.index);
      if (want) ui.win.open = true;
      ctx.render();
    };
    if (d.active) {
      apply();
      land(document.getElementById(d.id), from, true);
    } else flip([d.id], apply);
    if (moved) {
      audio.sfx('drop');
      haptic('light');
      const el = document.getElementById(d.id);
      if (el) fx.burst('dust', pointOn(el, 0.5, 0.9), { count: 6, scale: 0.7 });
    } else if (d.active) audio.sfx('cancel');
    return;
  }

  endItemTimers(d);
  endDwell(d);
  cleanup();
  if (!d.active) {
    if (d.slot) return; // a tap on a worn good: the button opens the list
    ui.sel = { grid: d.grid, uid: d.uid };
    ui.confirmDispose = false;
    ui.modal = 'inspect';
    audio.sfx('open');
    haptic('light');
    ctx.render();
    return;
  }
  const v = G.currentVisitor(g);
  const tab = shownTab(g);
  const counter = d.grid === 'shelf' && !d.slot ? root.querySelector('#near.drop') : null;
  const good = (el: HTMLElement | null, sound: 'drop' | 'equip'): void => {
    land(el, from, true);
    audio.sfx(sound);
    haptic('light');
    if (el) fx.burst(sound === 'equip' ? 'stars' : 'dust', pointOn(el, 0.5, 0.9), { count: 8 });
  };
  const bad = (el: HTMLElement | null, why = ''): void => {
    land(el, from, false);
    audio.sfx('dropBad');
    haptic('double');
    if (why) note(why, 'info');
  };
  const home = (): HTMLElement | null => document.getElementById(d.slot ? `gslot-${d.slot}` : `item-${d.uid}`);
  if (counter && v && !v.done && v.kind === 'buy' && inside(counter.getBoundingClientRect(), event.clientX, event.clientY)) {
    const stock = g.stock.find((x) => x.uid === d.uid);
    if (stock && !G.matches(cat, v.want, stock.itemId)) {
      G.refuseGood(g);
      ui.win.open = true;
      ctx.render();
      bad(home(), '希望と違う品');
      bubbleShake();
      custShake();
    } else if (stock) {
      ui.counter.push(d.uid);
      ui.win.open = true;
      ctx.render();
      good(document.getElementById(`put-${d.uid}`), 'drop');
    }
  } else if (tab === 'gear') {
    // dropped on a place for gear: worn, if it fits there
    const place = slotAt(event.clientX, event.clientY)?.dataset.slot ?? '';
    if (place && fitsPlace(d, place)) {
      const result = N.equip(g, cat, d.uid, place === 'wallet' ? undefined : (place as SlotId), d.grid);
      ctx.render();
      if (result === 'ok') good(document.getElementById(`gslot-${place}`), 'equip');
      else bad(document.getElementById(`gslot-${place}`), result === 'walletfull' ? 'ウォレットを空にしてから替えてください' : '外した品を置く場所がない');
    } else {
      ctx.render();
      bad(home(), place ? 'ここには装備できない' : '');
    }
  } else {
    const spot = dropCell(d, event.clientX, event.clientY);
    let ok = false;
    let uid = d.uid;
    if (spot && d.slot) {
      // a worn good comes off onto the grid
      ok = N.unequip(g, cat, d.slot, tab, spot.x, spot.y);
      if (ok) uid = G.gridOf(g, cat, tab).items[G.gridOf(g, cat, tab).items.length - 1].uid;
    } else if (spot && tab !== d.grid) ok = N.transfer(g, cat, d.grid, d.uid, tab, spot.x, spot.y);
    else if (spot) ok = G.moveStock(g, cat, d.uid, spot.x, spot.y, d.grid);
    ctx.render();
    if (ok) good(document.getElementById(`item-${uid}`), 'drop');
    else bad(home());
  }
  store.save(g);
}

function onCancel(): void {
  if (!drag) return;
  if (drag.kind !== 'win') drag.ghost?.remove();
  if (drag.kind === 'item') {
    endItemTimers(drag);
    endDwell(drag);
  }
  drag = null;
  cleanup();
  ctx.render();
}

/** True while something is being dragged (the screen must not be redrawn under it). */
export const dragging = (): boolean => !!drag && drag.kind !== 'win' && drag.active;

export function mountDrag(root: HTMLElement): void {
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('contextmenu', (event) => {
    if ((event.target as HTMLElement).closest('.inv-cell, .offer')) event.preventDefault();
  });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
}
