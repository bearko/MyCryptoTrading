import { satoshiSlip } from './dex';
import { B } from '../game/balance';
import { catalog as cat, COND_JA, RARITY_JA } from '../game/catalog';
import { wantText } from '../game/lines';
import { factionById, rivalOf, shown, standing } from '../game/factions';
import * as G from '../game/logic';
import type { GameState, Visitor } from '../game/state';
import { offerKey } from './counter';
import { ctx, isWide, TEMPER_JA, ui, stageWidth } from './core';
import { btn, esc, gum, itemTile, labels, num, pct, shapeIcon } from './html';
import { ICON } from './icons';

const SIZE_JA = { s: '小', m: '中', l: '大' } as const;

const rateText = (rate: number): string => `${rate < 0 ? '−' : '+'}${Math.round(Math.abs(rate) * 100)}%`;
/** beside the budget: how the chosen price has moved it */
const budgetTag = (): string => (ui.tier === 0 ? '' : `<em class="bud ${ui.tier < 0 ? 'up' : 'down'}">${rateText(-G.markupOf(ui.tier))}</em>`);
const oddsTone = (p: number): string => (p >= 0.75 ? 'safe' : p >= 0.45 ? 'even' : 'risky');

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
          <span class="line-main"><b class="pix">${esc(item.ja)}</b><small>${RARITY_JA[item.rarity]}・${COND_JA[o.cond]}・相場 ${num(G.stockValue(cat, o))}${o.seen ? `<b class="seen-note ${o.fake ? 'fake' : 'real'}">${o.fake ? '　レプリカ' : '　本物'}</b>` : ''}${o.hot ? '<b class="seen-note hot">　訳あり</b>' : ''}</small><span class="tags">${labels(item)}</span></span>
          <span class="line-shape">${shapeIcon(o.itemId)}<small>${G.shapeOf(cat, o.itemId, 0).cells.length}マス</small></span>
          <span class="line-price">${price}</span></button>`;
    })
    .join('');
  const some = G.quoteBuy(g, cat, v, ui.picked);
  const all = G.quoteBuy(g, cat, v, G.allPicks(v));
  const why = (q: G.BuyQuote): string => (q.block === 'shelf' ? '棚に置き場所なし' : q.block === 'gum' ? 'GUM 不足' : '');
  const allNote = all.rate > 0 ? `<em class="off">${Math.round(all.rate * 100)}% 引き</em>` : '';
  const actions = ui.beat
    ? meter('考えている…')
    : `<div class="actions two">${btn('buy-picked', `${some.count}個購入する`, { cls: 'primary', sub: some.count ? why(some) || gum(some.price) : '手前に品を置く', disabled: some.count === 0 || !!some.block, sfx: 'none' })}${btn('buy-all', 'まとめ買いする', { cls: 'gold', sub: why(all) || `${gum(all.price)}${all.rate > 0 ? `<em class="off mini">−${Math.round(all.rate * 100)}%</em>` : ''}`, disabled: !!all.block, sfx: 'none' })}</div>`;
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
      <div class="sum"><span>予算（残り）${budgetTag()}</span><b class="total">${gum(G.budgetAt(v, ui.tier))}</b></div>
      <p class="hint">棚の品をカウンターへドラッグすると、売上を試算します。帰ってもらうときはベルを鳴らします。</p></div>`;
  }
  const q = G.quoteSale(g, cat, v, ui.counter, ui.tier);
  const goods = ui.counter
    .map((uid) => {
      const stock = G.forSale(g).find((x) => x.uid === uid)!;
      const item = G.findItem(cat, stock.itemId);
      const wrong = !G.matches(cat, v.want, stock.itemId);
      return `<div class="line on ${wrong ? 'bad' : ''}" id="sline-${uid}">${itemTile(item, 'sm')}<span class="line-main"><b class="pix">${esc(item.ja)}</b>${wrong ? '<small class="bad">希望と違う</small>' : `<small>相場 ${num(G.stockValue(cat, stock))}${stock.fake && stock.seen ? '<b class="seen-note fake">　レプリカ</b>' : ''}</small>`}</span><span class="line-price"><b class="ask">${num(G.salePrice(cat, stock, ui.tier))}</b></span></div>`;
    })
    .join('');
  const over = q.over > 0;
  const foot = ui.beat
    ? meter('考えている…')
    : `<div class="actions one">${btn('sell', 'この金額で販売する', { cls: 'primary', disabled: !q.matches, sfx: 'none' })}</div>`;
  // the asking total sits right above the budget it is measured against
  return `<div class="win-scroll">${want}<div class="lines">${goods}</div></div>
    <div class="win-foot">
      <div class="sum ${over ? 'bad' : ''}"><span>売上金額</span><b class="total">${gum(q.asked)}</b></div>
      ${
        over
          ? `<div class="sum minor bad"><span>予算オーバー</span><b>${num(q.over)} GUM（受け取りは ${num(q.paid)}）</b></div>`
          : // what the customer still has after this sale: how much more can be put on the counter
            `<div class="sum rest" id="sum-rest"><span>予算の残り${budgetTag()}</span><b><s>${num(q.budget)}</s><i>▶</i>${gum(q.budget - q.asked)}</b></div>`
      }
      ${ui.tier !== 0 ? `<div class="sum tierline ${ui.tier < 0 ? 'kind' : ''}"><span>${ui.tier < 0 ? '値引き' : '上乗せ'}</span><b>${rateText(G.markupOf(ui.tier))}</b></div>` : ''}
      ${!q.matches ? '<p class="note bad">希望と違う品は受け取ってもらえません。</p>' : q.chance < 1 ? chanceBar(q.chance) : ''}
      ${foot}
    </div>`;
}

/** A house's regard as one line: its mark, the points, and what the next rank needs. */
function favorLine(g: GameState, v: Visitor): string {
  if (!v.faction) return '';
  const f = factionById(v.faction);
  const pts = g.favor[v.faction];
  const rival = rivalOf(v.faction);
  const signed = (points: number): string => `${shown(points) > 0 ? '+' : ''}${shown(points)}`;
  const versus = rival ? `<div class="nego-fac rival"><span>対立</span><span class="fac f-${rival}">${factionById(rival).ja}</span><b>${signed(g.favor[rival])}</b></div>` : '';
  return `<div class="nego-fac"><span class="fac f-${f.id}">${f.ja}</span><span>の評価</span><b>${signed(pts)}</b><small>${standing(f, pts)}</small></div>${versus}`;
}

/**
 * The bargaining panel: it opens beside the slip (over the customer), so the slip itself only has to say
 * what is traded, for how much, and yes or no. Hard prices can be refused; kind prices never are, and
 * they earn the regard of the customer's house.
 */
function negoPanel(g: GameState, v: Visitor): string {
  if (!ui.haggleOpen || ui.beat) return '';
  const rival = v.faction ? rivalOf(v.faction) : null;
  const house = v.faction ? `${factionById(v.faction).ja}の評価が上がる${rival ? `（対立する${factionById(rival).ja}は下がる）` : ''}` : '気前のいい値';
  const grudge = v.faction ? `<p class="nego-grudge">${v.kind === 'sell' ? '大きく値切る' : '大きく上乗せする'}と、${factionById(v.faction).ja}の評価が下がる${rival ? `（${factionById(rival).ja}は喜ぶ）` : ''}</p>` : '';
  let body: string;
  if (v.kind === 'sell') {
    if (v.haggled) {
      body = '<p class="nego-note">このお客さんとの交渉は、もう済んでいます。</p>';
    } else {
      const hard = B.discountTiers
        .map((rate, tier) => {
          const p = G.discountChance(g, v, tier);
          return `<button class="nopt ${oddsTone(p)}" data-act="haggle" data-arg="${tier}" data-sfx="none"><b>−${Math.round(rate * 100)}%</b><small>${pct(p)}</small></button>`;
        })
        .join('');
      const kind = B.generousTiers
        .map((rate, tier) => `<button class="nopt kind" data-act="sweeten" data-arg="${tier}" data-sfx="none"><b>+${Math.round(rate * 100)}%</b><small>評価 +${B.favorGenerous[tier]}</small></button>`)
        .join('');
      body = `<p class="nego-h">値切る<small>成功率。断られると我慢が減る</small></p><div class="nopts three">${hard}</div>${grudge}
        <p class="nego-h kind">色をつける<small>多く払う。${house}</small></p><div class="nopts two">${kind}</div>`;
    }
  } else {
    const opts = G.SALE_TIERS.map((tier) => {
      const p = ui.counter.length > 0 ? G.quoteSale(g, cat, v, ui.counter, tier).chance : G.tierChance(g, v, tier);
      const sub = tier < 0 ? `評価 +${G.saleFavor(tier)}` : tier === 0 ? '必ず売れる' : `成功 ${pct(p)}`;
      return `<button class="nopt ${tier < 0 ? 'kind' : tier === 0 ? 'fair' : oddsTone(p)} ${tier === ui.tier ? 'on' : ''}" data-act="tier" data-arg="${tier}" aria-pressed="${tier === ui.tier}"><b>${tier === 0 ? '定価' : rateText(G.markupOf(tier))}</b><small>${sub}</small></button>`;
    }).join('');
    const now = G.budgetAt(v, ui.tier);
    body = `<p class="nego-h">値付け<small>安くすると予算が増え、高くすると減る</small></p><div class="nopts two">${opts}</div>${grudge}
      <div class="nego-bud"><span>予算</span>${ui.tier !== 0 ? `<s>${num(v.budget)}</s>` : ''}<b>${num(now)}</b>${budgetTag()}</div>`;
  }
  return `<div class="nego paper kind-${v.kind}" id="nego" data-ui>
    <div class="nego-bar"><b>交渉</b>${v.kind === 'sell' ? '<small>1 人 1 回</small>' : ''}<button class="win-btn" data-act="haggle-close" data-sfx="close" aria-label="交渉を閉じる">${ICON.close}</button></div>
    <div class="nego-body">${body}${favorLine(g, v)}</div>
  </div>`;
}

/** The customer window: a slip of paper. Its bar is a handle; it can be made bigger, closed, and reopened. */
export function customerWindow(g: GameState, v: Visitor): string {
  if (!ui.win.open || v.done) return '';
  const hero = cat.heroById.get(v.heroId)!;
  if (v.special === 'patrol') {
    // a patrol's slip: what it found on the shelf, and what that cost
    const seized = v.seized ?? [];
    const rows = seized.map((id) => `<div class="line">${itemTile(G.findItem(cat, id), 'sm')}<span class="line-main"><b class="pix">${esc(G.findItem(cat, id).ja)}</b><small class="bad">没収</small></span></div>`).join('');
    return `<div class="win paper small kind-buy" id="win" data-ui style="left:${ui.win.x}px;top:${ui.win.y}px">
    <div class="win-bar"><span class="win-kind"><span>見回り</span><span class="wide">の調べ</span></span><i class="win-grip" aria-hidden="true"></i>
      <button class="win-btn" data-act="win-close" data-sfx="close" aria-label="閉じる">${ICON.close}</button></div>
    <div class="win-who"><b>${esc(hero.ja)}</b>${v.faction ? `<span class="fac f-${v.faction}">${factionById(v.faction).ja}</span>` : ''}</div>
    <div class="win-body patrol-body">${seized.length ? `${rows}<div class="sum"><span>罰金</span><b class="bad">−${num(v.fine ?? 0)}</b></div><p class="hint">訳ありの品は、棚にあると見つかります。ウォレットの中は調べられません。</p>` : '<p class="hint">棚に、訳ありの品はありませんでした。</p>'}
      <p class="hint">ベルを鳴らして、見送ります。</p></div>
    <i class="teeth" aria-hidden="true"></i>
  </div>`;
  }
  if (v.special === 'satoshi') return satoshiSlip(g, v, hero.ja);
  if (v.special === 'teacher') {
    // the one who teaches, come before closing: there is nothing to trade, only to listen
    return `<div class="win paper small kind-buy rent-win" id="win" data-ui style="left:${ui.win.x}px;top:${ui.win.y}px">
    <div class="win-bar"><span class="win-kind"><span>先生</span></span><i class="win-grip" aria-hidden="true"></i></div>
    <div class="win-who"><b>${esc(hero.ja)}</b><em class="temper t0">恩人</em></div>
    <div class="win-body"><p class="hint">${ui.cameo ? '話を聞きましょう（クリックか Space でつづき）。' : '話は済みました。ベルを鳴らして、見送ります。'}</p></div>
    <i class="teeth" aria-hidden="true"></i>
  </div>`;
  }
  if (v.special === 'courier') {
    // the keeper of the night shop, with last night's box: nothing to trade
    return `<div class="win paper small kind-buy rent-win" id="win" data-ui style="left:${ui.win.x}px;top:${ui.win.y}px">
    <div class="win-bar"><span class="win-kind"><span>配達</span></span><i class="win-grip" aria-hidden="true"></i></div>
    <div class="win-who"><b>${esc(hero.ja)}</b><em class="temper t0">夜のショップ</em></div>
    <div class="win-body"><div class="sum"><span>届いた箱</span><b class="total">${g.crates.length} 箱</b></div>
      <p class="hint">電話の横の荷物から、開けるか、箱のまま棚に置けます。ベルを鳴らして、見送ります。</p></div>
    <i class="teeth" aria-hidden="true"></i>
  </div>`;
  }
  if (v.special === 'landlord') {
    // the landlord's slip: pay, do not pay, or buy the shop outright
    const can = G.rentChoices(g);
    const refuse = can.waive ? '家賃を払わない<em>口添えで 1 回だけ待ってもらう</em>' : '家賃を払わない<em>店を失います</em>';
    const foot = ui.rentAsk
      ? `<p class="note bad">${can.waive ? `払わなかった ${num(g.rent)} GUM は、次回の家賃に上乗せされます。` : '口添えがないので、店を明けわたすことになります（ゲームオーバー）。'}</p>
        <div class="actions two">${btn('rent-skip', '本当に払わない', { cls: 'danger', sfx: 'none' })}${btn('rent-back', 'やめる', { cls: 'ghost' })}</div>`
      : `<div class="actions one">${btn('rent-pay', `家賃を支払う<em>${num(g.rent)} GUM</em>`, { cls: 'primary', disabled: !can.pay, sfx: 'none' })}</div>
        ${g.gum >= B.deedPrice ? `<div class="actions one">${btn('deed', `店を買い取る<em>${num(B.deedPrice)} GUM ※ゲームクリア</em>`, { cls: 'gold', disabled: !can.buy, sfx: 'none' })}</div>${g.loan ? '<p class="note bad">ギルドへの返済が残っているあいだは、買い取れません。</p>' : ''}` : ''}
        <div class="actions one">${btn('rent-ask', refuse, { cls: 'ghost', sfx: 'none' })}</div>`;
    return `<div class="win paper small kind-buy rent-win" id="win" data-ui style="left:${ui.win.x}px;top:${ui.win.y}px">
    <div class="win-bar"><span class="win-kind"><span>家賃</span><span class="wide">の日</span></span><i class="win-grip" aria-hidden="true"></i></div>
    <div class="win-who"><b>${esc(hero.ja)}</b><em class="temper t0">大家</em></div>
    <div class="win-body"><div class="sum"><span>今回の家賃</span><b class="total">${gum(g.rent)}</b></div><div class="sum minor"><span>所持金</span><b>${gum(g.gum)}</b></div>${foot}</div>
    <i class="teeth" aria-hidden="true"></i>
  </div>`;
  }
  const pips = Array.from({ length: B.temperPatience[v.temper] }, (_, i) => `<i class="${i < v.patience ? 'on' : ''}"></i>`).join('');
  const spent = v.kind === 'sell' && v.haggled;
  return `<div class="win paper ${ui.win.size === 'l' ? 'big' : ui.win.size === 's' ? 'small mini' : 'small'} kind-${v.kind} ${ui.beat ? 'beating' : ''}" id="win" data-ui style="left:${ui.win.x}px;top:${ui.win.y}px">
    <div class="win-bar"><span class="win-kind"><span>${v.special === 'dealer' ? '引取' : v.kind === 'sell' ? '買取' : '販売'}</span><span class="wide">伝票</span></span><i class="win-grip" aria-hidden="true"></i>
      <button class="win-btn win-size" data-act="win-size" aria-label="サイズ変更（いまは${SIZE_JA[ui.win.size]}）">${ICON.size}<b>${SIZE_JA[ui.win.size]}</b></button>
      <button class="win-btn win-nego ${v.special === 'dealer' ? 'gone' : ''} ${ui.haggleOpen ? 'on' : ''} ${spent ? 'spent' : ''}" data-act="haggle-open" data-sfx="none" aria-pressed="${ui.haggleOpen}" aria-label="交渉する${spent ? '（済み）' : ''}">${ICON.nego}<b>${spent ? '交渉済' : '交渉'}</b></button>
      <button class="win-btn" data-act="win-close" data-sfx="close" aria-label="閉じる">${ICON.close}</button>
    </div>
    <div class="win-who"><b>${esc(hero.ja)}</b>${v.faction ? `<span class="fac f-${v.faction}">${factionById(v.faction).ja}</span>` : ''}<em class="temper t${v.temper}">${TEMPER_JA[v.temper]}</em><span class="pips ink" aria-label="我慢 ${v.patience}">${pips}</span></div>
    <div class="win-body">${v.kind === 'sell' ? sellerBody(g, v) : buyerBody(g, v)}</div>
    <i class="teeth" aria-hidden="true"></i>
  </div>${negoPanel(g, v)}`;
}

const WIN_KEY = 'mycryptotrading.win.v1';

/** Puts the slip where the player last left it (kept in the browser, apart from the save). */
export function restoreWindow(): void {
  ui.win.moved = false;
  try {
    const raw = JSON.parse(localStorage.getItem(WIN_KEY) ?? 'null') as { x?: unknown; y?: unknown } | null;
    if (raw && typeof raw.x === 'number' && typeof raw.y === 'number') {
      ui.win.x = raw.x;
      ui.win.y = raw.y;
      ui.win.moved = true;
    }
  } catch {
    // (no storage: the slip opens in its usual place)
  }
}

/** Remembers where the player left the slip. */
export function rememberWindow(): void {
  try {
    localStorage.setItem(WIN_KEY, JSON.stringify({ x: ui.win.x, y: ui.win.y }));
  } catch {
    // (no storage: the place holds until the page is closed)
  }
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
  // (a seller's "bring it all over" button stands on the counter's edge: the slip ends above it)
  const lip = root.querySelector('#take-all') ? 32 : 12;
  win.style.maxHeight = ui.win.moved || edge === undefined ? `${Math.max(200, room)}px` : `${Math.max(150, edge - base.top - ui.win.y - lip)}px`;
  // (on a wide screen the slip keeps to the shop's side)
  const areaW = stageWidth();
  // (on a wide screen the slip opens clear of the showcase on the wall, until it is moved by hand)
  // (the showcase grows sideways with its slots)
  if (isWide() && !ui.win.moved) {
    // (the customer stands in the middle: the slip opens to their right, before the right wall; where the
    // opening is too narrow for that, it lies over the wall, so the customer and their goods stay in view)
    const wallW = root.querySelector<HTMLElement>('.wall.wr')?.offsetWidth ?? 0;
    const far = root.querySelector<HTMLElement>('#far .zone-goods')?.getBoundingClientRect();
    const clear = far && far.width > 0 ? far.right - base.left + 28 : areaW / 2 + 70;
    ui.win.x = Math.round(Math.max(areaW - wallW - win.offsetWidth - 12, clear));
  }
  ui.win.x = Math.max(0, Math.min(ui.win.x, areaW - win.offsetWidth));
  ui.win.y = Math.max(0, Math.min(ui.win.y, root.clientHeight - 48));
  win.style.left = `${ui.win.x}px`;
  win.style.top = `${ui.win.y}px`;
  // the bargaining panel stands to the right of the slip; where there is no room, it lies over the slip, under its bar
  const nego = root.querySelector<HTMLElement>('#nego');
  if (nego) {
    const right = ui.win.x + win.offsetWidth + 6;
    const beside = areaW - right - 6;
    const width = beside >= 140 ? Math.min(beside, 230) : Math.min(230, areaW - 12);
    const left = beside >= 140 ? right : Math.max(6, Math.min(ui.win.x + win.offsetWidth - width - 6, areaW - width - 6));
    const top = beside >= 140 ? ui.win.y : ui.win.y + 46;
    nego.style.width = `${width}px`;
    nego.style.left = `${left}px`;
    nego.style.top = `${Math.min(top, root.clientHeight - 120)}px`;
    nego.style.maxHeight = `${Math.max(140, base.height - top - 12)}px`;
  }
}
