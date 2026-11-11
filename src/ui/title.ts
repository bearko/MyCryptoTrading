import { version } from '../../package.json';
import { catalog as cat } from '../game/catalog';
import * as store from '../game/save';
import { btn } from './html';

/** heroes picked once per visit, so the parade does not reshuffle on every redraw */
let parade: { img: string; lane: number; dur: number; delay: number; size: number }[] | null = null;

function pickParade(): NonNullable<typeof parade> {
  const list: NonNullable<typeof parade> = [];
  const pool = [...cat.heroes];
  for (let i = 0; i < 9 && pool.length; i++) {
    const hero = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const lane = i % 3;
    list.push({ img: hero.img, lane, dur: 15 + lane * 4 + Math.random() * 3, delay: -(i * 5.300 + Math.random() * 3), size: 132 - lane * 30 });
  }
  return list;
}

const letters = (word: string, from: number): string =>
  [...word].map((ch, i) => (ch === ' ' ? '<i class="sp"></i>' : `<i style="--d:${from + i}">${ch}</i>`)).join('');

export function title(): string {
  const saved = store.load();
  parade ??= pickParade();
  const walkers = parade
    .map((h, i) => `<span class="marcher lane-${h.lane}" style="--dur:${h.dur.toFixed(1)}s;--delay:${h.delay.toFixed(1)}s;--size:${h.size}px"><img src="${h.img}" alt="" draggable="false" style="animation-delay:${-(i * 0.13).toFixed(2)}s" /></span>`)
    .join('');
  return `<div class="title" id="title" data-ui>
    <div class="title-bg" style="background-image:url('${cat.backdrop}')"></div>
    <div class="title-tone"></div>
    <div class="title-band" aria-hidden="true"><span>BUY LOW ★ SELL HIGH ★ OWN THE SHOP ★ BUY LOW ★ SELL HIGH ★ OWN THE SHOP ★ BUY LOW ★ SELL HIGH ★ OWN THE SHOP ★ </span></div>
    <div class="parade" aria-hidden="true">${walkers}</div>
    <h1 class="logo" aria-label="My Crypto Trading">
      <span class="logo-top">${letters('MY CRYPTO', 0)}</span>
      <span class="logo-main">${letters('TRADING', 5)}</span>
      <span class="logo-sub">マイクリプトトレーディング</span>
    </h1>
    <p class="title-copy"><b>安く買って、高く売る。</b><br />家賃に追われる前に、店を自分のものに。</p>
    <div class="title-acts">
      ${saved ? btn('resume', `つづきから<em>${saved.day}日目</em>`, { cls: 'primary big pulse', sfx: 'none' }) : ''}
      ${btn('new', 'はじめから', { cls: saved ? 'big' : 'primary big pulse', sfx: 'none' })}
      <div class="actions two">${btn('help', '遊びかた', { cls: 'ghost small', sfx: 'open' })}${btn('settings', '設定', { cls: 'ghost small', sfx: 'open' })}</div>
    </div>
    <p class="credit">ver ${version}　非公式の二次創作です。<br />素材：My Crypto Heroes（© MCH Co.,Ltd.）</p>
  </div>`;
}
