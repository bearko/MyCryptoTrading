/**
 * Dev only (fxboard.html): a phone-sized fake game root with one button per effect of src/ui/fx.ts.
 * The fake screen is rebuilt from an HTML string on "re-render", like the real game does, to show
 * that the effect layers survive it.
 */
import '../styles/tokens.css';
import '../styles/fx.css';
import { fx, fxDebug, type BurstKind } from '../ui/fx';

const app = document.getElementById('app')!;

let gum = 1200;
let shown = 1200;
let tone: 'day' | 'night' = 'night';
let renders = 0;

type Action = { label: string; run: () => void; main?: boolean };

const HERO = '.b-hero';
const WALLET = '#wallet';

/** Rolls the wallet number up to its new value (the caller's job in the real game too). */
function roll(): void {
  const from = shown;
  const to = gum;
  const t0 = performance.now();
  const tick = (now: number): void => {
    const k = Math.min(1, (now - t0) / 500);
    shown = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
    const el = document.getElementById('wallet-n');
    if (el) el.textContent = String(shown);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const bursts: BurstKind[] = ['coins', 'sparks', 'stars', 'dust', 'smoke', 'confetti', 'heal', 'hit', 'shards', 'ring'];

const groups: Array<{ title: string; actions: Action[] }> = [
  {
    title: 'COMBOS (docs/UI_DIRECTION.md §6)',
    actions: [
      {
        label: '売れた SOLD',
        main: true,
        run: () => {
          fx.hitStop(70);
          fx.stamp('SOLD', HERO);
          fx.shake(5, 220);
          fx.fly('coins', HERO, WALLET, {
            count: 10,
            onArrive: () => {
              gum += 340;
              roll();
              fx.text('340', { x: app.clientWidth / 2, y: 78 }, { kind: 'gain' });
            },
          });
        },
      },
      {
        label: '攻撃 HIT',
        main: true,
        run: () => {
          fx.hitStop(80);
          fx.flash(undefined, 120);
          fx.burst('hit', HERO);
          fx.shake(8, 260);
          fx.text(String(20 + Math.floor(Math.random() * 60)), HERO, { kind: 'dmg' });
        },
      },
      {
        label: '会心 CRIT',
        main: true,
        run: () => {
          fx.hitStop(110);
          fx.flash(undefined, 140);
          fx.burst('hit', HERO, { scale: 1.5, count: 12 });
          fx.shake(12, 340);
          fx.text('128', HERO, { kind: 'crit' });
        },
      },
      {
        label: '勝利 WIN',
        main: true,
        run: () => {
          void fx.banner('WIN', { sub: 'BATTLE CLEAR', ms: 1000 });
          fx.burst('confetti', { x: app.clientWidth / 2, y: -20 }, { count: 90, spread: app.clientWidth / 2 });
          fx.burst('confetti', { x: 40, y: 330 }, { count: 24 });
          fx.burst('confetti', { x: app.clientWidth - 40, y: 330 }, { count: 24 });
        },
      },
      {
        label: '開店 OPEN',
        run: () => {
          void fx.banner('OPEN', { sub: 'DAY 3', ms: 900 });
          fx.shake(4, 200);
        },
      },
      {
        label: '閉店 CLOSED',
        run: () => {
          fx.burst('smoke', { x: app.clientWidth * 0.25, y: 360 }, { count: 6 });
          fx.burst('smoke', { x: app.clientWidth * 0.75, y: 360 }, { count: 6 });
          fx.shake(10, 300);
          void fx.banner('CLOSED', { color: 'var(--hot)' });
        },
      },
      {
        label: 'ベル bell',
        run: () => {
          fx.burst('ring', HERO, { color: 'var(--gum)' });
        },
      },
      {
        label: '断られた',
        run: () => {
          fx.burst('shards', HERO, { color: 'var(--leaf)' });
          fx.text('…', HERO, { kind: 'info' });
        },
      },
    ],
  },
  {
    title: 'fx.burst(kind, at)',
    actions: bursts.map((kind) => ({ label: kind, run: () => fx.burst(kind, HERO) })),
  },
  {
    title: 'fx.fly / fx.text / fx.stamp',
    actions: [
      { label: 'fly coins', run: () => fx.fly('coins', HERO, WALLET, { onArrive: () => ((gum += 100), roll()) }) },
      { label: 'fly stars', run: () => fx.fly('stars', WALLET, HERO, { count: 6 }) },
      { label: 'fly ×20', run: () => fx.fly('coins', HERO, WALLET, { count: 20, onArrive: () => ((gum += 900), roll()) }) },
      { label: 'text gain', run: () => fx.text('250', HERO, { kind: 'gain' }) },
      { label: 'text loss', run: () => fx.text('120', HERO, { kind: 'loss' }) },
      { label: 'text dmg', run: () => fx.text('47', HERO, { kind: 'dmg' }) },
      { label: 'text crit', run: () => fx.text('128', HERO, { kind: 'crit' }) },
      { label: 'text heal', run: () => fx.text('+30', HERO, { kind: 'heal' }) },
      { label: 'text info', run: () => fx.text('まいど！', HERO, { kind: 'info' }) },
      { label: 'stamp SOLD', run: () => fx.stamp('SOLD', HERO) },
      { label: 'stamp DEAL', run: () => fx.stamp('DEAL', HERO, { color: 'var(--cool)' }) },
      { label: 'stamp 済', run: () => fx.stamp('支払済', HERO, { color: 'var(--leaf)', size: 34 }) },
    ],
  },
  {
    title: 'fx.banner / shake / flash / hitStop',
    actions: [
      { label: 'banner', run: () => void fx.banner('OPEN') },
      { label: 'banner sub', run: () => void fx.banner('ファイアボール', { sub: 'INT ×1.5', color: 'var(--cool)' }) },
      { label: 'banner 階', run: () => void fx.banner('地下 3 階', { sub: 'FLOOR 3', color: 'var(--violet)', ms: 700 }) },
      { label: 'banner ink', run: () => void fx.banner('GAME OVER', { color: 'var(--ink)' }) },
      { label: 'shake 6', run: () => fx.shake() },
      { label: 'shake 16', run: () => fx.shake(16, 420) },
      { label: 'flash', run: () => fx.flash() },
      { label: 'flash hot', run: () => fx.flash('var(--hot)', 200) },
      {
        label: 'hitStop 200',
        run: () => {
          fx.burst('coins', HERO, { count: 14 });
          window.setTimeout(() => fx.hitStop(200), 200);
        },
      },
    ],
  },
  {
    title: 'fx.transition / ambient / calm',
    actions: [
      { label: 'slash', run: () => void fx.transition(flip) },
      { label: 'bars', run: () => void fx.transition(flip, 'bars') },
      { label: 'iris', run: () => void fx.transition(flip, 'iris') },
      { label: 'iris @hero', run: () => void fx.transition(flip, 'iris', { at: HERO }) },
      {
        label: 'slash ×3',
        run: () => {
          // re-entrant: every swap must still run exactly once
          void fx.transition(flip);
          void fx.transition(flip);
          window.setTimeout(() => void fx.transition(flip, 'bars'), 330);
        },
      },
      { label: 'amb day', run: () => fx.ambient('day') },
      { label: 'amb night', run: () => fx.ambient('night') },
      { label: 'amb dungeon', run: () => fx.ambient('dungeon') },
      { label: 'amb none', run: () => fx.ambient('none') },
      {
        label: 'calm',
        run: () => {
          calm = !calm;
          fx.setCalm(calm);
          document.documentElement.classList.toggle('calm', calm);
          render();
        },
      },
      { label: 're-render', run: () => render() },
    ],
  },
];

let calm = false;
let flips = 0;

/** The "screen change" used by the transitions: swaps the stage between its day and night look. */
function flip(): void {
  flips++;
  tone = tone === 'day' ? 'night' : 'day';
  render();
}

/** Rebuilds the whole fake screen from a string (the real game morphs; this is the harsher case). */
function render(): void {
  renders++;
  const pad = app.querySelector('.b-pad');
  const scroll = pad ? pad.scrollTop : 0;
  let i = 0;
  const buttons = groups
    .map(
      (g) =>
        `<h2>${g.title}</h2><div class="b-grid">${g.actions
          .map((a) => `<button type="button" data-i="${i++}" class="${a.main ? 'is-main' : ''}${a.label === 'calm' && calm ? ' is-on' : ''}">${a.label}</button>`)
          .join('')}</div>`,
    )
    .join('');
  app.innerHTML = `
    <div class="b-hud">
      <span class="b-day">DAY 3</span>
      <span class="b-wallet" id="wallet"><span id="wallet-n">${shown}</span><small>GUM</small></span>
      <span class="b-stat" id="stat"></span>
    </div>
    <div class="b-stage" data-tone="${tone}">
      <div class="b-hero"></div>
      <div class="b-counter"></div>
    </div>
    <div class="b-pad">${buttons}</div>`;
  const next = app.querySelector('.b-pad');
  if (next) next.scrollTop = scroll;
}

const flat: Action[] = groups.flatMap((g) => g.actions);

app.addEventListener('click', (ev) => {
  const btn = (ev.target as Element).closest('button[data-i]');
  if (!btn) return;
  flat[Number(btn.getAttribute('data-i'))]?.run();
});

render();
fx.mount(app);
fx.ambient('night');

window.setInterval(() => {
  const s = fxDebug();
  const el = document.getElementById('stat');
  if (el) el.textContent = `${s.alive}p q${s.quality.toFixed(2)} ${s.running ? 'RUN' : 'zzz'}\nr${renders} swap${flips}`;
}, 200);

// For driving the board from the console or a script.
Object.assign(window, { fx, fxDebug, board: { flat, flip, render } });
