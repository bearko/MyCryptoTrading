import { B } from '../game/balance';
import { catalog as cat, COND_JA, RARITY_JA } from '../game/catalog';
import * as G from '../game/logic';
import type { GameState } from '../game/state';
import * as N from '../game/night';
import { ui } from './core';
import { sideFits } from './grid';
import { btn, esc, glyphs, itemTile, labels, num, tone } from './html';

/** The night shop: goods as price-tagged cards, and the tray of what is bought but not in the wallet yet. */
export function shopScreen(g: GameState): { top: string; side: string } {
  const shop = g.shop!;
  const goods = shop.goods
    .map((o, i) => {
      const item = G.findItem(cat, o.itemId);
      const poor = !o.sold && g.gum < o.price;
      const value = G.itemValue(cat, o.itemId, o.cond);
      const off = Math.round((1 - o.price / value) * 100);
      return `<div class="shop-good ${o.sold ? 'sold' : ''}" id="good-${i}" style="--i:${i}">
        ${itemTile(item, 'lg')}
        <div class="good-body">
          <b class="pix good-name">${esc(item.ja)}</b>
          <div class="tags">${labels(item)}</div>
          <div class="tags"><span class="tag rar r${item.rarity}">${RARITY_JA[item.rarity]}</span><span class="tag cond c${o.cond}">${COND_JA[o.cond]}</span><span class="good-val">相場 ${num(value)}</span></div>
        </div>
        ${
          o.sold
            ? '<span class="stamp sold" aria-label="購入済み">SOLD</span>'
            : `<button class="price-tag ${poor ? 'poor' : ''}" data-act="shop-buy" data-arg="${i}" data-sfx="none" ${poor ? 'disabled' : ''} aria-label="${esc(item.ja)}を ${o.price} GUM で買う">
                <small>${poor ? 'GUM 不足' : off > 0 ? `${off}% お得` : '買う'}</small><b>${num(o.price)}</b></button>`
        }
      </div>`;
    })
    .join('');
  // a wide screen: the goods stand on the shop's floor at their real size (a click buys one)
  const floor = shop.goods
    .map((o, i) => {
      const item = G.findItem(cat, o.itemId);
      const [w, h] = item.shape.split('x').map(Number);
      const poor = !o.sold && g.gum < o.price;
      const at = `left:calc(var(--scell) * ${o.x ?? 0});top:calc(var(--scell) * ${o.y ?? 0});width:calc(var(--scell) * ${w});height:calc(var(--scell) * ${h})`;
      if (o.sold) return `<span class="sgood sold" id="sgood-${i}" style="${at}"><b>SOLD</b></span>`;
      return `<button class="sgood ${poor ? 'poor' : ''}" id="sgood-${i}" data-good="${i}" data-act="shop-buy" data-arg="${i}" data-sfx="none" style="${at};${tone(item)}" aria-label="${esc(item.ja)}（${w}×${h} マス）を ${o.price} GUM で買う">
          <img src="${item.img}" alt="" draggable="false" /><em>${num(o.price)}</em></button>`;
    })
    .join('');
  // a box to send home what the wallet cannot carry
  const box = shop.box ?? null;
  const size = box ? B.boxes[box.size] : null;
  const boxed = box && size
    ? `<div class="sbox" id="sbox" style="--bcell:${Math.floor(Math.min(26, 156 / size.cols))}px;width:calc(var(--bcell) * ${size.cols});height:calc(var(--bcell) * ${size.rows})">${box.items
        .map((x) => {
          const item = G.findItem(cat, x.itemId);
          const shape = G.shapeOf(cat, x.itemId, x.rot);
          return `<button class="bgood" id="bgood-${x.uid}" data-boxed="${x.uid}" data-act="unbox" data-arg="${x.uid}" data-sfx="cancel" style="left:calc(var(--bcell) * ${x.x});top:calc(var(--bcell) * ${x.y});width:calc(var(--bcell) * ${shape.w});height:calc(var(--bcell) * ${shape.h});${tone(item)}" aria-label="${esc(item.ja)}を箱から出す"><img src="${item.img}" alt="" draggable="false" /></button>`;
        })
        .join('')}</div>`
    : '';
  const tray = shop.tray
    .map((x, i) => {
      const item = G.findItem(cat, x.itemId);
      return `<button class="offer on-counter" id="tray-${i}-${x.itemId}" style="${tone(item)}" data-act="stow" data-arg="${i}" data-sfx="none" aria-label="${esc(item.ja)}をウォレットに入れる"><img src="${item.img}" alt="" draggable="false" />${glyphs(item)}</button>`;
    })
    .join('');
  // the keeper of the shop (a wide screen: he stands on the right, above the wallet)
  const keeper = cat.heroById.get(B.dealerHero);
  const left = G.freeCells(g, cat, 'wallet');
  const line = box && box.items.length > 0 ? '箱の品は、明日の閉店まぎわに届けるよ。' : shop.tray.length > 0 ? 'ウォレットに入らない品は、持ち帰れないよ。箱で送ることもできる。' : left === 0 ? 'ウォレットがいっぱいだね。大きいのに替えれば、もっと運べる。' : 'いらっしゃい。持ち帰れるのは、ウォレットに入るぶんだけだ。';
  const stage = `<main class="shop" id="shop" data-ui>
      <header class="shop-sign"><b>NIGHT SHOP</b><span>夜のショップ</span></header>
      <p class="shop-hint">支払いは電子決済。手持ちの GUM をすべて使えます。買った品は、<b>ウォレットに入れた分だけ</b>持ち帰れます。</p>
      <div class="shop-list">${goods}</div>
      <div class="shop-floor-wrap"><div class="shop-floor" id="shop-floor" style="--n:${B.shopFloor}">${floor}</div></div>
    </main>
    <aside class="keeper" id="keeper" data-ui>
      <p class="keeper-say" id="keeper-say">${line}</p>
      ${keeper ? `<img class="keeper-img" src="${keeper.img}" alt="" draggable="false" />` : ''}
      <b class="keeper-name"><small>店主</small>${esc(keeper?.ja ?? '')}</b>
    </aside>`;
  const trayHtml = `<div class="tray ${shop.tray.length ? 'has' : ''}" id="tray" ${sideFits(g) ? '' : 'data-ui'}>
      <div class="counter-mat"><span class="zone-label">${shop.tray.length ? '未収納（タップで入れる）' : '買った品'}</span>
        <div class="zone-goods">${tray || '<div class="counter-note">入りきらない品が<br />ここに並びます</div>'}</div></div>
      ${box ? `<div class="sbox-wrap"><span class="zone-label">発送の箱（${size!.ja}）</span>${boxed}
        <div class="stow-to" role="group" aria-label="買った品の入れ先"><button class="${ui.stowTo === 'wallet' ? 'on' : ''}" data-act="stow-to" data-arg="wallet" aria-pressed="${ui.stowTo === 'wallet'}">ウォレットへ</button><button class="${ui.stowTo === 'box' ? 'on' : ''}" data-act="stow-to" data-arg="box" aria-pressed="${ui.stowTo === 'box'}">箱へ</button></div></div>` : ''}
      ${btn('ship', box ? '箱を大きくする' : '発送サービス', { cls: 'ghost', sfx: 'open', disabled: !!box && box.size >= B.boxes.length - 1 })}
      ${btn('shop-leave', '帰宅する', { cls: 'primary', sfx: 'none' })}
    </div>`;
  // the tray stands beside the wallet when there is room; under the shop otherwise
  return sideFits(g) ? { top: stage, side: trayHtml } : { top: stage + trayHtml, side: '' };
}

const SHIP_NOTES = `<ul class="ship-notes">
      <li>箱代と送料がかかります（箱を大きくするときは、差額だけ）。</li>
      <li>箱に入れた品は、<b>翌日の閉店まぎわ</b>に店主が届けに来ます。店に並べられるのは、その次の日からです。</li>
      <li>届いた品は、電話の横の荷物から棚に出します。</li>
      <li>箱は 1 晩に 1 つ。箱に入れずに残した品は、持ち帰れません。</li>
    </ul>`;

/** The sending service: a box to buy, in three sizes. */
export function shipModal(g: GameState): string {
  const now = g.shop?.box ?? null;
  const tiles = B.boxes
    .map((b, i) => {
      const cost = N.boxCost(g, i);
      const had = !!now && i <= now.size;
      return `<button class="ship-box ${had ? 'had' : ''} ${!had && g.gum < cost ? 'poor' : ''}" data-act="box-buy" data-arg="${i}" data-sfx="none" ${had || g.gum < cost ? 'disabled' : ''} aria-label="${b.ja}の箱（${b.cols}×${b.rows} マス）">
        <i class="ship-pic" style="--c:${b.cols};--r:${b.rows}"></i><b>${b.ja}</b><span>${b.cols}×${b.rows} マス</span>
        <em>${had ? (i === now!.size ? '購入済み' : '—') : `${num(cost)} GUM`}</em>${had ? '' : `<small>箱 ${b.price}＋送料 ${b.post}${now ? '（差額）' : ''}</small>`}</button>`;
    })
    .join('');
  return `<div class="modal" id="modal-ship" data-ui><div class="modal-box">
    <button class="help-dot ${ui.shipHelp ? 'on' : ''}" id="ship-help-btn" data-act="ship-help" aria-label="発送サービスの注意事項" aria-pressed="${ui.shipHelp}">?</button>
    <h2 class="modal-title"><small>DELIVERY</small>発送サービス</h2>
    <p class="modal-text">ウォレットに入らない品を、箱に詰めて店へ送ります。</p>
    <div class="ship-row">${tiles}</div>
    ${ui.shipHelp ? SHIP_NOTES : ''}
    <div class="actions">${btn('modal-close', '閉じる', { cls: 'ghost' })}</div>
  </div></div>`;
}

/** Leaving with bought goods not in the wallet: they would be thrown away. */
export function leaveShopModal(): string {
  return `<div class="modal" id="modal-leave" data-ui><div class="modal-box alert">
    <button class="help-dot ${ui.shipHelp ? 'on' : ''}" id="leave-help-btn" data-act="ship-help" aria-label="発送サービスの注意事項" aria-pressed="${ui.shipHelp}">?</button>
    <span class="alert-mark" aria-hidden="true">!</span>
    <p class="modal-text warn-text">このまま帰宅すると、ウォレットに入っていない購入済みのエクステンションは処分されます。ウォレットに入れる余裕がない場合は、有償の発送サービスをご利用ください。</p>
    ${ui.shipHelp ? SHIP_NOTES : ''}
    <div class="actions">${btn('ship', '発送サービスを使う', { cls: 'primary', sfx: 'open' })}</div>
    <div class="actions two">${btn('modal-close', 'キャンセル', { cls: 'ghost' })}${btn('shop-leave-ok', '処分して帰宅する', { cls: 'danger', sfx: 'none' })}</div>
  </div></div>`;
}
