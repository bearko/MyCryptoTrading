import { B } from '../game/balance';
import { catalog as cat, SLOT_JA } from '../game/catalog';
import * as G from '../game/logic';
import type { GameState, Visitor } from '../game/state';
import { audio, hapticSettings } from './audio';
import { craftNote } from './craft';
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
  else if (g.phase === 'quest') action = btn('drop', '捨てる');
  else if (ui.sel.grid === 'wallet') action = btn('unload', '棚へ移す');
  else action = '';
  // a good with an effect of its own is used from here too (the same as a double click on it)
  const use = item.effect && atHome(g) && ui.sel.grid === 'shelf' ? btn('use-item', '使う：合成をはじめる', { cls: 'primary', sfx: 'open' }) : '';
  // (a good on the shelf is not sold off from here: it goes to the bin, or to the dealer who comes on rent day)
  // throwing a good away is asked twice, and the second button is not where the first one was:
  // tapping the same spot again backs out instead
  const throwable = g.phase === 'quest';
  const foot =
    ui.confirmDispose && throwable
      ? `<p class="warn-text dispose-ask">${g.phase === 'quest' ? 'この品を捨てます。' : `この品を ${num(price)} GUM で処分します。`}元には戻せません。</p>
      <div class="actions two">${btn('dispose-no', 'やめる', { cls: 'ghost' })}${btn(g.phase === 'quest' ? 'drop' : 'dispose', g.phase === 'quest' ? '本当に捨てる' : '本当に処分', { cls: 'danger', sfx: 'none' })}</div>`
      : `${use ? `<div class="actions one">${use}</div>` : ''}<div class="actions ${action ? 'two' : 'one'}">${action}${btn('modal-close', '閉じる', { cls: 'ghost' })}</div>`;
  return `<div class="modal" id="modal-inspect" data-ui><div class="modal-box tall">
    <div class="modal-scroll">
    ${itemCard(x.itemId, x.cond, `<div class="item-note">仕入れ値 ${num(x.paid)}　定価 ${num(G.salePrice(cat, x, 0))}${x.hot ? '　<b class="seen-note hot">訳あり（棚にあると、見回りに没収される）</b>' : ''}${x.seen ? `　<b class="seen-note ${x.fake ? 'fake' : 'real'}">${x.fake ? 'レプリカ（見分け済み）' : '本物（見分け済み）'}</b>` : ''}</div>`)}
    ${itemDetail(item)}
    ${craftNote(g, item)}
    </div>
    ${foot}
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
      ${atHome(g) && G.hasEffect(g, cat, 'pot') && !item.effect ? btn('to-pot', '合成の壺に入れる', { disabled: ui.counter.includes(x.uid), sfx: 'drop' }) : ''}
      ${atHome(g) && !ui.counter.includes(x.uid) ? btn('show-toggle', ui.sel.grid === 'case' ? 'ショーケースから棚へ戻す' : 'ショーケースに飾る', { sfx: 'none' }) : ''}
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
      <li>売りに来たお客さんの品は、カウンターの奥から手前へ移して買い取ります（青い ↓ ボタンで、すべて手前に移せます）。「まとめ買いする」は割引がつくことがあります。</li>
      <li>買いに来たお客さんには、棚の品をカウンターへドラッグして売ります。予算を超えた分は支払われません。</li>
      <li>ベルを鳴らすと、いまのお客さんに帰ってもらい、次のお客さんを呼びます。</li>
      <li>品の色は系統（PHY系＝赤▲・INT系＝青◆・AGI系＝緑●）。品をタップで詳細、長押しでメニュー（回転・装備）。</li>
      <li>店にいるあいだは、品をつまんだままタブ（棚・ウォレット・装備）の上で 1 秒待つと、そのタブが開きます。そのまま置けば、棚・ウォレット・装備のあいだで品を移せます。</li>
      <li>お客さんの伝票は、上のボタンで大きさを 小 → 大 → 中 と切り替えられます。その右の「交渉」で、値切り・上乗せ・値引きを選ぶ窓が開きます。</li>
      <li>買いに来たお客さんの予算は、値付けで動きます。安くした分だけ増え、高くした分だけ減ります。在庫を早く回したいときは安く、品を残して単価を上げたいときは高く。</li>
      <li>お客さんは 5 つの派閥（朱雀・青龍・玄武・白虎・黄竜）のどれかに属しています。交渉で値引きして売る・色をつけて買うと、その派閥の評価が大きく上がり、評価が貯まると恩恵を受けられます（左上の「評判」をタップで確認）。派閥は 2 つずつ対立していて（朱雀と玄武、青龍と白虎）、片方に気前よくすると相手の評価が下がります。下がりきった派閥は、恩恵が裏返ります。</li>
      <li>買い取りの伝票には、品が棚でしめる形（マス目）が出ます。販売の伝票には、品を置いたあとの「予算の残り」が出ます。</li>
      <li>棚にある<b>ぴっぴ教の壺</b>（角に ✦ の印がある品）を<b>クリック</b>すると、合成ができます（ダブルクリックで、品の詳細）。品を 2〜3 個入れると、1 つ上の品になります（1 日 2 回、お布施が要ります）。壺もふつうの品なので売れますが、売ると合成はできなくなります。✦ の印がある品は、棚に置いてダブルクリックすると特別な効果を使えます。</li>
      <li>お客さんの予算は、ヒーローのレアリティで決まります。エピックやレジェンダリーの品は、買える人が限られます。レジェンダリーのヒーローは大富豪です。</li>
      <li>PC の画面にタブはありません。下はいつも棚で、<b>ウォレットの中</b>は棚のウォレット（✦）をクリック、<b>装備</b>は棚の右の装備棚をクリック、<b>合成</b>は壺（✦）をダブルクリックすると、それぞれ窓が開きます。窓は上の帯をつかんで動かせて、開いたままにできます。品は、棚と窓のあいだをドラッグで行き来します。</li>
      <li>PC では、店の中の物で操作します。<b>寝床</b>をクリック＝眠って翌日へ。<b>ゴミ箱</b>へ品をドラッグ＝捨てる（夜までは戻せます）。<b>ショーケース</b>へ品をドラッグ＝飾る（棚と同じマス目で、形どおりにはめこみます。その系統を欲しがる客が来やすくなり、高い品ほど上客が来ます。すきまなく埋めると、集客が増えます。飾った品は、そのままカウンターへ出して売れます）。<b>電話</b>＝商人ギルド（ずっと効く頼みごとと、系統を選べる品の取り寄せを、GUM か、毎朝貯まる信用で。取り寄せた品は、翌朝、電話の下の箱に届きます。GUM を借りることもできます：利子 2 割、7 晩で返済。返しおえるまで権利書は買えません）。</li>
      <li>5 日目から、売り客の品に<b>レプリカ</b>が混じります（値打ちは本物の 3 割。言い値が少し安いのが手がかり）。カウンターの<b>ルーペ</b>へ品をドラッグすると見分けられます（1 日 3 回）。見抜くと、売り客は安く手放します。知らずに本物として売ると、ばれて評判を落とすことがあります。</li>
      <li>6 日目から、<b>訳あり</b>の品が安く持ちこまれます（言い値は半分ほど。ふつうの値で売れます）。ただし、ときどき<b>見回り</b>が来て、棚にある訳ありの品を没収し、罰金を取っていきます。ウォレットの中は調べられないので、売るときまで隠しておけます。壺に入れた品は、訳ありではなくなります。</li>
      <li>壁に<b>手配書</b>が貼られることがあります。ある派閥が、対立する派閥の客を追っています。その客が来たら、手配書を開いて通報する（賞金と、依頼主の評価）か、そのまま取引する（追われる側の評価。金払いがよく、品も安い）かを選べます。</li>
      <li>品の枠の色はレアリティです（青＝コモン、緑＝アンコモン、黄＝レア、オレンジ＝エピック、赤＝レジェンダリー）。品にマウスを乗せると詳細の札、右クリックでメニュー、つまんだまま <b>R</b>（または右クリック）で回転。<b>O</b> キーで、操作の案内（物の名前とショートカットの一覧）が出ます。キーを押しながらクリックすると、品をすぐに移せます（<b>Ctrl</b>＝棚、<b>Shift</b>＝ショーケース、<b>Alt</b>＝カウンター）。ドラッグ中は <b>Q</b>・<b>E</b> で左・右に回転。キーは <b>Space</b>＝せりふ送り、<b>B</b>＝ベル、<b>Enter</b>＝決定、<b>Esc</b>＝閉じる、<b>1〜3</b>＝棚・ウォレット・装備。</li>
      <li>閉店後、左のドアから外出できます（一晩に一か所。翌朝はお客さんが ${B.lateOpenLoss} 人減ります）。</li>
      <li>ショップ：品を買い、ウォレットに入れた分だけ持ち帰れます。</li>
      <li>クエスト：装備した品のスキルで戦い、進むか帰るかを選びます。倒れると、その回に拾った品を失います。</li>
            <li>毎朝「本日の注文」が出ます。達成するとその場で GUM がもらえます。成約を続けると COMBO がつき、売値におまけが乗ります（何も取引せずに帰すと切れます）。</li>
      <li>家賃を払うたびに「商才」を 3 つから 1 つ選べます。3 日目からは、大富豪・急ぎの旅人・収集家といった特別なお客さんも来ます。</li>
      <li>7日ごとに、その日の最後に<b>大家</b>が家賃を取りに来ます（毎回上がります）。払えないと店を失います（ギルドの「大家への口添え」があれば 1 回だけ待ってもらえます）。所持金が ${num(B.deedPrice)} GUM あれば、そのとき店を買い取れます（クリア）。</li>
      <li>家賃の日は、大家の前に<b>引取の商人</b>が来ます。何でも買ってくれますが、定価の ${Math.round(B.dealerCut * 100)}% 引きで、予算までです。</li>
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
