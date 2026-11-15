/**
 * The things of the shop that are used by hand rather than through a menu (a wide screen shows them
 * beside the shelf): the bin — goods are dragged into it — and the bed — a click on it at night ends the day.
 */
import { catalog as cat, HERO_CLASS_JA, PARAM_JA, RARITY_JA } from '../game/catalog';
import * as G from '../game/logic';
import { SLOT_IDS, type GameState } from '../game/state';
import { B, WEEKDAYS } from '../game/balance';
import { factionById, rivalOf } from '../game/factions';
import { GROUP_JA, hasService, loanBlock, loanNightly, loanTotal, serviceBlock, SERVICES, SUPPLIES, supplyBlock, supplyById, trustDaily } from '../game/network';
import { atHome, CASE_CELL, ctx, ui } from './core';
import { gridItem } from './grid';
import { btn, esc, gum, itemTile, num } from './html';

// drawn flat, in the shop's own ink and paper (no pictures of their own in the catalogue)
const BIN = `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="p-ink" d="M10 16h44v6H10z"/><path class="p-ink" d="M24 9h16v8H24z"/><path class="p-fill" d="M14 22h36l-4 34H18z"/><path class="p-ink" d="M14 22h36l-4 34H18zm4 4 3 26h22l3-26z" fill-rule="evenodd"/><path class="p-ink" d="M25 29h3v20h-3zM36 29h3v20h-3z"/></svg>`;
const RACK = `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="p-ink" d="M8 6h48v52H8z"/><path class="p-paper" d="M12 10h40v44H12z"/><path class="p-ink" d="M12 24h40v4H12zM12 40h40v4H12z"/><path class="p-fill" d="M16 13h10v9H16zM31 14h8v8h-8zM42 12h7v10h-7zM17 30h12v8H17zM36 29h10v9H36zM20 46h9v6h-9zM34 45h12v7H34z"/></svg>`;
const BED = `<svg viewBox="0 0 96 64" aria-hidden="true"><path class="p-ink" d="M2 46h92v8H2zM6 54h8v8H6zM82 54h8v8h-8z"/><path class="p-ink" d="M6 34h84v14H6z"/><path class="p-paper" d="M9 37h78v8H9z"/><path class="p-ink" d="M30 22h60v20H30z"/><path class="p-fill" d="M33 25h54v14H33z"/><path class="p-ink" d="M44 25h3v14h-3z"/><path class="p-ink" d="M6 22h26v18H6z"/><path class="p-paper" d="M9 25h20v12H9z"/><path class="p-z" d="M58 4h12v3l-7 6h7v3H58v-3l7-6h-7zM76 12h8v2l-5 4h5v2h-8v-2l5-4h-5z"/></svg>`;

export function deckProps(g: GameState): string {
  if (!atHome(g)) return '';
  const night = g.phase === 'evening';
  const count = g.trash.length;
  const worn = SLOT_IDS.filter((slot) => g.equip[slot]).length;
  return `<button class="prop trash ${count ? 'full' : ''}" id="trash" data-act="trash" data-sfx="open" aria-label="ゴミ箱（品をドラッグして捨てる。中身は ${count} 個。クリックで中を見る）">
      ${BIN}<b>ゴミ箱</b>${count ? `<em>${count}</em>` : ''}<small>ここへドラッグ</small></button>
    <button class="prop rack ${ui.pops.gear.open ? 'open' : ''}" id="rack" data-act="gear" aria-label="装備棚（クリックで装備の窓を開く・閉じる。身につけている品 ${worn} 個）">
      ${RACK}<b>装備棚</b><small>${worn}/6</small></button>
    <button class="prop bed ${night ? 'ready' : ''}" id="bed" data-act="bed" data-sfx="none" aria-label="寝床（店を閉めたあと、クリックで眠って翌日へ）">
      ${BED}<b>寝床</b><small>${night ? 'クリックで眠る' : '夜になったら'}</small></button>`;
}

/** What is in the bin: anything can be taken back until the night. */
export function trashModal(g: GameState): string {
  const rows = g.trash
    .map((x) => {
      const item = G.findItem(cat, x.itemId);
      return `<div class="pick-row">${itemTile(item, 'sm')}<span class="pick-main"><b class="pix">${esc(item.ja)}</b><small>処分の値 ${num(G.disposePrice(cat, x))}</small></span>${btn('untrash', '戻す', { arg: x.uid, cls: 'small', sfx: 'none' })}</div>`;
    })
    .join('');
  return `<div class="modal" id="modal-trash" data-ui><div class="modal-box tall">
    <h2 class="modal-title"><small>BIN</small>ゴミ箱</h2>
    <p class="hint">品をここへドラッグすると捨てられます。夜、眠るときに回収されて、処分の値が入ります（今夜の合計 ${gum(g.trashGum)}）。それまでは戻せます。</p>
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
  const phone = `<button class="phone" id="phone" data-act="phone" data-sfx="open" aria-label="電話（商人ギルドに頼みごとをする。信用 ${g.trust}）">${PHONE}<b>電話</b><small>信用 ${num(g.trust)}</small></button>`;
  return `<div class="sprops" id="sprops" data-ui>
    <div class="case ${full ? 'full' : ''}" id="case"><b>ショーケース</b>
      <div class="case-grid" id="case-grid" data-grid="case" style="--cell:${CASE_CELL}px;width:${grid.cols * CASE_CELL}px;height:${grid.rows * CASE_CELL}px">${goods}<div class="preview" id="case-preview" data-live></div></div>
      ${sign}<small class="case-tip">${tip}</small></div>
    ${wantedNotice(g)}
    ${g.parcel.length ? `<button class="parcel" id="parcel" data-act="parcel" data-sfx="open" aria-label="ギルドから届いた荷物（${g.parcel.length} 個。クリックで受け取る）">${CRATE}<b>荷物</b><em>${g.parcel.length}</em></button>` : ''}
  </div>${phone}`;
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

/** Ordering goods: a parameter line, then what to send, for GUM or for trust. One order at a time. */
function supplyRows(g: GameState): string {
  if (g.supply) {
    return `<div class="svc owned" id="svc-supply"><span class="svc-main"><b>${PARAM_JA[g.supply.param]}の${esc(supplyById(g.supply.id).name)}</b><small>手配ずみ。明日の朝、店に届きます（注文は 1 度に 1 つ）</small></span><em class="svc-done">手配中</em></div>`;
  }
  const lines = (['phy', 'int', 'agi'] as const)
    .map((p) => `<button class="seek ${ui.supplyParam === p ? 'on' : ''} s-${p}" data-act="supply-param" data-arg="${p}" aria-pressed="${ui.supplyParam === p}">${PARAM_JA[p]}</button>`)
    .join('');
  const rows = SUPPLIES.map((x) => {
    const price = B.supplies[x.id];
    const buy = (pay: 'gum' | 'trust'): string =>
      btn('supply', pay === 'gum' ? `${num(price.gum)} GUM` : `信用 ${num(price.trust)}`, { arg: `${x.id}:${pay}`, cls: `small ${pay === 'gum' ? 'gold' : ''}`, disabled: !!supplyBlock(g, x.id, pay), sfx: 'none' });
    return `<div class="svc" id="svc-${x.id}"><span class="svc-main"><b>${esc(x.name)}</b><small>${PARAM_JA[ui.supplyParam]}の${esc(x.text)}</small></span><span class="svc-buy">${buy('gum')}${buy('trust')}</span></div>`;
  }).join('');
  return `<div class="supply-line" role="group" aria-label="取り寄せる系統"><small>系統</small>${lines}</div>${rows}`;
}

/** Borrowing from the guild: a sum now, paid back with interest over the coming nights. One loan at a time. */
function loanRows(g: GameState): string {
  if (g.loan) {
    return `<div class="svc owned" id="svc-loan"><span class="svc-main"><b>借りています：残り ${num(g.loan.left)} GUM</b><small>毎晩 ${num(g.loan.nightly)} GUM ずつ返します。払えない夜は、残りが 1 割増えます。返しおえるまで、権利書は買えません</small></span>
      <span class="svc-buy">${btn('repay', 'まとめて返す', { cls: 'small gold', disabled: g.gum < g.loan.left, sfx: 'none' })}</span></div>`;
  }
  return B.loans
    .map((amount, i) => {
      const block = loanBlock(g, i);
      return `<div class="svc ${block ? 'locked' : ''}" id="svc-loan-${i}"><span class="svc-main"><b>${num(amount)} GUM を借りる</b><small>毎晩 ${num(loanNightly(amount))} GUM × ${B.loanNights} 晩（合計 ${num(loanTotal(amount))}）</small></span>
        ${block === 'rep' ? `<em class="svc-lock">評判 ${B.loanRep[i]} から</em>` : `<span class="svc-buy">${btn('borrow', '借りる', { arg: i, cls: 'small', sfx: 'none' })}</span>`}</div>`;
    })
    .join('');
}

/** What has come from the guild: each good is taken onto the shelf (or into the wallet). */
export function parcelModal(g: GameState): string {
  const rows = g.parcel
    .map((x, i) => {
      const item = G.findItem(cat, x.itemId);
      return `<div class="pick-row">${itemTile(item, 'sm')}<span class="pick-main"><b class="pix">${esc(item.ja)}</b><small>相場 ${num(G.itemValue(cat, x.itemId, x.cond))}</small></span>${btn('unpack', '棚へ', { arg: i, cls: 'small', sfx: 'none' })}</div>`;
    })
    .join('');
  return `<div class="modal" id="modal-parcel" data-ui><div class="modal-box tall">
    <h2 class="modal-title"><small>PARCEL</small>ギルドからの荷物</h2>
    <p class="hint">電話で取り寄せた品です。棚（いっぱいならウォレット）に空きがある分だけ受け取れます。残りは、ここで待っています。</p>
    <div class="modal-scroll">${rows}</div>
    <div class="actions">${btn('modal-close', 'あとで')}${btn('unpack', 'すべて受け取る', { arg: 'all', cls: 'primary', sfx: 'none' })}</div>
  </div></div>`;
}

/** The telephone: the guild's favours, each for GUM or for trust. */
export function networkModal(g: GameState): string {
  const groups = (['intro', 'shop', 'craft'] as const)
    .map((group) => {
      const rows = SERVICES.filter((x) => x.group === group)
        .map((x) => {
          const owned = hasService(g, x.id);
          const locked = !owned && serviceBlock(g, x.id, 'gum') === 'needs';
          const buy = (pay: 'gum' | 'trust'): string =>
            btn('service', pay === 'gum' ? `${num(x.gum)} GUM` : `信用 ${num(x.trust)}`, { arg: `${x.id}:${pay}`, cls: `small ${pay === 'gum' ? 'gold' : ''}`, disabled: !!serviceBlock(g, x.id, pay), sfx: 'none' });
          return `<div class="svc ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}" id="svc-${x.id}">
            <span class="svc-main"><b>${esc(x.name)}</b><small>${esc(x.text)}</small></span>
            ${owned ? '<em class="svc-done">済</em>' : locked ? '<em class="svc-lock">前の段が先</em>' : `<span class="svc-buy">${buy('gum')}${buy('trust')}</span>`}
          </div>`;
        })
        .join('');
      return `<h3 class="rc-sub">${GROUP_JA[group]}</h3>${rows}`;
    })
    .join('');
  return `<div class="modal" id="modal-network" data-ui><div class="modal-box tall">
    <h2 class="modal-title"><small>GUILD</small>商人ギルド</h2>
    <p class="hint">品の<b>取り寄せ</b>と、ずっと効く<b>頼みごと</b>ができます。<b>GUM</b> で払うか、ギルドの<b>信用</b>で払うかを選べます。信用は毎朝 +${trustDaily(g)} ずつ貯まります（待てばただ、急ぐなら GUM）。</p>
    <div class="svc-purse"><span>所持金 <b>${gum(g.gum)}</b></span><span>信用 <b>${num(g.trust)}</b></span></div>
    <div class="modal-scroll"><h3 class="rc-sub">取り寄せ<small>翌朝に届く</small></h3>${supplyRows(g)}${groups}<h3 class="rc-sub">融資<small>いま借りて、あとで返す</small></h3>${loanRows(g)}</div>
    <div class="actions one">${btn('modal-close', '電話を切る', { cls: 'primary' })}</div>
  </div></div>`;
}

/** The calendar on the wall, opened: the days ahead, with what is already known about them. */
export function calendarModal(g: GameState): string {
  const rows: string[] = [];
  let rent = g.rent;
  for (let day = g.day; day < g.day + 14; day++) {
    const marks: string[] = [];
    if (day === g.day) marks.push(`<i class="cal-mark today">今日</i>${{ none: 'いつもどおりの一日', demand: '流行りの系統がある日', caravan: '隊商が来る日', rain: '雨の日', bargain: '投げ売りの日' }[g.event.id]}`);
    if (day === g.day && g.patrolDay && hasService(g, 'tip')) marks.push('<i class="cal-mark warn">見回り</i>棚とショーケースを改めに来る');
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
