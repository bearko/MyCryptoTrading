import { B, WEEKDAYS } from '../game/balance';
import morphdom from 'morphdom';
import { catalog as cat, COND_JA, PARAM_JA, RARITY_JA, SLOT_JA } from '../game/catalog';
import { wantText } from '../game/lines';
import * as G from '../game/logic';
import * as N from '../game/night';
import * as Q from '../game/quest';
import * as store from '../game/save';
import type { GameState, SlotId, Visitor } from '../game/state';
import { btn, esc, gum, itemCard, itemDetail, labels, num, pct, tone } from './html';
import { questAct, questEffects, questScreen } from './quest';

type Modal = 'none' | 'help' | 'inspect' | 'menu' | 'over' | 'dest' | 'leave' | 'gear' | 'pick';

/** Screen state that is not part of the saved game. */
interface Ui {
  screen: 'title' | 'game';
  modal: Modal;
  /** the good a detail or menu window is about */
  sel: { grid: G.GridId; uid: number } | null;
  confirmDispose: boolean;
  confirmReset: boolean;
  haggleOpen: boolean;
  /** goods put on the counter for the customer at the counter (uids of stock) */
  counter: number[];
  /** a seller's goods pulled to the near side of the counter (indexes into the customer's offers) */
  picked: number[];
  /** markup tier chosen for the sale */
  tier: number;
  /** the customer window: where it is, its size, and whether it is open */
  win: { x: number; y: number; big: boolean; open: boolean; moved: boolean };
  /** a short note (money moved, no room …) */
  flash: { text: string; tone: 'good' | 'bad' | 'info' } | null;
  /** changes whenever a new customer steps up */
  enterKey: number;
  /** at home: which grid is shown under the counter */
  gridView: G.GridId;
  /** the gear window: the slot being filled ('wallet' for the wallet), and whether it leads to the quest */
  gearSlot: SlotId | 'wallet' | null;
  departing: boolean;
}

let s: GameState | null = null;
const ui: Ui = {
  screen: 'title',
  modal: 'none',
  sel: null,
  confirmDispose: false,
  confirmReset: false,
  haggleOpen: false,
  counter: [],
  picked: [],
  tier: 0,
  win: { x: 6, y: 60, big: false, open: true, moved: false },
  flash: null,
  enterKey: 0,
  gridView: 'shelf',
  gearSlot: null,
  departing: false,
};
let root: HTMLElement;
/** the customer whose walk-in / walk-out has already been played */
let enteredKey = -1;
let exitedKey = -1;
/** the phase drawn last time (the shutter moves when it changes) */
let shownPhase = '';
/** size of one grid cell in px (fits the screen) */
let cell = 48;
/** the pending walk-out before the next customer comes in (after the bell) */
let nextTimer = 0;

const TEMPER_JA = ['気さく', 'ふつう', '頑固'];
const ICON_SIZE =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="1.5" y="7.5" width="7" height="7" rx="1.5" fill="currentColor"/></svg>';
const ICON_BELL =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 3.2a1.6 1.6 0 0 1 1.6 1.6v.5a6 6 0 0 1 4.4 5.8v3.4l1.7 2.6a.9.9 0 0 1-.8 1.4H5.1a.9.9 0 0 1-.8-1.4L6 14.5v-3.4a6 6 0 0 1 4.4-5.8v-.5A1.6 1.6 0 0 1 12 3.2z" fill="currentColor"/><path d="M9.6 19.800h4.8a2.400 2.400 0 0 1-4.8 0z" fill="currentColor"/></svg>';
const ICON_CLOSE =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** At home the shelf or the wallet is shown; out at night, always the wallet. */
const shownGrid = (g: GameState): G.GridId => (g.phase === 'shop' || g.phase === 'quest' ? 'wallet' : ui.gridView);
const atHome = (g: GameState): boolean => g.phase === 'morning' || g.phase === 'open' || g.phase === 'evening';

// ---------------------------------------------------------------- top bar

function hud(g: GameState): string {
  const weekday = WEEKDAYS[(g.day - 1) % 7];
  let rent: string;
  if (g.owned) rent = '<b>自分の店</b>';
  else {
    const left = G.daysToRent(g);
    rent = `<span class="${left <= 1 ? 'warn' : ''}">家賃 ${left === 0 ? '今夜' : `あと${left}日`}</span> ${gum(g.rent)}`;
  }
  return `<header class="hud">
    <div class="hud-day">${g.day}日目<small>（${weekday}）</small></div>
    <div class="hud-gum">${gum(g.gum)}</div>
    <div class="hud-rep" title="評判">★ ${g.rep}</div>
    <div class="hud-rent">${rent}</div>
    <button class="hud-help" data-act="help" aria-label="遊びかた">?</button>
  </header>`;
}

// ---------------------------------------------------------------- the shop front: scene, counter, shutter

/** The view over the counter: the customer walks in from the left and leaves to the right. */
function scene(g: GameState, v: Visitor | null, opening: boolean): string {
  let inner = '';
  if (v) {
    const hero = cat.heroById.get(v.heroId)!;
    let walk = '';
    if (v.done) walk = exitedKey === ui.enterKey ? 'gone' : 'exit';
    else if (enteredKey !== ui.enterKey) walk = opening ? 'enter late' : 'enter';
    inner = `<div class="line-left">残り ${G.visitorsLeft(g)} 人</div>
      <div class="walker ${walk} mood-${v.mood}" data-act="hero"><img class="hero" src="${hero.img}" alt="${esc(hero.ja)}" draggable="false" /></div>
      <div class="bubble ${walk === 'gone' ? 'hide' : ''}">${esc(v.line)}</div>`;
  }
  return `<section class="scene" style="background-image:url('${cat.backdrop}')">${inner}</section>`;
}

/** A seller's good as it lies on the counter. Tap or drag it between the far and the near side. */
function offerTile(v: Visitor, index: number): string {
  const o = v.offers[index];
  const item = G.findItem(cat, o.itemId);
  return `<div class="offer" style="${tone(item)}" data-offer="${index}" role="button" aria-label="${esc(item.ja)}"><img src="${item.img}" alt="" draggable="false" /><span>${num(o.ask)}</span></div>`;
}

/**
 * The counter has two sides. Far side (the customer's): what a seller has brought.
 * Near side (the shop's): what the shop means to buy, or the goods put out for a buyer. The bell sends
 * the customer away and calls the next one.
 */
function counterBar(g: GameState, v: Visitor): string {
  let far = '';
  let near: string;
  let nearCls = '';
  if (v.done) {
    near = `<div class="counter-note">${G.visitorsLeft(g) === 0 ? 'ベルを鳴らして店を閉める' : 'ベルを鳴らして次のお客さんを呼ぶ'}</div>`;
  } else if (v.kind === 'sell') {
    const rest = G.allPicks(v).filter((i) => !ui.picked.includes(i));
    far = rest.map((i) => offerTile(v, i)).join('') || '<div class="counter-note">すべて手前にあります</div>';
    near = ui.picked.map((i) => offerTile(v, i)).join('') || '<div class="counter-note hint-drop">買い取る品を、手前へ（タップかドラッグ）</div>';
    nearCls = 'take';
  } else if (ui.counter.length === 0) {
    near = '<div class="counter-note hint-drop">売る品を、棚からここへドラッグ</div>';
    nearCls = 'drop';
  } else {
    near =
      ui.counter
        .map((uid) => {
          const item = G.findItem(cat, g.stock.find((x) => x.uid === uid)!.itemId);
          return `<button class="on-counter" style="${tone(item)}" data-act="uncounter" data-arg="${uid}" aria-label="${esc(item.ja)}を棚へ戻す"><img src="${item.img}" alt="" /></button>`;
        })
        .join('') + '<div class="counter-note">タップで棚へ戻す</div>';
    nearCls = 'drop';
  }
  return `<div class="counter-far">${far}</div>
    <div class="counter ${nearCls}"><div class="counter-goods">${near}</div>
      <button class="bell ${v.done ? 'ring' : ''}" data-act="bell" aria-label="${v.done ? '次のお客さんを呼ぶ' : 'このお客さんを帰して、次のお客さんを呼ぶ'}">${ICON_BELL}</button>
    </div>`;
}

function eventText(g: GameState): string {
  switch (g.event.id) {
    case 'demand':
      return `${PARAM_JA[g.event.param ?? 'phy']}の品を求める人が多い日。予算も多めです。`;
    case 'caravan':
      return `行商の一団が街に来ています。お客さんが ${B.caravanVisitors} 人増えます。`;
    case 'rain':
      return '雨。客足が鈍く、お客さんが 1 人減ります。';
    case 'bargain':
      return '旅立ち前の人が多く、売りに来る人の言い値が安めです。';
    default:
      return '特になし。いつもどおりの一日です。';
  }
}

/** On waking: today's event, and what last night cost. */
function morningCard(g: GameState): string {
  return `<div class="wake">
    <h2>${g.day}日目の朝</h2>
    <div class="win-row"><span>本日のイベント</span></div>
    <p class="event">${eventText(g)}</p>
    ${g.lateOpen ? `<p class="late">夜に出歩いたため開店が遅れ、お客さんを ${B.lateOpenLoss} 人取り逃しました。</p>` : ''}
    ${g.nightNote ? `<p class="note">${esc(g.nightNote)}</p>` : ''}
    <p class="hint">今日のお客さんは ${G.visitorsExpected(g)} 人の見込み。</p>
    <div class="actions one">${btn('open', '店を開ける', { cls: 'primary big' })}</div>
  </div>`;
}

/** After closing: the day's figures, the shop's business, and the door out into the night. */
function nightCard(g: GameState): string {
  const t = g.today;
  const net = t.revenue - t.spend;
  const cost = G.shelfCost(g);
  let rent = '';
  if (G.isRentDay(g)) {
    const short = g.gum < g.rent;
    rent = `<p class="note ${short ? 'bad' : ''}">今夜は家賃の支払日（${gum(g.rent)}）。${
      short ? (g.graceLeft > 0 ? '足りなければ一度だけ猶予が使えます。' : '足りないと店を失います。品を処分して工面を。') : ''
    }</p>`;
  }
  const deed = g.owned ? '' : btn('deed', '権利書を買う', { cls: 'small gold', sub: gum(B.deedPrice), disabled: g.gum < B.deedPrice });
  const shelfBtn = cost === null ? '' : btn('shelf', '棚を広げる', { cls: 'small', sub: gum(cost), disabled: g.gum < cost });
  return `<button class="door ${g.wentOut ? 'used' : ''}" data-act="door" aria-label="外へ出る"><i></i><span>${g.wentOut ? '外出済み' : '外へ'}</span></button>
    <div class="night-card">
      <h2>${g.day}日目の締め</h2>
      <table class="sum">
        <tr><td>売上</td><td>${gum(t.revenue)}</td></tr>
        <tr><td>仕入れ</td><td>${gum(t.spend)}</td></tr>
        <tr class="${net >= 0 ? 'good' : 'bad'}"><td>収支</td><td>${net >= 0 ? '+' : '−'}${gum(Math.abs(net))}</td></tr>
      </table>
      ${rent}
      <div class="actions">${deed}${shelfBtn}${btn('gear', '装備', { cls: 'small' })}</div>
      <p class="hint">${g.wentOut ? '今夜はもう外出しました。' : '左のドアから外出できます（一晩に一か所。翌朝は開店が遅れます）。'}</p>
      <div class="actions one">${btn('endday', '眠って翌日へ', { cls: 'primary' })}</div>
    </div>`;
}

function front(g: GameState, v: Visitor | null): string {
  const prev = shownPhase;
  if (g.phase === 'open' && v) {
    const opening = prev === 'morning';
    return `<div class="front">${scene(g, v, opening)}${counterBar(g, v)}<div class="shutter ${opening ? 'opening' : 'up'}"></div></div>`;
  }
  const closing = g.phase === 'evening' && prev === 'open';
  const over = g.phase === 'morning' ? morningCard(g) : `<div class="night ${closing ? 'delay' : ''}">${nightCard(g)}</div>`;
  return `<div class="front">${scene(g, null, false)}<div class="shutter ${closing ? 'closing' : 'closed'}"></div>${over}</div>`;
}

// ---------------------------------------------------------------- grids (the shelf and the wallet)

/** Where the picture sits on an odd-shaped footprint: over its heaviest part. */
function imageSpot(cells: readonly (readonly [number, number])[], size: number): string {
  const cx = cells.reduce((a, c) => a + c[0] + 0.5, 0) / cells.length;
  const cy = cells.reduce((a, c) => a + c[1] + 0.5, 0) / cells.length;
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  const left = Math.min(Math.max(cx * cell - size / 2, 0), w * cell - size);
  const top = Math.min(Math.max(cy * cell - size / 2, 0), h * cell - size);
  return `left:${left}px;top:${top}px`;
}

function gridSection(g: GameState): string {
  const id = shownGrid(g);
  const grid = G.gridOf(g, cat, id);
  const items = grid.items
    .map((x) => {
      const item = G.findItem(cat, x.itemId);
      const shape = G.shapeOf(cat, x.itemId, x.rot);
      const away = id === 'shelf' && ui.counter.includes(x.uid);
      const cells = shape.cells.map(([cx, cy]) => `<i class="inv-cell" data-uid="${x.uid}" style="left:${cx * cell}px;top:${cy * cell}px"></i>`).join('');
      const size = Math.min(shape.w, shape.h) * cell;
      return `<div class="inv-item ${away ? 'away' : ''}" data-item="${x.uid}" style="${tone(item)};left:${x.x * cell}px;top:${x.y * cell}px;width:${shape.w * cell}px;height:${shape.h * cell}px">
        ${cells}<img src="${item.img}" alt="${esc(item.ja)}" draggable="false" style="width:${size}px;height:${size}px;${imageSpot(shape.cells, size)}${x.rot ? ';transform:rotate(90deg)' : ''}" /></div>`;
    })
    .join('');
  const total = grid.cols * grid.rows;
  const used = total - G.freeCells(g, cat, id);
  const wallet = G.findItem(cat, g.wallet.itemId);
  let head: string;
  if (atHome(g)) {
    const tab = (which: G.GridId, label: string): string => `<button class="tab ${id === which ? 'on' : ''}" data-act="grid" data-arg="${which}">${label}</button>`;
    head = `${tab('shelf', `棚 ${id === 'shelf' ? `${used}/${total}` : ''}`)}${tab('wallet', `ウォレット ${g.wallet.items.length ? `(${g.wallet.items.length})` : ''}`)}`;
  } else {
    head = `<b>ウォレット</b><span class="inv-count">${used} / ${total} マス（${esc(wallet.ja)}）</span>`;
  }
  return `<section class="inv">
    <div class="inv-head">${head}<span class="inv-tip">${atHome(g) ? 'タップ：詳細　長押し：メニュー' : 'タップ：詳細'}</span></div>
    <div class="grid" data-grid="${id}" style="--cell:${cell}px;width:${grid.cols * cell}px;height:${grid.rows * cell}px">${items}<div class="preview"></div></div>
  </section>`;
}

// ---------------------------------------------------------------- the customer window

function windowBody(g: GameState, v: Visitor): string {
  const pips = '●'.repeat(Math.max(0, v.patience)) + '○'.repeat(Math.max(0, B.temperPatience[v.temper] - v.patience));
  const who = `<div class="win-row"><span>気質</span><b>${TEMPER_JA[v.temper]}　<span class="pips">我慢 ${pips}</span></b></div>`;

  if (v.kind === 'sell') {
    const goods = v.offers
      .map((o, i) => {
        const item = G.findItem(cat, o.itemId);
        return `<div class="offer-line ${ui.picked.includes(i) ? 'on' : ''}"><img src="${item.img}" alt="" />
          <div><b>${esc(item.ja)}</b><small>${RARITY_JA[item.rarity]}・${COND_JA[o.cond]}・相場 ${num(G.itemValue(cat, o.itemId, o.cond))}</small><div class="tags">${labels(item)}</div></div>
          <b class="ask">${num(o.ask)}</b></div>`;
      })
      .join('');
    const some = G.quoteBuy(g, cat, v, ui.picked);
    const all = G.quoteBuy(g, cat, v, G.allPicks(v));
    const why = (q: G.BuyQuote): string => (q.block === 'shelf' ? '棚に置き場所なし' : q.block === 'gum' ? 'GUM 不足' : '');
    const allNote = all.rate > 0 ? `<em class="off">${Math.round(all.rate * 100)}% 引き</em>` : '';
    let actions: string;
    if (ui.haggleOpen && !v.haggled) {
      actions =
        B.discountTiers.map((rate, tier) => btn('haggle', `${Math.round(rate * 100)}% 引き`, { arg: tier, sub: `成功 ${pct(G.discountChance(g, v, tier))}` })).join('') +
        btn('haggle-close', 'やめる', { cls: 'ghost' });
    } else {
      actions = [
        btn('buy-picked', `${some.count}個購入する`, { cls: 'primary', sub: some.count ? why(some) || gum(some.price) : '手前に品を置く', disabled: some.count === 0 || !!some.block }),
        btn('buy-all', 'まとめ買いする', { cls: 'gold', sub: why(all) || gum(all.price), disabled: !!all.block }),
        btn('take-all', 'すべて手前に', { disabled: ui.picked.length === v.offers.length }),
        btn('haggle-open', v.haggled ? '値切り済み' : '値切る', { disabled: v.haggled }),
      ].join('');
    }
    return `${who}
      <div class="offer-list">${goods}</div>
      <div class="win-row total"><span>手前の ${some.count} 個</span><b>${gum(some.price)}</b></div>
      <div class="win-row"><span>まとめ買い（全 ${all.count} 個）</span><b>${allNote}${gum(all.price)}</b></div>
      <div class="actions">${actions}</div>`;
  }

  const head = `<div class="win-row"><span>欲しいもの</span><b>${esc(wantText(v.want))}</b></div>
    <div class="win-row"><span>予算（残り）</span><b>${gum(v.budget)}</b></div>${who}`;
  if (ui.counter.length === 0) {
    return `${head}<p class="hint">棚の品をカウンターへドラッグすると、売上を試算します。帰ってもらうときはベルを鳴らします。</p>`;
  }
  const q = G.quoteSale(g, cat, v, ui.counter, ui.tier);
  const goods = ui.counter
    .map((uid) => {
      const stock = g.stock.find((x) => x.uid === uid)!;
      const item = G.findItem(cat, stock.itemId);
      const wrong = !G.matches(cat, v.want, stock.itemId);
      return `<div class="sale-line ${wrong ? 'bad' : ''}"><img src="${item.img}" alt="" /><span>${esc(item.ja)}${wrong ? '（希望と違う）' : ''}</span><b>${num(G.salePrice(cat, stock, ui.tier))}</b></div>`;
    })
    .join('');
  const tiers = B.markupTiers
    .map((rate, tier) => `<button class="seg ${tier === ui.tier ? 'on' : ''}" data-act="tier" data-arg="${tier}">${tier === 0 ? '定価' : `+${Math.round(rate * 100)}%`}</button>`)
    .join('');
  const over = q.over > 0;
  return `${head}
    <div class="sale">
      ${goods}
      <div class="segs">${tiers}</div>
      <div class="win-row total ${over ? 'bad' : ''}"><span>売上金額</span><b>${gum(q.asked)}</b></div>
      ${over ? `<div class="win-row bad"><span>予算オーバー</span><b>${num(q.over)} GUM（受け取りは ${num(q.paid)}）</b></div>` : ''}
      ${q.matches ? `<div class="win-row"><span>成功率</span><b>${pct(q.chance)}</b></div>` : '<p class="note bad">希望と違う品は受け取ってもらえません。</p>'}
    </div>
    <div class="actions one">${btn('sell', 'この金額で販売する', { cls: 'primary', disabled: !q.matches })}</div>`;
}

function customerWindow(g: GameState, v: Visitor): string {
  if (!ui.win.open || v.done) return '';
  const hero = cat.heroById.get(v.heroId)!;
  return `<div class="win ${ui.win.big ? 'big' : 'small'}" style="left:${ui.win.x}px;top:${ui.win.y}px">
    <div class="win-bar"><b>${esc(hero.ja)}</b><span>${v.kind === 'sell' ? '売りたい' : '買いたい'}</span>
      <button class="win-btn" data-act="win-size" aria-label="サイズ変更">${ICON_SIZE}</button>
      <button class="win-btn" data-act="win-close" aria-label="閉じる">${ICON_CLOSE}</button>
    </div>
    <div class="win-body">${windowBody(g, v)}</div>
  </div>`;
}

// ---------------------------------------------------------------- the night shop

function shopScreen(g: GameState): string {
  const shop = g.shop!;
  const goods = shop.goods
    .map((o, i) => `<div class="row">${itemCard(o.itemId, o.cond)}${btn('shop-buy', o.sold ? '購入済み' : `買う ${gum(o.price)}`, { arg: i, cls: 'small', disabled: o.sold || g.gum < o.price })}</div>`)
    .join('');
  const tray = shop.tray
    .map((x, i) => {
      const item = G.findItem(cat, x.itemId);
      return `<button class="on-counter" style="${tone(item)}" data-act="stow" data-arg="${i}" aria-label="${esc(item.ja)}をウォレットに入れる"><img src="${item.img}" alt="" /></button>`;
    })
    .join('');
  return `<main class="body"><section class="panel">
      <h2>夜のショップ</h2>
      <p class="hint">支払いは電子決済。手持ちの GUM をすべて使えます。買った品は、ウォレットに入れた分だけ持ち帰れます。</p>
      ${goods}
    </section></main>
    <div class="tray ${shop.tray.length ? 'has' : ''}"><div class="counter-goods">${tray || '<div class="counter-note">買った品がここに並びます</div>'}</div>
      ${shop.tray.length ? '<div class="counter-note">タップでウォレットへ</div>' : ''}${btn('shop-leave', '帰宅する', { cls: 'small primary' })}</div>`;
}

function ending(g: GameState): string {
  if (g.phase === 'won') {
    return `<section class="panel end">
      <h2>店を買い取った！</h2>
      <p>${g.ownedDay}日目で権利書を手に入れました。もう家賃に追われることはありません。</p>
      <table class="sum"><tr><td>売った品</td><td>${g.totals.sold}</td></tr><tr><td>買った品</td><td>${g.totals.bought}</td></tr><tr><td>最高の売上</td><td>${gum(g.totals.bestSale)}</td></tr><tr><td>ダンジョンの最深到達</td><td>地下 ${g.totals.deepest} 階</td></tr></table>
      <div class="actions">${btn('continue', 'このまま店を続ける', { cls: 'primary big' })}${btn('restart', '最初からやり直す', { cls: 'ghost' })}</div>
    </section>`;
  }
  return `<section class="panel end">
    <h2>店を失った…</h2>
    <p>${g.day}日目、家賃を払えませんでした。相場より安く買い、欲しがる人に高く売るのが商いの基本です。</p>
    <div class="actions">${btn('restart', 'もう一度はじめる', { cls: 'primary big' })}</div>
  </section>`;
}

// ---------------------------------------------------------------- windows over the game

const selected = (g: GameState) => (ui.sel ? (G.gridOf(g, cat, ui.sel.grid).items.find((x) => x.uid === ui.sel!.uid) ?? null) : null);

/** A tap on a good: everything about it, and what can be done with it here. */
function inspectModal(g: GameState): string {
  const x = selected(g);
  if (!x || !ui.sel) return '';
  const item = G.findItem(cat, x.itemId);
  const price = G.disposePrice(cat, x);
  let action: string;
  if (g.phase === 'shop') action = btn('unstow', 'ウォレットから出す');
  else if (g.phase === 'quest') action = btn('drop', ui.confirmDispose ? '本当に捨てる' : '捨てる', { cls: ui.confirmDispose ? 'danger' : '' });
  else if (ui.sel.grid === 'wallet') action = btn('unload', '棚へ移す');
  else action = btn('dispose', ui.confirmDispose ? `本当に処分 ${gum(price)}` : `処分する ${gum(price)}`, { cls: ui.confirmDispose ? 'danger' : '' });
  return `<div class="modal"><div class="modal-box tall">
    ${itemCard(x.itemId, x.cond, `<div class="item-note">仕入れ値 ${num(x.paid)}　定価 ${num(G.salePrice(cat, x, 0))}</div>`)}
    ${itemDetail(item)}
    <div class="actions">${action}${btn('modal-close', '閉じる', { cls: 'primary' })}</div>
  </div></div>`;
}

/** A long press on a good: turn it, wear it, or nothing. */
function menuModal(g: GameState): string {
  const x = selected(g);
  if (!x || !ui.sel) return '';
  const item = G.findItem(cat, x.itemId);
  const wearable = atHome(g) && ui.sel.grid === 'shelf' && !ui.counter.includes(x.uid);
  return `<div class="modal"><div class="modal-box menu">
    <div class="menu-head"><img src="${item.img}" alt="" /><b>${esc(item.ja)}</b></div>
    <div class="actions one">
      ${btn('turn', '回転させる')}
      ${btn('equip', '装備する', { disabled: !wearable, sub: wearable ? (item.wallet ? 'ウォレットとして使う' : `${SLOT_JA[item.slot]}に装備`) : '店の棚にある品だけ装備できます' })}
      ${btn('modal-close', 'やめる', { cls: 'ghost' })}
    </div>
  </div></div>`;
}

function overModal(g: GameState, v: Visitor): string {
  const q = G.quoteSale(g, cat, v, ui.counter, ui.tier);
  return `<div class="modal"><div class="modal-box">
    <p class="modal-text">${num(q.over)}GUM予算オーバーしています。オーバーした分は支払われません。よろしいですか？</p>
    <div class="actions">${btn('modal-close', 'キャンセル', { cls: 'ghost' })}${btn('sell-ok', 'OK', { cls: 'primary' })}</div>
  </div></div>`;
}

/** The door: where to go tonight. */
function destModal(): string {
  return `<div class="modal"><div class="modal-box">
    <h2>どこへ行きますか？</h2>
    <p class="hint">一晩に行けるのは一か所だけ。外出すると翌朝の開店が遅れ、お客さんが ${B.lateOpenLoss} 人減ります。</p>
    <div class="actions one">
      ${btn('go-shop', 'ショップ', { cls: 'primary', sub: 'エクステンションを買い、ウォレットに入れて持ち帰る' })}
      ${btn('go-quest', 'クエスト', { cls: 'gold', sub: '装備を整えてダンジョンへ。品と GUM を持ち帰る' })}
      ${btn('modal-close', 'やめる', { cls: 'ghost' })}
    </div>
  </div></div>`;
}

function leaveModal(): string {
  return `<div class="modal"><div class="modal-box">
    <p class="modal-text warn-text">ウォレットに入れていないエクステンションは持ち帰れずに処分されます。本当に帰宅しますか？</p>
    <div class="actions">${btn('modal-close', 'キャンセル', { cls: 'ghost' })}${btn('shop-leave-ok', '帰宅する', { cls: 'danger' })}</div>
  </div></div>`;
}

/** The gear window: the warrior, six places to wear gear, and the wallet. Also the way out to the quest. */
function gearModal(g: GameState): string {
  const slotBtn = (id: SlotId | 'wallet', label: string): string => {
    const itemId = id === 'wallet' ? g.wallet.itemId : g.equip[id]?.itemId;
    const item = itemId ? G.findItem(cat, itemId) : null;
    return `<button class="slot slot-${id} ${item ? 'full' : ''}" ${item ? `style="${tone(item)}"` : ''} data-act="gear-slot" data-arg="${id}">
      <small>${label}</small>${item ? `<img src="${item.img}" alt="${esc(item.ja)}" />` : '<i>なし</i>'}</button>`;
  };
  const [hp, phy, int, agi] = N.playerStats(g, cat);
  const size = G.walletSize(g, cat);
  return `<div class="modal"><div class="modal-box tall">
    <h2>${ui.departing ? 'クエストへ出発' : '装備'}</h2>
    <div class="gear">
      ${slotBtn('special1', '特殊1')}${slotBtn('head', '頭')}${slotBtn('special2', '特殊2')}
      ${slotBtn('arm', '腕')}<div class="gear-me"><img src="${cat.player.img}" alt="${esc(cat.player.ja)}" /></div>${slotBtn('body', '胴体')}
      ${slotBtn('wallet', 'ウォレット')}${slotBtn('leg', '足')}<div class="gear-stats"><b>HP ${hp}</b><b>PHY ${phy}</b><b>INT ${int}</b><b>AGI ${agi}</b></div>
    </div>
    <p class="hint">場所をタップして、棚の品から選びます。装備した品のスキルを戦闘で使えます。ウォレットは ${size.cols}×${size.rows} マス。</p>
    <div class="actions">${ui.departing ? btn('depart', '出発する', { cls: 'gold' }) : ''}${btn('modal-close', ui.departing ? 'やめる' : '閉じる', { cls: ui.departing ? 'ghost' : 'primary' })}</div>
  </div></div>`;
}

/** Choosing what to wear in one place: the fitting goods on the shelf. */
function pickModal(g: GameState): string {
  const slot = ui.gearSlot;
  if (!slot) return '';
  const fits = g.stock.filter((x) => {
    const item = G.findItem(cat, x.itemId);
    if (ui.counter.includes(x.uid)) return false;
    return slot === 'wallet' ? item.wallet : !item.wallet && (slot.startsWith('special') ? item.slot === 'special' : item.slot === slot);
  });
  const worn = slot === 'wallet' ? null : g.equip[slot];
  const rows = fits
    .map((x) => {
      const item = G.findItem(cat, x.itemId);
      const [hp, phy, int, agi] = item.stats;
      return `<div class="row">${itemCard(x.itemId, x.cond, `<div class="item-note">HP+${hp} PHY+${phy} INT+${int} AGI+${agi}</div><div class="item-note">${esc(item.skill)}</div>`)}${btn('gear-wear', '装備', { arg: x.uid, cls: 'small primary' })}</div>`;
    })
    .join('');
  const label = slot === 'wallet' ? 'ウォレット' : slot === 'special1' ? '特殊1' : slot === 'special2' ? '特殊2' : SLOT_JA[slot];
  return `<div class="modal"><div class="modal-box tall">
    <h2>${label}に装備する品</h2>
    ${worn ? `<div class="row">${itemCard(worn.itemId, worn.cond, '<div class="item-note good">装備中</div>')}${btn('gear-off', '外す', { cls: 'small' })}</div>` : ''}
    ${rows || '<p class="note">ここに装備できる品が、棚にありません。</p>'}
    <div class="actions one">${btn('gear-back', '戻る', { cls: 'primary' })}</div>
  </div></div>`;
}

function helpModal(): string {
  return `<div class="modal"><div class="modal-box tall">
    <h2>遊びかた</h2>
    <ol class="help">
      <li>朝、本日のイベントを確かめて店を開けます（シャッターが上がります）。</li>
      <li>売りに来たお客さんの品は、カウンターの奥から手前へ移して買い取ります。「まとめ買いする」は割引がつくことがあります。</li>
      <li>買いに来たお客さんには、棚の品をカウンターへドラッグして売ります。予算を超えた分は支払われません。</li>
      <li>ベルを鳴らすと、いまのお客さんに帰ってもらい、次のお客さんを呼びます。</li>
      <li>品の色は系統（PHY系＝赤・INT系＝青・AGI系＝緑）。品をタップで詳細、長押しでメニュー（回転・装備）。</li>
      <li>閉店後、左のドアから外出できます（一晩に一か所。翌朝はお客さんが ${B.lateOpenLoss} 人減ります）。</li>
      <li>ショップ：品を買い、ウォレットに入れた分だけ持ち帰れます。</li>
      <li>クエスト：装備した品のスキルで戦い、進むか帰るかを選びます。倒れると、その回に拾った品を失います。</li>
      <li>7日ごとに家賃を払います（毎回上がります）。${num(B.deedPrice)} GUM で店の権利書を買い取ればクリアです。</li>
    </ol>
    <div class="actions">${btn('modal-close', '閉じる', { cls: 'primary' })}${s ? btn('reset', ui.confirmReset ? '本当にやり直す' : '最初からやり直す', { cls: ui.confirmReset ? 'danger' : 'ghost' }) : ''}</div>
    <p class="credit">素材：My Crypto Heroes（© MCH Co.,Ltd.）。本作は非公式の二次創作です。</p>
  </div></div>`;
}

function title(): string {
  const saved = store.load();
  return `<div class="title" style="background-image:url('${cat.backdrop}')">
    <div class="title-card">
      <h1>My Crypto<br />Trading</h1>
      <p>安く買って、高く売る。<br />家賃に追われる前に、店を自分のものに。</p>
      <div class="actions">
        ${saved ? btn('resume', `つづきから（${saved.day}日目）`, { cls: 'primary big' }) : ''}
        ${btn('new', 'はじめから', { cls: saved ? '' : 'primary big' })}
        ${btn('help', '遊びかた', { cls: 'ghost' })}
      </div>
      <p class="credit">非公式の二次創作です。素材：My Crypto Heroes（© MCH Co.,Ltd.）</p>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- render

function measure(g: GameState): void {
  const w = root.clientWidth || 390;
  const h = root.clientHeight || 780;
  const grid = G.gridOf(g, cat, shownGrid(g));
  const share = g.phase === 'shop' || g.phase === 'quest' ? 0.29 : 0.46;
  cell = Math.floor(Math.max(28, Math.min((w - 20) / grid.cols, 58, (h * share - 26) / grid.rows)));
}

function render(): void {
  let html: string;
  if (ui.screen === 'title' || !s) {
    html = title();
  } else {
    const g = s;
    measure(g);
    const v = G.currentVisitor(g);
    ui.counter = v && !v.done && v.kind === 'buy' ? ui.counter.filter((uid) => g.stock.some((x) => x.uid === uid)) : [];
    ui.picked = v && !v.done && v.kind === 'sell' ? ui.picked.filter((i) => i < v.offers.length) : [];
    let top: string;
    if (g.phase === 'shop') top = shopScreen(g);
    else if (g.phase === 'quest') top = questScreen(g);
    else if (g.phase === 'won' || g.phase === 'lost') top = `<main class="body">${ending(g)}</main>`;
    else top = front(g, v);
    const flash = ui.flash ? `<div class="flash ${ui.flash.tone}">${esc(ui.flash.text)}</div>` : '';
    html = `${hud(g)}${top}${gridSection(g)}${v ? customerWindow(g, v) : ''}${flash}`;
    if (ui.modal === 'inspect') html += inspectModal(g);
    if (ui.modal === 'menu') html += menuModal(g);
    if (ui.modal === 'over' && v) html += overModal(g, v);
    if (ui.modal === 'dest') html += destModal();
    if (ui.modal === 'leave') html += leaveModal();
    if (ui.modal === 'gear') html += gearModal(g);
    if (ui.modal === 'pick') html += pickModal(g);
    shownPhase = g.phase;
  }
  if (ui.modal === 'help') html += helpModal();
  // update in place: elements that stay keep their state (scroll, running animations, transitions)
  const next = root.cloneNode(false) as HTMLElement;
  next.innerHTML = html;
  morphdom(root, next, { childrenOnly: true });
  if (s && s.phase === 'quest') questEffects(s, root);
  clampWindow();
  ui.flash = null;
  const v = s ? G.currentVisitor(s) : null;
  if (v) {
    enteredKey = ui.enterKey;
    if (v.done) exitedKey = ui.enterKey;
  }
}

/** Keeps the customer window on screen (after a drag, a resize, or a change of its size). */
function clampWindow(): void {
  const win = root.querySelector<HTMLElement>('.win');
  if (!win) return;
  // until the player moves it, the window ends above the counter so the goods on it stay in reach
  const body = win.querySelector<HTMLElement>('.win-body');
  const far = root.querySelector<HTMLElement>('.counter-far');
  if (body && far) body.style.maxHeight = ui.win.moved ? '' : `${Math.max(150, far.getBoundingClientRect().top - root.getBoundingClientRect().top - ui.win.y - 48)}px`;
  ui.win.x = Math.max(0, Math.min(ui.win.x, root.clientWidth - win.offsetWidth));
  ui.win.y = Math.max(0, Math.min(ui.win.y, root.clientHeight - 44));
  win.style.left = `${ui.win.x}px`;
  win.style.top = `${ui.win.y}px`;
}

function note(text: string, tone: 'good' | 'bad' | 'info'): void {
  ui.flash = { text, tone };
}

// ---------------------------------------------------------------- actions

function closeModal(): void {
  ui.modal = 'none';
  ui.sel = null;
  ui.confirmDispose = false;
  ui.confirmReset = false;
  ui.departing = false;
  ui.gearSlot = null;
}

function act(name: string, arg: string | undefined): void {
  const n = arg === undefined ? 0 : Number(arg);
  if (name === 'help') ui.modal = 'help';
  else if (name === 'modal-close') closeModal();
  else if (name === 'new' || name === 'restart') {
    store.clear();
    s = G.newGame((Date.now() ^ (Math.random() * 0x7fffffff)) | 0, cat);
    ui.screen = 'game';
    ui.gridView = 'shelf';
    shownPhase = '';
    closeModal();
  } else if (name === 'resume') {
    s = store.load();
    ui.screen = s ? 'game' : 'title';
    shownPhase = '';
    if (s && G.currentVisitor(s)) newCustomer();
  } else if (name === 'reset') {
    if (!ui.confirmReset) ui.confirmReset = true;
    else {
      store.clear();
      s = null;
      ui.screen = 'title';
      closeModal();
    }
  } else if (s) {
    if (!questAct(s, name, n)) gameAct(s, name, n, arg ?? '');
  }
  if (s && ui.screen === 'game') store.save(s);
  render();
}

function doSell(g: GameState, v: Visitor): void {
  const before = g.gum;
  const result = G.sell(g, cat, ui.counter, ui.tier);
  ui.modal = 'none';
  if (result === 'sold') {
    note(`+${num(g.gum - before)} GUM`, 'good');
    ui.counter = [];
    ui.tier = 0;
  } else if (result === 'left') note('怒って帰ってしまった…', 'bad');
  else if (result === 'refused') note('断られた', 'bad');
  else if (result === 'nomatch') note('希望と違う品がある', 'bad');
  if (v.done) ui.win.open = false;
}

function gameAct(g: GameState, name: string, n: number, arg: string): void {
  const v = G.currentVisitor(g);
  const before = g.gum;
  switch (name) {
    case 'open':
      G.openShop(g, cat);
      newCustomer();
      break;
    case 'bell':
      if (v && !v.done) {
        // send this customer away, let them walk out, then bring the next one in
        G.pass(g);
        ui.win.open = false;
        const key = ui.enterKey;
        window.clearTimeout(nextTimer);
        nextTimer = window.setTimeout(() => {
          if (s !== g || key !== ui.enterKey || !G.currentVisitor(g)?.done) return;
          G.callNext(g, cat);
          newCustomer();
          store.save(g);
          render();
        }, 1000);
      } else {
        window.clearTimeout(nextTimer);
        G.callNext(g, cat);
        newCustomer();
      }
      break;
    case 'hero':
      if (v && !v.done) ui.win.open = true;
      break;
    case 'win-close':
      ui.win.open = false;
      break;
    case 'win-size':
      ui.win.big = !ui.win.big;
      break;
    case 'grid':
      ui.gridView = arg === 'wallet' ? 'wallet' : 'shelf';
      break;
    case 'take-all':
      if (v) ui.picked = G.allPicks(v);
      break;
    case 'buy-picked':
    case 'buy-all':
      if (!v) break;
      if (G.buy(g, cat, name === 'buy-all' ? G.allPicks(v) : ui.picked)) {
        note(`−${num(before - g.gum)} GUM`, 'info');
        ui.picked = [];
      }
      break;
    case 'haggle-open':
      ui.haggleOpen = true;
      break;
    case 'haggle-close':
      ui.haggleOpen = false;
      break;
    case 'haggle':
      if (G.haggle(g, n)) note('値切り成功！', 'good');
      else note(v?.done ? '怒って帰ってしまった…' : '断られた', 'bad');
      ui.haggleOpen = false;
      break;
    case 'tier':
      ui.tier = n;
      break;
    case 'uncounter':
      ui.counter = ui.counter.filter((uid) => uid !== n);
      break;
    case 'sell':
      if (!v || ui.counter.length === 0) break;
      if (G.quoteSale(g, cat, v, ui.counter, ui.tier).over > 0) ui.modal = 'over';
      else doSell(g, v);
      break;
    case 'sell-ok':
      if (v) doSell(g, v);
      break;

    // ---- a good's detail and menu windows
    case 'dispose':
    case 'drop':
      if (!ui.sel) break;
      if (!ui.confirmDispose) ui.confirmDispose = true;
      else {
        if (name === 'drop') g.wallet.items = g.wallet.items.filter((x) => x.uid !== ui.sel!.uid);
        else G.dispose(g, cat, ui.sel.uid, ui.sel.grid);
        closeModal();
      }
      break;
    case 'unload':
      if (ui.sel && N.unload(g, cat, ui.sel.uid)) closeModal();
      else note('棚に置き場所がない', 'bad');
      break;
    case 'unstow':
      if (ui.sel && N.unstow(g, ui.sel.uid)) closeModal();
      break;
    case 'turn':
      if (!ui.sel) break;
      if (!G.turnStock(g, cat, ui.sel.uid, ui.sel.grid)) note('回転して置ける場所がない', 'bad');
      closeModal();
      break;
    case 'equip': {
      if (!ui.sel) break;
      const result = N.equip(g, cat, ui.sel.uid);
      closeModal();
      if (result === 'ok') ui.modal = 'gear';
      else note(result === 'walletfull' ? 'ウォレットを空にしてから替えてください' : '外した品を置く場所が棚にない', 'bad');
      break;
    }

    // ---- gear
    case 'gear':
      ui.modal = 'gear';
      break;
    case 'gear-slot':
      ui.gearSlot = arg as SlotId | 'wallet';
      ui.modal = 'pick';
      break;
    case 'gear-wear': {
      const result = N.equip(g, cat, n, ui.gearSlot === 'wallet' || ui.gearSlot === null ? undefined : ui.gearSlot);
      if (result !== 'ok') note(result === 'walletfull' ? 'ウォレットを空にしてから替えてください' : '外した品を置く場所が棚にない', 'bad');
      ui.modal = 'gear';
      break;
    }
    case 'gear-off':
      if (ui.gearSlot && ui.gearSlot !== 'wallet' && !N.unequip(g, cat, ui.gearSlot)) note('棚に置き場所がない', 'bad');
      ui.modal = 'gear';
      break;
    case 'gear-back':
      ui.modal = 'gear';
      break;

    // ---- the night
    case 'door':
      if (N.canGoOut(g)) ui.modal = 'dest';
      else note('今夜はもう外出しました', 'info');
      break;
    case 'go-shop':
      closeModal();
      N.goShop(g, cat);
      break;
    case 'go-quest':
      ui.modal = 'gear';
      ui.departing = true;
      break;
    case 'depart':
      closeModal();
      Q.startQuest(g, cat);
      break;
    case 'shop-buy':
      if (N.shopBuy(g, n)) {
        note(`−${num(before - g.gum)} GUM`, 'info');
        // straight into the wallet when it fits; otherwise it waits on the tray
        N.stow(g, cat, g.shop!.tray.length - 1);
      }
      break;
    case 'stow':
      if (!N.stow(g, cat, n)) note('ウォレットに入らない', 'bad');
      break;
    case 'shop-leave':
      if (g.shop && g.shop.tray.length > 0) ui.modal = 'leave';
      else N.goHome(g, cat);
      break;
    case 'shop-leave-ok':
      closeModal();
      N.goHome(g, cat);
      break;

    case 'shelf':
      if (G.upgradeShelf(g)) note('棚を広げた', 'good');
      break;
    case 'deed':
      G.buyDeed(g);
      break;
    case 'continue':
      G.continueAfterWin(g);
      break;
    case 'endday':
      G.endDay(g);
      ui.gridView = 'shelf';
      break;
  }
  const now = G.currentVisitor(g);
  if (now?.done) ui.win.open = false;
}

function newCustomer(): void {
  ui.enterKey += 1;
  ui.haggleOpen = false;
  ui.counter = [];
  ui.picked = [];
  ui.tier = 0;
  ui.win.open = true;
}

// ---------------------------------------------------------------- dragging and pressing (goods, the customer window)

type Drag =
  | { kind: 'win'; dx: number; dy: number }
  | { kind: 'offer'; index: number; startX: number; startY: number; active: boolean; ghost: HTMLElement | null; offX: number; offY: number }
  | { kind: 'item'; grid: G.GridId; uid: number; startX: number; startY: number; active: boolean; ghost: HTMLElement | null; grabX: number; grabY: number; offX: number; offY: number; hold: number };
let drag: Drag | null = null;

const inside = (rect: DOMRect, x: number, y: number): boolean => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

/** The cell a dragged good would land on (its top-left cell), or null when off its grid. */
function dropCell(d: Extract<Drag, { kind: 'item' }>, x: number, y: number): { x: number; y: number } | null {
  const grid = root.querySelector('.grid');
  if (!grid) return null;
  const rect = grid.getBoundingClientRect();
  if (!inside(rect, x, y)) return null;
  return { x: Math.floor((x - rect.left) / cell) - d.grabX, y: Math.floor((y - rect.top) / cell) - d.grabY };
}

function onDown(event: PointerEvent): void {
  if (!s || ui.modal !== 'none') return;
  const target = event.target as HTMLElement;
  const bar = target.closest('.win-bar');
  if (bar && !target.closest('button')) {
    const rect = root.getBoundingClientRect();
    drag = { kind: 'win', dx: event.clientX - rect.left - ui.win.x, dy: event.clientY - rect.top - ui.win.y };
    event.preventDefault();
    return;
  }
  const offerEl = target.closest<HTMLElement>('.offer');
  if (offerEl) {
    const rect = offerEl.getBoundingClientRect();
    drag = { kind: 'offer', index: Number(offerEl.dataset.offer), startX: event.clientX, startY: event.clientY, active: false, ghost: null, offX: event.clientX - rect.left, offY: event.clientY - rect.top };
    event.preventDefault();
    return;
  }
  const cellEl = target.closest<HTMLElement>('.inv-cell');
  if (!cellEl) return;
  const uid = Number(cellEl.dataset.uid);
  if (ui.counter.includes(uid)) return;
  const grid = (cellEl.closest<HTMLElement>('.grid')?.dataset.grid ?? 'shelf') as G.GridId;
  const rect = cellEl.parentElement!.getBoundingClientRect();
  const d: Extract<Drag, { kind: 'item' }> = {
    kind: 'item',
    grid,
    uid,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    ghost: null,
    grabX: Math.floor((event.clientX - rect.left) / cell),
    grabY: Math.floor((event.clientY - rect.top) / cell),
    offX: event.clientX - rect.left,
    offY: event.clientY - rect.top,
    // held still for half a second: the menu
    hold: window.setTimeout(() => {
      if (drag !== d || d.active) return;
      drag = null;
      ui.sel = { grid, uid };
      ui.modal = 'menu';
      render();
    }, 500),
  };
  drag = d;
  event.preventDefault();
}

function onMove(event: PointerEvent): void {
  if (!drag || !s) return;
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
    const el = root.querySelector<HTMLElement>(d.kind === 'offer' ? `.offer[data-offer="${d.index}"]` : `.inv-item[data-item="${d.uid}"]`);
    if (!el) return;
    if (d.kind === 'item') window.clearTimeout(d.hold);
    d.active = true;
    d.ghost = el.cloneNode(true) as HTMLElement;
    d.ghost.classList.add('ghost');
    root.appendChild(d.ghost);
    el.classList.add('lifted');
  }
  const rootRect = root.getBoundingClientRect();
  d.ghost!.style.left = `${event.clientX - rootRect.left - d.offX}px`;
  d.ghost!.style.top = `${event.clientY - rootRect.top - d.offY}px`;
  if (d.kind === 'offer') {
    for (const zone of root.querySelectorAll('.counter.take, .counter-far')) zone.classList.toggle('hot', inside(zone.getBoundingClientRect(), event.clientX, event.clientY));
    return;
  }
  const counter = d.grid === 'shelf' ? root.querySelector('.counter.drop') : null;
  counter?.classList.toggle('hot', inside(counter.getBoundingClientRect(), event.clientX, event.clientY));
  const preview = root.querySelector<HTMLElement>('.preview');
  const grid = G.gridOf(s, cat, d.grid);
  const stock = grid.items.find((x) => x.uid === d.uid);
  const spot = dropCell(d, event.clientX, event.clientY);
  if (preview && stock) {
    if (!spot) preview.style.display = 'none';
    else {
      const shape = G.shapeOf(cat, stock.itemId, stock.rot);
      const ok = G.canPlaceIn(grid, cat, stock.itemId, spot.x, spot.y, stock.rot, d.uid);
      preview.style.display = 'block';
      preview.className = `preview ${ok ? 'ok' : 'ng'}`;
      preview.innerHTML = shape.cells.map(([cx, cy]) => `<i style="left:${(spot.x + cx) * cell}px;top:${(spot.y + cy) * cell}px"></i>`).join('');
    }
  }
}

function onUp(event: PointerEvent): void {
  if (!drag || !s) return;
  const d = drag;
  drag = null;
  if (d.kind === 'win') return;
  d.ghost?.remove();
  const g = s;
  if (d.kind === 'offer') {
    const picked = ui.picked.includes(d.index);
    let want = !picked; // a tap moves it to the other side
    if (d.active) {
      const near = root.querySelector('.counter.take');
      const far = root.querySelector('.counter-far');
      if (near && inside(near.getBoundingClientRect(), event.clientX, event.clientY)) want = true;
      else if (far && inside(far.getBoundingClientRect(), event.clientX, event.clientY)) want = false;
      else want = picked;
    }
    ui.picked = want ? [...new Set([...ui.picked, d.index])] : ui.picked.filter((i) => i !== d.index);
    if (want) ui.win.open = true;
    render();
    return;
  }
  window.clearTimeout(d.hold);
  if (!d.active) {
    // a tap: the good's details
    ui.sel = { grid: d.grid, uid: d.uid };
    ui.confirmDispose = false;
    ui.modal = 'inspect';
    render();
    return;
  }
  const v = G.currentVisitor(g);
  const counter = d.grid === 'shelf' ? root.querySelector('.counter.drop') : null;
  if (counter && v && !v.done && v.kind === 'buy' && inside(counter.getBoundingClientRect(), event.clientX, event.clientY)) {
    const stock = g.stock.find((x) => x.uid === d.uid);
    if (stock && !G.matches(cat, v.want, stock.itemId)) {
      G.refuseGood(g);
      note('希望と違う品', 'bad');
    } else if (stock) {
      ui.counter.push(d.uid);
    }
    ui.win.open = true;
  } else {
    const spot = dropCell(d, event.clientX, event.clientY);
    if (spot) G.moveStock(g, cat, d.uid, spot.x, spot.y, d.grid);
  }
  store.save(g);
  render();
}

export function mount(el: HTMLElement): void {
  root = el;
  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target || (target as HTMLButtonElement).disabled) return;
    act(target.dataset.act!, target.dataset.arg);
  });
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('contextmenu', (event) => {
    if ((event.target as HTMLElement).closest('.inv-cell, .offer')) event.preventDefault();
  });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', () => {
    if (drag && drag.kind !== 'win') drag.ghost?.remove();
    if (drag?.kind === 'item') window.clearTimeout(drag.hold);
    drag = null;
    render();
  });
  window.addEventListener('resize', render);
  render();
}
