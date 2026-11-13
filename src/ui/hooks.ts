import { B } from '../game/balance';
import { catalog as cat, PARAM_JA } from '../game/catalog';
import { FACTIONS, RANK_JA, rankOf } from '../game/factions';
import * as G from '../game/logic';
import { perkById } from '../game/perks';
import type { DayOrder, GameState } from '../game/state';
import { audio, haptic } from './audio';
import { ctx } from './core';
import { fx } from './fx';
import { btn, esc, num } from './html';

/**
 * The pull of the game, on screen: today's order (a goal to aim at), the streak (a rhythm to keep),
 * unusual customers (the routine broken), and 商才 (the shop growing its own way).
 */

export const SPECIAL_JA = { rich: '大富豪', hurry: '急ぎの旅人', collector: '収集家' } as const;
const SPECIAL_SUB = { rich: '予算は桁ちがい。売れるだけ売ろう', hurry: '破格の言い値。値切りは聞いてくれない', collector: 'レア以上の品に大金を出す' } as const;

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
  const o = g.order;
  const order = o ? `<p class="news-order"><span>本日の注文</span><b>${orderText(o)}</b><em>達成で +${num(o.reward)} GUM</em></p>` : '';
  const perks = g.perks.length
    ? `<p class="news-perks"><span>商才</span>${g.perks.map((id) => `<i title="${esc(perkById(id).text)}">${esc(perkById(id).name)}</i>`).join('')}</p>`
    : '';
  const ranked = FACTIONS.filter((f) => G.favorRank(g, f.id) > 0);
  const houses = ranked.length ? `<p class="news-perks news-houses"><span>派閥</span>${ranked.map((f) => `<i class="fac f-${f.id}">${f.ja} ${'★'.repeat(G.favorRank(g, f.id))}</i>`).join('')}</p>` : '';
  return order + perks + houses;
}

// ---------------------------------------------------------------- the houses

/** Under the reputation: one pip per house, lit by rank. */
export function houseDots(g: GameState): string {
  return `<span class="house-dots" id="house-dots" aria-hidden="true">${FACTIONS.map((f) => `<i class="f-${f.id} r${G.favorRank(g, f.id)}"></i>`).join('')}</span>`;
}

/** The houses: each one's regard for the shop, and what it grants. */
export function housesModal(g: GameState): string {
  const rows = FACTIONS.map((f) => {
    const pts = g.favor[f.id];
    const rank = G.favorRank(g, f.id);
    const from = rank === 0 ? 0 : B.favorRanks[rank - 1];
    const next = B.favorRanks[rank];
    const fill = next ? (pts - from) / (next - from) : 1;
    return `<div class="house r${rank}">
        <span class="fac f-${f.id}">${f.ja}</span>
        <span class="house-main"><b>${f.boon}<em>${RANK_JA[rank]}</em></b>
          <span class="house-bar"><i style="transform:scaleX(${fill.toFixed(3)})"></i></span>
          <small>${rank > 0 ? `いま：${f.text(rank)}` : ''}${rank > 0 && next ? '<br />' : ''}${next ? `次：${f.text(rank + 1)}` : ''}</small></span>
        <span class="house-n"><b>${num(pts)}</b>${next ? `<small>/${next}</small>` : '<small>MAX</small>'}</span>
      </div>`;
  }).join('');
  return `<div class="modal" id="modal-houses" data-ui><div class="modal-box">
    <h2 class="modal-title"><small>HOUSES</small>派閥の評価</h2>
    <p class="hint">お客さんは 5 つの派閥のどれかに属しています。取引がまとまると、その派閥の評価が上がります。交渉で<b>値引きして売る</b>・<b>色をつけて買う</b>と、大きく上がります。強気の値で通すと上がらず、怒らせると下がります。</p>
    <div class="houses">${rows}</div>
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
    for (const f of FACTIONS) {
      const was = favorWas[f.id] ?? 0;
      const now = g.favor[f.id];
      if (now === was) continue;
      const plate = root.querySelector('.plate') ?? '#hud-rep';
      window.setTimeout(() => fx.text(`${f.ja} ${now > was ? '+' : '−'}${Math.abs(now - was)}`, plate, { kind: now > was ? 'gain' : 'dmg', size: 18 }), 520);
      const rank = rankOf(now);
      if (rank > rankOf(was)) {
        window.setTimeout(() => {
          audio.sfx('event');
          haptic('heavy');
          void fx.banner(`${f.ja}・${RANK_JA[rank]}`, { sub: `${f.boon}：${f.text(rank)}`, ms: 1500 });
          const dots = root.querySelector('#house-dots');
          if (dots) fx.burst('stars', dots, { count: 12 });
        }, 1200);
      }
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
