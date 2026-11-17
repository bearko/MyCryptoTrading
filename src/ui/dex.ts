import { B } from '../game/balance';
import { catalog as cat } from '../game/catalog';
import * as G from '../game/logic';
import * as M from '../game/mchc';
import type { GameState, Visitor } from '../game/state';
import { ui } from './core';
import { btn, esc, num, tone } from './html';

/** A token's mark: its coin and its name. */
const token = (id: 'gum' | 'mchc'): string => `<span class="tok tok-${id}"><img src="${cat.icons[id]}" alt="" draggable="false" />${id === 'gum' ? 'GUM' : 'MCHC'}</span>`;

/** MCHC held, as a small coin and a number (for bars and price tags). */
export const mchcTag = (n: number): string => `<span class="mchc-n"><img src="${cat.icons.mchc}" alt="MCHC" draggable="false" />${num(n)}</span>`;

/** Today's price of MCHC, and how it moved since yesterday. */
export function rateLine(g: GameState): string {
  const moved = g.rateWas > 0 ? ((g.rate - g.rateWas) / g.rateWas) * 100 : 0;
  const sign = moved > 0.05 ? 'up' : moved < -0.05 ? 'down' : '';
  return `1 MCHC = <b>${g.rate.toFixed(2)}</b> GUM <em class="rate-move ${sign}">前日比 ${moved >= 0 ? '+' : '−'}${Math.abs(moved).toFixed(1)}%</em>`;
}

/**
 * The swap: what is given above, what is had for it below, and a button — the same panel for the exchange (either
 * way round, for a fee) and for the Tuesday caller (GUM or medals for MCHC, as far as his purse goes).
 */
export function swapPanel(g: GameState): string {
  const via = M.swapVia(g);
  if (!via) return '';
  const from = via === 'satoshi' ? 'gum' : ui.dex.from;
  const to = from === 'gum' ? 'mchc' : 'gum';
  const max = M.swapMax(g, from);
  const amount = Math.min(ui.dex.amount, max);
  const got = M.quoteSwap(g, from, amount);
  const held = (id: 'gum' | 'mchc'): number => (id === 'gum' ? g.gum : g.mchc);
  const chip = (n: number): string => `<button class="swap-chip" data-act="dex-add" data-arg="${n}" data-sfx="tap" ${amount + n > max ? 'disabled' : ''}>+${num(n)}</button>`;
  const medals = M.medalsHeld(g, cat);
  const v = M.facingSatoshi(g);
  const medalRow = medals.length
    ? `<div class="swap-medals"><small>メダルを MCHC に（クリックで交換）</small><div class="swap-medal-row">${medals
        .map((x) => {
          const item = G.findItem(cat, x.itemId);
          const q = M.medalQuote(g, cat, x);
          const no = !!v && v.budget < q;
          return `<button class="swap-medal" id="smedal-${x.uid}" data-act="dex-medal" data-arg="${x.uid}" data-sfx="none" style="${tone(item)}" ${no ? 'disabled' : ''} aria-label="${esc(item.ja)}を ${q} MCHC に交換"><img src="${item.img}" alt="" draggable="false" /><em>${mchcTag(q)}</em></button>`;
        })
        .join('')}</div></div>`
    : '';
  return `<div class="swap" id="swap">
    <div class="swap-box"><small>売る</small><div class="swap-line"><b class="swap-n ${amount === 0 ? 'zero' : ''}">${num(amount)}</b>${token(from)}</div>
      <div class="swap-foot"><span>残高 ${num(held(from))}</span><span class="swap-chips">${chip(10)}${chip(100)}${chip(1000)}<button class="swap-chip" data-act="dex-max" data-sfx="tap" ${max <= 0 ? 'disabled' : ''}>MAX</button><button class="swap-chip" data-act="dex-clear" data-sfx="tap" ${amount === 0 ? 'disabled' : ''}>C</button></span></div></div>
    <button class="swap-flip" data-act="dex-flip" data-sfx="tap" ${via === 'satoshi' ? 'disabled' : ''} aria-label="売る側と受け取る側を入れかえる">↓</button>
    <div class="swap-box"><small>受け取る</small><div class="swap-line"><b class="swap-n ${got === 0 ? 'zero' : ''}">${num(got)}</b>${token(to)}</div>
      <div class="swap-foot"><span>残高 ${num(held(to))}</span></div></div>
    <p class="swap-rate">${rateLine(g)}<span>${via === 'dex' ? `手数料 ${Math.round(B.mchc.dexFee * 100)}%` : `手数料なし・相手の手持ち ${num(v?.budget ?? 0)} MCHC`}</span></p>
    ${btn('dex-go', amount > 0 && got > 0 ? 'スワップ' : '数量を入れる', { cls: 'primary', disabled: amount <= 0 || got <= 0, sfx: 'none' })}
    ${medalRow}
  </div>`;
}

/** The exchange, opened from the wallet. */
export function dexModal(g: GameState): string {
  return `<div class="modal" id="modal-dex" data-ui><div class="modal-box dex-box">
    <h2 class="modal-title"><small>DEX</small>分散型取引所</h2>
    ${swapPanel(g)}
    <div class="actions">${btn('modal-close', '閉じる', { cls: 'ghost' })}</div>
  </div></div>`;
}

/** The Tuesday caller's slip: the swap, and nothing else. */
export function satoshiSlip(g: GameState, v: Visitor, name: string): string {
  return `<div class="win paper small kind-buy rent-win swap-win" id="win" data-ui style="left:${ui.win.x}px;top:${ui.win.y}px">
    <div class="win-bar"><span class="win-kind"><span>交換</span></span><i class="win-grip" aria-hidden="true"></i></div>
    <div class="win-who"><b>${esc(name)}</b><em class="temper t0">MCHC のみ</em></div>
    <div class="win-body">${v.done ? '<p class="hint">では、また火曜日に。</p>' : swapPanel(g)}<p class="hint">ベルを鳴らして、見送ります。</p></div>
    <i class="teeth" aria-hidden="true"></i>
  </div>`;
}
