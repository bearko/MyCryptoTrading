import { catalog as cat } from '../game/catalog';
import * as G from '../game/logic';
import type { GameState } from '../game/state';
import * as N from '../game/night';
import { SLOT_IDS, type SlotId } from '../game/state';
import { craftsLeft } from '../game/craft';
import { craftBoard } from './craft';
import { atHome, ctx, deckWidth, hasMouse, isWide, popsOn, shownGrid, shownTab, ui, type PopId } from './core';
import { esc, num, tone } from './html';
import { ICON } from './icons';

/** Where the picture sits on an odd-shaped footprint: over its heaviest part. */
function imageSpot(cells: readonly (readonly [number, number])[], size: number): string {
  const cell = ctx.cell;
  const cx = cells.reduce((a, c) => a + c[0] + 0.5, 0) / cells.length;
  const cy = cells.reduce((a, c) => a + c[1] + 0.5, 0) / cells.length;
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  const left = Math.min(Math.max(cx * cell - size / 2, 0), w * cell - size);
  const top = Math.min(Math.max(cy * cell - size / 2, 0), h * cell - size);
  return `left:${left}px;top:${top}px`;
}

/** One good on a grid: a tile for each cell of its footprint (outlined along the outer edge), and its picture. */
export function gridItem(x: { uid: number; itemId: number; x: number; y: number; rot: number; fake?: boolean; seen?: boolean; hot?: boolean; bag?: boolean }, cls = ''): string {
  const cell = ctx.cell;
  const item = G.findItem(cat, x.itemId);
  // (a good with an effect of its own wears a mark: it does something when it is double-clicked)
  if (item.effect || x.bag) cls += ' special';
  if (ui.marked?.uids.includes(x.uid)) cls += ' picked';
  const shape = G.shapeOf(cat, x.itemId, x.rot);
  const has = new Set(shape.cells.map(([cx, cy]) => `${cx},${cy}`));
  const cells = shape.cells
    .map(([cx, cy]) => {
      const edge = (dx: number, dy: number, name: string): string => (has.has(`${cx + dx},${cy + dy}`) ? '' : ` ${name}`);
      return `<i class="inv-cell${edge(0, -1, 'et')}${edge(1, 0, 'er')}${edge(0, 1, 'eb')}${edge(-1, 0, 'el')}" data-uid="${x.uid}" style="left:${cx * cell}px;top:${cy * cell}px"></i>`;
    })
    .join('');
  const size = Math.min(shape.w, shape.h) * cell;
  const first = shape.cells.reduce((a, c) => (c[1] < a[1] || (c[1] === a[1] && c[0] < a[0]) ? c : a));
  // (on fine cells the marks shrink with the cell, so they never cover the good)
  const k = Math.min(1, cell / 34);
  const mark = (left: number, top: number): string => `left:${left}px;top:${top}px${k < 1 ? `;scale:${k.toFixed(2)};transform-origin:0 0` : ''}`;
  return `<div class="inv-item ${cls}${k < 1 ? ' fine' : ''}" id="item-${x.uid}" data-item="${x.uid}" style="${tone(item)};left:${x.x * cell}px;top:${x.y * cell}px;width:${shape.w * cell}px;height:${shape.h * cell}px">
      ${cells}<img src="${item.img}" alt="${esc(item.ja)}" draggable="false" style="width:${size}px;height:${size}px;${imageSpot(shape.cells, size)}${x.rot ? `;transform:rotate(${x.rot * 90}deg)` : ''}" />
      ${item.effect || x.bag ? `<b class="inv-fx" style="${mark((first[0] + 1) * cell - 19 * k, (first[1] + 1) * cell - 19 * k)}" aria-label="特別な効果のある品（クリックで使う）">✦</b>` : ''}${x.hot ? `<b class="inv-seen hot" style="${mark(first[0] * cell + (x.seen ? 16 * k : 0), (first[1] + 1) * cell - 15 * k)}">訳</b>` : ''}${x.seen ? `<b class="inv-seen ${x.fake ? 'fake' : 'real'}" style="${mark(first[0] * cell, (first[1] + 1) * cell - 15 * k)}">${x.fake ? '写' : '真'}</b>` : ''}${cls.split(' ').includes('match') ? `<i class="inv-mark" style="${mark((first[0] + 1) * cell - 17 * k, first[1] * cell + 3 * k)}" aria-label="お客さんの希望に合う品"></i>` : ''}</div>`;
}

const SLOT_LABEL: Record<SlotId | 'wallet', string> = { head: '頭', body: '胴体', arm: '腕', leg: '足', special1: '特殊1', special2: '特殊2', wallet: 'ウォレット' };

/**
 * The gear tab: what is worn, as places to drop goods on and to drag them off.
 * A tap on a place opens the list of goods that fit it.
 */
function gearBoard(g: GameState): string {
  const place = (id: SlotId | 'wallet'): string => {
    const itemId = id === 'wallet' ? g.wallet.itemId : g.equip[id]?.itemId;
    const item = itemId ? G.findItem(cat, itemId) : null;
    return `<button class="gslot ${item ? 'full' : ''}" id="gslot-${id}" data-slot="${id}" data-act="gear-slot" data-arg="${id}" ${item ? `style="${tone(item)}"` : ''} aria-label="${SLOT_LABEL[id]}${item ? `：${esc(item.ja)}` : '：なし'}">
      <span class="gslot-face">${item ? `<img src="${item.img}" alt="" draggable="false" />` : `<i>${ICON.slot[id]}</i>`}</span><small>${SLOT_LABEL[id]}</small></button>`;
  };
  const [hp, phy, int, agi] = N.playerStats(g, cat);
  return `<div class="gearboard" id="gearboard">
      <div class="gslots">${SLOT_IDS.map(place).join('')}${place('wallet')}</div>
      <div class="gear-line"><img src="${cat.player.img}" alt="" draggable="false" /><b>HP ${hp}</b><b class="s-phy">PHY ${phy}</b><b class="s-int">INT ${int}</b><b class="s-agi">AGI ${agi}</b></div>
      <p class="hint">${popsOn(g) ? '棚の品をつまんで、ここへ置くと装備。装備中の品は、つまんで棚へ運ぶと外せます。' : '品をつまんで、ここへ置くと装備。装備中の品は、つまんでタブへ運ぶと外せます。'}</p>
    </div>`;
}

/** The room the grid section is given at home, whichever tab is shown (so switching tabs moves nothing). */
let boardMin = 0;

/**
 * The shelf or the wallet: an ink board of cells, with the goods on parameter-coloured tiles.
 * `side` is put beside the board when there is room for it (the night shop's tray).
 */
export function gridSection(g: GameState, side = ''): string {
  const cell = ctx.cell;
  const id = shownGrid(g);
  const tab = shownTab(g);
  const grid = G.gridOf(g, cat, id);
  // while a buyer is at the counter, the goods on the shelf that they would take are marked
  const v = G.currentVisitor(g);
  const want = id === 'shelf' && v && !v.done && v.kind === 'buy' ? v.want : null;
  const items = grid.items
    .map((x) => gridItem(x, id === 'shelf' && ui.counter.includes(x.uid) ? 'away' : want && G.matches(cat, want, x.itemId) ? 'match' : ''))
    .join('');
  const total = grid.cols * grid.rows;
  const used = total - G.freeCells(g, cat, id);
  const wallet = G.findItem(cat, g.wallet.itemId);
  let head: string;
  if (popsOn(g)) {
    // no tabs: the shelf is always here, and the wallet, the gear and the pot open in windows of their own
    head = `<div class="tabs"><span class="tab on solo"><span>棚</span><em>${usedOf(g, 'shelf')}</em></span></div>`;
  } else if (atHome(g)) {
    const tabBtn = (which: G.GridId | 'gear' | 'craft', label: string, count: string): string =>
      `<button class="tab ${tab === which ? 'on' : ''}" id="tab-${which}" data-act="grid" data-arg="${which}" role="tab" aria-selected="${tab === which}"><span>${label}</span><em>${count}</em></button>`;
    const worn = SLOT_IDS.filter((slot) => g.equip[slot]).length;
    head = `<div class="tabs" role="tablist">${tabBtn('shelf', '棚', usedOf(g, 'shelf'))}${tabBtn('wallet', 'ウォレット', g.wallet.items.length ? `${g.wallet.items.length}個` : '空')}${tabBtn('gear', '装備', `${worn}/6`)}${tab === 'craft' ? `<span class="tab on solo-pot" id="tab-craft"><span>合成</span><em>${craftsLeft(g)}回</em></span>` : ''}</div>`;
  } else {
    head = `<div class="tabs"><span class="tab on solo"><span>ウォレット</span><em>${used}/${total}</em></span><span class="inv-count">${esc(wallet.ja)}</span></div>`;
  }
  const board =
    tab === 'gear'
      ? gearBoard(g)
      : tab === 'craft'
        ? craftBoard(g)
        : `<div class="grid" id="grid-${id}" data-grid="${id}" style="--cell:${cell}px;width:${grid.cols * cell}px;height:${grid.rows * cell}px">${items}<div class="preview" id="preview" data-live></div></div>`;
  return `<section class="inv ${tab} ${side ? 'with-side' : ''}" id="inv" data-ui>
    <div class="inv-head">${head}<span class="inv-tip">${hasMouse() ? (atHome(g) ? '✦ の品はクリックで開く（壺・ウォレット）　装備は右の装備棚<br />Q・E：回転（ドラッグ中）　Space：せりふ送り　B：ベル　<b>O：操作の案内</b>' : 'クリック：詳細<br />マウスを乗せる：ひと目') : `${atHome(g) ? 'つまんでタブへ：移動' : 'タップ：詳細'}<br />長押し：メニュー`}</span></div>
    <div class="inv-body">
      <div class="board" ${atHome(g) && boardMin ? `style="min-height:${boardMin}px"` : ''}>${board}</div>
      ${side}
    </div>
    ${atHome(g) ? '<p class="keys" aria-label="キーボードの近道"><span><kbd>Space</kbd>ベル・せりふを飛ばす</span><span><kbd>Enter</kbd>決定（買う・売る・開店）</span><span><kbd>Esc</kbd>閉じる</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>棚・ウォレット・装備</span><span><kbd>R</kbd>つまんだ品を回す</span></p>' : ''}
  </section>`;
}

const POP_JA: Record<PopId, string> = { craft: '合成の壺', wallet: 'ウォレット', gear: '装備', trash: 'ゴミ箱' };

/**
 * The windows that float over the shop (a wide screen, at home): the pot, the wallet's inside, the gear.
 * Each is opened from a thing in the shop, dragged by its bar, left open or shut, and goods are dragged
 * between them and the shelf.
 */
export function popups(g: GameState): string {
  if (!popsOn(g)) return '';
  const cell = ctx.cell;
  const body = (id: PopId): string => {
    if (id === 'craft') return G.hasEffect(g, cat, 'pot') ? craftBoard(g) : '';
    if (id === 'gear') return gearBoard(g);
    if (id === 'trash') {
      const bin = G.gridOf(g, cat, 'trash');
      return `<div class="grid" id="grid-trash" data-grid="trash" style="--cell:${cell}px;width:${bin.cols * cell}px;height:${bin.rows * cell}px">${bin.items.map((x) => gridItem(x)).join('')}<div class="preview" id="preview-trash" data-live></div></div><p class="pop-note">夜、眠るときに回収されます。それまでは取り出せます。</p>`;
    }
    const grid = G.gridOf(g, cat, 'wallet');
    // (the wallet's head: what it holds of each token, and the way into the exchange)
    const purse = `<div class="purse" id="purse"><span class="purse-n"><img src="${cat.icons.gum}" alt="GUM" draggable="false" /><b>${num(g.gum)}</b><small>GUM</small></span><span class="purse-n"><img src="${cat.icons.mchc}" alt="MCHC" draggable="false" /><b>${num(g.mchc)}</b><small>MCHC</small></span>${g.services.includes('dex') ? '<button class="purse-swap" data-act="dex" data-sfx="open" aria-label="DEX を開く（スワップ）">⇅<small>Swap</small></button>' : ''}</div>`;
    return `${purse}<div class="grid" id="grid-wallet" data-grid="wallet" style="--cell:${cell}px;width:${grid.cols * cell}px;height:${grid.rows * cell}px">${grid.items.map((x) => gridItem(x)).join('')}<div class="preview" id="preview-wallet" data-live></div></div>`;
  };
  const note = (id: PopId): string => (id === 'wallet' || id === 'trash' ? usedOf(g, id) : id === 'gear' ? `${SLOT_IDS.filter((slot) => g.equip[slot]).length}/6` : `あと ${craftsLeft(g)} 回`);
  return ui.popOrder
    .filter((id) => ui.pops[id].open)
    .map((id, z) => {
      const inner = body(id);
      if (!inner) return '';
      const p = ui.pops[id];
      return `<section class="pop pop-${id}" id="pop-${id}" data-ui style="left:${p.x}px;top:${p.y}px;z-index:${24 + z}">
        <div class="pop-bar" data-pop="${id}"><b>${POP_JA[id]}</b><em>${note(id)}</em><i class="win-grip" aria-hidden="true"></i>
          <button class="win-btn" data-act="pop-close" data-arg="${id}" data-sfx="close" aria-label="${POP_JA[id]}の窓を閉じる">${ICON.close}</button></div>
        <div class="pop-body">${inner}</div>
      </section>`;
    })
    .join('');
}

function usedOf(g: GameState, id: G.GridId): string {
  const grid = G.gridOf(g, cat, id);
  const total = grid.cols * grid.rows;
  return `${total - G.freeCells(g, cat, id)}/${total}`;
}

/** True when the night shop's tray fits beside the wallet (a wide wallet takes the whole width). */
export const sideFits = (g: GameState): boolean => G.walletSize(g, cat).cols <= 10;

/** How much of the screen's height the shelf takes (a wide screen, at home). */
const SHELF_SHARE = Number(new URLSearchParams(location.search).get('share')) || 0.36;

/** Fits the cell size to the screen. */
export function measure(g: GameState): void {
  const root = ctx.root;
  const w = root.clientWidth || 390;
  const h = root.clientHeight || 780;
  const grid = G.gridOf(g, cat, shownGrid(g));
  // on shorter screens the cells give way to the scene (never under a finger's width while the grid is small)
  const cap = Math.max(44, Math.min(58, h * 0.067));
  if (isWide()) {
    // a wide screen: the grid has a column of its own, as tall as the screen under the bar at the top
    // a wide screen: the shelf is a long counter along the bottom, between the bin and the bed
    const col = deckWidth() - 34;
    const tall = h * (atHome(g) ? 0.27 : 0.36);
    const fit = (cols: number, rows: number): number => Math.floor(Math.max(26, Math.min(col / cols, 60, tall / rows)));
    boardMin = 0;
    if (atHome(g)) {
      const shelf = G.gridOf(g, cat, 'shelf');
      // (the shelf is large and fine-celled: it takes the deck from just under the counter to the foot of the screen,
      // its height decides the cell, and its width follows from that)
      const shelfCell = Math.floor(Math.max(8, Math.min(col / shelf.cols, (h * SHELF_SHARE - 14) / shelf.rows)));
      boardMin = shelf.rows * shelfCell + 6;
      // (the counter's mat is made about as wide as the shelf, so the bell is never far from the goods)
      ctx.root.style.setProperty('--shelf-w', `${shelf.cols * shelfCell}px`);
      ctx.cell = grid === shelf || shownGrid(g) === 'shelf' ? shelfCell : fit(grid.cols, grid.rows);
      return;
    }
    if (g.phase === 'shop') {
      // (the night shop: the wallet has the right-hand column, under the keeper)
      const room = Math.max(440, w * 0.38) - 40;
      const inShop = (cols: number): number => Math.floor(Math.max(22, Math.min(room / cols, 52, (h * 0.4) / grid.rows)));
      ctx.cell = sideFits(g) ? inShop(grid.cols + 3.4) : inShop(grid.cols);
      return;
    }
    ctx.cell = fit(grid.cols, grid.rows);
    return;
  }
  if (atHome(g)) {
    // the shelf sets the room; the wallet tab fits itself into the same room
    const shelf = G.gridOf(g, cat, 'shelf');
    const share = h < 700 ? 0.38 : 0.44;
    const shelfCell = Math.floor(Math.max(10, Math.min((w - 24) / shelf.cols, cap, (h * share - 40) / shelf.rows)));
    boardMin = shelf.rows * shelfCell + 18;
    ctx.cell = grid === shelf || shownGrid(g) === 'shelf' ? shelfCell : Math.floor(Math.max(28, Math.min((w - 24) / grid.cols, cap, (shelf.rows * shelfCell) / grid.rows)));
    return;
  }
  boardMin = 0;
  const beside = g.phase === 'shop' && sideFits(g);
  ctx.cell = Math.floor(Math.max(28, Math.min((w - 24) / grid.cols, beside ? 46 : cap, (h * (beside ? 0.34 : 0.3) - 40) / grid.rows)));
}
