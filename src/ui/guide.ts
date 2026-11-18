import { catalog as cat } from '../game/catalog';
import { filed, GUIDE_HERO, LESSONS, lessonText } from '../game/guide';
import { ctx } from './core';
import { ui } from './core';
import { btn, esc } from './html';

const face = (): string => cat.heroById.get(GUIDE_HERO)?.img ?? '';

/** A note from the one who took the player in: a few lines, and where to look. */
export function memoModal(): string {
  const lesson = LESSONS.find((l) => l.id === ui.memo);
  if (!lesson) return '';
  return `<div class="modal" id="modal-memo" data-ui><div class="modal-box memo">
    <div class="memo-head"><img class="memo-face" src="${face()}" alt="" draggable="false" /><span><small>福沢諭吉のメモ</small><b class="pix">${esc(lesson.title)}</b></span></div>
    ${(ctx.s ? lessonText(ctx.s, lesson) : lesson.text).map((t) => `<p class="memo-text">${esc(t)}</p>`).join('')}
    <p class="memo-hint">${esc(lesson.hint)}</p>
    <div class="actions">${btn('memo-ok', ui.memoBack ? 'バインダーに戻す' : 'わかった（バインダーにとじる）', { cls: 'primary', sfx: ui.memoBack ? 'close' : 'confirm' })}</div>
  </div></div>`;
}

/** The binder on the counter: every note read so far, to be read again at any time. */
export function binderModal(): string {
  const notes = ctx.s ? filed(ctx.s) : [];
  const rows = notes
    .map((l, i) => `<button class="binder-row" data-act="binder-read" data-arg="${l.id}" data-sfx="open"><i>${i + 1}</i><span><b class="pix">${esc(l.title)}</b><small>${esc(l.hint)}</small></span></button>`)
    .join('');
  return `<div class="modal" id="modal-binder" data-ui><div class="modal-box tall memo binder-box">
    <div class="memo-head"><img class="memo-face" src="${face()}" alt="" draggable="false" /><span><small>福沢諭吉のメモ</small><b class="pix">バインダー</b></span></div>
    <div class="modal-scroll binder-list">${rows || '<p class="hint">まだ、とじたメモはありません。</p>'}</div>
    <div class="actions one">${btn('modal-close', '閉じる', { cls: 'primary' })}</div>
  </div></div>`;
}

/** The opening: two lines in the dark, then three from him — and the shop opens. */
const INTRO: { who: boolean; text: string }[] = [
  { who: false, text: '気がつくと、知らない世界にいた。' },
  { who: false, text: '行く宛もなく立ちつくすあなたに、ひとりの男が声をかけた。' },
  { who: true, text: 'ここは CryptoWorld。昔の偉人たちが、毎日のように流れつく世界だ。' },
  { who: true, text: '食べていくなら、商いがいい。この店は伊能忠敬という男の持ちものでね。家賃は週に一度、払うことになる。' },
  { who: true, text: 'まずは 1 つ買って、1 つ売ってみなさい。客はもう、そこまで来ている。' },
];
export const INTRO_STEPS = INTRO.length;

export function introScreen(): string {
  const step = INTRO[Math.min(Math.max(0, ui.intro), INTRO.length - 1)];
  return `<button class="intro ${step.who ? 'lit' : ''}" id="intro" data-act="intro-next" data-sfx="tap" data-ui aria-label="つづける">
    ${step.who ? `<img class="intro-face" src="${face()}" alt="" draggable="false" /><b class="intro-name">福沢諭吉</b>` : ''}
    <p class="intro-text" id="intro-text-${ui.intro}">${esc(step.text)}</p>
    <small class="intro-next">クリックでつづける</small><small class="intro-skip" data-act="intro-skip">スキップ</small>
  </button>`;
}
