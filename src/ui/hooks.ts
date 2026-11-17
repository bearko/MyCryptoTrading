import { rateLine } from './dex';
import { MARK_JA } from '../game/kinds';
import { B } from '../game/balance';
import { catalog as cat, HERO_CLASS_JA, PARAM_JA, RARITY_JA } from '../game/catalog';
import { FACTIONS, factionById, holds, rankOf, shown as regard, standing, type Faction, type Rung, type RungIcon } from '../game/factions';
import * as G from '../game/logic';
import { perkById } from '../game/perks';
import type { DayOrder, GameState } from '../game/state';
import { audio, haptic } from './audio';
import { ctx, isWide, ui } from './core';
import { fx } from './fx';
import { btn, esc, num } from './html';

/**
 * The pull of the game, on screen: today's order (a goal to aim at), the streak (a rhythm to keep),
 * unusual customers (the routine broken), and 商才 (the shop growing its own way).
 */

export const SPECIAL_JA = { rich: '大富豪', hurry: '急ぎの旅人', collector: '収集家', patrol: '見回り', dealer: '引取の商人', landlord: '大家', courier: '配達', satoshi: 'MCHC の両替' } as const;
const SPECIAL_SUB = { rich: '予算は桁ちがい。売れるだけ売ろう', hurry: '破格の言い値。値切りは聞いてくれない', collector: 'レア以上の品に大金を出す', patrol: '棚の品を改めていく' , dealer: `何でも買うが、定価の ${Math.round(B.dealerCut * 100)}% 引き。予算まで`, landlord: '家賃の日。払うか、店を買い取るか', courier: '昨夜の箱を届けに来た。荷物は電話の横に', satoshi: 'GUM やメダルを、MCHC と交換してくれる' } as const;

export function orderText(o: DayOrder): string {
  if (o.kind === 'sellParam') return `${PARAM_JA[o.param ?? 'phy']}の品を ${o.need} 個売る`;
  if (o.kind === 'sellCount') return `品を ${o.need} 個売る`;
  if (o.kind === 'buyCount') return `品を ${o.need} 個買い取る`;
  return `売上 ${num(o.need)} GUM`;
}

/** The same order, short enough for the chip (the count sits beside it). */
function orderShort(o: DayOrder): string {
  if (o.kind === 'sellParam') return `${PARAM_JA[o.param ?? 'phy']}を売る`;
  if (o.kind === 'sellCount') return '品を売る';
  if (o.kind === 'buyCount') return '品を買い取る';
  return '売上';
}

/** Under the rent gauge: today's order with its progress, and the streak once it is running. */
export function goalChips(g: GameState): string {
  const o = g.order;
  const order = o
    ? `<div class="goal ${o.done ? 'done' : ''}" id="goal" aria-label="本日の注文：${orderText(o)}">
        <span class="goal-k">${o.done ? '達成' : '注文'}</span><span class="goal-t">${orderShort(o)}</span>
        <b class="goal-n">${num(o.have)}<small>/${num(o.need)}</small></b><em class="goal-r">+${num(o.reward)}</em>
        <span class="goal-bar"><i style="transform:scaleX(${Math.min(1, o.have / o.need)})"></i></span>
      </div>`
    : '';
  const rate = G.comboRate(g);
  const combo = g.combo >= 2 ? `<div class="combo" id="combo" aria-label="連続成約 ${g.combo}"><small>COMBO</small><b>${g.combo}</b><em><span>売値</span> +${Math.round(rate * 100)}%</em></div>` : '';
  return order || combo ? `<div class="goals" id="goals">${order}${combo}</div>` : '';
}

/** On the morning paper: the order of the day and the knacks the shop has. */
export function morningExtras(g: GameState): string {
  // (the token's price, in small print)
  const ticker = `<p class="news-mchc"><span>MCHC</span>${rateLine(g)}${(g.day - 1) % 7 === B.mchc.weekday - 1 ? '<i>本日、両替商が来店</i>' : ''}</p>`;
  const o = g.order;
  const order = o ? `<p class="news-order"><span>本日の注文</span><b>${orderText(o)}</b><em>達成で +${num(o.reward)} GUM</em></p>` : '';
  const perks = g.perks.length
    ? `<p class="news-perks"><span>商才</span>${g.perks.map((id) => `<i title="${esc(perkById(id).text)}">${esc(perkById(id).name)}</i>`).join('')}</p>`
    : '';
  const ranked = FACTIONS.filter((f) => G.favorRank(g, f.id) !== 0);
  const houses = ranked.length
    ? `<p class="news-perks news-houses"><span>派閥</span>${ranked.map((f) => `<i class="fac f-${f.id}${G.favorRank(g, f.id) < 0 ? ' low' : ''}">${f.ja} ${standing(f, g.favor[f.id])}</i>`).join('')}</p>`
    : '';
  // a new class of hero is drawn to the shop from today
  // lines of goods taken up since the shop last opened
  const lines = g.linesNew.length ? `<p class="news-order news-crowd"><span>取り扱い</span><b>${g.linesNew.map((mark) => MARK_JA[mark]).join('・')}の品を扱えるようになりました</b><em>売り客が持ちこみ、取り寄せにも入ります</em></p>` : '';
  const crowd = G.clienteleDue(g, cat) ? `<p class="news-order news-crowd"><span>客層</span><b>${HERO_CLASS_JA[g.clientele + 1]}のヒーローが来るようになりました</b><em>${RARITY_JA[g.clientele + 1]}の品を扱ってきた評判</em></p>` : '';
  const parcel = g.crates.length ? `<p class="news-order news-parcel"><span>荷物</span><b>夜のショップから、箱が ${g.crates.length} つ届いています</b></p>` : g.parcel.length ? `<p class="news-order news-parcel"><span>荷物</span><b>ギルドから ${g.parcel.length} 個届いています</b><em>電話の下の箱から受け取る</em></p>` : '';
  const wanted = g.wanted ? `<p class="news-order news-wanted"><span>手配</span><b>${esc(cat.heroById.get(g.wanted.heroId)!.ja)}</b><em>賞金 ${num(g.wanted.bounty)} GUM</em></p>` : '';
  // a word of advice on the mornings when something new is in the shop (the things on the wall are on a wide screen only)
  const tips: Record<number, [string, string] | undefined> = {
    2: isWide() ? ['手引き', '棚の品を、壁の<b>ショーケース</b>のマス目にはめこむと、その系統を欲しがる客が来やすくなります（すきまなく埋めると、さらに）'] : undefined,
    3: isWide() ? ['手引き', '壁の<b>電話</b>で、商人ギルドに頼みごとや取り寄せができます（信用は毎朝貯まります）'] : undefined,
    [B.wantedFromDay]: isWide() ? ['手引き', '壁に<b>手配書</b>が貼られることがあります。その客が来たら、通報するか取引するかを選べます'] : undefined,
    [B.hotFromDay]: ['うわさ', '<b>訳あり</b>の品が、安く出回っています。<b>見回り</b>に棚で見つかると没収されます（ウォレットの中は見られません）'],
    [B.fakeFromDay]: ['うわさ', '<b>レプリカ</b>が出回りはじめました。品をカウンターの<b>ルーペ</b>へドラッグすると見分けられます（1 日 3 回）'],
  };
  const tip = tips[g.day] ? `<p class="news-order news-tip"><span>${tips[g.day]![0]}</span><b>${tips[g.day]![1]}</b></p>` : '';
  const patrol = g.patrolDay && G.knowsPatrol(g) ? '<p class="news-order news-patrol"><span>知らせ</span><b>今日は、見回りが来ます</b><em>訳ありの品はウォレットへ</em></p>' : '';
  const loan = g.loan ? `<p class="news-order news-loan"><span>融資</span><b>今夜の返済 ${num(Math.min(g.loan.left, g.loan.nightly))} GUM</b><em>残り ${num(g.loan.left)}</em></p>` : '';
  return ticker + lines + crowd + order + patrol + tip + wanted + parcel + loan + perks + houses;
}

// ---------------------------------------------------------------- the houses

/** Under the reputation: one pip per house, lit by rank. */
export function houseDots(g: GameState): string {
  return `<span class="house-dots" id="house-dots" aria-hidden="true">${FACTIONS.map((f) => `<i class="f-${f.id} r${G.favorRank(g, f.id)}"></i>`).join('')}</span>`;
}

/** Small pictures for what a rung of regard does (16 × 16, drawn in the ink of the day). */
const RUNG_ICON: Record<RungIcon, string> = {
  gum: '<circle cx="8" cy="8" r="6"/><path class="cut" d="M10.5 6H7a2 2 0 000 4h2V8.5H7.8"/>',
  purse: '<path d="M5 2h6l-1 3h2l2 9H2l2-9h2z"/>',
  crowd: '<circle cx="5" cy="5" r="2.5"/><circle cx="11" cy="5" r="2.5"/><path d="M1 14a4 4 0 018 0zM8 14a4 4 0 017 0z"/>',
  gift: '<path d="M2 6h12v3H2zM3 9h10v5H3z"/><path class="cut" d="M7.2 6h1.6v8H7.2z"/><path d="M8 6C5 6 4 2 6 2s2 4 2 4 0-4 2-4 1 4-2 4z"/>',
  line: '<path d="M2 3h8l4 4-7 7-5-5z"/><circle class="cut" cx="5.5" cy="6.5" r="1.3"/>',
  talk: '<path d="M2 2h12v8H8l-4 4v-4H2z"/>',
  clock: '<circle cx="8" cy="8" r="6.5"/><path class="cut" d="M7.3 4h1.4v4.4H11v1.4H7.3z"/>',
  gem: '<path d="M4 2h8l3 4-7 8-7-8z"/>',
  loupe: '<circle cx="6.5" cy="6.5" r="5"/><circle class="cut" cx="6.5" cy="6.5" r="2.8"/><path d="M10 9l5 5-1.5 1.5-5-5z"/>',
  tag: '<path d="M2 2h6l6 6-6 6-6-6z"/><path class="cut" d="M5 7h5v1.6H5z"/>',
  news: '<path d="M2 2h12v12H2z"/><path class="cut" d="M4 4h8v2H4zM4 8h8v1H4zM4 10.5h5v1H4z"/>',
  shield: '<path d="M8 1l6 2v5c0 4-3 6-6 7-3-1-6-3-6-7V3z"/>',
  star: '<path d="M8 1l2.2 4.6 5 .6-3.7 3.4 1 5L8 12.1 3.5 14.6l1-5L.8 6.2l5-.6z"/>',
  shun: '<circle cx="8" cy="8" r="6.5"/><path class="cut" d="M4 7.2h8v1.6H4z"/>',
  patrol: '<path d="M3 6h10v2H3zM5 2h6l1 4H4zM4 9h8v5H4z"/>',
  fake: '<path d="M2 2h12v12H2z"/><path class="cut" d="M5 5l6 6M11 5l-6 6" stroke-width="1.6" fill="none"/>',
  thief: '<path d="M3 5h10v3H3z"/><circle class="cut" cx="6" cy="6.5" r="1"/><circle class="cut" cx="10" cy="6.5" r="1"/><path d="M5 9h6v5H5z"/>',
  skull: '<path d="M3 2h10v8h-2v4H5v-4H3z"/><path class="cut" d="M5 5h2v2H5zM9 5h2v2H9zM7.3 11h1.4v3H7.3z"/>',
};
export const rungIcon = (icon: RungIcon): string => `<svg class="rung-ico" viewBox="0 0 16 16" aria-hidden="true">${RUNG_ICON[icon]}</svg>`;

/** One house's ladder as an upright bar: +100 at the top, −100 at the foot, a mark at every rung with an effect. */
function ladder(g: GameState, f: Faction): string {
  const pts = g.favor[f.id];
  const now = regard(pts);
  // (the bar's height is 200 of regard: a point's place from the top, in percent)
  const top = (at: number): number => (100 - at) / 2;
  const marks = f.rungs
    .map((rung: Rung) => {
      const on = holds(rung, pts);
      const picked = ui.rung?.house === f.id && ui.rung.at === rung.at;
      return `<button class="rung ${rung.at > 0 ? 'up' : 'down'} ${on ? 'on' : ''} ${picked ? 'picked' : ''} ${rung.icon === 'skull' ? 'dead' : ''}" id="rung-${f.id}-${rung.at}" data-act="rung" data-arg="${f.id}:${rung.at}" style="top:${top(rung.at)}%" aria-label="${f.ja} ${rung.at > 0 ? '+' : ''}${rung.at}：${esc(rung.name)}">${rungIcon(rung.icon)}</button>`;
    })
    .join('');
  const ticks = [100, 80, 60, 40, 20, 0, -20, -40, -60, -80, -100].map((at) => `<i class="tick ${at === 0 ? 'zero' : ''}" style="top:${top(at)}%"></i>`).join('');
  const fill = now >= 0 ? `top:${top(now)}%;height:${now / 2}%` : `top:50%;height:${-now / 2}%`;
  return `<div class="ladder f-${f.id}" id="ladder-${f.id}">
      <b class="ladder-name"><span class="fac f-${f.id}">${f.ja}</span></b>
      <span class="ladder-n">${now > 0 ? '+' : ''}${now}<small>/100</small></span>
      <div class="ladder-bar">${ticks}<i class="ladder-fill ${now < 0 ? 'low' : ''}" style="${fill}"></i><i class="ladder-now" style="top:${top(now)}%"></i>${marks}</div>
      <small class="ladder-stand">${standing(f, pts)}</small>
      <small class="ladder-rival">${f.rival ? `対立：${factionById(f.rival).ja}` : '対立なし'}</small>
    </div>`;
}

/** The houses: each one's regard for the shop as a ladder, and under them what the rung picked out does. */
export function housesModal(g: GameState): string {
  const picked = ui.rung ? factionById(ui.rung.house).rungs.find((rung) => rung.at === ui.rung!.at) : undefined;
  const f = ui.rung ? factionById(ui.rung.house) : undefined;
  const detail =
    picked && f
      ? `<div class="rung-detail ${holds(picked, g.favor[f.id]) ? 'on' : ''}" id="rung-detail">
          <b>${rungIcon(picked.icon)}${esc(picked.name)}<em>${holds(picked, g.favor[f.id]) ? '有効' : 'まだ'}</em><small><span class="fac f-${f.id}">${f.ja}</span> ${picked.at > 0 ? '+' : ''}${picked.at}${picked.at > 0 ? ' 以上' : ' 以下'}</small></b>
          <p>${esc(picked.text)}</p>
          <p class="rung-who"><b>${f.who}</b>${f.trait}</p>
        </div>`
      : `<div class="rung-detail empty" id="rung-detail"><p>印をクリックすると、その評価で得られる（失う）ものが出ます。</p></div>`;
  return `<div class="modal" id="modal-houses" data-ui><div class="modal-box houses-box">
    <h2 class="modal-title"><small>HOUSES</small>派閥の評価</h2>
    <button class="help-dot ${ui.housesHelp ? 'on' : ''}" id="houses-help-btn" data-act="houses-help" aria-label="この画面の説明" aria-pressed="${ui.housesHelp}">?</button>
    ${ui.housesHelp ? '<p class="hint" id="houses-help">取引がまとまると、その客の派閥の評価が上がります。<b>値引きして売る</b>・<b>色をつけて買う</b>と大きく上がり、<b>対立する派閥</b>の評価が下がります。強気の値は、通っても断られても下がります。評価は −100 から +100 まで。20 ごとに、その派閥ならではの効きめがあります。</p>' : ''}
    <div class="ladders">${FACTIONS.map((x) => ladder(g, x)).join('')}</div>
    ${detail}
    <div class="actions one">${btn('modal-close', '閉じる', { cls: 'primary' })}</div>
  </div></div>`;
}

/** After a rent payment: pick one of three knacks. It stays up until one is chosen. */
export function perkModal(g: GameState): string {
  const offer = g.perkOffer ?? [];
  const cards = offer
    .map((id, i) => {
      const p = perkById(id);
      return `<button class="perk-card kind-${p.kind}" data-act="perk" data-arg="${i}" data-sfx="confirm" style="--i:${i}">
        <small>${p.kind === 'shop' ? '店' : p.kind === 'night' ? '夜' : 'クエスト'}</small><b>${esc(p.name)}</b><span>${esc(p.text)}</span></button>`;
    })
    .join('');
  return `<div class="modal" id="modal-perk" data-ui><div class="modal-box perkbox">
    <h2 class="modal-title"><small>REWARD</small>家賃を払いきった！</h2>
    <p class="hint">今週のごほうびに、商才を 1 つ選びます。選んだ商才はずっと効きます。</p>
    <div class="perk-cards">${cards}</div>
    ${g.perks.length ? `<p class="hint">いまの商才：${g.perks.map((id) => esc(perkById(id).name)).join('・')}</p>` : ''}
  </div></div>`;
}

export function perkHelp(g: GameState): string {
  if (g.perks.length === 0) return '';
  return `<div class="perk-list">${g.perks.map((id) => `<p><b>${esc(perkById(id).name)}</b>${esc(perkById(id).text)}</p>`).join('')}</div>${btn('modal-close', '閉じる', { cls: 'primary' })}`;
}

// ---------------------------------------------------------------- what just changed (called after every redraw)

const seen = { day: -1, orderDone: false, combo: 0, sold: 0, visitors: 0, favor: '' };
const favorKey = (g: GameState): string => FACTIONS.map((f) => g.favor[f.id]).join(',');
let favorWas: Record<string, number> = {};
const keepFavor = (g: GameState): void => {
  seen.favor = favorKey(g);
  favorWas = { ...g.favor };
};

export function hookEffects(g: GameState): void {
  const root = ctx.root;
  const fresh = seen.day !== g.day || g.totals.sold < seen.sold;
  if (fresh) {
    // a new day or another game: start from what is there, without fanfare
    seen.day = g.day;
    seen.orderDone = !!g.order?.done;
    seen.combo = g.combo;
    seen.sold = g.totals.sold;
    seen.visitors = g.queue.length;
    keepFavor(g);
    return;
  }
  // a house's regard moved: say so by the customer's name, and make a show of a new rank
  if (favorKey(g) !== seen.favor) {
    let shown = 0;
    for (const f of FACTIONS) {
      const was = favorWas[f.id] ?? 0;
      const now = g.favor[f.id];
      if (now === was) continue;
      const plate = root.querySelector('.plate') ?? '#hud-rep';
      window.setTimeout(() => fx.text(`${f.ja} ${now > was ? '+' : '−'}${(Math.abs(now - was) / 2).toFixed(1).replace('.0', '')}`, plate, { kind: now > was ? 'gain' : 'dmg', size: 18 }), 520 + 380 * shown);
      shown += 1;
      const rank = rankOf(now);
      const before = rankOf(was);
      if (rank === before) continue;
      const up = rank > before;
      window.setTimeout(() => {
        audio.sfx(up ? 'event' : 'error');
        haptic('heavy');
        // (a rank won or lost, a house that turns cold, a house that comes round)
        // (the rung just reached on the way up, or the one just fallen onto; else one that was lost)
        const at = (up ? rank : rank < 0 ? rank : before) * 20;
        const rung = f.rungs.find((x) => x.at === at);
        const gained = rung ? holds(rung, now) : false;
        const sub = rung ? `${rung.name}${gained ? '' : '（なくなった）'}：${rung.text}` : `評価 ${regard(now) > 0 ? '+' : ''}${regard(now)}`;
        void fx.banner(`${f.ja} ${regard(now) > 0 ? '+' : ''}${regard(now)}`, { sub, ms: 1700 });
        const dots = root.querySelector('#house-dots');
        if (dots && up) fx.burst('stars', dots, { count: 12 });
      }, 1200);
    }
    keepFavor(g);
  }
  // an unusual customer steps up: the routine breaks
  if (g.queue.length > seen.visitors) {
    seen.visitors = g.queue.length;
    const v = G.currentVisitor(g);
    if (v?.special) {
      audio.sfx('event');
      haptic('medium');
      void fx.banner(SPECIAL_JA[v.special], { sub: SPECIAL_SUB[v.special], ms: 1100 });
    }
  }
  // the streak bonus on a sale
  if (g.totals.sold > seen.sold) {
    seen.sold = g.totals.sold;
    if (g.last.bonus > 0) window.setTimeout(() => fx.text(`おまけ +${num(g.last.bonus)}`, '#combo', { kind: 'gain', size: 20 }), 380);
  }
  if (g.combo !== seen.combo) {
    const up = g.combo > seen.combo;
    seen.combo = g.combo;
    const el = root.querySelector<HTMLElement>('#combo');
    if (up && el) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
      audio.sfx('coin', { pitch: Math.min(1.8, 1 + g.combo * 0.08), volume: 0.5, delay: 0.25 });
    } else if (!up && g.combo === 0) {
      fx.text('COMBO が切れた', '#goals', { kind: 'info', size: 14 });
    }
  }
  // today's order is met: paid on the spot
  if (g.order?.done && !seen.orderDone) {
    seen.orderDone = true;
    window.setTimeout(() => {
      audio.sfx('haggleOk');
      haptic('heavy');
      fx.stamp('注文達成', { x: root.clientWidth / 2, y: root.clientHeight * 0.3 }, { size: 46 });
      fx.fly('coins', '#goal', '#hud-gum', { count: 10 });
      fx.text(`+${num(g.order!.reward)}`, '#goal', { kind: 'gain', size: 26 });
    }, 700);
  }
  void cat;
}
