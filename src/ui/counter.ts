import { catalog as cat } from '../game/catalog';
import * as G from '../game/logic';
import type { GameState, Visitor } from '../game/state';
import { ui } from './core';
import { esc, glyphs, num, tone } from './html';
import { ICON } from './icons';

/** A name for a seller's good that stays the same when the goods before it are bought (indexes shift then). */
export function offerKey(v: Visitor, index: number): string {
  const id = v.offers[index].itemId;
  let nth = 0;
  for (let i = 0; i < index; i++) if (v.offers[i].itemId === id) nth += 1;
  return `${ui.custKey}-${id}-${nth}`;
}

/** A seller's good as it lies on the counter. Tap or drag it between the far and the near side. */
function offerTile(v: Visitor, index: number): string {
  const o = v.offers[index];
  const item = G.findItem(cat, o.itemId);
  return `<div class="offer" id="offer-${offerKey(v, index)}" style="${tone(item)}" data-offer="${index}" role="button" aria-label="${esc(item.ja)} ${o.ask} GUM">
    <img src="${item.img}" alt="" draggable="false" />${glyphs(item)}<span class="ptag">${num(o.ask)}</span></div>`;
}

/** True when the bell is the next thing to do: the customer is done, or the shop has nothing for them. */
export function bellReady(g: GameState, v: Visitor): boolean {
  if (v.done) return true;
  if (v.kind === 'buy') return !g.stock.some((x) => G.matches(cat, v.want, x.itemId));
  return false;
}

/**
 * The far side of the counter (the customer's): what a seller has brought, standing on the ledge in front
 * of them. Empty for a buyer.
 */
export function farTray(v: Visitor | null): { html: string; rows: number } {
  if (!v || v.done || v.kind !== 'sell') return { html: '', rows: 0 };
  const rest = G.allPicks(v).filter((i) => !ui.picked.includes(i));
  const goods = rest.map((i) => offerTile(v, i)).join('') || '<div class="counter-note">すべて<br />手前に</div>';
  return {
    html: `<div class="far take" id="far"><span class="zone-label">お客さんの品</span><div class="zone-goods">${goods}</div></div>`,
    rows: rest.length > 2 ? 2 : 1,
  };
}

/**
 * The near side of the counter (the shop's): what the shop means to buy, or the goods put out for a buyer.
 * The bell sends the customer away and calls the next one.
 */
export function counterBar(g: GameState, v: Visitor | null): string {
  let near: string;
  let nearLabel = '';
  let nearCls = '';
  if (!v) {
    near = '';
  } else if (v.done) {
    near = `<div class="counter-note call">${G.visitorsLeft(g) === 0 ? 'ベルを鳴らして<b>店を閉める</b>' : 'ベルを鳴らして<b>次のお客さん</b>を呼ぶ'}</div>`;
  } else if (v.kind === 'sell') {
    near = ui.picked.map((i) => offerTile(v, i)).join('') || '<div class="counter-note hint-drop">買い取る品を、ここへ<small>タップかドラッグ</small></div>';
    nearLabel = '買い取る品';
    nearCls = 'take';
  } else if (ui.counter.length === 0) {
    near = '<div class="counter-note hint-drop">売る品を、棚からここへ<small>ドラッグして置く</small></div>';
    nearLabel = '売る品';
    nearCls = 'drop';
  } else {
    near = ui.counter
      .map((uid) => {
        const stock = g.stock.find((x) => x.uid === uid)!;
        const item = G.findItem(cat, stock.itemId);
        const wrong = !G.matches(cat, v.want, stock.itemId);
        return `<button class="offer on-counter ${wrong ? 'wrong' : ''}" id="put-${uid}" style="${tone(item)}" data-act="uncounter" data-arg="${uid}" data-sfx="cancel" aria-label="${esc(item.ja)}を棚へ戻す">
          <img src="${item.img}" alt="" draggable="false" />${glyphs(item)}<span class="ptag">${num(G.salePrice(cat, stock, ui.tier))}</span></button>`;
      })
      .join('');
    nearLabel = '売る品（タップで棚へ戻す）';
    nearCls = 'drop';
  }
  // a seller's goods come over in one go: a round button on the counter's edge, between their side and the shop's
  const takeAll =
    v && !v.done && v.kind === 'sell' && ui.picked.length < v.offers.length
      ? `<button class="take-all" id="take-all" data-act="take-all" data-sfx="none" aria-label="お客さんの品を、すべて手前に置く">${ICON.down}</button>`
      : '';
  const ready = !!v && bellReady(g, v);
  const left = G.visitorsLeft(g);
  const queue = !v ? '' : left > 0 ? `<small class="bell-queue" id="queue" aria-label="このあと ${left} 人">あと<b>${left}</b>人</small>` : '<small class="bell-queue last" id="queue">最後の客</small>';
  return `<div class="ledge" aria-hidden="true"></div>
    <div class="counter ${nearCls}" id="near">
      ${takeAll}
      <div class="counter-mat">${nearLabel ? `<span class="zone-label">${nearLabel}</span>` : ''}<div class="zone-goods">${near}</div></div>
      <button class="bell ${ready ? 'ring' : ''}" id="bell" data-act="bell" data-sfx="none" ${v ? '' : 'tabindex="-1"'} aria-label="${!v || v.done ? '次のお客さんを呼ぶ' : 'このお客さんを帰して、次のお客さんを呼ぶ'}">${ICON.bell}${queue}</button>
    </div>`;
}
