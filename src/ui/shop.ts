import { catalog as cat, COND_JA, RARITY_JA } from '../game/catalog';
import * as G from '../game/logic';
import type { GameState } from '../game/state';
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
  const tray = shop.tray
    .map((x, i) => {
      const item = G.findItem(cat, x.itemId);
      return `<button class="offer on-counter" id="tray-${i}-${x.itemId}" style="${tone(item)}" data-act="stow" data-arg="${i}" data-sfx="none" aria-label="${esc(item.ja)}をウォレットに入れる"><img src="${item.img}" alt="" draggable="false" />${glyphs(item)}</button>`;
    })
    .join('');
  const stage = `<main class="shop" id="shop" data-ui>
      <header class="shop-sign"><b>NIGHT SHOP</b><span>夜のショップ</span></header>
      <p class="shop-hint">支払いは電子決済。手持ちの GUM をすべて使えます。買った品は、<b>ウォレットに入れた分だけ</b>持ち帰れます。</p>
      <div class="shop-list">${goods}</div>
    </main>`;
  const trayHtml = `<div class="tray ${shop.tray.length ? 'has' : ''}" id="tray" ${sideFits(g) ? '' : 'data-ui'}>
      <div class="counter-mat"><span class="zone-label">${shop.tray.length ? '未収納（タップで入れる）' : '買った品'}</span>
        <div class="zone-goods">${tray || '<div class="counter-note">入りきらない品が<br />ここに並びます</div>'}</div></div>
      ${btn('shop-leave', '帰宅する', { cls: 'primary', sfx: 'none' })}
    </div>`;
  // the tray stands beside the wallet when there is room; under the shop otherwise
  return sideFits(g) ? { top: stage, side: trayHtml } : { top: stage + trayHtml, side: '' };
}
