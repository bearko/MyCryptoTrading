import { B, WEEKDAYS } from '../game/balance';
import { catalog as cat, COND_JA, KIND_JA, RARITY_JA } from '../game/catalog';
import { wantText } from '../game/lines';
import * as G from '../game/logic';
import * as store from '../game/save';
import type { GameState, StockItem, Visitor } from '../game/state';

/** Screen state that is not part of the saved game. */
interface Ui {
  screen: 'title' | 'game';
  sheet: 'none' | 'stock' | 'help';
  haggleOpen: boolean;
  selectedUid: number | null;
  confirmDispose: number | null;
  confirmReset: boolean;
  /** a short note over the counter (money moved, shelf full …) */
  flash: { text: string; tone: 'good' | 'bad' | 'info' } | null;
  /** changes whenever a new customer steps up, to replay the entrance animation */
  enterKey: number;
}

let s: GameState | null = null;
const ui: Ui = { screen: 'title', sheet: 'none', haggleOpen: false, selectedUid: null, confirmDispose: null, confirmReset: false, flash: null, enterKey: 0 };
let root: HTMLElement;
/** the customer whose entrance has already been animated */
let shownKey = -1;

const esc = (text: string | number): string =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const gum = (n: number): string => `<span class="gum"><img src="${cat.icons.gum}" alt="GUM" />${n.toLocaleString('ja-JP')}</span>`;
const pct = (p: number): string => `${Math.round(p * 100)}%`;
const TEMPER_JA = ['気さく', 'ふつう', '頑固'];

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
  </header>`;
}

function scene(g: GameState, v: Visitor | null, keeperLine: string, keeperPose: keyof typeof cat.keeper = 'idle'): string {
  let customer = '';
  if (v) {
    const hero = cat.heroById.get(v.heroId)!;
    const pips = '●'.repeat(Math.max(0, v.patience)) + '○'.repeat(Math.max(0, B.temperPatience[v.temper] - v.patience));
    customer = `<div class="customer ${ui.enterKey !== shownKey ? 'enter' : ''} ${v.done ? 'leaving' : ''} mood-${v.mood}">
      <div class="bubble">${esc(v.line)}</div>
      <img class="hero" src="${hero.img}" alt="" />
      <div class="plate"><b>${esc(hero.ja)}</b><span>${TEMPER_JA[v.temper]}　我慢 ${pips}</span></div>
    </div>`;
  } else {
    customer = `<div class="keeper-talk"><div class="bubble">${esc(keeperLine)}</div></div>`;
  }
  const flash = ui.flash ? `<div class="flash ${ui.flash.tone}">${esc(ui.flash.text)}</div>` : '';
  const left = g.phase === 'open' ? `<div class="line-left">残り ${G.visitorsLeft(g)} 人</div>` : '';
  return `<section class="scene" style="background-image:url('${cat.backdrop}')">
    ${left}${customer}${flash}
    <img class="keeper" src="${cat.keeper[keeperPose]}" alt="" />
    <div class="counter"></div>
  </section>`;
}

// ---------------------------------------------------------------- phases

function morning(g: GameState): string {
  const offers = g.wholesale
    .map((o, i) => {
      const full = g.stock.length >= g.capacity;
      const label = o.sold ? '仕入れ済み' : full ? '棚がいっぱい' : `仕入れる ${gum(o.price)}`;
      return `<div class="row">${itemCard(o.itemId, o.cond)}${btn('wholesale', label, { arg: i, cls: 'small', disabled: o.sold || full || g.gum < o.price })}</div>`;
    })
    .join('');
  const note = g.nightNote ? `<p class="note">${esc(g.nightNote)}</p>` : '';
  return `<section class="panel">
    <h2>朝の仕入れ</h2>
    ${note}
    <p class="hint">卸売り商が来ています。相場より少し安く仕入れられます。今日のお客さんは ${G.visitorsFor(g.rep)} 人の見込み。</p>
    ${offers}
    <div class="actions sticky">${btn('open', '店を開ける', { cls: 'primary big' })}</div>
  </section>`;
}

function sellerPanel(g: GameState, v: Visitor): string {
  const block = G.buyBlock(g, v.ask);
  const why = block === 'shelf' ? '棚がいっぱいです' : block === 'gum' ? 'GUM が足りません' : '';
  const profit = Math.round(G.itemValue(cat, v.itemId, v.cond) * B.retail) - v.ask;
  let actions: string;
  if (ui.haggleOpen && !v.haggled) {
    actions =
      B.discountTiers
        .map((rate, tier) =>
          btn('haggle', `${Math.round(rate * 100)}% 引きを求める`, { arg: tier, sub: `${gum(G.discountedAsk(v, tier))}　成功率 ${pct(G.discountChance(g, v, tier))}` }),
        )
        .join('') + btn('haggle-close', 'やめる', { cls: 'ghost' });
  } else {
    actions = [
      btn('accept', '買う', { cls: 'primary', sub: gum(v.ask), disabled: !!block }),
      btn('haggle-open', v.haggled ? '値切り済み' : '値切る', { disabled: v.haggled, sub: v.haggled ? '' : '断られると我慢が減る' }),
      btn('tip', '色をつけて買う', { sub: `${gum(G.tipPrice(v))}　評判 +${B.tipRep}`, disabled: !!G.buyBlock(g, G.tipPrice(v)) }),
      btn('pass', '見送る', { cls: 'ghost' }),
    ].join('');
  }
  return `<section class="panel">
    <h2>買い取り <small>言い値 ${gum(v.ask)}</small></h2>
    ${itemCard(v.itemId, v.cond, `<div class="item-note ${profit >= 0 ? 'good' : 'bad'}">定価で売れば ${profit >= 0 ? '+' : ''}${profit}</div>`)}
    ${why ? `<p class="note bad">${why}</p>` : ''}
    <div class="actions">${actions}</div>
  </section>`;
}

function buyerPanel(g: GameState, v: Visitor): string {
  const fits = g.stock.filter((x) => G.matches(cat, v.want, x.itemId));
  const selected = fits.find((x) => x.uid === ui.selectedUid) ?? null;
  const head = `<h2>販売 <small>希望：${esc(wantText(v.want))}　予算 ${gum(v.budget)}</small></h2>`;
  if (fits.length === 0) {
    return `<section class="panel">${head}<p class="note">希望に合う品が棚にありません。</p><div class="actions">${btn('pass', '謝って見送る', { cls: 'ghost' })}</div></section>`;
  }
  const list = fits
    .map((x) => {
      const item = G.findItem(cat, x.itemId);
      const fair = G.salePrice(cat, x, 0);
      return `<button class="pickitem r${item.rarity} ${selected?.uid === x.uid ? 'on' : ''} ${fair > v.budget ? 'over' : ''}" data-act="select" data-arg="${x.uid}">
        <img src="${item.img}" alt="" /><span>${fair.toLocaleString('ja-JP')}</span></button>`;
    })
    .join('');
  let detail = '<p class="hint">売る品をタップして選びます（数字は定価）。</p>';
  if (selected) {
    const tiers = B.markupTiers
      .map((rate, tier) => {
        const price = G.salePrice(cat, selected, tier);
        const over = price > v.budget;
        const label = tier === 0 ? '定価で売る' : `+${Math.round(rate * 100)}% で売る`;
        return btn('offer', label, { arg: tier, cls: tier === 0 ? 'primary' : '', disabled: over, sub: over ? `${gum(price)}　予算オーバー` : `${gum(price)}　成功率 ${pct(G.markupChance(g, v, tier))}` });
      })
      .join('');
    detail = `${itemCard(selected.itemId, selected.cond, `<div class="item-note">仕入れ値 ${selected.paid}</div>`)}<div class="actions">${tiers}</div>`;
  }
  return `<section class="panel">${head}<div class="picklist">${list}</div>${detail}<div class="actions">${btn('pass', '見送る', { cls: 'ghost' })}</div></section>`;
}

function afterDeal(g: GameState): string {
  const last = G.visitorsLeft(g) === 0;
  return `<section class="panel"><div class="actions">${btn('next', last ? '店を閉める' : '次のお客さんを呼ぶ', { cls: 'primary big' })}</div></section>`;
}

function evening(g: GameState): string {
  const t = g.today;
  const net = t.revenue - t.spend;
  const cost = G.shelfCost(g);
  let rent = '';
  if (G.isRentDay(g)) {
    const short = g.gum < g.rent;
    rent = `<p class="note ${short ? 'bad' : ''}">今夜は家賃の支払日です（${gum(g.rent)}）。${
      short ? (g.graceLeft > 0 ? '足りない場合は、一度だけ猶予が使えます（次回の家賃に上乗せ）。' : '足りないと店を失います。在庫を処分して工面しましょう。') : ''
    }</p>`;
  }
  const deed = g.owned
    ? '<p class="note good">この店はあなたのものです。家賃はもうかかりません。</p>'
    : `<div class="row"><div><b>店の権利書</b><div class="hint">買い取れば家賃から解放されます（クリア）。</div></div>${btn('deed', `買い取る ${gum(B.deedPrice)}`, { cls: 'small gold', disabled: g.gum < B.deedPrice })}</div>`;
  const shelf =
    cost === null
      ? ''
      : `<div class="row"><div><b>棚を広げる</b><div class="hint">在庫 ${g.capacity} → ${g.capacity + B.shelfStep} 枠</div></div>${btn('shelf', `広げる ${gum(cost)}`, { cls: 'small', disabled: g.gum < cost })}</div>`;
  return `<section class="panel">
    <h2>${g.day}日目の締め</h2>
    <table class="sum">
      <tr><td>売上</td><td>${gum(t.revenue)}</td></tr>
      <tr><td>仕入れ</td><td>${gum(t.spend)}</td></tr>
      <tr class="${net >= 0 ? 'good' : 'bad'}"><td>収支</td><td>${net >= 0 ? '+' : '−'}${gum(Math.abs(net))}</td></tr>
      <tr><td>取引</td><td>買 ${t.bought}・売 ${t.sold}${t.walkouts ? `・怒って帰った ${t.walkouts}` : ''}</td></tr>
    </table>
    ${rent}${deed}${shelf}
    <div class="actions sticky">${btn('endday', '眠って翌日へ', { cls: 'primary big' })}</div>
  </section>`;
}

function ending(g: GameState): string {
  if (g.phase === 'won') {
    return `<section class="panel end">
      <h2>店を買い取った！</h2>
      <p>${g.ownedDay}日目で権利書を手に入れました。もう家賃に追われることはありません。</p>
      <table class="sum"><tr><td>売った品</td><td>${g.totals.sold}</td></tr><tr><td>買った品</td><td>${g.totals.bought}</td></tr><tr><td>最高の売値</td><td>${gum(g.totals.bestSale)}</td></tr></table>
      <div class="actions">${btn('continue', 'このまま店を続ける', { cls: 'primary big' })}${btn('restart', '最初からやり直す', { cls: 'ghost' })}</div>
    </section>`;
  }
  return `<section class="panel end">
    <h2>店を失った…</h2>
    <p>${g.day}日目、家賃を払えませんでした。相場より安く買い、欲しがる人に高く売るのが商いの基本です。</p>
    <div class="actions">${btn('restart', 'もう一度はじめる', { cls: 'primary big' })}</div>
  </section>`;
}

function stockSheet(g: GameState): string {
  const rows = g.stock
    .map((x: StockItem) => {
      const confirm = ui.confirmDispose === x.uid;
      const price = G.disposePrice(cat, x);
      return `<div class="row">${itemCard(x.itemId, x.cond, `<div class="item-note">仕入れ値 ${x.paid}</div>`)}${btn('dispose', confirm ? `本当に処分 ${gum(price)}` : `処分 ${gum(price)}`, { arg: x.uid, cls: `small ${confirm ? 'danger' : 'ghost'}` })}</div>`;
    })
    .join('');
  return `<div class="sheet"><div class="sheet-body">
    <h2>在庫 ${g.stock.length} / ${g.capacity}</h2>
    <p class="hint">処分すると卸売り商が相場の半値で引き取ります。</p>
    ${rows || '<p class="note">棚は空です。</p>'}
    <div class="actions">${btn('sheet-close', '閉じる', { cls: 'primary' })}</div>
  </div></div>`;
}

function helpSheet(): string {
  return `<div class="sheet"><div class="sheet-body">
    <h2>遊びかた</h2>
    <ol class="help">
      <li>朝、卸売り商から品を仕入れて店を開けます。</li>
      <li>お客さんは「売りに来た人」と「買いに来た人」。安く買い取り、欲しがる人に売って GUM を稼ぎます。</li>
      <li>値切りや上乗せは断られると相手の「我慢」が減り、0 になると怒って帰ります（評判が下がります）。頑固な相手ほど通りにくい。</li>
      <li>良心的な取引をすると評判（★）が上がり、お客さんが増えて、値の張る品も集まります。</li>
      <li>7日ごとに家賃を払います。家賃は毎回上がります。払えないと店を失います（猶予は一度だけ）。</li>
      <li>${B.deedPrice.toLocaleString('ja-JP')} GUM を貯めて、締めの画面で店の権利書を買い取ればクリアです。</li>
    </ol>
    <div class="actions">${btn('sheet-close', '閉じる', { cls: 'primary' })}</div>
    ${s ? `<div class="actions">${btn('reset', ui.confirmReset ? '本当に最初からやり直す' : '最初からやり直す', { cls: ui.confirmReset ? 'danger' : 'ghost' })}</div>` : ''}
    <p class="credit">素材：My Crypto Heroes（© MCH Co.,Ltd.）／クリスくん ドット絵：こじもこ。本作は非公式の二次創作です。</p>
  </div></div>`;
}

function title(): string {
  const saved = store.load();
  return `<div class="title" style="background-image:url('${cat.backdrop}')">
    <div class="title-card">
      <img class="title-keeper" src="${cat.keeper.cheer}" alt="" />
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

// ---------------------------------------------------------------- render and input

function render(): void {
  let html: string;
  if (ui.screen === 'title' || !s) {
    html = title();
  } else {
    const g = s;
    const v = G.currentVisitor(g);
    let body: string;
    let sceneHtml: string;
    if (g.phase === 'morning') {
      sceneHtml = scene(g, null, g.day === 1 ? 'まずは店を開けよう。安く買って、欲しがる人に売るんだ。' : G.daysToRent(g) <= 1 && !g.owned ? '家賃の日が近い。手元の GUM を残しておこう。' : '今日もいい品が集まりますように。', 'think');
      body = morning(g);
    } else if (g.phase === 'open' && v) {
      sceneHtml = scene(g, v, '');
      body = v.done ? afterDeal(g) : v.kind === 'sell' ? sellerPanel(g, v) : buyerPanel(g, v);
    } else if (g.phase === 'evening') {
      const net = g.today.revenue - g.today.spend;
      sceneHtml = scene(g, null, net > 0 ? '今日もおつかれさま。いい商いだったね。' : '今日は仕入れの日だった。明日売ろう。', net > 0 ? 'smile' : 'idle');
      body = evening(g);
    } else {
      sceneHtml = scene(g, null, g.phase === 'won' ? 'やった！ 今日からここは、ぼくたちの店だ！' : 'ごめん……店を守れなかった。', g.phase === 'won' ? 'cheer' : 'sad');
      body = ending(g);
    }
    html = `${hud(g)}${sceneHtml}<main class="body">${body}</main>
      <nav class="bar">${btn('stock', `在庫 ${g.stock.length}/${g.capacity}`, { cls: 'small' })}${btn('help', '遊びかた', { cls: 'small ghost' })}</nav>`;
  }
  if (ui.sheet === 'stock' && s) html += stockSheet(s);
  if (ui.sheet === 'help') html += helpSheet();
  const scroll = root.querySelector('.body')?.scrollTop ?? 0;
  root.innerHTML = html;
  const body = root.querySelector('.body');
  if (body) body.scrollTop = scroll;
  ui.flash = null;
  if (s && G.currentVisitor(s)) shownKey = ui.enterKey;
}

function note(text: string, tone: 'good' | 'bad' | 'info'): void {
  ui.flash = { text, tone };
}

function act(name: string, arg: string | undefined): void {
  const n = arg === undefined ? 0 : Number(arg);
  if (name === 'help') ui.sheet = 'help';
  else if (name === 'sheet-close') {
    ui.sheet = 'none';
    ui.confirmDispose = null;
    ui.confirmReset = false;
  } else if (name === 'new' || name === 'restart') {
    store.clear();
    s = G.newGame((Date.now() ^ (Math.random() * 0x7fffffff)) | 0, cat);
    ui.screen = 'game';
  } else if (name === 'resume') {
    s = store.load();
    ui.screen = s ? 'game' : 'title';
  } else if (name === 'reset') {
    if (!ui.confirmReset) ui.confirmReset = true;
    else {
      store.clear();
      s = null;
      ui.screen = 'title';
      ui.sheet = 'none';
      ui.confirmReset = false;
    }
  } else if (s) gameAct(s, name, n);
  if (s && ui.screen === 'game') store.save(s);
  render();
}

function gameAct(g: GameState, name: string, n: number): void {
  const v = G.currentVisitor(g);
  const before = g.gum;
  switch (name) {
    case 'stock':
      ui.sheet = 'stock';
      break;
    case 'wholesale':
      if (G.buyWholesale(g, n)) note(`−${before - g.gum} GUM`, 'info');
      break;
    case 'open':
      G.openShop(g, cat);
      newCustomer();
      break;
    case 'next':
      G.callNext(g, cat);
      newCustomer();
      break;
    case 'accept':
    case 'tip':
      if (G.acceptAsk(g, name === 'tip')) note(`−${before - g.gum} GUM${name === 'tip' ? `　評判 +${B.tipRep}` : ''}`, 'info');
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
    case 'select':
      ui.selectedUid = n;
      break;
    case 'offer': {
      if (ui.selectedUid === null) break;
      const result = G.offer(g, cat, ui.selectedUid, n);
      if (result === 'sold') note(`+${g.gum - before} GUM`, 'good');
      else if (result === 'left') note('怒って帰ってしまった…', 'bad');
      else if (result === 'refused') note('断られた', 'bad');
      break;
    }
    case 'pass':
      G.pass(g);
      break;
    case 'dispose':
      if (ui.confirmDispose !== n) ui.confirmDispose = n;
      else {
        G.dispose(g, cat, n);
        ui.confirmDispose = null;
        if (ui.selectedUid === n) ui.selectedUid = null;
      }
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
}

function newCustomer(): void {
  ui.enterKey += 1;
  ui.haggleOpen = false;
  ui.selectedUid = null;
}

export function mount(el: HTMLElement): void {
  root = el;
  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target || (target as HTMLButtonElement).disabled) return;
    act(target.dataset.act!, target.dataset.arg);
  });
  render();
}
