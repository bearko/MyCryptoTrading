import { B } from '../game/balance';
import { catalog as cat, SLOT_JA } from '../game/catalog';
import * as G from '../game/logic';
import type { GameState, Visitor } from '../game/state';
import { audio, hapticSettings } from './audio';
import { atHome, ctx, ui } from './core';
import { btn, esc, gum, itemCard, itemDetail, itemTile, num } from './html';
import { ICON } from './icons';
import { display } from './settings';

const selected = (g: GameState) => (ui.sel ? (G.gridOf(g, cat, ui.sel.grid).items.find((x) => x.uid === ui.sel!.uid) ?? null) : null);

/** A tap on a good: everything about it, and what can be done with it here. */
export function inspectModal(g: GameState): string {
  const x = selected(g);
  if (!x || !ui.sel) return '';
  const item = G.findItem(cat, x.itemId);
  const price = G.disposePrice(cat, x);
  let action: string;
  if (g.phase === 'shop') action = btn('unstow', 'ウォレットから出す');
  else if (g.phase === 'quest') action = btn('drop', ui.confirmDispose ? '本当に捨てる' : '捨てる', { cls: ui.confirmDispose ? 'danger' : '', sfx: ui.confirmDispose ? 'none' : 'tap' });
  else if (ui.sel.grid === 'wallet') action = btn('unload', '棚へ移す');
  else action = btn('dispose', ui.confirmDispose ? '本当に処分' : '処分する', { cls: ui.confirmDispose ? 'danger' : '', sub: gum(price), sfx: ui.confirmDispose ? 'none' : 'tap' });
  return `<div class="modal" id="modal-inspect" data-ui><div class="modal-box tall">
    <div class="modal-scroll">
    ${itemCard(x.itemId, x.cond, `<div class="item-note">仕入れ値 ${num(x.paid)}　定価 ${num(G.salePrice(cat, x, 0))}</div>`)}
    ${itemDetail(item)}
    </div>
    <div class="actions two">${action}${btn('modal-close', '閉じる', { cls: 'ghost' })}</div>
  </div></div>`;
}

/** A long press on a good: turn it, wear it, or nothing. */
export function menuModal(g: GameState): string {
  const x = selected(g);
  if (!x || !ui.sel) return '';
  const item = G.findItem(cat, x.itemId);
  const wearable = atHome(g) && ui.sel.grid === 'shelf' && !ui.counter.includes(x.uid);
  return `<div class="modal" id="modal-menu" data-ui><div class="modal-box menu">
    <div class="menu-head">${itemTile(item, 'md')}<b class="pix">${esc(item.ja)}</b></div>
    <div class="actions one">
      ${btn('turn', '回転させる', { sfx: 'none' })}
      ${btn('equip', '装備する', { disabled: !wearable, sub: wearable ? (item.wallet ? 'ウォレットとして使う' : `${SLOT_JA[item.slot]}に装備`) : '店の棚にある品だけ装備できます', sfx: 'none' })}
      ${btn('modal-close', 'やめる', { cls: 'ghost' })}
    </div>
  </div></div>`;
}

export function overModal(g: GameState, v: Visitor): string {
  const q = G.quoteSale(g, cat, v, ui.counter, ui.tier);
  return `<div class="modal" id="modal-over" data-ui><div class="modal-box alert">
    <span class="alert-mark" aria-hidden="true">!</span>
    <p class="modal-text">${num(q.over)}GUM予算オーバーしています。オーバーした分は支払われません。よろしいですか？</p>
    <div class="actions two">${btn('modal-close', 'キャンセル', { cls: 'ghost' })}${btn('sell-ok', 'OK', { cls: 'primary', sfx: 'none' })}</div>
  </div></div>`;
}

/** The door: where to go tonight. */
export function destModal(): string {
  return `<div class="modal" id="modal-dest" data-ui><div class="modal-box dest">
    <h2 class="modal-title"><small>TONIGHT</small>どこへ行きますか？</h2>
    <p class="hint">一晩に行けるのは一か所だけ。外出すると翌朝の開店が遅れ、お客さんが ${B.lateOpenLoss} 人減ります。</p>
    <div class="dest-cards">
      <button class="dest-card go-shop" data-act="go-shop" data-sfx="none"><span class="dest-icon">${ICON.bag}</span><span class="dest-text"><b>ショップ</b><small>エクステンションを買い、ウォレットに入れて持ち帰る</small></span><em>SHOP</em></button>
      <button class="dest-card go-quest" data-act="go-quest" data-sfx="confirm"><span class="dest-icon">${ICON.sword}</span><span class="dest-text"><b>クエスト</b><small>装備を整えてダンジョンへ。品と GUM を持ち帰る</small></span><em>QUEST</em></button>
    </div>
    <div class="actions one">${btn('modal-close', 'やめる', { cls: 'ghost' })}</div>
  </div></div>`;
}

export function leaveModal(): string {
  return `<div class="modal" id="modal-leave" data-ui><div class="modal-box alert">
    <span class="alert-mark" aria-hidden="true">!</span>
    <p class="modal-text warn-text">ウォレットに入れていないエクステンションは持ち帰れずに処分されます。本当に帰宅しますか？</p>
    <div class="actions two">${btn('modal-close', 'キャンセル', { cls: 'ghost' })}${btn('shop-leave-ok', '帰宅する', { cls: 'danger', sfx: 'none' })}</div>
  </div></div>`;
}

export function helpModal(): string {
  return `<div class="modal" id="modal-help" data-ui><div class="modal-box tall">
    <h2 class="modal-title"><small>HOW TO PLAY</small>遊びかた</h2>
    <div class="modal-scroll">
    <ol class="help">
      <li>朝、本日のイベントを確かめて店を開けます（シャッターが上がります）。</li>
      <li>売りに来たお客さんの品は、カウンターの奥から手前へ移して買い取ります。「まとめ買いする」は割引がつくことがあります。</li>
      <li>買いに来たお客さんには、棚の品をカウンターへドラッグして売ります。予算を超えた分は支払われません。</li>
      <li>ベルを鳴らすと、いまのお客さんに帰ってもらい、次のお客さんを呼びます。</li>
      <li>品の色は系統（PHY系＝赤▲・INT系＝青◆・AGI系＝緑●）。品をタップで詳細、長押しでメニュー（回転・装備）。</li>
      <li>店にいるあいだは、品をつまんだままタブ（棚・ウォレット・装備）の上で 1 秒待つと、そのタブが開きます。そのまま置けば、棚・ウォレット・装備のあいだで品を移せます。</li>
      <li>お客さんの伝票は、右上のボタンで大きさを 中 → 小 → 大 と切り替えられます。</li>
      <li>閉店後、左のドアから外出できます（一晩に一か所。翌朝はお客さんが ${B.lateOpenLoss} 人減ります）。</li>
      <li>ショップ：品を買い、ウォレットに入れた分だけ持ち帰れます。</li>
      <li>クエスト：装備した品のスキルで戦い、進むか帰るかを選びます。倒れると、その回に拾った品を失います。</li>
            <li>毎朝「本日の注文」が出ます。達成するとその場で GUM がもらえます。成約を続けると COMBO がつき、売値におまけが乗ります（何も取引せずに帰すと切れます）。</li>
      <li>家賃を払うたびに「商才」を 3 つから 1 つ選べます。3 日目からは、大富豪・急ぎの旅人・収集家といった特別なお客さんも来ます。</li>
      <li>7日ごとに家賃を払います（毎回上がります）。${num(B.deedPrice)} GUM で店の権利書を買い取ればクリアです。</li>
    </ol>
    <p class="credit">素材：My Crypto Heroes（© MCH Co.,Ltd.）。本作は非公式の二次創作です。</p>
    </div>
    <div class="actions one">${btn(ctx.s && ui.screen === 'game' ? 'settings' : 'modal-close', ctx.s && ui.screen === 'game' ? '戻る' : '閉じる', { cls: 'ghost' })}</div>
  </div></div>`;
}

const toggle = (act: string, label: string, sub: string, on: boolean): string =>
  `<button class="toggle ${on ? 'on' : ''}" data-act="${act}" role="switch" aria-checked="${on}"><span class="toggle-text"><b>${label}</b><small>${sub}</small></span><i class="toggle-knob"><i></i></i></button>`;

const slider = (kind: 'bgm' | 'se', label: string, value: number): string =>
  `<label class="slider"><span><b>${label}</b><em id="vol-${kind}-n">${Math.round(value * 100)}</em></span>
    <input type="range" min="0" max="100" step="5" value="${Math.round(value * 100)}" data-vol="${kind}" id="vol-${kind}" data-live style="--v:${Math.round(value * 100)}%" aria-label="${label}" /></label>`;

/** Settings (from the HUD): volumes, calm mode, vibration, bigger text, and starting over. */
export function settingsModal(): string {
  const inGame = !!ctx.s && ui.screen === 'game';
  const vol = audio.settings;
  return `<div class="modal" id="modal-settings" data-ui><div class="modal-box tall settings">
    <h2 class="modal-title"><small>SETTINGS</small>設定</h2>
    <div class="modal-scroll">
      ${slider('bgm', 'BGM の音量', vol.bgm)}
      ${slider('se', '効果音の音量', vol.se)}
      ${toggle('set-calm', '演出をひかえる', '揺れ・点滅・飛ぶ粒をやめて、静かに切り替えます', display.calm)}
      ${toggle('set-haptic', '振動', '対応している端末で、操作に合わせて震えます', hapticSettings.enabled)}
      ${toggle('set-big', '文字を大きく', '全体の文字を 1.15 倍にします', display.bigText)}
      <div class="actions ${inGame ? 'two' : 'one'} settings-more">${btn('help', '遊びかた', { cls: 'small', sfx: 'open' })}${inGame ? btn('reset', ui.confirmReset ? '本当にやり直す' : '最初からやり直す', { cls: ui.confirmReset ? 'small danger' : 'small ghost', sfx: ui.confirmReset ? 'none' : 'tap' }) : ''}</div>
    </div>
    <div class="actions one">${btn('modal-close', '閉じる', { cls: 'primary' })}</div>
  </div></div>`;
}

export function ending(g: GameState): string {
  if (g.phase === 'won') {
    return `<main class="ending won" id="ending" data-ui>
      <div class="end-rays" aria-hidden="true"></div>
      <section class="end-card paper">
        <span class="stamp deed" aria-hidden="true">権利書</span>
        <small class="end-kicker">CONGRATULATIONS</small>
        <h2>店を買い取った！</h2>
        <div class="end-record"><small>記録</small><b>${g.ownedDay}</b><span>日目</span></div>
        <p>${g.ownedDay}日目で権利書を手に入れました。もう家賃に追われることはありません。</p>
        <div class="end-table">
          <div class="rc-line"><span>売った品</span><i></i><b>${num(g.totals.sold)}</b></div>
          <div class="rc-line"><span>買った品</span><i></i><b>${num(g.totals.bought)}</b></div>
          <div class="rc-line"><span>最高の売上</span><i></i><b>${gum(g.totals.bestSale)}</b></div>
          <div class="rc-line"><span>ダンジョンの最深到達</span><i></i><b>地下 ${g.totals.deepest} 階</b></div>
          <div class="rc-line"><span>注文の達成</span><i></i><b>${num(g.totals.orders)} 回</b></div>
          <div class="rc-line"><span>最長の COMBO</span><i></i><b>${num(g.totals.bestCombo)}</b></div>
          <div class="rc-line"><span>身につけた商才</span><i></i><b>${num(g.perks.length)}</b></div>
        </div>
        <i class="teeth" aria-hidden="true"></i>
      </section>
      <div class="cta">${btn('continue', 'このまま店を続ける', { cls: 'primary big', sfx: 'none' })}${btn('restart', '最初からやり直す', { cls: 'ghost small', sfx: 'none' })}</div>
    </main>`;
  }
  return `<main class="ending lost" id="ending" data-ui>
    <section class="end-card paper">
      <span class="stamp ng seized" aria-hidden="true">差し押さえ</span>
      <small class="end-kicker">GAME OVER</small>
      <h2>店を失った…</h2>
      <p>${g.day}日目、家賃を払えませんでした。相場より安く買い、欲しがる人に高く売るのが商いの基本です。</p>
      <i class="teeth" aria-hidden="true"></i>
    </section>
    <div class="cta">${btn('restart', 'もう一度はじめる', { cls: 'primary big', sfx: 'none' })}</div>
  </main>`;
}
