import { catalog as cat } from '../game/catalog';
import * as G from '../game/logic';
import * as N from '../game/night';
import * as Q from '../game/quest';
import * as store from '../game/save';
import type { GameState, SlotId, Visitor } from '../game/state';
import { audio, haptic, hapticSettings } from './audio';
import { offerKey } from './counter';
import { ctx, ui } from './core';
import { fx } from './fx';
import { itemTile } from './html';
import { holdGum, resetHud } from './hud';
import { anim, centre, flip, flyGhost, locked, nope, pointOn, settle, tok, wait, within } from './motion';
import { questAct } from './quest';
import { bubbleShake, custHop, custShake, custThink, OPEN_MS, pipBreak, resetScene, sayAgain } from './scene';
import { display } from './settings';
import { note } from './toast';
import { BEAT_MS } from './window';

/** the pending walk-out before the next customer comes in (after the bell) */
let nextTimer = 0;

const render = (): void => ctx.render();
const $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => ctx.root.querySelector<T>(sel);

export function closeModal(): void {
  ui.modal = 'none';
  ui.sel = null;
  ui.confirmDispose = false;
  ui.confirmReset = false;
  ui.departing = false;
  ui.gearSlot = null;
  ui.gearBefore = null;
  ui.gearFlash = null;
}

function newCustomer(): void {
  ui.custKey += 1;
  ui.haggleOpen = false;
  ui.counter = [];
  ui.picked = [];
  ui.tier = 0;
  ui.beat = null;
  ui.struck = null;
  ui.win.open = true;
}

/** A change of scene: the screen is swapped under an ink wipe, and input waits until it is over. */
function sceneChange(swap: () => void, kind: 'slash' | 'bars' | 'iris' = 'slash'): Promise<void> {
  return locked(async () => {
    let done = false;
    const once = (): void => {
      if (done) return;
      done = true;
      swap();
    };
    await within(fx.transition(once, kind), 1600);
    // a transition that never called back must not leave the old screen up
    once();
  });
}

/** Starts or resumes a game from the title. */
function enterGame(g: GameState | null): void {
  void sceneChange(() => {
    ctx.s = g;
    ui.screen = g ? 'game' : 'title';
    ui.gridView = 'shelf';
    ui.printDay = 0;
    ui.win.moved = false;
    ui.win.big = false;
    closeModal();
    resetHud(g);
    resetScene();
    if (g && G.currentVisitor(g)) newCustomer();
    if (g) store.save(g);
    render();
    if (g?.phase === 'morning') audio.sfx('event', { delay: 0.35 });
  });
}

// ---------------------------------------------------------------- the day: opening, the bell, closing

function openShop(g: GameState): void {
  if (g.phase !== 'morning') return;
  void locked(async () => {
    audio.sfx('shutterUp');
    haptic('medium');
    G.openShop(g, cat);
    newCustomer();
    ui.lateKey = ui.custKey;
    store.save(g);
    render();
    const shutter = $('#shutter');
    anim(
      shutter,
      [
        { transform: 'translateY(0)', offset: 0 },
        { transform: 'translateY(-2.5%)', offset: 0.1 },
        { transform: 'translateY(-1.5%)', offset: 0.16 },
        { transform: 'translateY(-34%)', offset: 0.45 },
        { transform: 'translateY(-32.5%)', offset: 0.5 },
        { transform: 'translateY(-72%)', offset: 0.78 },
        { transform: 'translateY(-71%)', offset: 0.82 },
        { transform: 'translateY(-103%)', offset: 1 },
      ],
      { duration: OPEN_MS, easing: 'linear' },
    );
    $('#scene')?.classList.add('sweep');
    void fx.banner('OPEN', { sub: `${g.day}日目・営業開始`, color: tok('--gum'), ms: 900 });
    await wait(display.still ? 60 : OPEN_MS - 150);
  });
}

function closeShop(g: GameState): void {
  ui.printDay = g.day;
  ui.win.open = false;
  store.save(g);
  render();
  void locked(async () => {
    audio.sfx('shutterDown');
    const shutter = $('#shutter');
    anim(
      shutter,
      [
        { transform: 'translateY(-103%)', offset: 0, easing: 'cubic-bezier(.5,0,1,.6)' },
        { transform: 'translateY(0)', offset: 0.62, easing: 'ease-out' },
        { transform: 'translateY(-3.5%)', offset: 0.76, easing: 'ease-in' },
        { transform: 'translateY(0)', offset: 0.88 },
        { transform: 'translateY(-1%)', offset: 0.94 },
        { transform: 'translateY(0)', offset: 1 },
      ],
      { duration: 620, easing: 'linear' },
    );
    await wait(display.still ? 0 : 380);
    haptic('heavy');
    fx.shake(8, 320);
    const front = $('#front');
    if (front) for (const f of [0.15, 0.5, 0.85]) fx.burst('dust', pointOn(front, f, 0.98), { count: 12, scale: 1.3 });
    void fx.banner('CLOSED', { sub: '本日の営業は終了', color: tok('--violet'), ms: 900 });
    // the receipt prints line by line: a tick for each line, a thump for the stamp
    if (!display.still) {
      for (let i = 0; i < 4; i++) audio.sfx('receipt', { delay: 0.75 + i * 0.22, pitch: 1 + i * 0.04 });
      audio.sfx('stamp', { delay: 0.75 + 4 * 0.22 + 0.2 });
    } else audio.sfx('stamp');
    await wait(display.still ? 0 : 500);
  });
}

function callNext(g: GameState): void {
  window.clearTimeout(nextTimer);
  G.callNext(g, cat);
  if (g.phase === 'evening') {
    closeShop(g);
    return;
  }
  newCustomer();
  store.save(g);
  render();
}

function ringBell(g: GameState, v: Visitor | null): void {
  if (g.phase !== 'open') return;
  const bell = $('#bell');
  audio.sfx('bell');
  haptic('light');
  if (bell) {
    fx.burst('ring', pointOn(bell, 0.5, 0.45), { color: tok('--gum') });
    anim(bell.firstElementChild, [{ transform: 'rotate(0)' }, { transform: 'rotate(-22deg)' }, { transform: 'rotate(18deg)' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(0)' }], { duration: 520, easing: 'ease-out' });
  }
  if (v && !v.done) {
    // send this customer away, let them walk out, then bring the next one in
    G.pass(g);
    ui.win.open = false;
    store.save(g);
    render();
    const key = ui.custKey;
    window.clearTimeout(nextTimer);
    nextTimer = window.setTimeout(() => {
      if (ctx.s !== g || key !== ui.custKey || !G.currentVisitor(g)?.done || ctx.busy > 0) return;
      callNext(g);
    }, 1000);
  } else {
    callNext(g);
  }
}

// ---------------------------------------------------------------- deals

/** The customer said no: a shake and a broken pip, or — out of patience — they storm off. */
function refusal(v: Visitor): void {
  if (v.done) {
    ui.win.open = false;
    render();
    audio.sfx('angry');
    haptic('heavy');
    fx.shake(10, 420);
    const walker = $('.walker');
    walker?.classList.add('angry');
    if (walker) fx.text('怒', pointOn(walker, 0.5, 0.18), { kind: 'dmg', size: 30 });
    note('怒って帰ってしまった…', 'info');
    pipBreak(0);
  } else {
    render();
    audio.sfx('refuse');
    haptic('light');
    bubbleShake();
    custShake();
    pipBreak(v.patience);
    nope($('#win'));
  }
}

async function suspense(kind: 'haggle' | 'sell', tier: number): Promise<void> {
  ui.beat = { kind, tier };
  audio.sfx('tap', { pitch: 0.8 });
  render();
  custThink(BEAT_MS);
  if (!display.still) {
    audio.sfx('tap', { delay: BEAT_MS / 3000, pitch: 1, volume: 0.5 });
    audio.sfx('tap', { delay: (BEAT_MS * 2) / 3000, pitch: 1.25, volume: 0.5 });
  }
  await wait(display.still ? 80 : BEAT_MS);
  ui.beat = null;
}

function haggle(g: GameState, v: Visitor, tier: number): void {
  if (v.haggled || v.done) return;
  void locked(async () => {
    await suspense('haggle', tier);
    const old = v.offers.map((o) => o.ask);
    const ok = G.haggle(g, tier);
    ui.haggleOpen = false;
    store.save(g);
    if (ok) {
      ui.struck = old;
      render();
      audio.sfx('haggleOk');
      haptic('medium');
      fx.hitStop(70);
      const win = $('#win');
      fx.stamp('DEAL', win ? pointOn(win, 0.5, 0.4) : centre($('#scene')), { color: tok('--leaf'), size: 64 });
      custHop();
      for (const el of ctx.root.querySelectorAll('.offer .ptag')) settle(el);
    } else refusal(v);
  });
}

function doSell(g: GameState, v: Visitor): void {
  ui.modal = 'none';
  const quote = G.quoteSale(g, cat, v, ui.counter, ui.tier);
  if (!quote.matches) {
    G.sell(g, cat, ui.counter, ui.tier);
    render();
    bubbleShake();
    note('希望と違う品がある', 'bad');
    return;
  }
  void locked(async () => {
    if (quote.chance < 1) await suspense('sell', ui.tier);
    else render();
    const before = g.gum;
    const mat = $('#near .counter-mat');
    const at = pointOn(mat, 0.5, 0.5);
    const result = G.sell(g, cat, ui.counter, ui.tier);
    store.save(g);
    if (result === 'sold') {
      const paid = g.gum - before;
      const release = holdGum(1500);
      ui.counter = [];
      ui.tier = 0;
      if (v.done) ui.win.open = false;
      render();
      audio.sfx('stamp');
      haptic('medium');
      fx.hitStop(70);
      fx.stamp('SOLD', at, { color: tok('--hot'), size: 72 });
      custHop();
      let arrived = false;
      const arrive = (): void => {
        if (arrived) return;
        arrived = true;
        audio.sfx(paid >= 200 ? 'coinBig' : 'coin');
        release();
      };
      fx.fly('coins', at, '#hud-gum', { count: Math.max(5, Math.min(16, Math.round(paid / 20))), onArrive: arrive });
      window.setTimeout(arrive, display.still ? 0 : 900);
      await wait(display.still ? 0 : 320);
    } else if (result === 'left' || result === 'refused') {
      refusal(v);
    } else render();
  });
}

/** Buys a seller's goods: they fly from the counter into their cells on the shelf. */
function buy(g: GameState, v: Visitor, picks: number[], button: HTMLElement | null): void {
  const from = picks.map((i) => {
    const el = document.getElementById(`offer-${offerKey(v, i)}`);
    return { rect: el?.getBoundingClientRect() ?? null, item: G.findItem(cat, v.offers[i].itemId) };
  });
  const firstUid = g.nextUid;
  const kept = ui.struck ? ui.struck.filter((_, i) => !picks.includes(i)) : null;
  if (!G.buy(g, cat, picks)) {
    audio.sfx('error');
    haptic('double');
    nope(button);
    return;
  }
  ui.picked = [];
  ui.struck = kept;
  ui.gridView = 'shelf';
  if (v.done) ui.win.open = false;
  store.save(g);
  render();
  audio.sfx('buy');
  haptic('light');
  custHop();
  from.forEach((f, i) => {
    const el = document.getElementById(`item-${firstUid + i}`);
    if (!el || !f.rect) return;
    el.style.visibility = 'hidden';
    void flyGhost(itemTile(f.item, 'fly'), f.rect, el.getBoundingClientRect(), { delay: i * 70, ms: 400, arc: -40 }).then(() => {
      el.style.visibility = '';
      settle(el);
      audio.sfx('drop', { volume: 0.6, pitch: 1 + i * 0.06 });
      fx.burst('dust', pointOn(el, 0.5, 0.9), { count: 6, scale: 0.8 });
    });
  });
}

// ---------------------------------------------------------------- the night shop

function shopBuy(g: GameState, index: number, button: HTMLElement | null): void {
  const good = g.shop?.goods[index];
  const tile = $(`#good-${index} .tile`);
  const from = tile?.getBoundingClientRect() ?? null;
  const firstUid = g.nextUid;
  if (!good || !N.shopBuy(g, index)) {
    audio.sfx('error');
    haptic('double');
    nope(button);
    return;
  }
  // straight into the wallet when it fits; otherwise it waits on the tray
  const stowed = N.stow(g, cat, g.shop!.tray.length - 1);
  store.save(g);
  render();
  audio.sfx('buy');
  haptic('light');
  const target = stowed ? document.getElementById(`item-${firstUid}`) : $('#tray .zone-goods .offer:last-child');
  if (target && from) {
    target.style.visibility = 'hidden';
    void flyGhost(itemTile(G.findItem(cat, good.itemId), 'fly'), from, target.getBoundingClientRect(), { ms: 440, arc: -30 }).then(() => {
      target.style.visibility = '';
      settle(target);
      audio.sfx('drop', { volume: 0.7 });
      fx.burst('dust', pointOn(target, 0.5, 0.9), { count: 6, scale: 0.8 });
    });
  }
  if (!stowed) note('ウォレットに入らない。並べ替えて場所を作ろう', 'info');
}

function stow(g: GameState, index: number, button: HTMLElement | null): void {
  const from = button?.getBoundingClientRect() ?? null;
  const loose = g.shop?.tray[index];
  const firstUid = g.nextUid;
  if (!loose || !N.stow(g, cat, index)) {
    nope(button);
    note('ウォレットに入らない', 'bad');
    return;
  }
  store.save(g);
  render();
  const target = document.getElementById(`item-${firstUid}`);
  if (target && from) {
    target.style.visibility = 'hidden';
    void flyGhost(itemTile(G.findItem(cat, loose.itemId), 'fly'), from, target.getBoundingClientRect(), { ms: 320, arc: -20 }).then(() => {
      target.style.visibility = '';
      settle(target);
      audio.sfx('drop');
      haptic('light');
    });
  } else audio.sfx('drop');
}

function goHome(g: GameState): void {
  audio.sfx('door');
  void sceneChange(() => {
    closeModal();
    N.goHome(g, cat);
    ui.printDay = 0;
    ui.gridView = 'shelf';
    store.save(g);
    render();
  });
}

// ---------------------------------------------------------------- endings

function buyDeed(g: GameState, button: HTMLElement | null): void {
  if (!G.buyDeed(g)) {
    audio.sfx('error');
    nope(button);
    return;
  }
  store.save(g);
  ui.printDay = 0;
  void locked(async () => {
    audio.sfx('fanfare');
    haptic('heavy');
    fx.flash(tok('--gum'), 380);
    render();
    const base = ctx.root.getBoundingClientRect();
    for (let i = 0; i < 5; i++) {
      fx.burst('confetti', { x: base.width * (0.15 + 0.7 * Math.random()), y: base.height * (0.12 + 0.2 * Math.random()) }, { count: 40, scale: 1.2 });
      if (i === 1) fx.burst('stars', centre($('.end-record')), { count: 16 });
      await wait(display.still ? 0 : 260);
    }
  });
}

function endDay(g: GameState): void {
  const before = g.gum;
  audio.sfx('confirm');
  void sceneChange(() => {
    G.endDay(g);
    ui.gridView = 'shelf';
    ui.printDay = 0;
    store.save(g);
    render();
    if (g.phase === 'lost') {
      audio.sfx('lose');
      haptic('heavy');
      return;
    }
    if (g.gum < before) {
      audio.sfx('rent', { delay: 0.3 });
      haptic('medium');
    }
    audio.sfx('event', { delay: 0.45 });
    if (g.lateOpen) audio.sfx('stamp', { delay: 0.95 });
  }, 'bars');
}

// ---------------------------------------------------------------- everything else

function gearChange(g: GameState, change: () => N.EquipResult | boolean, slot: string | null): void {
  const before = N.playerStats(g, cat);
  const result = change();
  if (result === 'ok' || result === true) {
    ui.gearBefore = before;
    ui.gearFlash = slot;
    ui.modal = 'gear';
    haptic('light');
  } else if (result === false) {
    note('棚に置き場所がない', 'bad');
    ui.modal = 'gear';
  } else {
    note(result === 'walletfull' ? 'ウォレットを空にしてから替えてください' : result === 'noroom' ? '外した品を置く場所が棚にない' : 'ここには装備できない', 'bad');
    if (ui.modal === 'pick') ui.modal = 'gear';
  }
}

function gameAct(g: GameState, name: string, n: number, arg: string, el: HTMLElement | null): void {
  const v = G.currentVisitor(g);
  switch (name) {
    case 'open':
      openShop(g);
      return;
    case 'bell':
      ringBell(g, v);
      return;
    case 'hero':
      if (v && !v.done && !ui.win.open) {
        ui.win.open = true;
        audio.sfx('open');
      } else if (v && !v.done) {
        custHop();
        sayAgain();
      }
      break;
    case 'win-close':
      ui.win.open = false;
      break;
    case 'win-size':
      ui.win.big = !ui.win.big;
      break;
    case 'grid':
      ui.gridView = arg === 'wallet' ? 'wallet' : 'shelf';
      break;
    case 'take-all':
      if (v && v.kind === 'sell') {
        const ids = G.allPicks(v).map((i) => `offer-${offerKey(v, i)}`);
        flip(ids, () => {
          ui.picked = G.allPicks(v);
          render();
        });
        audio.sfx('drop');
        return;
      }
      break;
    case 'pick-line':
      if (v && v.kind === 'sell' && !v.done && v.offers[n]) {
        const on = ui.picked.includes(n);
        flip([`offer-${offerKey(v, n)}`], () => {
          ui.picked = on ? ui.picked.filter((i) => i !== n) : [...ui.picked, n];
          render();
        });
        audio.sfx(on ? 'pick' : 'drop');
        haptic('light');
        return;
      }
      break;
    case 'buy-picked':
    case 'buy-all':
      if (v && v.kind === 'sell' && !v.done) buy(g, v, name === 'buy-all' ? G.allPicks(v) : [...ui.picked], el);
      return;
    case 'haggle-open':
      ui.haggleOpen = true;
      break;
    case 'haggle-close':
      ui.haggleOpen = false;
      break;
    case 'haggle':
      if (v) haggle(g, v, n);
      return;
    case 'tier':
      ui.tier = n;
      render();
      settle($('#win .total'));
      for (const tag of ctx.root.querySelectorAll('#near .ptag')) settle(tag);
      return;
    case 'uncounter':
      ui.counter = ui.counter.filter((uid) => uid !== n);
      render();
      settle(document.getElementById(`item-${n}`));
      return;
    case 'sell':
      if (!v || v.done || ui.counter.length === 0) break;
      if (G.quoteSale(g, cat, v, ui.counter, ui.tier).over > 0) {
        ui.modal = 'over';
        audio.sfx('open');
      } else {
        audio.sfx('confirm');
        doSell(g, v);
        return;
      }
      break;
    case 'sell-ok':
      if (v) {
        audio.sfx('confirm');
        doSell(g, v);
      }
      return;

    // ---- a good's detail and menu windows
    case 'dispose':
    case 'drop':
      if (!ui.sel) break;
      if (!ui.confirmDispose) ui.confirmDispose = true;
      else {
        if (name === 'drop') {
          g.wallet.items = g.wallet.items.filter((x) => x.uid !== ui.sel!.uid);
          audio.sfx('cancel');
        } else {
          const at = centre(document.getElementById(`item-${ui.sel.uid}`));
          if (G.dispose(g, cat, ui.sel.uid, ui.sel.grid)) {
            audio.sfx('coin');
            haptic('light');
            fx.burst('coins', at, { count: 6 });
          }
        }
        closeModal();
      }
      break;
    case 'unload':
      if (ui.sel && N.unload(g, cat, ui.sel.uid)) {
        closeModal();
        audio.sfx('drop');
      } else note('棚に置き場所がない', 'bad');
      break;
    case 'unstow':
      if (ui.sel && N.unstow(g, ui.sel.uid)) closeModal();
      break;
    case 'turn': {
      if (!ui.sel) break;
      const uid = ui.sel.uid;
      const ok = G.turnStock(g, cat, uid, ui.sel.grid);
      closeModal();
      store.save(g);
      render();
      const item = document.getElementById(`item-${uid}`);
      if (ok) {
        audio.sfx('rotate');
        haptic('light');
        anim(item, [{ transform: 'rotate(-90deg) scale(.86)' }, { transform: 'rotate(6deg) scale(1.05)', offset: 0.7 }, { transform: 'rotate(0) scale(1)' }], { duration: 280, easing: 'ease-out' });
      } else {
        nope(item);
        note('回転して置ける場所がない', 'bad');
      }
      return;
    }
    case 'equip': {
      if (!ui.sel) break;
      const stock = g.stock.find((x) => x.uid === ui.sel!.uid);
      const item = stock ? G.findItem(cat, stock.itemId) : null;
      const slot = item ? (item.wallet ? 'wallet' : N.slotFor(g, item)) : null;
      const uid = ui.sel.uid;
      closeModal();
      gearChange(g, () => N.equip(g, cat, uid), slot);
      break;
    }

    // ---- gear
    case 'gear':
      ui.modal = 'gear';
      ui.gearBefore = null;
      break;
    case 'gear-slot':
      ui.gearSlot = arg as SlotId | 'wallet';
      ui.gearBefore = null;
      ui.modal = 'pick';
      break;
    case 'gear-wear': {
      const slot = ui.gearSlot;
      gearChange(g, () => N.equip(g, cat, n, slot === 'wallet' || slot === null ? undefined : slot), slot);
      break;
    }
    case 'gear-off': {
      const slot = ui.gearSlot;
      if (slot && slot !== 'wallet') {
        gearChange(g, () => N.unequip(g, cat, slot), null);
        if (ui.gearBefore) audio.sfx('cancel');
      }
      ui.modal = 'gear';
      break;
    }
    case 'gear-back':
      ui.modal = 'gear';
      break;

    // ---- the night
    case 'door':
      if (N.canGoOut(g)) {
        ui.modal = 'dest';
        audio.sfx('door');
        haptic('light');
      } else {
        nope(el);
        note('今夜はもう外出しました', 'bad');
      }
      break;
    case 'go-shop':
      audio.sfx('confirm');
      void sceneChange(() => {
        closeModal();
        N.goShop(g, cat);
        store.save(g);
        render();
      });
      return;
    case 'go-quest':
      ui.modal = 'gear';
      ui.departing = true;
      ui.gearBefore = null;
      break;
    case 'depart':
      audio.sfx('door');
      haptic('medium');
      void sceneChange(() => {
        closeModal();
        Q.startQuest(g, cat);
        store.save(g);
        render();
      }, 'iris');
      return;
    case 'shop-buy':
      shopBuy(g, n, el);
      return;
    case 'stow':
      stow(g, n, el);
      return;
    case 'shop-leave':
      if (g.shop && g.shop.tray.length > 0) {
        ui.modal = 'leave';
        audio.sfx('error');
        haptic('double');
      } else {
        goHome(g);
        return;
      }
      break;
    case 'shop-leave-ok':
      goHome(g);
      return;

    case 'shelf':
      if (G.upgradeShelf(g)) {
        audio.sfx('buy');
        haptic('medium');
        ui.gridView = 'shelf';
        store.save(g);
        render();
        const grid = $('.grid');
        if (grid) fx.burst('sparks', pointOn(grid, 0.5, 0.95), { count: 18 });
        note('棚を広げた', 'good');
        return;
      }
      nope(el);
      break;
    case 'deed':
      buyDeed(g, el);
      return;
    case 'continue':
      audio.sfx('confirm');
      void sceneChange(() => {
        G.continueAfterWin(g);
        store.save(g);
        render();
      });
      return;
    case 'endday':
      endDay(g);
      return;
  }
  const now = G.currentVisitor(g);
  if (now?.done) ui.win.open = false;
  store.save(g);
  render();
}

/** Every button on the screen ends up here. `el` is the element that was pressed. */
export function act(name: string, arg: string | undefined, el: HTMLElement | null = null): void {
  const n = arg === undefined ? 0 : Number(arg);
  const g = ctx.s;
  switch (name) {
    case 'help':
      ui.modal = 'help';
      ui.confirmReset = false;
      break;
    case 'settings':
      ui.modal = 'settings';
      ui.confirmReset = false;
      break;
    case 'modal-close':
      closeModal();
      break;
    case 'set-calm':
      display.setCalm(!display.calm);
      break;
    case 'set-big':
      display.setBigText(!display.bigText);
      break;
    case 'set-haptic':
      hapticSettings.set(!hapticSettings.enabled);
      haptic('medium');
      break;
    case 'new':
    case 'restart':
      audio.sfx('confirm');
      haptic('medium');
      store.clear();
      enterGame(G.newGame((Date.now() ^ (Math.random() * 0x7fffffff)) | 0, cat));
      return;
    case 'resume':
      audio.sfx('confirm');
      haptic('medium');
      enterGame(store.load());
      return;
    case 'reset':
      if (!ui.confirmReset) ui.confirmReset = true;
      else {
        audio.sfx('cancel');
        store.clear();
        enterGame(null);
        return;
      }
      break;
    default:
      if (!g || ui.screen !== 'game') break;
      if (name.startsWith('q-')) {
        // the quest screen handles its own buttons; a change of phase (going home) is a change of scene
        const phase = g.phase;
        if (questAct(g, name, n)) {
          store.save(g);
          if (g.phase !== phase) {
            ui.printDay = 0;
            ui.gridView = 'shelf';
            void sceneChange(render);
          } else render();
          return;
        }
      }
      gameAct(g, name, n, arg ?? '', el);
      return;
  }
  render();
}
