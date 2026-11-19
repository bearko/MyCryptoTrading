import { mustShop } from '../game/guide';
import { morningExtras } from './hooks';
import { stageProps } from './props';
import { B, WEEKDAYS } from '../game/balance';
import { PARAM_JA } from '../game/catalog';
import * as G from '../game/logic';
import type { GameState, Visitor } from '../game/state';
import { isWide, ui } from './core';
import { counterBar, deskNotes, farTray, outsideNote } from './counter';
import { cameo } from './guide';
import { btn, esc, GLYPH, gum } from './html';
import { ICON } from './icons';
import { scene } from './scene';

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

function eventHead(g: GameState): { title: string; icon: string; cls: string } {
  switch (g.event.id) {
    case 'demand': {
      const p = g.event.param ?? 'phy';
      return { title: `<span class="hl-${p}">${GLYPH[p]}${PARAM_JA[p]}</span>に需要！`, icon: ICON.evDemand, cls: `ev-demand p-${p}` };
    }
    case 'caravan':
      return { title: '行商の一団、<wbr />来たる', icon: ICON.evCaravan, cls: 'ev-caravan' };
    case 'rain':
      return { title: '雨で客足<wbr />にぶる', icon: ICON.evRain, cls: 'ev-rain' };
    case 'bargain':
      return { title: '旅立ち前、<wbr />売り急ぐ人々', icon: ICON.evBargain, cls: 'ev-bargain' };
    default:
      return { title: '街は<wbr />いつもどおり', icon: ICON.evNone, cls: 'ev-none' };
  }
}

/** On waking: an extra edition slammed on the shutter — today's event, and what last night cost. */
function morningCard(g: GameState): string {
  const weekday = WEEKDAYS[(g.day - 1) % 7];
  const head = eventHead(g);
  return `<div class="morning" id="morning-${g.day}">
    <article class="news paper ${head.cls}">
      <header class="news-mast"><span class="news-extra">号外</span><b>GUM TIMES</b><i>第${g.day}号（${weekday}）</i></header>
      <div class="news-body" id="news-body-${g.day}">
        <div class="news-main"><span class="news-icon">${head.icon}</span><div><small>本日のイベント</small><h2>${head.title}</h2></div></div>
        <p class="news-lead">${eventText(g)}</p>
        ${g.nightNote ? `<p class="news-note">${esc(g.nightNote)}</p>` : ''}
        ${g.lateOpen ? `<div class="news-late-row"><p class="news-late">夜に出歩いたため開店が遅れ、お客さんを ${B.lateOpenLoss} 人取り逃しました。</p><span class="stamp late" aria-hidden="true">開店遅れ<small>−${B.lateOpenLoss}人</small></span></div>` : ''}
        ${morningExtras(g)}
      </div>
      <footer class="news-foot"><span>今日のお客さんは</span><b>${G.visitorsExpected(g)}</b><span>人の見込み。</span></footer>
    </article>
    <div class="cta">${btn('open', '店を開ける', { cls: 'primary big', sfx: 'none' })}</div>
  </div>`;
}

/** After closing: the day's receipt, the shop's business, and the door out into the night. */
function nightCard(g: GameState): string {
  const t = g.today;
  const net = t.revenue - t.spend;
  const cost = G.shelfCost(g);
  const weekday = WEEKDAYS[(g.day - 1) % 7];
  // (a wide screen has the door, the telephone, the gear rack and the bed as things of the shop: no buttons here)
  const wide = isWide();
  const shelfBtn = cost === null ? '' : btn('shelf', '棚を広げる', { cls: 'small', sub: gum(cost), disabled: g.gum < cost, sfx: 'none' });
  const note = g.nightNote ? `<p class="rent-tag"><b>${esc(g.nightNote)}</b></p>` : '';
  const print = ui.printDay === g.day ? 'print' : '';
  return `<div class="night" id="night-${g.day}">
    <div class="night-top">
      ${wide ? '' : `<button class="door ${g.wentOut ? 'used' : ''} ${mustShop(g) ? 'beckon' : ''}" id="door" data-act="door" data-sfx="none" aria-label="${g.wentOut ? '今夜はもう外出しました' : '外へ出る（ショップ／クエスト）'}">
        <i class="door-glow"></i><span class="door-leaf"><i class="door-win"></i><i class="door-knob"></i></span><b>${g.wentOut ? '外出済み' : '外へ'}</b>
      </button>`}
      <article class="receipt paper ${print}" id="receipt">
        <header class="rc-head"><b>${g.day}日目の締め</b><span>DAY ${g.day}・${weekday}</span></header>
        <div class="rc-line"><span>売上</span><i></i><b>${gum(t.revenue)}</b></div>
        <div class="rc-line"><span>仕入れ</span><i></i><b>${gum(t.spend)}</b></div>
        <div class="rc-line minor"><span>売った品 ${t.sold}　買った品 ${t.bought}${t.walkouts ? `　怒って帰った客 ${t.walkouts}` : ''}</span></div>
        <div class="rc-total ${net >= 0 ? 'good' : 'bad'}"><span>収支</span><b>${net >= 0 ? '+' : '−'}${gum(Math.abs(net))}</b><em class="stamp ${net >= 0 ? 'ok' : 'ng'}">${net > 0 ? '黒字' : net < 0 ? '赤字' : '±0'}</em></div>
        ${note}
        <i class="teeth" aria-hidden="true"></i>
      </article>
    </div>
    ${
      wide
        ? ''
        : `<p class="night-hint">${g.wentOut ? '今夜はもう外出しました。' : '左のドアから外出できます（一晩に一か所。翌朝は開店が遅れます）。'}</p>
    <div class="actions two night-acts">${shelfBtn}${btn('gear', '装備', { cls: 'small', sfx: 'open' })}</div>
    <div class="cta">${btn('endday', `${ICON.moon}眠って翌日へ`, { cls: 'primary big', sfx: 'none' })}</div>`
    }
  </div>`;
}

const shutter = (state: 'down' | 'up', night: boolean): string =>
  `<div class="shutter ${state} ${night ? 'night' : ''}" id="shutter" aria-hidden="true"><div class="shutter-slats"></div><span class="shutter-sign">MY CRYPTO<br />TRADING</span><div class="shutter-bar"><i></i></div></div>`;

/**
 * The shop front: the street beyond the counter while open; the shutter with a card on it otherwise.
 * The scene and the counter are always there (the shutter covers them), so nothing jumps when it moves.
 */
/** The shop's walls, left and right of the opening to the street (a wide screen): the showcase is set into the left one, and customers come out from behind them. */
const WALLS = '<i class="wall wl" aria-hidden="true"></i><i class="wall wr" aria-hidden="true"></i>';

export function front(g: GameState, v: Visitor | null, opening: boolean): string {
  if (g.phase === 'open' && v) {
    // the street outside follows the day: the light turns towards evening as the line of customers runs out
    const sky = { dusk: g.visitorsToday > 1 ? Math.min(1, g.cursor / (g.visitorsToday - 1)) * 0.75 : 0, rain: g.event.id === 'rain' };
    return `<div class="front open" id="front" data-ui>${scene(v, opening, { ...farTray(v), html: farTray(v).html + outsideNote(g) + WALLS }, sky)}${counterBar(g, v)}${shutter('up', false)}${stageProps(g)}${deskNotes(g)}${cameo(g)}</div>`;
  }
  const night = g.phase === 'evening';
  return `<div class="front shut ${night ? 'is-night' : 'is-morning'}" id="front" data-ui>${scene(null, false)}${counterBar(g, null)}${shutter('down', night)}${WALLS}${night ? nightCard(g) : morningCard(g)}${stageProps(g)}${deskNotes(g)}</div>`;
}
