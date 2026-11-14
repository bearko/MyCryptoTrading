/**
 * The things of the shop that are used by hand rather than through a menu (a wide screen shows them
 * beside the shelf): the bin — goods are dragged into it — and the bed — a click on it at night ends the day.
 */
import { catalog as cat } from '../game/catalog';
import * as G from '../game/logic';
import type { GameState } from '../game/state';
import { atHome } from './core';
import { btn, esc, gum, itemTile, num } from './html';

// drawn flat, in the shop's own ink and paper (no pictures of their own in the catalogue)
const BIN = `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="p-ink" d="M10 16h44v6H10z"/><path class="p-ink" d="M24 9h16v8H24z"/><path class="p-fill" d="M14 22h36l-4 34H18z"/><path class="p-ink" d="M14 22h36l-4 34H18zm4 4 3 26h22l3-26z" fill-rule="evenodd"/><path class="p-ink" d="M25 29h3v20h-3zM36 29h3v20h-3z"/></svg>`;
const BED = `<svg viewBox="0 0 96 64" aria-hidden="true"><path class="p-ink" d="M2 46h92v8H2zM6 54h8v8H6zM82 54h8v8h-8z"/><path class="p-ink" d="M6 34h84v14H6z"/><path class="p-paper" d="M9 37h78v8H9z"/><path class="p-ink" d="M30 22h60v20H30z"/><path class="p-fill" d="M33 25h54v14H33z"/><path class="p-ink" d="M44 25h3v14h-3z"/><path class="p-ink" d="M6 22h26v18H6z"/><path class="p-paper" d="M9 25h20v12H9z"/><path class="p-z" d="M58 4h12v3l-7 6h7v3H58v-3l7-6h-7zM76 12h8v2l-5 4h5v2h-8v-2l5-4h-5z"/></svg>`;

export function deckProps(g: GameState): string {
  if (!atHome(g)) return '';
  const night = g.phase === 'evening';
  const count = g.trash.length;
  return `<button class="prop trash ${count ? 'full' : ''}" id="trash" data-act="trash" data-sfx="open" aria-label="ゴミ箱（品をドラッグして捨てる。中身は ${count} 個。クリックで中を見る）">
      ${BIN}<b>ゴミ箱</b>${count ? `<em>${count}</em>` : ''}<small>ここへドラッグ</small></button>
    <button class="prop bed ${night ? 'ready' : ''}" id="bed" data-act="bed" data-sfx="none" aria-label="寝床（店を閉めたあと、クリックで眠って翌日へ）">
      ${BED}<b>寝床</b><small>${night ? 'クリックで眠る' : '夜になったら'}</small></button>`;
}

/** What is in the bin: anything can be taken back until the night. */
export function trashModal(g: GameState): string {
  const rows = g.trash
    .map((x) => {
      const item = G.findItem(cat, x.itemId);
      return `<div class="pick-row">${itemTile(item, 'sm')}<span class="pick-main"><b class="pix">${esc(item.ja)}</b><small>処分の値 ${num(G.disposePrice(cat, x))}</small></span>${btn('untrash', '戻す', { arg: x.uid, cls: 'small', sfx: 'none' })}</div>`;
    })
    .join('');
  return `<div class="modal" id="modal-trash" data-ui><div class="modal-box tall">
    <h2 class="modal-title"><small>BIN</small>ゴミ箱</h2>
    <p class="hint">品をここへドラッグすると捨てられます。夜、眠るときに回収されて、処分の値が入ります（今夜の合計 ${gum(g.trashGum)}）。それまでは戻せます。</p>
    <div class="modal-scroll">${rows || '<p class="hint">いまは空です。</p>'}</div>
    <div class="actions one">${btn('modal-close', '閉じる', { cls: 'primary' })}</div>
  </div></div>`;
}
