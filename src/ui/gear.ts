import { catalog as cat, SLOT_JA } from '../game/catalog';
import * as G from '../game/logic';
import * as N from '../game/night';
import type { GameState, SlotId } from '../game/state';
import { audio } from './audio';
import { ctx, ui } from './core';
import { fx } from './fx';
import { btn, esc, glyphs, itemCard, tone } from './html';
import { ICON } from './icons';
import { rollNumber } from './motion';

const SLOT_LABEL: Record<SlotId | 'wallet', string> = { head: '頭', body: '胴体', arm: '腕', leg: '足', special1: '特殊1', special2: '特殊2', wallet: 'ウォレット' };
const STAT_NAMES = ['HP', 'PHY', 'INT', 'AGI'];
const STAT_KEYS = ['hp', 'phy', 'int', 'agi'];

/** The gear window: the warrior, six places to wear gear, and the wallet. Also the way out to the quest. */
export function gearModal(g: GameState): string {
  const slotBtn = (id: SlotId | 'wallet'): string => {
    const itemId = id === 'wallet' ? g.wallet.itemId : g.equip[id]?.itemId;
    const item = itemId ? G.findItem(cat, itemId) : null;
    return `<button class="slot slot-${id} ${item ? 'full' : ''} ${ui.gearFlash === id ? 'flash' : ''}" id="slot-${id}" ${item ? `style="${tone(item)}"` : ''} data-act="gear-slot" data-arg="${id}" aria-label="${SLOT_LABEL[id]}${item ? `：${esc(item.ja)}` : '：なし'}">
      <span class="slot-face">${item ? `<img src="${item.img}" alt="" draggable="false" />${glyphs(item)}` : `<i class="slot-glyph">${ICON.slot[id]}</i>`}</span>
      <small>${ICON.slot[id]}${SLOT_LABEL[id]}</small></button>`;
  };
  const stats = N.playerStats(g, cat);
  const before = ui.gearBefore;
  const statBox = stats
    .map((v, i) => {
      const d = before ? v - before[i] : 0;
      return `<div class="gstat s-${STAT_KEYS[i]}"><small>${STAT_NAMES[i]}</small><b id="gstat-${i}" data-live>${before ? before[i] : v}</b>${d ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲+' : '▼−'}${Math.abs(d)}</em>` : ''}</div>`;
    })
    .join('');
  const size = G.walletSize(g, cat);
  return `<div class="modal" id="modal-gear" data-ui><div class="modal-box gearbox ${ui.departing ? 'departing' : ''}">
    <h2 class="modal-title">${ui.departing ? '<small>QUEST</small>クエストへ出発' : '<small>GEAR</small>装備'}</h2>
    <div class="gear-stage">
      <div class="gear-col">${slotBtn('head')}${slotBtn('body')}${slotBtn('arm')}</div>
      <div class="gear-me"><i class="gear-spot"></i><img src="${cat.player.img}" alt="${esc(cat.player.ja)}" draggable="false" />${slotBtn('wallet')}</div>
      <div class="gear-col">${slotBtn('special1')}${slotBtn('special2')}${slotBtn('leg')}</div>
    </div>
    <div class="gear-stats" id="gear-stats">${statBox}</div>
    <p class="hint">場所をタップして、棚の品から選びます。装備した品のスキルを戦闘で使えます。ウォレットは ${size.cols}×${size.rows} マス。</p>
    <div class="actions ${ui.departing ? 'two' : 'one'}">${btn('modal-close', ui.departing ? 'やめる' : '閉じる', { cls: ui.departing ? 'ghost' : '' })}${ui.departing ? btn('depart', '出発する', { cls: 'primary big', sfx: 'none' }) : ''}</div>
  </div></div>`;
}

/** After a redraw of the gear window: the stats count up to what is worn now, and the filled slot flashes. */
export function gearEffects(g: GameState): void {
  const box = ctx.root.querySelector('#gear-stats');
  if (!box) return;
  const stats = N.playerStats(g, cat);
  stats.forEach((v, i) => {
    const el = box.querySelector<HTMLElement>(`#gstat-${i}`);
    if (!el) return;
    const from = Number((el.textContent ?? '').replace(/[^\d-]/g, '')) || 0;
    if (from !== v) rollNumber(el, from, v, 520);
  });
  if (ui.gearFlash) {
    const slot = ctx.root.querySelector(`#slot-${ui.gearFlash}`);
    if (slot) {
      fx.burst('sparks', slot, { count: 12 });
      audio.sfx('equip');
    }
    ui.gearFlash = null;
  }
}

const slotOf = (slot: SlotId | 'wallet'): string => (slot === 'wallet' ? 'ウォレット' : slot === 'special1' ? '特殊1' : slot === 'special2' ? '特殊2' : SLOT_JA[slot]);

/** Choosing what to wear in one place: the fitting goods on the shelf, each with what it changes. */
export function pickModal(g: GameState): string {
  const slot = ui.gearSlot;
  if (!slot) return '';
  const fits = g.stock.filter((x) => {
    const item = G.findItem(cat, x.itemId);
    if (ui.counter.includes(x.uid)) return false;
    return slot === 'wallet' ? item.wallet : !item.wallet && (slot.startsWith('special') ? item.slot === 'special' : item.slot === slot);
  });
  const worn = slot === 'wallet' ? null : g.equip[slot];
  const wornStats = worn ? G.findItem(cat, worn.itemId).stats : [0, 0, 0, 0];
  const delta = (stats: readonly number[]): string =>
    stats
      .map((v, i) => {
        const d = v - wornStats[i];
        if (v === 0 && d === 0) return '';
        return `<span class="stat s-${STAT_KEYS[i]} ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${STAT_NAMES[i]}<b>+${v}</b>${worn && d !== 0 ? `<em>${d > 0 ? '▲' : '▼'}${Math.abs(d)}</em>` : ''}</span>`;
      })
      .join('');
  const rows = fits
    .map((x, i) => {
      const item = G.findItem(cat, x.itemId);
      const extra = item.wallet ? '' : `<div class="stats">${delta(item.stats)}</div><div class="item-note pix">${esc(item.skill)}</div>`;
      return `<div class="row" style="--i:${i}">${itemCard(x.itemId, x.cond, extra)}${btn('gear-wear', '装備', { arg: x.uid, cls: 'small primary', sfx: 'none' })}</div>`;
    })
    .join('');
  return `<div class="modal" id="modal-pick" data-ui><div class="modal-box tall">
    <h2 class="modal-title"><small>${ICON.slot[slot]}</small>${slotOf(slot)}に装備する品</h2>
    <div class="modal-scroll">
    ${worn ? `<div class="row worn">${itemCard(worn.itemId, worn.cond, '<div class="item-note good">装備中</div>')}${btn('gear-off', '外す', { cls: 'small' })}</div>` : ''}
    ${rows || '<p class="note">ここに装備できる品が、棚にありません。</p>'}
    </div>
    <div class="actions one">${btn('gear-back', '戻る', { cls: 'ghost' })}</div>
  </div></div>`;
}
