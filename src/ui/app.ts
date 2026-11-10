import { B, WEEKDAYS } from '../game/balance';
import { catalog as cat, COND_JA, KIND_JA, RARITY_JA } from '../game/catalog';
import { wantText } from '../game/lines';
import * as G from '../game/logic';
import * as store from '../game/save';
import type { GameState, Visitor } from '../game/state';

/** Screen state that is not part of the saved game. */
interface Ui {
  screen: 'title' | 'game';
  modal: 'none' | 'help' | 'inspect' | 'over';
  inspectUid: number | null;
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
  /** a short note over the counter (money moved, shelf full …) */
  flash: { text: string; tone: 'good' | 'bad' | 'info' } | null;
  /** changes whenever a new customer steps up */
  enterKey: number;
}

let s: GameState | null = null;
const ui: Ui = {
  screen: 'title',
  modal: 'none',
  inspectUid: null,
  confirmDispose: false,
  confirmReset: false,
  haggleOpen: false,
  counter: [],
  picked: [],
  tier: 0,
  win: { x: 6, y: 60, big: false, open: true, moved: false },
  flash: null,
  enterKey: 0,
};
let root: HTMLElement;
/** the customer whose walk-in / walk-out has already been played */
let enteredKey = -1;
let exitedKey = -1;
/** size of one shelf cell in px (fits the screen) */
let cell = 48;
/** the pending walk-out before the next customer comes in (after the bell) */
let nextTimer = 0;

const esc = (text: string | number): string =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (n: number): string => n.toLocaleString('ja-JP');
const gum = (n: number): string => `<span class="gum"><img src="${cat.icons.gum}" alt="GUM" />${num(n)}</span>`;
const pct = (p: number): string => `${Math.round(p * 100)}%`;
const TEMPER_JA = ['気さく', 'ふつう', '頑固'];

const ICON_SIZE =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="1.5" y="7.5" width="7" height="7" rx="1.5" fill="currentColor"/></svg>';
const ICON_BELL =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 3.2a1.6 1.6 0 0 1 1.6 1.6v.5a6 6 0 0 1 4.4 5.8v3.4l1.7 2.6a.9.9 0 0 1-.8 1.4H5.100a.9.9 0 0 1-.8-1.400L6 14.500v-3.400a6 6 0 0 1 4.400-5.800v-.500A1.600 1.600 0 0 1 12 3.200z" fill="currentColor"/><path d="M9.6 19.800h4.800a2.400 2.400 0 0 1-4.800 0z" fill="currentColor"/></svg>';
const ICON_CLOSE =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function btn(act: string, label: string, opts: { cls?: string; arg?: string | number; disabled?: boolean; sub?: string } = {}): string {
  const sub = opts.sub ? `<small>${opts.sub}</small>` : '';
  return `<button class="btn ${opts.cls ?? ''}" data-act="${act}"${opts.arg !== undefined ? ` data-arg="${opts.arg}"` : ''}${opts.disabled ? ' disabled' : ''}><span>${label}</span>${sub}</button>`;
}

// ---------------------------------------------------------------- pieces

function itemCard(itemId: number, cond: number, extra = ''): string {
  const item = G.findItem(cat, itemId);
  return `<div class="item r${item.rarity}">
    <div class="item-img"><img src="${item.img}" alt="" /></div>
    <div class="item-body">
      <div class="item-name">${esc(item.ja)}</div>
      <div class="tags"><span class="tag rar">${RARITY_JA[item.rarity]}</span><span class="tag">${KIND_JA[item.kind]}</span><span class="tag c${cond}">${COND_JA[cond]}</span></div>
      <div class="item-val">相場 ${gum(G.itemValue(cat, itemId, cond))}</div>
      ${extra}
    </div>
  </div>`;
}

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

/** The view over the counter: the customer walks in from the left and leaves to the right. */
function scene(g: GameState, v: Visitor): string {
  const hero = cat.heroById.get(v.heroId)!;
  let walk = '';
  if (v.done) walk = exitedKey === ui.enterKey ? 'gone' : 'exit';
  else if (enteredKey !== ui.enterKey) walk = 'enter';
  const flash = ui.flash ? `<div class="flash ${ui.flash.tone}">${esc(ui.flash.text)}</div>` : '';
  return `<section class="scene" style="background-image:url('${cat.backdrop}')">
    <div class="line-left">残り ${G.visitorsLeft(g)} 人</div>
    <div class="walker ${walk} mood-${v.mood}" data-act="hero"><img class="hero" src="${hero.img}" alt="${esc(hero.ja)}" draggable="false" /></div>
    <div class="bubble ${walk === 'gone' ? 'hide' : ''}">${esc(v.line)}</div>
    ${flash}
  </section>`;
}

/** A seller's good as it lies on the counter. Tap or drag it between the far and the near side. */
function offerTile(v: Visitor, index: number): string {
  const o = v.offers[index];
  const item = G.findItem(cat, o.itemId);
  return `<div class="offer r${item.rarity}" data-offer="${index}" role="button" aria-label="${esc(item.ja)}"><img src="${item.img}" alt="" draggable="false" /><span>${num(o.ask)}</span></div>`;
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
          const stock = g.stock.find((x) => x.uid === uid)!;
          const item = G.findItem(cat, stock.itemId);
          return `<button class="on-counter r${item.rarity}" data-act="uncounter" data-arg="${uid}" aria-label="${esc(item.ja)}を棚へ戻す"><img src="${item.img}" alt="" /></button>`;
        })
        .join('') + '<div class="counter-note">タップで棚へ戻す</div>';
    nearCls = 'drop';
  }
  return `<div class="counter-far">${far}</div>
    <div class="counter ${nearCls}"><div class="counter-goods">${near}</div>
      <button class="bell ${v.done ? 'ring' : ''}" data-act="bell" aria-label="${v.done ? '次のお客さんを呼ぶ' : 'このお客さんを帰して、次のお客さんを呼ぶ'}">${ICON_BELL}</button>
    </div>`;
}

// ---------------------------------------------------------------- the shelf grid

function shelf(g: GameState): string {
  const items = g.stock
    .map((x) => {
      const item = G.findItem(cat, x.itemId);
      const shape = G.shapeOf(cat, x.itemId, x.rot);
      const away = ui.counter.includes(x.uid);
      const cells = shape.cells
        .map(([cx, cy]) => `<i class="inv-cell" data-uid="${x.uid}" style="left:${cx * cell}px;top:${cy * cell}px"></i>`)
        .join('');
      const size = Math.min(shape.w, shape.h) * cell;
      return `<div class="inv-item r${item.rarity} ${away ? 'away' : ''}" data-item="${x.uid}" style="left:${x.x * cell}px;top:${x.y * cell}px;width:${shape.w * cell}px;height:${shape.h * cell}px">
        ${cells}<img src="${item.img}" alt="${esc(item.ja)}" draggable="false" style="width:${size}px;height:${size}px;${imageSpot(shape.cells, size)}${x.rot ? ';transform:rotate(90deg)' : ''}" /></div>`;
    })
    .join('');
  const total = B.gridCols * g.rows;
  return `<section class="inv">
    <div class="inv-head"><b>棚</b><span>${total - G.freeCells(g, cat)} / ${total} マス</span><span class="inv-tip">タップで詳細・ドラッグで移動</span></div>
    <div class="grid" style="--cell:${cell}px;width:${B.gridCols * cell}px;height:${g.rows * cell}px">${items}<div class="preview"></div></div>
  </section>`;
}

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

// ---------------------------------------------------------------- the customer window

function windowBody(g: GameState, v: Visitor): string {
  const pips = '●'.repeat(Math.max(0, v.patience)) + '○'.repeat(Math.max(0, B.temperPatience[v.temper] - v.patience));
  const who = `<div class="win-row"><span>気質</span><b>${TEMPER_JA[v.temper]}　<span class="pips">我慢 ${pips}</span></b></div>`;

  if (v.kind === 'sell') {
    const goods = v.offers
      .map((o, i) => {
        const item = G.findItem(cat, o.itemId);
        const on = ui.picked.includes(i);
        return `<div class="offer-line ${on ? 'on' : ''}"><img src="${item.img}" alt="" />
          <div><b>${esc(item.ja)}</b><small>${RARITY_JA[item.rarity]}・${COND_JA[o.cond]}・相場 ${num(G.itemValue(cat, o.itemId, o.cond))}</small></div>
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
        B.discountTiers
          .map((rate, tier) => btn('haggle', `${Math.round(rate * 100)}% 引き`, { arg: tier, sub: `成功 ${pct(G.discountChance(g, v, tier))}` }))
          .join('') + btn('haggle-close', 'やめる', { cls: 'ghost' });
    } else {
      actions = [
        btn('buy-picked', `${some.count}個購入する`, { cls: 'primary', sub: some.count ? (why(some) || gum(some.price)) : '手前に品を置く', disabled: some.count === 0 || !!some.block }),
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

// ---------------------------------------------------------------- phases without a customer

function morning(g: GameState): string {
  const offers = g.wholesale
    .map((o, i) => {
      const full = !G.findSlot(g, cat, o.itemId);
      const label = o.sold ? '仕入れ済み' : full ? '置けない' : `仕入れる ${gum(o.price)}`;
      return `<div class="row">${itemCard(o.itemId, o.cond)}${btn('wholesale', label, { arg: i, cls: 'small', disabled: o.sold || full || g.gum < o.price })}</div>`;
    })
    .join('');
  const tip = g.day === 1 ? 'まずは店を開けましょう。安く買い取り、欲しがる人に売ります。' : G.daysToRent(g) <= 1 && !g.owned ? '家賃の日が近づいています。手元の GUM を残しておきましょう。' : '';
  return `<section class="panel">
    <h2>朝の仕入れ</h2>
    ${g.nightNote ? `<p class="note">${esc(g.nightNote)}</p>` : ''}${tip ? `<p class="note">${tip}</p>` : ''}
    <p class="hint">卸売り商が来ています。相場より少し安く仕入れられます。今日のお客さんは ${G.visitorsFor(g.rep)} 人の見込み。</p>
    ${offers}
    <div class="actions sticky">${btn('open', '店を開ける', { cls: 'primary big' })}</div>
  </section>`;
}

function evening(g: GameState): string {
  const t = g.today;
  const net = t.revenue - t.spend;
  const cost = G.shelfCost(g);
  let rent = '';
  if (G.isRentDay(g)) {
    const short = g.gum < g.rent;
    rent = `<p class="note ${short ? 'bad' : ''}">今夜は家賃の支払日です（${gum(g.rent)}）。${
      short ? (g.graceLeft > 0 ? '足りない場合は、一度だけ猶予が使えます（次回の家賃に上乗せ）。' : '足りないと店を失います。棚の品をタップして処分し、工面しましょう。') : ''
    }</p>`;
  }
  const deed = g.owned
    ? '<p class="note good">この店はあなたのものです。家賃はもうかかりません。</p>'
    : `<div class="row"><div><b>店の権利書</b><div class="hint">買い取れば家賃から解放されます（クリア）。</div></div>${btn('deed', `買い取る ${gum(B.deedPrice)}`, { cls: 'small gold', disabled: g.gum < B.deedPrice })}</div>`;
  const shelfRow =
    cost === null
      ? ''
      : `<div class="row"><div><b>棚を広げる</b><div class="hint">${g.rows} 段 → ${g.rows + 1} 段（+${B.gridCols} マス）</div></div>${btn('shelf', `広げる ${gum(cost)}`, { cls: 'small', disabled: g.gum < cost })}</div>`;
  return `<section class="panel">
    <h2>${g.day}日目の締め</h2>
    <table class="sum">
      <tr><td>売上</td><td>${gum(t.revenue)}</td></tr>
      <tr><td>仕入れ</td><td>${gum(t.spend)}</td></tr>
      <tr class="${net >= 0 ? 'good' : 'bad'}"><td>収支</td><td>${net >= 0 ? '+' : '−'}${gum(Math.abs(net))}</td></tr>
      <tr><td>取引</td><td>買 ${t.bought}・売 ${t.sold}${t.walkouts ? `・怒って帰った ${t.walkouts}` : ''}</td></tr>
    </table>
    ${rent}${deed}${shelfRow}
    <div class="actions sticky">${btn('endday', '眠って翌日へ', { cls: 'primary big' })}</div>
  </section>`;
}

function ending(g: GameState): string {
  if (g.phase === 'won') {
    return `<section class="panel end">
      <h2>店を買い取った！</h2>
      <p>${g.ownedDay}日目で権利書を手に入れました。もう家賃に追われることはありません。</p>
      <table class="sum"><tr><td>売った品</td><td>${g.totals.sold}</td></tr><tr><td>買った品</td><td>${g.totals.bought}</td></tr><tr><td>最高の売上</td><td>${gum(g.totals.bestSale)}</td></tr></table>
      <div class="actions">${btn('continue', 'このまま店を続ける', { cls: 'primary big' })}${btn('restart', '最初からやり直す', { cls: 'ghost' })}</div>
    </section>`;
  }
  return `<section class="panel end">
    <h2>店を失った…</h2>
    <p>${g.day}日目、家賃を払えませんでした。相場より安く買い、欲しがる人に高く売るのが商いの基本です。</p>
    <div class="actions">${btn('restart', 'もう一度はじめる', { cls: 'primary big' })}</div>
  </section>`;
}

// ---------------------------------------------------------------- modals and title

function inspectModal(g: GameState): string {
  const x = g.stock.find((it) => it.uid === ui.inspectUid);
  if (!x) return '';
  const price = G.disposePrice(cat, x);
  return `<div class="modal"><div class="modal-box">
    ${itemCard(x.itemId, x.cond, `<div class="item-note">仕入れ値 ${num(x.paid)}　定価 ${num(G.salePrice(cat, x, 0))}</div>`)}
    <p class="hint">回転すると、棚で使うマス目の向きが変わります。処分すると、卸売り商が相場の半値で引き取ります。</p>
    <div class="actions">${btn('turn', '回転する', { cls: 'big' })}${btn('dispose', ui.confirmDispose ? `本当に処分 ${gum(price)}` : `処分する ${gum(price)}`, { cls: ui.confirmDispose ? 'danger' : '' })}${btn('modal-close', '閉じる', { cls: 'primary' })}</div>
  </div></div>`;
}

function overModal(g: GameState, v: Visitor): string {
  const q = G.quoteSale(g, cat, v, ui.counter, ui.tier);
  return `<div class="modal"><div class="modal-box">
    <p class="modal-text">${num(q.over)}GUM予算オーバーしています。オーバーした分は支払われません。よろしいですか？</p>
    <div class="actions">${btn('modal-close', 'キャンセル', { cls: 'ghost' })}${btn('sell-ok', 'OK', { cls: 'primary' })}</div>
  </div></div>`;
}

function helpModal(): string {
  return `<div class="modal"><div class="modal-box tall">
    <h2>遊びかた</h2>
    <ol class="help">
      <li>朝、卸売り商から品を仕入れて店を開けます。</li>
      <li>お客さんは「売りに来た人」と「買いに来た人」。ウィンドウに、持ってきた品と言い値や、欲しいもの・予算が出ます。ウィンドウは上の帯をドラッグして動かせます。</li>
      <li>買い取るときは、カウンターの奥の品を手前へ移し（タップかドラッグ）、「〇個購入する」を押します。「まとめ買いする」は全部を一度に買い、割引がつくことがあります。</li>
      <li>売るときは、棚の品をカウンターへドラッグし、ウィンドウの「この金額で販売する」を押します。予算を超えた分は支払われません。予算が残っていれば、続けて売れます。</li>
      <li>ベルを鳴らすと、いまのお客さんに帰ってもらい、次のお客さんを呼びます。</li>
      <li>品は種類ごとに棚で使うマス目の形が違います。ドラッグで並べ替え、タップして回転させて、置き場所を作りましょう。</li>
      <li>値切りや上乗せは、断られると相手の「我慢」が減り、0 になると怒って帰ります（評判が下がります）。</li>
      <li>良心的な取引で評判（★）が上がると、お客さんが増え、値の張る品も集まります。</li>
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
  cell = Math.floor(Math.max(30, Math.min((w - 20) / B.gridCols, 58, (h * 0.46 - 26) / g.rows)));
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
    if (g.phase === 'open' && v) top = `${scene(g, v)}${counterBar(g, v)}`;
    else top = `<main class="body">${g.phase === 'morning' ? morning(g) : g.phase === 'evening' ? evening(g) : ending(g)}</main>`;
    html = `${hud(g)}${top}${shelf(g)}${v ? customerWindow(g, v) : ''}`;
    if (ui.modal === 'inspect') html += inspectModal(g);
    if (ui.modal === 'over' && v) html += overModal(g, v);
  }
  if (ui.modal === 'help') html += helpModal();
  const scroll = root.querySelector('.body')?.scrollTop ?? 0;
  root.innerHTML = html;
  const body = root.querySelector('.body');
  if (body) body.scrollTop = scroll;
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
  if (body && far) body.style.maxHeight = ui.win.moved ? '' : `${Math.max(150, far.offsetTop - ui.win.y - 48)}px`;
  ui.win.x = Math.max(0, Math.min(ui.win.x, root.clientWidth - win.offsetWidth));
  ui.win.y = Math.max(0, Math.min(ui.win.y, root.clientHeight - 44));
  win.style.left = `${ui.win.x}px`;
  win.style.top = `${ui.win.y}px`;
}

function note(text: string, tone: 'good' | 'bad' | 'info'): void {
  ui.flash = { text, tone };
}

// ---------------------------------------------------------------- actions

function act(name: string, arg: string | undefined): void {
  const n = arg === undefined ? 0 : Number(arg);
  if (name === 'help') ui.modal = 'help';
  else if (name === 'modal-close') {
    ui.modal = 'none';
    ui.confirmDispose = false;
    ui.confirmReset = false;
  } else if (name === 'new' || name === 'restart') {
    store.clear();
    s = G.newGame((Date.now() ^ (Math.random() * 0x7fffffff)) | 0, cat);
    ui.screen = 'game';
    ui.modal = 'none';
  } else if (name === 'resume') {
    s = store.load();
    ui.screen = s ? 'game' : 'title';
    if (s && G.currentVisitor(s)) newCustomer();
  } else if (name === 'reset') {
    if (!ui.confirmReset) ui.confirmReset = true;
    else {
      store.clear();
      s = null;
      ui.screen = 'title';
      ui.modal = 'none';
      ui.confirmReset = false;
    }
  } else if (s) gameAct(s, name, n);
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

function gameAct(g: GameState, name: string, n: number): void {
  const v = G.currentVisitor(g);
  const before = g.gum;
  switch (name) {
    case 'wholesale':
      if (G.buyWholesale(g, cat, n)) note(`−${num(before - g.gum)} GUM`, 'info');
      break;
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
    case 'dispose':
      if (ui.inspectUid === null) break;
      if (!ui.confirmDispose) ui.confirmDispose = true;
      else {
        G.dispose(g, cat, ui.inspectUid);
        ui.confirmDispose = false;
        ui.modal = 'none';
      }
      break;
    case 'turn':
      if (ui.inspectUid === null) break;
      if (G.turnStock(g, cat, ui.inspectUid)) ui.modal = 'none';
      else note('回転して置ける場所がない', 'bad');
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
      G.endDay(g, cat);
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

// ---------------------------------------------------------------- dragging (shelf goods, the customer window)

type Drag =
  | { kind: 'win'; dx: number; dy: number }
  | { kind: 'offer'; index: number; startX: number; startY: number; active: boolean; ghost: HTMLElement | null; offX: number; offY: number }
  | { kind: 'item'; uid: number; startX: number; startY: number; active: boolean; ghost: HTMLElement | null; grabX: number; grabY: number; offX: number; offY: number };
let drag: Drag | null = null;

const inside = (rect: DOMRect, x: number, y: number): boolean => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

/** The shelf cell a dragged good would land on (its top-left cell), or null when off the shelf. */
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
  const itemEl = cellEl.parentElement!;
  const rect = itemEl.getBoundingClientRect();
  drag = {
    kind: 'item',
    uid,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    ghost: null,
    grabX: Math.floor((event.clientX - rect.left) / cell),
    grabY: Math.floor((event.clientY - rect.top) / cell),
    offX: event.clientX - rect.left,
    offY: event.clientY - rect.top,
  };
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
  if (drag.kind === 'offer') {
    const o = drag;
    if (!o.active) {
      if (Math.hypot(event.clientX - o.startX, event.clientY - o.startY) < 8) return;
      const el = root.querySelector<HTMLElement>(`.offer[data-offer="${o.index}"]`);
      if (!el) return;
      o.active = true;
      o.ghost = el.cloneNode(true) as HTMLElement;
      o.ghost.classList.add('ghost');
      root.appendChild(o.ghost);
      el.classList.add('lifted');
    }
    const rr = root.getBoundingClientRect();
    o.ghost!.style.left = `${event.clientX - rr.left - o.offX}px`;
    o.ghost!.style.top = `${event.clientY - rr.top - o.offY}px`;
    for (const zone of root.querySelectorAll('.counter.take, .counter-far')) zone.classList.toggle('hot', inside(zone.getBoundingClientRect(), event.clientX, event.clientY));
    return;
  }
  const d = drag;
  if (!d.active) {
    if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < 8) return;
    const itemEl = root.querySelector<HTMLElement>(`.inv-item[data-item="${d.uid}"]`);
    if (!itemEl) return;
    d.active = true;
    d.ghost = itemEl.cloneNode(true) as HTMLElement;
    d.ghost.classList.add('ghost');
    root.appendChild(d.ghost);
    itemEl.classList.add('lifted');
  }
  const rootRect = root.getBoundingClientRect();
  d.ghost!.style.left = `${event.clientX - rootRect.left - d.offX}px`;
  d.ghost!.style.top = `${event.clientY - rootRect.top - d.offY}px`;

  const counter = root.querySelector('.counter.drop');
  counter?.classList.toggle('hot', inside(counter.getBoundingClientRect(), event.clientX, event.clientY));
  const preview = root.querySelector<HTMLElement>('.preview');
  const stock = s.stock.find((x) => x.uid === d.uid);
  const spot = dropCell(d, event.clientX, event.clientY);
  if (preview && stock) {
    if (!spot) preview.style.display = 'none';
    else {
      const shape = G.shapeOf(cat, stock.itemId, stock.rot);
      const ok = G.canPlace(s, cat, stock.itemId, spot.x, spot.y, stock.rot, d.uid);
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
  if (d.kind === 'offer') {
    d.ghost?.remove();
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
  const g = s;
  if (!d.active) {
    // a tap: show the good's details
    ui.inspectUid = d.uid;
    ui.confirmDispose = false;
    ui.modal = 'inspect';
    render();
    return;
  }
  d.ghost?.remove();
  const v = G.currentVisitor(g);
  const counter = root.querySelector('.counter.drop');
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
    if (spot) G.moveStock(g, cat, d.uid, spot.x, spot.y);
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
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', () => {
    if (drag && drag.kind !== 'win') drag.ghost?.remove();
    drag = null;
    render();
  });
  window.addEventListener('resize', render);
  render();
}
