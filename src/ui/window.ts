import { B } from '../game/balance';
import { catalog as cat, COND_JA, RARITY_JA } from '../game/catalog';
import { wantText } from '../game/lines';
import * as G from '../game/logic';
import type { GameState, Visitor } from '../game/state';
import { offerKey } from './counter';
import { ctx, TEMPER_JA, ui } from './core';
import { btn, esc, gum, itemTile, labels, num, pct } from './html';
import { ICON } from './icons';

const SIZE_JA = { s: '小', m: '中', l: '大' } as const;

/** how long the customer thinks an offer over (the suspense beat) */
export const BEAT_MS = 420;

const meter = (label: string): string => `<div class="beat" id="beat"><span>${label}</span><i class="beat-bar"><b style="animation-duration:${BEAT_MS}ms"></b></i></div>`;

/** A chance as a bar: the number, and how safe it is. */
function chanceBar(p: number): string {
  const tone = p >= 0.75 ? 'safe' : p >= 0.45 ? 'even' : 'risky';
  return `<div class="chance ${tone}"><span>成功率</span><i><b style="width:${Math.round(p * 100)}%"></b></i><em>${pct(p)}</em></div>`;
}

function sellerBody(g: GameState, v: Visitor): string {
  const struck = ui.struck && ui.struck.length === v.offers.length ? ui.struck : null;
  const goods = v.offers
    .map((o, i) => {
      const item = G.findItem(cat, o.itemId);
      const on = ui.picked.includes(i);
      const price = struck && struck[i] !== o.ask ? `<s>${num(struck[i])}</s><b class="ask new">${num(o.ask)}</b>` : `<b class="ask">${num(o.ask)}</b>`;
      return `<button class="line ${on ? 'on' : ''}" id="line-${offerKey(v, i)}" data-act="pick-line" data-arg="${i}" data-sfx="none" aria-pressed="${on}">
          ${itemTile(item, 'sm')}
          <span class="line-main"><b class="pix">${esc(item.ja)}</b><small>${RARITY_JA[item.rarity]}・${COND_JA[o.cond]}・相場 ${num(G.itemValue(cat, o.itemId, o.cond))}</small><span class="tags">${labels(item)}</span></span>
          <span class="line-price">${price}</span></button>`;
    })
    .join('');
  const some = G.quoteBuy(g, cat, v, ui.picked);
  const all = G.quoteBuy(g, cat, v, G.allPicks(v));
  const why = (q: G.BuyQuote): string => (q.block === 'shelf' ? '棚に置き場所なし' : q.block === 'gum' ? 'GUM 不足' : '');
  const allNote = all.rate > 0 ? `<em class="off">${Math.round(all.rate * 100)}% 引き</em>` : '';
  let actions: string;
  if (ui.beat) {
    actions = meter('考えている…');
  } else if (ui.haggleOpen && !v.haggled) {
    actions = `<div class="haggle"><p class="haggle-q">いくら値切る？<small>断られると我慢が減る（1人1回）</small></p><div class="actions three">${B.discountTiers
      .map((rate, tier) => {
        const p = G.discountChance(g, v, tier);
        return btn('haggle', `−${Math.round(rate * 100)}%`, { arg: tier, cls: `tier ${p >= 0.75 ? 'safe' : p >= 0.45 ? 'even' : 'risky'}`, sub: `成功 ${pct(p)}`, sfx: 'none' });
      })
      .join('')}</div><div class="actions one">${btn('haggle-close', 'やめる', { cls: 'ghost small' })}</div></div>`;
  } else {
    actions = `<div class="actions two">${btn('buy-picked', `${some.count}個購入する`, { cls: 'primary', sub: some.count ? why(some) || gum(some.price) : '手前に品を置く', disabled: some.count === 0 || !!some.block, sfx: 'none' })}${btn('buy-all', 'まとめ買いする', { cls: 'gold', sub: why(all) || `${gum(all.price)}${all.rate > 0 ? `<em class="off mini">−${Math.round(all.rate * 100)}%</em>` : ''}`, disabled: !!all.block, sfx: 'none' })}</div>
      <div class="actions two">${btn('take-all', 'すべて手前に', { cls: 'small', disabled: ui.picked.length === v.offers.length })}${btn('haggle-open', v.haggled ? '値切り済み' : '値切る', { cls: 'small', disabled: v.haggled })}</div>`;
  }
  return `<div class="win-scroll"><div class="lines">${goods}</div></div>
    <div class="win-foot">
      <div class="sum"><span>手前の ${some.count} 個</span><b class="total">${gum(some.price)}</b></div>
      <div class="sum minor bundle"><span>まとめ買い（全 ${all.count} 個）</span><b>${allNote}${gum(all.price)}</b></div>
      ${actions}
    </div>`;
}

function buyerBody(g: GameState, v: Visitor): string {
  const want = `<div class="want"><span>欲しいもの</span><b>${esc(wantText(v.want))}</b></div>`;
  if (ui.counter.length === 0) {
    return `<div class="win-scroll">${want}
      <div class="sum"><span>予算（残り）</span><b class="total">${gum(v.budget)}</b></div>
      <p class="hint">棚の品をカウンターへドラッグすると、売上を試算します。帰ってもらうときはベルを鳴らします。</p></div>`;
  }
  const q = G.quoteSale(g, cat, v, ui.counter, ui.tier);
  const goods = ui.counter
    .map((uid) => {
      const stock = g.stock.find((x) => x.uid === uid)!;
      const item = G.findItem(cat, stock.itemId);
      const wrong = !G.matches(cat, v.want, stock.itemId);
      return `<div class="line on ${wrong ? 'bad' : ''}" id="sline-${uid}">${itemTile(item, 'sm')}<span class="line-main"><b class="pix">${esc(item.ja)}</b>${wrong ? '<small class="bad">希望と違う</small>' : `<small>相場 ${num(G.itemValue(cat, stock.itemId, stock.cond))}</small>`}</span><span class="line-price"><b class="ask">${num(G.salePrice(cat, stock, ui.tier))}</b></span></div>`;
    })
    .join('');
  const tiers = B.markupTiers
    .map((rate, tier) => `<button class="seg ${tier === ui.tier ? 'on' : ''}" data-act="tier" data-arg="${tier}" aria-pressed="${tier === ui.tier}">${tier === 0 ? '定価' : `+${Math.round(rate * 100)}%`}</button>`)
    .join('');
  const over = q.over > 0;
  const foot = ui.beat
    ? meter('考えている…')
    : `<div class="actions one">${btn('sell', 'この金額で販売する', { cls: 'primary', disabled: !q.matches, sfx: 'none' })}</div>`;
  // the asking total sits right above the budget it is measured against
  return `<div class="win-scroll">${want}<div class="lines">${goods}</div></div>
    <div class="win-foot">
      <div class="segs" role="group" aria-label="値付け">${tiers}</div>
      <div class="sum ${over ? 'bad' : ''}"><span>売上金額</span><b class="total">${gum(q.asked)}</b></div>
      ${over ? `<div class="sum minor bad"><span>予算オーバー</span><b>${num(q.over)} GUM（受け取りは ${num(q.paid)}）</b></div>` : `<div class="sum minor"><span>予算（残り）</span><b>${gum(v.budget)}</b></div>`}
      ${q.matches ? chanceBar(q.chance) : '<p class="note bad">希望と違う品は受け取ってもらえません。</p>'}
      ${foot}
    </div>`;
}

/** The customer window: a slip of paper. Its bar is a handle; it can be made bigger, closed, and reopened. */
export function customerWindow(g: GameState, v: Visitor): string {
  if (!ui.win.open || v.done) return '';
  const hero = cat.heroById.get(v.heroId)!;
  const pips = Array.from({ length: B.temperPatience[v.temper] }, (_, i) => `<i class="${i < v.patience ? 'on' : ''}"></i>`).join('');
  return `<div class="win paper ${ui.win.size === 'l' ? 'big' : ui.win.size === 's' ? 'small mini' : 'small'} kind-${v.kind} ${ui.beat ? 'beating' : ''}" id="win" data-ui style="left:${ui.win.x}px;top:${ui.win.y}px">
    <div class="win-bar"><span class="win-kind">${v.kind === 'sell' ? '買取伝票' : '販売伝票'}</span><i class="win-grip" aria-hidden="true"></i>
      <button class="win-btn win-size" data-act="win-size" aria-label="サイズ変更（いまは${SIZE_JA[ui.win.size]}）">${ICON.size}<b>${SIZE_JA[ui.win.size]}</b></button>
      <button class="win-btn" data-act="win-close" data-sfx="close" aria-label="閉じる">${ICON.close}</button>
    </div>
    <div class="win-who"><b>${esc(hero.ja)}</b><em class="temper t${v.temper}">${TEMPER_JA[v.temper]}</em><span class="pips ink" aria-label="我慢 ${v.patience}">${pips}</span></div>
    <div class="win-body">${v.kind === 'sell' ? sellerBody(g, v) : buyerBody(g, v)}</div>
    <i class="teeth" aria-hidden="true"></i>
  </div>`;
}

/** Keeps the customer window on screen (after a drag, a resize, or a change of its size). */
export function clampWindow(): void {
  const root = ctx.root;
  const win = root.querySelector<HTMLElement>('#win');
  if (!win) return;
  const base = root.getBoundingClientRect();
  const hud = root.querySelector<HTMLElement>('#hud');
  const top = (hud ? hud.getBoundingClientRect().bottom - base.top : 60) + 6;
  if (!ui.win.moved) ui.win.y = top;
  // until the player moves it, the window ends above the near side of the counter, so the drop zone, the goods on
  // it and the bell stay in reach (when the slip is longer than that, its body scrolls and the buttons stay in view)
  const near = root.querySelector<HTMLElement>('#near');
  const edge = near?.getBoundingClientRect().top;
  const room = base.height - ui.win.y - 12;
  win.style.maxHeight = ui.win.moved || edge === undefined ? `${Math.max(200, room)}px` : `${Math.max(150, edge - base.top - ui.win.y - 12)}px`;
  ui.win.x = Math.max(0, Math.min(ui.win.x, root.clientWidth - win.offsetWidth));
  ui.win.y = Math.max(0, Math.min(ui.win.y, root.clientHeight - 48));
  win.style.left = `${ui.win.x}px`;
  win.style.top = `${ui.win.y}px`;
}
