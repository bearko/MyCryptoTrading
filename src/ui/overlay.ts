/**
 * The guide overlay (the O key): a name on each thing of the shop, and the list of shortcuts. It lies over
 * the page, outside the game's own tree, and goes away at the next click or key.
 */
import { audio } from './audio';
import { ctx, ui } from './core';

const LABELS: [selector: string, text: string][] = [
  ['#case', 'ショーケース'],
  ['#phone', '電話（商人ギルド）'],
  ['#wanted', '手配書'],
  ['#parcel', '届いた荷物'],
  ['#hud-rep', '評判と派閥'],
  ['#win', '伝票'],
  ['#far', 'お客さんの品'],
  ['#near .counter-mat', 'カウンター（売る品・買い取る品）'],
  ['#take-all', 'すべて手前に'],
  ['#loupe', 'ルーペ（品を重ねて見分ける）'],
  ['#bell', '次の客を呼ぶ（B）'],
  ['.cta [data-act="open"]', '店を開ける（Enter）'],
  ['.inv-item.special', '特別な品（ダブルクリックで使う）'],
  ['#inv .grid', '棚'],
  ['#trash', 'ゴミ箱（品を重ねて捨てる）'],
  ['#bed', '寝床（夜にクリックで翌日へ）'],
];

const KEYS: [keys: string[], text: string][] = [
  [['Ctrl', 'クリック'], '棚に即時移動させる'],
  [['Shift', 'クリック'], 'ショーケースに即時移動させる'],
  [['Alt', 'クリック'], 'カウンターに即時移動させる'],
  [['ドラッグ中', 'Q'], '品を左に回転させる'],
  [['ドラッグ中', 'E'], '品を右に回転させる（R も同じ）'],
  [['ダブルクリック'], '特別な品（✦）を使う'],
  [['Space'], 'せりふを送る'],
  [['B'], 'ベルを鳴らす'],
  [['Enter'], '決定（買う・売る・店を開ける）'],
  [['1', '2', '3'], '棚・ウォレット・装備'],
  [['Esc'], '閉じる／設定を開く'],
  [['O'], 'この案内を表示／非表示'],
];

const COUNTER = new Set(['#near .counter-mat', '#bell', '#take-all', '#loupe', '#far', '#win']);

let host: HTMLElement | null = null;

export const overlayOpen = (): boolean => !!host;

export function closeOverlay(): void {
  if (!host) return;
  host.remove();
  host = null;
  window.removeEventListener('resize', closeOverlay);
}

/** Shows or hides the guide. True when it did something. */
export function toggleOverlay(): boolean {
  if (host) {
    closeOverlay();
    audio.sfx('close');
    return true;
  }
  if (ui.screen !== 'game') return false;
  const el = document.createElement('div');
  el.className = 'guide';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '操作の案内');
  const tags = LABELS.map(([selector, text]) => {
    // (the counter is behind the shutter until the shop is open)
    if (COUNTER.has(selector) && ctx.s?.phase !== 'open') return '';
    const target = ctx.root.querySelector<HTMLElement>(selector);
    if (!target || target.offsetParent === null) return '';
    const r = target.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return '';
    // the name sits on the thing's top edge, kept inside the window
    // (the shelf's name goes to its left end, clear of the goods' own names)
    const half = text.length * 7 + 14;
    const x = Math.max(half, Math.min(window.innerWidth - half, selector === '#inv .grid' ? r.left + 30 : r.left + r.width / 2));
    const y = Math.max(22, r.top + Math.min(14, r.height / 2));
    return `<span class="guide-tag" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px">${text}</span><i class="guide-box" style="left:${r.left.toFixed(0)}px;top:${r.top.toFixed(0)}px;width:${r.width.toFixed(0)}px;height:${r.height.toFixed(0)}px"></i>`;
  }).join('');
  const keys = KEYS.map(([keys, text]) => `<li><span>${keys.map((k) => `<kbd>${k}</kbd>`).join('<em>+</em>')}</span><b>${text}</b></li>`).join('');
  el.innerHTML = `${tags}
    <p class="guide-top">O キーで、この案内を表示／非表示</p>
    <div class="guide-keys"><h2>キーボードのショートカット</h2><ul>${keys}</ul></div>
    <button class="guide-close" type="button">案内を閉じる</button>`;
  el.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeOverlay();
    audio.sfx('close');
  });
  document.body.appendChild(el);
  host = el;
  window.addEventListener('resize', closeOverlay);
  audio.sfx('open');
  return true;
}
