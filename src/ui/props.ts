/**
 * The things of the shop that are used by hand rather than through a menu (a wide screen shows them
 * beside the shelf): the bin — goods are dragged into it — and the bed — a click on it at night ends the day.
 */
import { knows, mustShop } from '../game/guide';
import { MARK_JA, MARKS } from '../game/kinds';
import { catalog as cat, HERO_CLASS_JA, PARAM_JA, RARITY_JA, CRATE_IDS } from '../game/catalog';
import * as G from '../game/logic';
import { SLOT_IDS, type GameState } from '../game/state';
import { B, WEEKDAYS } from '../game/balance';
import { FACTIONS, factionById, rivalOf } from '../game/factions';
import { GROUP_JA, hasService, lineOf, loanBlock, loanNightly, loanTotal, serviceBlock, SERVICES, SUPPLIES, supplyBlock, trustDaily, type ServiceId } from '../game/network';
import { rungIcon } from './hooks';
import { atHome, caseCellFor, ctx, ui } from './core';
import { gridItem } from './grid';
import { btn, esc, gum, itemTile, num } from './html';

// drawn flat, in the shop's own ink and paper (no pictures of their own in the catalogue)
const BIN = `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="p-ink" d="M10 16h44v6H10z"/><path class="p-ink" d="M24 9h16v8H24z"/><path class="p-fill" d="M14 22h36l-4 34H18z"/><path class="p-ink" d="M14 22h36l-4 34H18zm4 4 3 26h22l3-26z" fill-rule="evenodd"/><path class="p-ink" d="M25 29h3v20h-3zM36 29h3v20h-3z"/></svg>`;
const RACK = `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="p-ink" d="M8 6h48v52H8z"/><path class="p-paper" d="M12 10h40v44H12z"/><path class="p-ink" d="M12 24h40v4H12zM12 40h40v4H12z"/><path class="p-fill" d="M16 13h10v9H16zM31 14h8v8h-8zM42 12h7v10h-7zM17 30h12v8H17zM36 29h10v9H36zM20 46h9v6h-9zM34 45h12v7H34z"/></svg>`;
// (the bedding, folded and put away: three folds of mattress and quilt, the pillow on top)
const BED = `<svg viewBox="0 0 96 80" aria-hidden="true"><path class="p-ink" d="M4 56h88v20H4z"/><path class="p-paper" d="M8 60h80v12H8z"/><path class="p-ink" d="M8 38h80v20H8z"/><path class="p-fill" d="M12 42h72v12H12z"/><path class="p-ink" d="M12 22h72v18H12z"/><path class="p-paper" d="M16 26h64v10H16z"/><path class="p-ink" d="M26 8h44v16H26z"/><path class="p-paper" d="M30 12h36v8H30z"/><path class="p-z" d="M76 2h10v3l-6 5h6v3H76v-3l6-5h-6z"/></svg>`;

export function deckProps(g: GameState): string {
  if (!atHome(g)) return '';
  const night = g.phase === 'evening';
  const count = g.trash.length;
  const worn = SLOT_IDS.filter((slot) => g.equip[slot]).length;
  // (the door is always there — a shop has a door — but it leads out only once the night shop has been spoken of)
  const out = night && !g.wentOut && knows(g, 'shop');
  // (the evening the night shop is first spoken of, the door calls louder and the bed does not)
  const call = mustShop(g);
  return `<button class="prop exit ${out ? 'ready' : ''} ${call ? 'beckon' : ''} ${night && g.wentOut ? 'used' : ''}" id="door" data-act="door" data-sfx="none" title="${night ? (g.wentOut ? '今夜はもう外出しました' : '外へ出る（ショップ／クエスト）') : '閉店後にならないと、外出はできません'}" aria-label="ドア（閉店後に、ここから外出する）">
      <span class="exit-leaf"><i class="exit-win"></i><i class="exit-knob"></i></span><b>ドア</b></button>
    <button class="prop trash ${count ? 'full' : ''}" id="trash" data-act="trash" data-sfx="open" aria-label="ゴミ箱（品をドラッグして捨てる。中身は ${count} 個。クリックで中を見る）">
      ${BIN}<b>ゴミ箱</b>${count ? `<em>${count}</em>` : ''}</button>
    <button class="prop rack ${ui.pops.gear.open ? 'open' : ''}" id="rack" data-act="gear" aria-label="装備棚（クリックで装備の窓を開く・閉じる。身につけている品 ${worn} 個）">
      ${RACK}<b>装備棚</b><small>${worn}/6</small></button>
    <button class="prop bed ${night && !call && !g.memoOut ? 'ready' : ''}" id="bed" data-act="bed" data-sfx="none" aria-label="寝床（店を閉めたあと、クリックで眠って翌日へ）">
      ${BED}<b>寝床</b></button>`;
}

/** What is in the bin: anything can be taken back until the night. */
export function trashModal(g: GameState): string {
  const rows = g.trash
    .map((x) => {
      const item = G.findItem(cat, x.itemId);
      return `<div class="pick-row">${itemTile(item, 'sm')}<span class="pick-main"><b class="pix">${esc(item.ja)}</b><small>夜に回収される</small></span>${btn('untrash', '戻す', { arg: x.uid, cls: 'small', sfx: 'none' })}</div>`;
    })
    .join('');
  return `<div class="modal" id="modal-trash" data-ui><div class="modal-box tall">
    <h2 class="modal-title"><small>BIN</small>ゴミ箱</h2>
    <p class="hint">捨てた品は、夜、眠るときに回収されます（お金にはなりません）。それまでは戻せます。</p>
    <div class="modal-scroll">${rows || '<p class="hint">いまは空です。</p>'}</div>
    <div class="actions one">${btn('modal-close', '閉じる', { cls: 'primary' })}</div>
  </div></div>`;
}

const PHONE = `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="p-ink" d="M8 30h48v26H8z"/><path class="p-fill" d="M12 34h40v18H12z"/><path class="p-ink" d="M4 14h56v14H46v-6H18v6H4z"/><path class="p-paper" d="M8 18h8v6H8zM48 18h8v6h-8z"/><path class="p-ink" d="M24 38h4v4h-4zM30 38h4v4h-4zM36 38h4v4h-4zM24 44h4v4h-4zM30 44h4v4h-4zM36 44h4v4h-4z"/></svg>`;

/**
 * On the shop's wall, beside the shutter: the showcase (what is shown there draws customers after that kind
 * of good, and richer ones the rarer it is) and the telephone (the guild's favours).
 */
export function stageProps(g: GameState): string {
  if (!atHome(g)) return '';
  // the showcase: a small grid; goods are fitted into it by their shape, like on the shelf
  const grid = G.gridOf(g, cat, 'case');
  const v = G.currentVisitor(g);
  const want = g.phase === 'open' && v && !v.done && v.kind === 'buy' ? v.want : null;
  const keep = ctx.cell;
  // (the shelf's cell is in hand here: the wall beside the shelf says how large the window's cells can be)
  const CASE_CELL = caseCellFor(grid.cols, G.gridOf(g, cat, 'shelf').cols * keep);
  ctx.caseCell = CASE_CELL;
  ctx.cell = CASE_CELL;
  const goods = grid.items.map((x) => gridItem(x, ui.counter.includes(x.uid) ? 'away' : want && G.matches(cat, want, x.itemId) ? 'match' : '')).join('');
  ctx.cell = keep;
  const full = G.caseFull(g, cat);
  const appeal = G.showAppeal(g, cat);
  const tip = grid.items.length === 0 ? '品をここへドラッグ' : full ? `集客 +${appeal}（ぴったり +${B.showFull}）` : `集客 +${appeal}・空き ${G.freeCells(g, cat, 'case')} マス`;
  const sign = hasService(g, 'sign')
    ? `<div class="case-seek" role="group" aria-label="買いたい系統の看板"><small>求む</small>${(['phy', 'int', 'agi'] as const)
        .map((p) => `<button class="seek ${g.seek === p ? 'on' : ''} s-${p}" data-act="seek" data-arg="${p}" aria-pressed="${g.seek === p}">${PARAM_JA[p].replace('系', '')}</button>`)
        .join('')}</div>`
    : '';
  // (the telephone is a set that stands on the counter)
  const phone = !knows(g, 'phone') ? '' : `<button class="phone" id="phone" data-act="phone" data-sfx="open" aria-label="電話（商人ギルドに頼みごとをする。信用 ${g.trust}）">${PHONE}<b>電話</b><small>信用 ${num(g.trust)}</small></button>`;
  return `<div class="sprops" id="sprops" data-ui>
    <div class="case ${full ? 'full' : ''} ${knows(g, 'case') ? '' : 'untaught'}" id="case"><b>ショーケース</b>
      <div class="case-grid" id="case-grid" data-grid="case" style="--cell:${CASE_CELL}px;width:${grid.cols * CASE_CELL}px;height:${grid.rows * CASE_CELL}px">${goods}<div class="preview" id="case-preview" data-live></div></div>
      ${sign}<small class="case-tip">${tip}</small></div>
    <button class="monitor ${knows(g, 'case') ? '' : 'untaught'} ${g.phase === 'open' && pending(g) ? 'stale' : ''}" id="monitor" data-act="forecast" data-sfx="open" aria-label="予測客のモニター（ショーケースが呼ぶ客の見込みを見る）"><i class="mon-screen"><u></u><u></u><u></u></i><b>予測客</b></button>
    ${wantedNotice(g)}
    ${g.parcel.length + g.crates.length ? `<button class="parcel" id="parcel" data-act="parcel" data-sfx="open" aria-label="届いた荷物（${g.crates.length + g.parcel.length} 個。クリックで受け取る）">${CRATE}<b>荷物</b><em>${g.parcel.length}</em></button>` : ''}
  </div>${phone}`;
}

/** True when the window has been rearranged since the shop opened (what it does now is not yet what is shown). */
const pending = (g: GameState): boolean => {
  const was = (g.display?.goods ?? []).map((x) => x.uid).sort().join(',');
  return was !== g.showcase.map((x) => x.uid).sort().join(',');
};

const pct = (rate: number): string => `${Math.round(rate * 100)}%`;

/** The monitor beside the showcase: what the window, as it stands, is expected to bring in. */
export function forecastModal(g: GameState): string {
  const f = G.forecast(g, cat);
  const open = g.phase === 'open';
  const when = open
    ? pending(g)
      ? '<p class="note bad">ショーケースを開店中に並べかえました。この見込みは<b>次に店を開けたとき</b>から効きます（今日の客は、開店のときの並びで決まっています）。</p>'
      : '<p class="note">今日の客は、この並びで呼んでいます。</p>'
    : '<p class="note">この並びは、<b>次に店を開けたとき</b>から効きます。</p>';
  const lines = (['phy', 'int', 'agi'] as const)
    .filter((param) => f.lines[param] > 0)
    .map((param) => `<div class="fc-bar s-${param}"><span>${PARAM_JA[param]}を欲しがる客</span><i><u style="width:${pct(f.pull * f.lines[param])}"></u></i><b>${pct(f.pull * f.lines[param])}</b></div>`)
    .join('');
  const richer = ([3, 4, 5] as const)
    .map((rarity, i) =>
      f.richer[i] > 0
        ? `<div class="fc-row"><span>${HERO_CLASS_JA[rarity]}のヒーロー</span><b>${f.richer[i] > 1.005 ? `ふだんの ${f.richer[i].toFixed(2)} 倍` : 'ふだんどおり'}</b></div>`
        : `<div class="fc-row fc-off"><span>${HERO_CLASS_JA[rarity]}のヒーロー</span><b>まだ来ない</b></div>`,
    )
    .join('');
  const purses = f.purses.map((x) => `<div class="fc-row"><span>${HERO_CLASS_JA[x.rarity]}</span><b>およそ ${num(x.budget)} GUM</b></div>`).join('');
  const houses = FACTIONS.map((h) => `<div class="fc-bar f-${h.id}"><span><span class="fac f-${h.id}">${h.ja}</span></span><i><u style="width:${pct(f.houses[h.id])}"></u></i><b>${pct(f.houses[h.id])}</b></div>`).join('');
  const rulers = f.rulersNeed > 0 ? `<p class="note bad">覇王のヒーローは、ショーケースに<b>${RARITY_JA[f.rulersNeed]}以上</b>の品がないと来ません。</p>` : '';
  const next = g.clientele + 1;
  const crowd = next > 5 ? '' : `<div class="fc-row"><span>次の客層：${HERO_CLASS_JA[next]}</span><b>${Math.min(G.clienteleScore(g, cat, next), B.clienteleNeed[next])}/${B.clienteleNeed[next]}</b></div>`;
  return `<div class="modal" id="modal-forecast" data-ui><div class="modal-box tall">
    <h2 class="modal-title"><small>FORECAST</small>予測客</h2>
    <div class="modal-scroll forecast">
      ${when}
      <div class="fc-row head"><span>展示 ${f.count} 個${f.full ? '（すきまなし）' : ''}</span><b>集客 +${f.appeal}</b></div>
      ${
        f.count === 0
          ? '<p class="hint">ショーケースが空です。品を飾ると、その系統を欲しがる客と、上の階級のヒーローが来やすくなります。</p>'
          : `<h3 class="rc-sub">欲しがる品<small>買い客のうち</small></h3>${lines}<div class="fc-row"><span>ショーケースを見て来る買い客</span><b>${pct(f.pull)}</b></div>
      <h3 class="rc-sub">来る階級<small>レアリティの高い品ほど効く</small></h3>${richer}`
      }
      <h3 class="rc-sub">来る派閥<small>客のうち</small></h3>${houses}${rulers}
      <h3 class="rc-sub">客の予算<small>買い客 1 人あたり</small></h3>${purses}${crowd}
    </div>
    <div class="actions one">${btn('modal-close', '閉じる', { cls: 'primary' })}</div>
  </div></div>`;
}

/** Said once: the window rearranged while the shop is open tells from the next opening. */
export function caseToldModal(): string {
  return `<div class="modal" id="modal-casetold" data-ui><div class="modal-box">
    <h2 class="modal-title"><small>SHOWCASE</small>ショーケースの効きめ</h2>
    <p class="modal-text">ショーケースの並びは、<b>次に店を開けたとき</b>から客を呼びます。開店中に並べかえても、今日の客は変わりません。</p>
    <p class="modal-text">開店の前（シャッターが開く前）に並べれば、その日から効きます。見込みは、ショーケースの横の<b>予測客</b>のモニターで見られます。</p>
    <div class="actions one">${btn('modal-close', 'わかった', { cls: 'primary' })}</div>
  </div></div>`;
}

/** Several goods were dropped where they do not all fit: put in the ones that do, or leave it. */
export function spillModal(): string {
  const sp = ui.spill;
  if (!sp) return '';
  const tile = (uid: number): string => {
    const x = ctx.s ? (['shelf', 'wallet', 'case', 'trash'] as const).flatMap((id) => G.itemsOf(ctx.s!, id)).find((it) => it.uid === uid) : undefined;
    return x ? itemTile(G.findItem(cat, x.itemId), 'sm') : '';
  };
  return `<div class="modal" id="modal-spill" data-ui><div class="modal-box">
    <h2 class="modal-title"><small>NO ROOM</small>置くスペースがありません</h2>
    <p class="modal-text">選んだ ${sp.fit.length + sp.left.length} 個すべては、入りません。<b>${sp.left.length} 個</b>を元の場所に残せば、<b>${sp.fit.length} 個</b>は置けます。</p>
    <p class="spill-label">元の場所に残す品</p><div class="spill-row">${sp.left.map(tile).join('')}</div>
    <div class="actions">${btn('modal-close', 'やめる', { cls: 'ghost' })}${btn('spill-go', `${sp.fit.length} 個だけ置く`, { cls: 'primary', sfx: 'none' })}</div>
  </div></div>`;
}

/** The notice on the wall: a face, and what the house that posted it will pay. */
function wantedNotice(g: GameState): string {
  const w = g.wanted;
  if (!w) return '';
  const hero = cat.heroById.get(w.heroId)!;
  return `<button class="wanted" id="wanted" data-act="wanted" data-sfx="open" aria-label="手配書（${esc(hero.ja)}。賞金 ${w.bounty} GUM。クリックでくわしく）">
    <span class="wanted-face"><img src="${hero.img}" alt="" draggable="false" /></span><span class="wanted-txt"><b>手配</b><small>${num(w.bounty)} GUM</small></span></button>`;
}

/** The notice, read closely: who, who asks, what each choice does — and the button that turns in the customer at the counter. */
export function wantedModal(g: GameState): string {
  const w = g.wanted;
  if (!w) return '';
  const hero = cat.heroById.get(w.heroId)!;
  const by = factionById(w.by);
  const prey = factionById(rivalOf(w.by)!);
  const v = G.currentVisitor(g);
  const here = g.phase === 'open' && !!v && !v.done;
  return `<div class="modal" id="modal-wanted" data-ui><div class="modal-box">
    <h2 class="modal-title"><small>WANTED</small>手配書</h2>
    <div class="wanted-sheet">
      <span class="wanted-face big"><img src="${hero.img}" alt="" draggable="false" /></span>
      <div class="wanted-who"><b class="pix">${esc(hero.ja)}</b><span><i class="fac f-${prey.id}">${prey.ja}</i> の者</span>
        <span>依頼主 <i class="fac f-${by.id}">${by.ja}</i></span><em><small>賞金</small>${gum(w.bounty)}</em></div>
    </div>
    <p class="hint">この客は、近いうちに店へ来ます。来たら、どちらかを選べます。</p>
    <div class="wanted-ways">
      <p><b>通報する</b>賞金 ${num(w.bounty)} GUM。${by.ja}の評価 +${B.wantedFavor}、${prey.ja}の評価 −${B.wantedGrudge}。客は取引せずに去ります。</p>
      <p><b>取引する</b>追われる身は金払いがよく（予算 ${B.wantedBudget} 倍）、品は安く手放します（言い値の ${Math.round(B.wantedAsk * 100)}%）。${prey.ja}の評価 +${B.harbourFavor}、${by.ja}の評価 −${B.harbourGrudge}。</p>
    </div>
    <p class="hint">人違いで通報すると、罰金 ${B.wantedFine} GUM。その客の派閥の評価も下がります。</p>
    <div class="actions">${btn('modal-close', '閉じる')}${btn('report', here ? 'いまの客を通報する' : '客が来たら通報できる', { cls: 'danger', disabled: !here, sfx: 'none' })}</div>
  </div></div>`;
}

const CRATE = `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="p-ink" d="M6 18h52v40H6z"/><path class="p-fill" d="M10 22h44v32H10z"/><path class="p-ink" d="M10 34h44v4H10zM30 22h4v32h-4z"/><path class="p-paper" d="M24 8h16v12H24z"/><path class="p-ink" d="M22 6h20v16H22zm4 4v8h12v-8z" fill-rule="evenodd"/></svg>`;

/** Pictures for the guild's tiles that the rungs' set does not have (16 × 16). */
const TILE_ICON = {
  box: '<path d="M2 5l6-3 6 3v7l-6 3-6-3z"/><path class="cut" d="M7.3 8h1.4v6H7.3z"/>',
  shelf: '<path d="M1 3h14v10H1z"/><path class="cut" d="M3 5h4v2H3zM9 5h4v2H9zM3 9h4v2H3zM9 9h4v2H9z"/>',
  window: '<path d="M2 2h12v12H2z"/><path class="cut" d="M4 4h3.3v3.3H4zM8.7 4H12v3.3H8.7zM4 8.7h3.3V12H4zM8.7 8.7H12V12H8.7z"/>',
  pot: '<path d="M5 2h6v2h-1c3 1 4 3 4 6s-2 4-6 4-6-1-6-4 1-5 4-6H5z"/>',
  scroll: '<path d="M3 2h9a2 2 0 012 2v10H5a2 2 0 01-2-2z"/><path class="cut" d="M6 5h5v1.2H6zM6 8h5v1.2H6z"/>',
} as const;
const tileIcon = (icon: keyof typeof TILE_ICON): string => `<svg class="rung-ico" viewBox="0 0 16 16" aria-hidden="true">${TILE_ICON[icon]}</svg>`;

/** One thing the guild can be asked for, as a tile on the right and a page on the left. */
interface Ask {
  key: string;
  group: string;
  picture: string;
  name: string;
  text: string;
  /** 'had': already done; 'shut': something else comes first */
  state: 'open' | 'had' | 'shut';
  /** the figure on the tile (a price, usually), and whether it is out of reach now */
  tag: string;
  dear: boolean;
  /** under the words on the left: the buttons, or why not */
  act: string;
  /** stands next to the tile before it, as its next step */
  chained?: boolean;
}

const SERVICE_PICTURE: Partial<Record<ServiceId, string>> = {
  guest1: rungIcon('crowd'),
  guest2: rungIcon('crowd'),
  vip: rungIcon('star'),
  case1: tileIcon('window'),
  case2: tileIcon('window'),
  sign: rungIcon('tag'),
  tip: rungIcon('news'),
  waiver: tileIcon('scroll'),
  dex: '<b class="gtile-txt">⇅</b>',
  pot: tileIcon('pot'),
  eye: rungIcon('loupe'),
};

/** Everything on the guild's board, in the order of its panels. */
function asks(g: GameState): Ask[] {
  const out: Ask[] = [];
  const pay = (act: string, id: string | number, gumCost: number, trust: number, blocked: (by: 'gum' | 'trust') => boolean): string =>
    `<div class="ask-buy">${btn(act, `${num(gumCost)} GUM`, { arg: `${id}:gum`, cls: 'gold', disabled: blocked('gum'), sfx: 'none' })}${btn(act, `信用 ${num(trust)}`, { arg: `${id}:trust`, disabled: blocked('trust'), sfx: 'none' })}</div>`;
  // goods sent for: at the door next morning
  for (const x of SUPPLIES) {
    const price = B.supplies[x.id];
    const sent = g.supply?.id === x.id;
    const lines = (['phy', 'int', 'agi'] as const)
      .map((param) => `<button class="seek ${ui.supplyParam === param ? 'on' : ''} s-${param}" data-act="supply-param" data-arg="${param}" aria-pressed="${ui.supplyParam === param}">${PARAM_JA[param]}</button>`)
      .join('');
    out.push({
      key: `supply:${x.id}`,
      group: '取り寄せ',
      picture: tileIcon('box'),
      name: x.name,
      text: `${PARAM_JA[ui.supplyParam]}の${x.text}。明日の朝、店に届く（注文は 1 度に 1 つ）`,
      state: sent ? 'had' : g.supply ? 'shut' : 'open',
      tag: num(price.gum),
      dear: g.gum < price.gum && g.trust < price.trust,
      act: sent ? '<p class="ask-note">手配ずみ。明日の朝に届きます。</p>' : g.supply ? '<p class="ask-note">ほかの注文が届いてから。</p>' : `<div class="supply-line" role="group" aria-label="取り寄せる系統"><small>系統</small>${lines}</div>${pay('supply', x.id, price.gum, price.trust, (by) => !!supplyBlock(g, x.id, by))}`,
    });
  }
  for (const group of ['lines', 'intro', 'shop', 'craft'] as const) {
    if (group === 'shop') {
      const cost = G.shelfCost(g);
      out.push({
        key: 'shelf',
        group: GROUP_JA.shop,
        picture: tileIcon('shelf'),
        name: '棚の拡張',
        text: `棚が 2 列広がる（いま ${G.gridOf(g, cat, 'shelf').cols} 列）`,
        state: cost === null ? 'had' : 'open',
        tag: cost === null ? '' : num(cost),
        dear: cost !== null && g.gum < cost,
        act: cost === null ? '<p class="ask-note">これ以上は広げられません。</p>' : `<div class="ask-buy">${btn('shelf', `${num(cost)} GUM`, { cls: 'gold', disabled: g.gum < cost, sfx: 'none' })}</div>`,
      });
    }
    for (const x of SERVICES.filter((y) => y.group === group)) {
      const had = hasService(g, x.id);
      const shut = !had && serviceBlock(g, x.id, 'gum') === 'needs';
      const mark = lineOf(x.id);
      out.push({
        key: `service:${x.id}`,
        group: GROUP_JA[group],
        picture: mark ? `<b class="tile-glyph">${mark === 'holy' ? '聖' : mark === 'occult' ? '秘' : MARK_JA[mark].slice(0, 1)}</b>` : (SERVICE_PICTURE[x.id] ?? rungIcon('star')),
        name: x.name,
        text: x.text,
        state: had ? 'had' : shut ? 'shut' : 'open',
        tag: had ? '' : num(x.gum),
        dear: g.gum < x.gum && g.trust < x.trust,
        act: had ? '<p class="ask-note">頼んであります。</p>' : shut ? '<p class="ask-note">前の段を先に頼みます。</p>' : pay('service', x.id, x.gum, x.trust, (by) => !!serviceBlock(g, x.id, by)),
        chained: !!x.needs,
      });
    }
  }
  // money lent: a sum now, paid back with interest over the coming nights
  B.loans.forEach((amount, i) => {
    const block = loanBlock(g, i);
    out.push({
      key: `loan:${i}`,
      group: '融資',
      picture: rungIcon('gum'),
      name: `${num(amount)} GUM を借りる`,
      text: `毎晩 ${num(loanNightly(amount))} GUM × ${B.loanNights} 晩（合計 ${num(loanTotal(amount))}）で返す。払えない夜は、残りが 1 割増える。借りているあいだは、店を買い取れない`,
      state: g.loan ? 'shut' : block ? 'shut' : 'open',
      tag: num(amount),
      dear: false,
      act: g.loan
        ? `<p class="ask-note">借りています：残り ${num(g.loan.left)} GUM（毎晩 ${num(g.loan.nightly)} GUM）</p><div class="ask-buy">${btn('repay', 'まとめて返す', { cls: 'gold', disabled: g.gum < g.loan.left, sfx: 'none' })}</div>`
        : block === 'rep'
          ? `<p class="ask-note">評判 ${B.loanRep[i]} から借りられます。</p>`
          : `<div class="ask-buy">${btn('borrow', '借りる', { arg: i, sfx: 'none' })}</div>`,
    });
  });
  return out;
}

/** The telephone: the guild's board of tiles on the right, and on the left the page of the one picked out. */
export function networkModal(g: GameState): string {
  const all = asks(g);
  const picked = all.find((x) => x.key === ui.ask) ?? null;
  const groups: string[] = [];
  for (const x of all) if (!groups.includes(x.group)) groups.push(x.group);
  const panels = groups
    .map((group) => {
      const tiles = all
        .filter((x) => x.group === group)
        .map((x) => `<button class="gtile ${x.state} ${x.chained ? 'chained' : ''} ${picked?.key === x.key ? 'picked' : ''}" id="ask-${x.key.replace(':', '-')}" data-act="ask" data-arg="${x.key}" data-sfx="none" aria-label="${esc(x.name)}" aria-pressed="${picked?.key === x.key}">${x.picture}${x.tag ? `<em class="${x.dear ? 'dear' : ''}">${x.tag}</em>` : ''}</button>`)
        .join('');
      return `<section class="gpanel ${group === GROUP_JA.lines ? 'wide' : ''}"><h3>${group}${group === GROUP_JA.lines ? `<small>${g.lines.length}/${MARKS.length}</small>` : ''}</h3><div class="gtiles">${tiles}</div></section>`;
    })
    .join('');
  const page = picked
    ? `<h3 class="ask-name">${esc(picked.name)}</h3><small class="ask-group">${picked.group}</small><p class="ask-text">${esc(picked.text)}</p>${picked.act}`
    : `<h3 class="ask-name">商人ギルド</h3><small class="ask-group">電話</small><p class="ask-text">右の印を選ぶと、ここに中身が出ます。GUM で払うか、ギルドの信用で払うかを選べます。</p>`;
  return `<div class="modal" id="modal-network" data-ui><div class="modal-box guild-box">
    <h2 class="modal-title"><small>GUILD</small>商人ギルド</h2>
    <div class="guild">
      <aside class="ask-page" id="ask-page">${page}
        <div class="ask-purse"><span>所持金<b>${gum(g.gum)}</b></span><span>信用<b>${num(g.trust)}</b><small>毎朝 +${trustDaily(g)}</small></span></div>
      </aside>
      <div class="gboard" id="gboard">${panels}</div>
    </div>
    <div class="actions one">${btn('modal-close', '電話を切る', { cls: 'primary' })}</div>
  </div></div>`;
}

/** What has come from the guild: each good is taken onto the shelf (or into the wallet). */
export function parcelModal(g: GameState): string {
  const rows = g.parcel
    .map((x, i) => {
      const item = G.findItem(cat, x.itemId);
      return `<div class="pick-row">${itemTile(item, 'sm')}<span class="pick-main"><b class="pix">${esc(item.ja)}</b><small>相場 ${num(G.itemValue(cat, x.itemId, x.cond))}</small></span>${btn('unpack', '棚へ', { arg: i, cls: 'small', sfx: 'none' })}</div>`;
    })
    .join('');
  // boxes sent from the night shop, still shut: opened here, or put on the shelf as they are
  const boxes = g.crates
    .map((c, i) => {
      const b = B.boxes[c.size];
      return `<div class="pick-row crate-row"><span class="tile sm crate-tile"><img src="${G.findItem(cat, CRATE_IDS[c.size]).img}" alt="" draggable="false" /></span><span class="pick-main"><b class="pix">段ボール箱（${b.ja}）</b><small>${c.items.length} 個入り・${b.cols}×${b.rows} マス</small></span>${btn('crate-shelve', '箱のまま棚へ', { arg: i, cls: 'small ghost', sfx: 'none' })}${btn('crate-open', '開ける', { arg: i, cls: 'small', sfx: 'none' })}</div>`;
    })
    .join('');
  return `<div class="modal" id="modal-parcel" data-ui><div class="modal-box tall">
    <button class="help-dot ${ui.parcelHelp ? 'on' : ''}" data-act="parcel-help" aria-label="荷物の説明" aria-pressed="${ui.parcelHelp}">?</button>
    <h2 class="modal-title"><small>PARCEL</small>届いた荷物</h2>
    ${ui.parcelHelp ? '<p class="hint">棚（いっぱいならウォレット）に空きがある分だけ受け取れます。残りは、ここで待っています。箱は、開けずに棚へ置くこともできます（箱の大きさは、入る量と同じです）。棚の箱は、クリックで開きます。</p>' : ''}
    <div class="modal-scroll">${boxes}${rows}</div>
    <div class="actions">${btn('modal-close', 'あとで')}${g.parcel.length ? btn('unpack', 'すべて受け取る', { arg: 'all', cls: 'primary', sfx: 'none' }) : ''}</div>
  </div></div>`;
}

/** The calendar on the wall, opened: the days ahead, with what is already known about them. */
export function calendarModal(g: GameState): string {
  const rows: string[] = [];
  let rent = g.rent;
  for (let day = g.day; day < g.day + 14; day++) {
    const marks: string[] = [];
    if (day === g.day) marks.push(`<i class="cal-mark today">今日</i>${{ none: 'いつもどおりの一日', demand: '流行りの系統がある日', caravan: '隊商が来る日', rain: '雨の日', bargain: '投げ売りの日' }[g.event.id]}`);
    if (day === g.day && g.patrolDay && G.knowsPatrol(g)) marks.push('<i class="cal-mark warn">見回り</i>棚とショーケースを改めに来る');
    if (day === g.day + 1 && g.supply) marks.push('<i class="cal-mark">荷物</i>ギルドに頼んだ品が届く');
    if (g.wanted && !g.wanted.came && day === Math.max(g.day, g.wanted.day)) marks.push(`<i class="cal-mark warn">手配</i>${esc(cat.heroById.get(g.wanted.heroId)!.ja)} が来るころ`);
    if (g.loan && day - g.day < Math.ceil(g.loan.left / g.loan.nightly)) marks.push(`<i class="cal-mark">返済</i>夜に ${num(Math.min(g.loan.nightly, g.loan.left - g.loan.nightly * (day - g.day)))} GUM`);
    if (!g.owned && day % B.rentEvery === 0) {
      marks.push(`<i class="cal-mark rent">家賃</i>夜に ${num(rent)} GUM`);
      rent = Math.round(rent * B.rentGrowth);
    }
    rows.push(`<div class="cal-day ${day === g.day ? 'now' : ''} ${marks.length ? '' : 'plain'}"><b>${day}</b><small>${WEEKDAYS[(day - 1) % 7]}</small><span>${marks.join('<br />') || '—'}</span></div>`);
  }
  // who comes to the shop, and how far it is to the next class of hero
  const next = g.clientele + 1;
  const crowd =
    next > 5
      ? `<p class="cal-crowd"><b>客層</b>${HERO_CLASS_JA[5]}まで、すべてのヒーローが来る</p>`
      : `<p class="cal-crowd"><b>客層</b>${HERO_CLASS_JA[g.clientele]}まで<span>次：${HERO_CLASS_JA[next]}のヒーロー　${RARITY_JA[next]}以上の品を扱う ${Math.min(G.clienteleScore(g, cat, next), B.clienteleNeed[next])}/${B.clienteleNeed[next]}（ショーケースに飾ると +${B.clienteleShow}）</span></p>`;
  return `<div class="modal" id="modal-calendar" data-ui><div class="modal-box tall">
    <h2 class="modal-title"><small>CALENDAR</small>暦</h2>
    <p class="hint">これから 2 週間の、いま分かっている予定です。</p>
    <div class="modal-scroll cal">${rows.join('')}</div>
    ${crowd}
    <div class="actions one">${btn('modal-close', '閉じる', { cls: 'primary' })}</div>
  </div></div>`;
}
