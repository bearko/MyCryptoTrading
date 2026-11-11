/**
 * Visual effects over the whole game: particles, flying numbers, stamps, banners, shakes, flashes,
 * screen wipes. Screens call only this API (docs/UI_DIRECTION.md §6).
 *
 * How it is attached: `mount(root)` builds ONE host element (`.fx-host`, position: fixed) as a child
 * of <body> — a sibling of the game root, never inside it — and keeps it exactly over the root's box.
 * The game re-renders by morphing the children of the root, so nothing of ours may live in there.
 * Inside the host, back to front: a small-duty canvas for the ambient motes, a DOM layer for the big
 * graphic pieces (stamps, banners), the particle canvas (so coins and confetti pass in front of
 * those), a DOM layer for the flying numbers, a flash sheet, and the screen-wipe layer.
 *
 * Coordinates are in px relative to the game root (#app). `Target` may also be an element or a CSS
 * selector inside the root: its centre is used. A target that does not exist is silently ignored.
 *
 * Cost: the frame loop sleeps whenever nothing is alive; the DOM effects animate only transform and
 * opacity (Web Animations API); the particle loop allocates nothing per frame.
 */
export type Target = { x: number; y: number } | Element | string;

export type BurstKind = 'coins' | 'sparks' | 'stars' | 'dust' | 'smoke' | 'confetti' | 'heal' | 'hit' | 'shards' | 'ring';

export interface BurstOptions {
  /** how many particles (default depends on the kind) */
  count?: number;
  /** CSS colour, for kinds that take one */
  color?: string;
  /** 0.5 small … 2 big */
  scale?: number;
  /** px: scatter the starting points this far around the place (e.g. confetti over the whole screen) */
  spread?: number;
}

export interface TextOptions {
  /** gain: +GUM (yellow) / loss: −GUM / dmg / heal / crit (bigger) / info */
  kind?: 'gain' | 'loss' | 'dmg' | 'heal' | 'crit' | 'info';
  /** px */
  size?: number;
}

export interface FlyOptions {
  count?: number;
  /** called once, when the first piece lands (always called, even if nothing could be drawn) */
  onArrive?: () => void;
  /** give the destination element a little bump as each piece lands (default true) */
  bump?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const TAU = Math.PI * 2;
const EASE_POP = 'cubic-bezier(0.2, 1.4, 0.3, 1)';
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.6, 0, 0.9, 0.4)';

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const easeOut3 = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);
/** A repeatable 0…1 value from a particle's seed (shapes must not flicker frame to frame). */
function hash(seed: number, i: number): number {
  const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------------------------------------
// Mounted state
// ---------------------------------------------------------------------------------------------

let root: HTMLElement | null = null;
let host: HTMLDivElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let ambCanvas: HTMLCanvasElement | null = null;
let ambCtx: CanvasRenderingContext2D | null = null;
/** stamps and banners: under the particles */
let layerBack: HTMLDivElement | null = null;
/** flying numbers: over the particles */
let layer: HTMLDivElement | null = null;
let wipe: HTMLDivElement | null = null;
let flashEl: HTMLDivElement | null = null;
let probe: HTMLDivElement | null = null;
let resizeObs: ResizeObserver | null = null;
let W = 0;
let H = 0;
let DPR = 1;

let calmUser = false;
const calmQuery: MediaQueryList | null =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const isCalm = (): boolean => calmUser || (calmQuery?.matches ?? false);

/** The palette, read from tokens.css at mount (the canvas cannot use CSS variables directly). */
const pal = {
  ink: 'black',
  ink2: 'black',
  ink3: 'black',
  paper: 'white',
  paper2: 'white',
  gum: 'white',
  gumDeep: 'white',
  hot: 'white',
  cool: 'white',
  leaf: 'white',
  violet: 'white',
  mute: 'white',
};
let confettiColors: string[] = [];

const colorCache = new Map<string, string>();
/** Any CSS colour (including `var(--hot)`) as a string the canvas understands. */
function resolveColor(css: string): string {
  const hit = colorCache.get(css);
  if (hit !== undefined) return hit;
  let out = css;
  if (probe) {
    probe.style.color = '';
    probe.style.color = css;
    const c = getComputedStyle(probe).color;
    if (probe.style.color !== '' && c) out = c;
  }
  colorCache.set(css, out);
  return out;
}

function readPalette(): void {
  if (!root) return;
  const cs = getComputedStyle(root);
  const get = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback;
  pal.ink = get('--ink', 'black');
  pal.ink2 = get('--ink-2', pal.ink);
  pal.ink3 = get('--ink-3', pal.ink);
  pal.paper = get('--paper', 'white');
  pal.paper2 = get('--paper-2', pal.paper);
  pal.gum = get('--gum', pal.paper);
  pal.gumDeep = get('--gum-deep', pal.gum);
  pal.hot = get('--hot', pal.paper);
  pal.cool = get('--cool', pal.paper);
  pal.leaf = get('--leaf', pal.paper);
  pal.violet = get('--violet', pal.paper);
  pal.mute = get('--mute', pal.paper2);
  confettiColors = [pal.gum, pal.hot, pal.cool, pal.leaf, pal.violet, pal.paper];
  colorCache.clear();
  spriteCache.clear();
  coinFrames = [];
}

const PT = { x: 0, y: 0 };
const PT2 = { x: 0, y: 0 };
/** Writes the target's position (px in the root) into `out`. False if there is nothing to point at. */
function resolve(t: Target, out: { x: number; y: number }): boolean {
  if (!root) return false;
  let el: Element | null = null;
  if (typeof t === 'string') {
    try {
      el = root.querySelector(t);
    } catch {
      el = null;
    }
    if (!el) return false;
  } else if (t instanceof Element) {
    if (!t.isConnected) return false;
    el = t;
  } else {
    if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) return false;
    out.x = t.x;
    out.y = t.y;
    return true;
  }
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const base = root.getBoundingClientRect();
  // the root has moved without changing size (nothing reports that): follow it now
  if (shaking === 0 && (Math.abs(base.left - hostX) > 0.5 || Math.abs(base.top - hostY) > 0.5)) sync();
  out.x = r.left + r.width / 2 - base.left;
  out.y = r.top + r.height / 2 - base.top;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Pixel sprites (coins, stars, plus signs): drawn once into tiny canvases, blitted without smoothing
// ---------------------------------------------------------------------------------------------

type Sprite = HTMLCanvasElement;

function makeSprite(rows: readonly string[], map: Record<string, string>): Sprite {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d')!;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = map[row[x]];
      if (col) {
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  return c;
}

// K ink / Y gold / D deep gold / W shine. Three views of a spinning coin: face, turned, edge.
const COIN_ART: readonly (readonly string[])[] = [
  [
    '....KKKK....',
    '..KKYYYYKK..',
    '.KYYWWYYYYK.',
    '.KYWYYYYYDK.',
    'KYWYYDDYYYDK',
    'KYWYDDDDYYDK',
    'KYYYDDDDYYDK',
    'KYYYYDDYYYDK',
    '.KYYYYYYYDK.',
    '.KYYDDDDDDK.',
    '..KKDDDDKK..',
    '....KKKK....',
  ],
  [
    '..KKKK..',
    '.KYYYYK.',
    'KYWWYYDK',
    'KYWYYYDK',
    'KYWDDYDK',
    'KYYDDYDK',
    'KYYDDYDK',
    'KYYDDYDK',
    'KYYYYYDK',
    'KYYYDDDK',
    '.KDDDDK.',
    '..KKKK..',
  ],
  ['.KK.', 'KWDK', 'KWDK', 'KWDK', 'KYDK', 'KYDK', 'KYDK', 'KYDK', 'KYDK', 'KYDK', 'KDDK', '.KK.'],
];
const COIN_SPIN = [0, 1, 2, 1];

// K ink / C colour / W shine. A four-point star at four sizes (the twinkle steps through them).
const STAR_ART: readonly (readonly string[])[] = [
  ['.K.', 'KCK', '.K.'],
  ['..K..', '.KCK.', 'KCWCK', '.KCK.', '..K..'],
  ['...K...', '..KCK..', '.KKCKK.', 'KCCWCCK', '.KKCKK.', '..KCK..', '...K...'],
  ['....K....', '...KCK...', '...KCK...', '.KKCCCKK.', 'KCCCWCCCK', '.KKCCCKK.', '...KCK...', '...KCK...', '....K....'],
];
const PLUS_ART: readonly (readonly string[])[] = [
  ['..KKKK..', '..KWCK..', 'KKKCCKKK', 'KWCCCCCK', 'KCCCCCCK', 'KKKCCKKK', '..KCCK..', '..KKKK..'],
];

let coinFrames: Sprite[] = [];
const spriteCache = new Map<string, Sprite[]>();

function coins(): Sprite[] {
  if (coinFrames.length === 0) {
    const map = { K: pal.ink, Y: pal.gum, D: pal.gumDeep, W: pal.paper };
    coinFrames = COIN_ART.map((rows) => makeSprite(rows, map));
  }
  return coinFrames;
}
function tinted(art: readonly (readonly string[])[], key: string, color: string): Sprite[] {
  const id = key + color;
  let set = spriteCache.get(id);
  if (!set) {
    const map = { K: pal.ink, C: color, W: pal.paper };
    set = art.map((rows) => makeSprite(rows, map));
    spriteCache.set(id, set);
  }
  return set;
}

// ---------------------------------------------------------------------------------------------
// Particle pool
// ---------------------------------------------------------------------------------------------

const MAX = 300;

const K_COIN = 1;
const K_SPARK = 2;
const K_STAR = 3;
const K_PUFF = 4;
const K_CONF = 5;
const K_SPRITE = 6;
const K_MOTE = 7;
const K_HITLINE = 8;
const K_HITFLASH = 9;
const K_SHARD = 10;
const K_RING = 11;
const K_FLY = 12;

/** One landing place shared by the pieces of a single fly() call. */
interface FlyGroup {
  fired: boolean;
  onArrive: (() => void) | undefined;
  bumpEl: Element | null;
  bumpSel: string;
  lastBump: number;
}

class Particle {
  on = false;
  kind = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** gravity px/s² */
  g = 0;
  /** air drag 1/s */
  drag = 0;
  rot = 0;
  vr = 0;
  /** seconds; negative while waiting to start */
  age = 0;
  life = 1;
  size = 1;
  c1 = '';
  c2 = '';
  // kind-specific numbers (see each emitter)
  a = 0;
  b = 0;
  c = 0;
  d = 0;
  e = 0;
  f = 0;
  tx = 0;
  ty = 0;
  n = 0;
  spr: Sprite[] | null = null;
  grp: FlyGroup | null = null;
}

const pool: Particle[] = [];
for (let i = 0; i < MAX; i++) pool.push(new Particle());
let alive = 0;
/** how many of the living particles are puffs (they need an extra pass) */
let puffs = 0;
/** how many are flying pieces (drawn last, over their own trails) */
let flyers = 0;
let cursor = 0;
/** 1 = full; lowered automatically when frames run slow, down to 0.4. */
let quality = 1;
const flyGroups = new Set<FlyGroup>();

function spawn(kind: number): Particle | null {
  if (alive >= MAX) return null;
  for (let i = 0; i < MAX; i++) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX;
    if (!p.on) {
      p.on = true;
      p.kind = kind;
      p.vx = p.vy = p.g = p.drag = p.rot = p.vr = p.age = 0;
      p.a = p.b = p.c = p.d = p.e = p.f = p.tx = p.ty = p.n = 0;
      p.life = 1;
      p.size = 1;
      p.c1 = pal.paper;
      p.c2 = pal.ink;
      p.spr = null;
      p.grp = null;
      alive++;
      if (kind === K_PUFF) puffs++;
      else if (kind === K_FLY) flyers++;
      return p;
    }
  }
  return null;
}
function kill(p: Particle): void {
  if (!p.on) return;
  p.on = false;
  p.spr = null;
  p.grp = null;
  alive--;
  if (p.kind === K_PUFF) puffs--;
  else if (p.kind === K_FLY) flyers--;
}
function fireGroup(g: FlyGroup): void {
  if (g.fired) return;
  g.fired = true;
  flyGroups.delete(g);
  const cb = g.onArrive;
  g.onArrive = undefined;
  if (cb) {
    try {
      cb();
    } catch (err) {
      console.error(err);
    }
  }
}
function clearParticles(): void {
  for (let i = 0; i < MAX; i++) kill(pool[i]);
  alive = 0;
  puffs = 0;
  flyers = 0;
  // Nobody may be left waiting for coins that will never land.
  for (const g of Array.from(flyGroups)) fireGroup(g);
}
/** The requested count, scaled by the current quality. */
function amount(asked: number | undefined, normal: number, most = 120): number {
  return clamp(Math.round((asked ?? normal) * quality), 1, most);
}

// ---------------------------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------------------------

function emitCoins(x: number, y: number, n: number, s: number, spread: number): void {
  const u = Math.max(1, Math.round(2 * s));
  for (let i = 0; i < n; i++) {
    const p = spawn(K_COIN);
    if (!p) return;
    const ang = -Math.PI / 2 + rnd(-0.8, 0.8);
    const sp = rnd(300, 560) * Math.sqrt(s);
    p.x = x + rnd(-spread, spread);
    p.y = y + rnd(-spread, spread) * 0.3;
    p.vx = Math.cos(ang) * sp;
    p.vy = Math.sin(ang) * sp;
    p.g = 1500;
    p.drag = 0.5;
    p.size = u;
    p.a = p.y + rnd(26, 64) * s; // the floor it bounces on
    p.rot = rnd(0, 4); // spin phase
    p.vr = rnd(11, 17); // spin frames per second
    p.life = rnd(1.25, 1.5);
    p.age = -i * 0.014;
  }
}

function emitSparks(x: number, y: number, n: number, s: number, color: string): void {
  for (let i = 0; i < n; i++) {
    const p = spawn(K_SPARK);
    if (!p) return;
    const ang = rnd(0, TAU);
    const sp = rnd(320, 760) * s;
    p.x = x + Math.cos(ang) * 6 * s;
    p.y = y + Math.sin(ang) * 6 * s;
    p.vx = Math.cos(ang) * sp;
    p.vy = Math.sin(ang) * sp;
    p.g = 420;
    p.drag = 5;
    p.size = rnd(1.8, 3) * s; // half width of the head
    p.a = rnd(0.07, 0.11); // streak length, in seconds of travel
    p.life = rnd(0.26, 0.46);
    p.c1 = color || (i % 3 === 0 ? pal.paper : pal.gum);
  }
}

function emitStars(x: number, y: number, n: number, s: number, color: string, spread: number): void {
  for (let i = 0; i < n; i++) {
    const p = spawn(K_STAR);
    if (!p) return;
    const ang = rnd(0, TAU);
    const sp = rnd(90, 330) * s;
    p.x = x + rnd(-spread, spread);
    p.y = y + rnd(-spread, spread);
    p.vx = Math.cos(ang) * sp;
    p.vy = Math.sin(ang) * sp;
    p.g = -24;
    p.drag = 3.2;
    p.size = s >= 1.5 ? 3 : 2;
    p.rot = rnd(0, TAU); // twinkle phase
    p.vr = rnd(14, 22); // twinkle speed
    p.life = rnd(0.5, 0.95);
    p.age = -rnd(0, 0.08);
    p.spr = tinted(STAR_ART, 'star', color || (i % 3 === 0 ? pal.paper : pal.gum));
  }
}

function emitPuffs(x: number, y: number, n: number, s: number, color: string, smoke: boolean): void {
  for (let i = 0; i < n; i++) {
    const p = spawn(K_PUFF);
    if (!p) return;
    let ang: number;
    let sp: number;
    if (smoke) {
      ang = -Math.PI / 2 + rnd(-1.1, 1.1);
      sp = rnd(30, 95) * s;
      p.g = -70;
      p.drag = 2;
      p.size = rnd(9, 17) * s;
      p.life = rnd(0.55, 0.95);
      p.c1 = color || (i % 3 === 0 ? pal.ink3 : pal.mute);
      p.c2 = color ? pal.paper : i % 3 === 0 ? pal.mute : pal.paper2;
    } else {
      // Dust hugs the ground: it shoots out sideways, a little upwards.
      const up = rnd(-0.55, 0.05);
      ang = i % 2 === 0 ? up : Math.PI - up;
      sp = rnd(50, 150) * s;
      p.g = -18;
      p.drag = 4.5;
      p.size = rnd(6, 12) * s;
      p.life = rnd(0.32, 0.58);
      p.c1 = color || pal.paper2;
      p.c2 = pal.paper;
    }
    p.x = x + rnd(-4, 4) * s;
    p.y = y + rnd(-3, 3) * s;
    p.vx = Math.cos(ang) * sp;
    p.vy = Math.sin(ang) * sp;
    p.age = -i * 0.012;
  }
}

function emitConfetti(x: number, y: number, n: number, s: number, color: string, spread: number): void {
  for (let i = 0; i < n; i++) {
    const p = spawn(K_CONF);
    if (!p) return;
    p.x = x + rnd(-spread, spread);
    p.y = y + rnd(-spread, spread) * 0.25;
    const rain = y < 0; // thrown from above the screen: let it fall instead of bursting upwards
    const ang = rain ? rnd(0, TAU) : -Math.PI / 2 + rnd(-1.15, 1.15);
    const sp = rnd(180, 600) * s * (rain ? 0.3 : 1);
    p.vx = Math.cos(ang) * sp;
    p.vy = Math.sin(ang) * sp;
    p.g = 560;
    p.drag = 2.3;
    p.size = rnd(5, 8) * s;
    p.b = rnd(1.2, 2); // height / width
    p.rot = rnd(0, TAU);
    p.vr = rnd(-7, 7);
    p.a = rnd(0, TAU); // flutter phase
    p.c = rnd(7, 15); // flutter speed
    p.life = rnd(1.4, 2.3);
    p.age = -rnd(0, rain ? 0.5 : 0.05);
    p.c1 = color || confettiColors[i % confettiColors.length];
  }
}

function emitHeal(x: number, y: number, n: number, s: number, color: string): void {
  const col = color || pal.leaf;
  for (let i = 0; i < n; i++) {
    const p = spawn(K_SPRITE);
    if (!p) return;
    p.x = x + (((((i * 3) % n) + 0.5) / n) * 2 - 1) * 34 * s + rnd(-6, 6);
    p.y = y + rnd(-14, 18) * s;
    p.vx = rnd(-10, 10);
    p.vy = -rnd(60, 150) * s;
    p.drag = 0.9;
    p.size = i < 2 && s >= 1 ? 3 : 2;
    p.a = rnd(0, TAU); // sway phase
    p.life = rnd(0.6, 1);
    p.age = -i * 0.05;
    p.spr = tinted(PLUS_ART, 'plus', col);
  }
  for (let i = 0; i < n; i++) {
    const p = spawn(K_MOTE);
    if (!p) return;
    p.x = x + rnd(-38, 38) * s;
    p.y = y + rnd(0, 24) * s;
    p.vx = rnd(-8, 8);
    p.vy = -rnd(70, 170) * s;
    p.drag = 1.2;
    p.size = rnd(3, 5) * s;
    p.life = rnd(0.45, 0.8);
    p.age = -rnd(0, 0.25);
    p.c1 = i % 2 === 0 ? col : pal.paper;
  }
}

function emitHit(x: number, y: number, n: number, s: number, color: string): void {
  const tone = color || pal.hot;
  // The comic star-burst: a coloured one behind, a paper one in front.
  const back = spawn(K_HITFLASH);
  if (back) {
    back.x = x;
    back.y = y;
    back.size = 40 * s;
    back.a = rnd(1, 99);
    back.rot = rnd(0, TAU);
    back.life = 0.24;
    back.c1 = tone;
  }
  const front = spawn(K_HITFLASH);
  if (front) {
    front.x = x;
    front.y = y;
    front.size = 27 * s;
    front.a = rnd(1, 99);
    front.rot = rnd(0, TAU);
    front.life = 0.2;
    front.c1 = pal.paper;
  }
  const off = rnd(0, TAU);
  for (let i = 0; i < n; i++) {
    const p = spawn(K_HITLINE);
    if (!p) return;
    p.x = x;
    p.y = y;
    p.rot = off + (i / n) * TAU + rnd(-0.16, 0.16);
    p.b = rnd(16, 24) * s; // where the line starts
    p.c = rnd(30, 46) * s; // how far it travels
    p.size = rnd(18, 34) * s; // length
    p.d = rnd(4.5, 7) * s; // width
    p.life = rnd(0.2, 0.3);
    p.c1 = i % 3 === 0 ? tone : pal.paper;
  }
  emitSparks(x, y, Math.max(2, Math.round(n * 0.6)), s, '');
}

function emitShards(x: number, y: number, n: number, s: number, color: string): void {
  const off = rnd(0, TAU);
  for (let i = 0; i < n; i++) {
    const p = spawn(K_SHARD);
    if (!p) return;
    const ang = off + (i / n) * TAU + rnd(-0.3, 0.3);
    const sp = rnd(150, 380) * s;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(ang) * sp;
    p.vy = Math.sin(ang) * sp - 60 * s;
    p.g = 950;
    p.drag = 1.6;
    p.rot = rnd(0, TAU);
    p.vr = rnd(-16, 16);
    p.size = rnd(5, 9) * s;
    p.a = rnd(1, 99); // shape seed
    p.life = rnd(0.42, 0.68);
    p.c1 = color || (i % 3 === 0 ? pal.paper2 : pal.paper);
  }
  emitRings(x, y, 1, s * 0.4, color || pal.paper);
}

function emitRings(x: number, y: number, n: number, s: number, color: string): void {
  for (let i = 0; i < n; i++) {
    const p = spawn(K_RING);
    if (!p) return;
    p.x = x;
    p.y = y;
    p.a = 6 * s; // first radius
    p.b = (46 + i * 16) * s; // last radius
    p.size = 7 * s; // line width
    p.life = 0.46;
    p.age = -i * 0.11;
    p.c1 = color || pal.paper;
  }
}

/** A tiny pop where a flying piece lands. */
function emitPop(x: number, y: number): void {
  const r = spawn(K_RING);
  if (r) {
    r.x = x;
    r.y = y;
    r.a = 3;
    r.b = 15;
    r.size = 4;
    r.life = 0.2;
    r.c1 = pal.gum;
  }
  for (let i = 0; i < 3; i++) {
    const p = spawn(K_MOTE);
    if (!p) return;
    const ang = rnd(0, TAU);
    const sp = rnd(70, 150);
    p.x = x;
    p.y = y;
    p.vx = Math.cos(ang) * sp;
    p.vy = Math.sin(ang) * sp;
    p.drag = 5;
    p.size = rnd(3, 5);
    p.life = rnd(0.16, 0.26);
    p.c1 = i === 0 ? pal.paper : pal.gum;
  }
}

// ---------------------------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------------------------

function bump(g: FlyGroup, now: number): void {
  if (now - g.lastBump < 70) return;
  g.lastBump = now;
  let el = g.bumpEl;
  if (g.bumpSel && root) {
    try {
      el = root.querySelector(g.bumpSel);
    } catch {
      el = null;
    }
  }
  if (!el || !el.isConnected) return;
  track(el.animate([{ transform: 'scale(1.16)' }, { transform: 'scale(1)' }], { duration: 150, easing: EASE_OUT }));
}

function stepFly(p: Particle, dt: number, now: number): void {
  if (p.n === 0) {
    // 1) the pop out of the source: a quick scatter that brakes hard
    const k = Math.max(0, 1 - 7 * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= k;
    p.vy *= k;
    if (p.age >= p.a) {
      // 2) aim: a curve bowed to one side (p.e holds how much, signed)
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      p.c = p.x;
      p.d = p.y;
      const bow = p.e;
      p.e = p.x + dx * 0.5 - dy * bow;
      p.f = p.y + dy * 0.5 + dx * bow;
      p.n = 1;
      p.vr = 0; // trail timer from here on
    }
    return;
  }
  const t = (p.age - p.a) / p.b;
  if (t >= 1) {
    const g = p.grp;
    const tx = p.tx;
    const ty = p.ty;
    kill(p);
    emitPop(tx, ty);
    if (g) {
      bump(g, now);
      fireGroup(g);
    }
    return;
  }
  // ease-in: hangs for a moment, then is sucked in
  const u = t * t * (0.55 + 0.45 * t);
  const iu = 1 - u;
  p.x = iu * iu * p.c + 2 * iu * u * p.e + u * u * p.tx;
  p.y = iu * iu * p.d + 2 * iu * u * p.f + u * u * p.ty;
  p.vr += dt;
  if (p.vr > 0.03 && t > 0.12) {
    p.vr = 0;
    const m = spawn(K_MOTE);
    if (m) {
      m.x = p.x + rnd(-3, 3);
      m.y = p.y + rnd(-3, 3);
      m.size = rnd(3, 5.5);
      m.life = 0.24;
      m.c1 = Math.random() < 0.3 ? pal.paper : pal.gum;
    }
  }
}

function step(dt: number, now: number): void {
  for (let i = 0; i < MAX; i++) {
    const p = pool[i];
    if (!p.on) continue;
    p.age += dt;
    if (p.age < 0) continue;
    if (p.kind === K_FLY) {
      stepFly(p, dt, now);
      continue;
    }
    if (p.age >= p.life) {
      kill(p);
      continue;
    }
    switch (p.kind) {
      case K_HITLINE:
      case K_HITFLASH:
      case K_RING:
        break; // drawn from age alone
      case K_CONF:
        p.vx += Math.sin(p.age * 3 + p.a) * 60 * dt;
      // falls through
      default: {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy = p.vy * k + p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.kind === K_COIN && p.vy > 0 && p.y >= p.a) {
          p.y = p.a;
          if (p.n === 0) {
            // the one bounce, with a speck of dust
            p.n = 1;
            p.vy *= -0.42;
            p.vx *= 0.6;
            const d = spawn(K_PUFF);
            if (d) {
              d.x = p.x;
              d.y = p.y + p.size * 5;
              d.vy = -12;
              d.size = 5;
              d.life = 0.26;
              d.c1 = pal.paper2;
              d.c2 = pal.paper;
            }
          } else {
            // then it lies still and blinks out
            p.n = 2;
            p.vy = 0;
            p.vx = 0;
            p.g = 0;
            p.vr = 0;
            if (p.life - p.age > 0.3) p.life = p.age + 0.3;
          }
        }
        if (p.kind === K_SPRITE) p.x += Math.sin(p.age * 5 + p.a) * 14 * dt;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------

const snap = (v: number): number => Math.round(v * DPR) / DPR;

function blit(c: CanvasRenderingContext2D, s: Sprite, x: number, y: number, u: number): void {
  const w = s.width * u;
  const h = s.height * u;
  c.drawImage(s, snap(x - w / 2), snap(y - h / 2), w, h);
}

/** A puff swells fast to full size, then dwindles to nothing — no soft fade, the shape does the work. */
function puffRadius(p: Particle, t: number): number {
  return t < 0.3 ? p.size * (0.3 + 0.7 * easeOut3(t / 0.3)) : p.size * (1 - ((t - 0.3) / 0.7) ** 2.2);
}

/**
 * Ink discs under every puff, drawn before any fill: overlapping puffs then share ONE outline and read
 * as a single cloud, the way smoke is inked in print.
 */
function drawPuffRims(c: CanvasRenderingContext2D): void {
  c.fillStyle = pal.ink;
  for (let i = 0; i < MAX; i++) {
    const p = pool[i];
    if (!p.on || p.kind !== K_PUFF || p.age < 0) continue;
    const r = puffRadius(p, p.age / p.life);
    if (r < 0.7) continue;
    c.beginPath();
    c.arc(p.x, p.y, r + 2, 0, TAU);
    c.fill();
  }
}

function drawParticle(c: CanvasRenderingContext2D, p: Particle): void {
  const t = p.age / p.life;
  switch (p.kind) {
    case K_COIN: {
      const set = coins();
      const f = p.n === 2 ? 0 : COIN_SPIN[Math.floor(p.age * p.vr + p.rot) & 3];
      // lying still at the end: blink out in two steps instead of a soft fade (pixel art stays crisp)
      if (t > 0.86) c.globalAlpha = t > 0.93 ? 0.35 : 0.7;
      blit(c, set[f], p.x, p.y, p.size);
      c.globalAlpha = 1;
      break;
    }
    case K_STAR: {
      const env = Math.sin(Math.PI * t);
      const tw = 0.5 + 0.5 * Math.sin(p.age * p.vr + p.rot);
      const f = clamp(Math.floor(env * (0.5 + 0.5 * tw) * 4.4), 0, 3);
      blit(c, p.spr![f], p.x, p.y, p.size);
      break;
    }
    case K_SPRITE: {
      if (t > 0.72) c.globalAlpha = t > 0.86 ? 0.35 : 0.7;
      // pops in one size smaller for the first instants
      blit(c, p.spr![0], p.x, p.y, p.age < 0.05 ? Math.max(1, p.size - 1) : p.size);
      c.globalAlpha = 1;
      break;
    }
    case K_MOTE: {
      const s = p.size * (1 - t * t);
      if (s < 0.6) break;
      const x = snap(p.x - s / 2);
      const y = snap(p.y - s / 2);
      if (p.size >= 3) {
        c.fillStyle = pal.ink;
        c.fillRect(x - 1, y - 1, s + 2, s + 2);
      }
      c.fillStyle = p.c1;
      c.fillRect(x, y, s, s);
      break;
    }
    case K_SPARK: {
      // A streak: blunt head, long tail drawn to a point. It thins out as it dies.
      const w = p.size * (1 - t * 0.7);
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const len = Math.max(7, sp * p.a);
      const ux = p.vx / sp;
      const uy = p.vy / sp;
      const nx = -uy * w;
      const ny = ux * w;
      c.beginPath();
      c.moveTo(p.x + ux * w * 1.4, p.y + uy * w * 1.4);
      c.lineTo(p.x + nx, p.y + ny);
      c.lineTo(p.x - ux * len, p.y - uy * len);
      c.lineTo(p.x - nx, p.y - ny);
      c.closePath();
      c.strokeStyle = pal.ink;
      c.lineWidth = 3;
      c.stroke();
      c.fillStyle = p.c1;
      c.fill();
      break;
    }
    case K_PUFF: {
      // The fill of a flat cartoon puff (its ink rim was laid down first, see drawPuffRims), with a
      // lighter patch on the upper left for volume.
      const r = puffRadius(p, t);
      if (r < 0.7) break;
      c.beginPath();
      c.arc(p.x, p.y, r, 0, TAU);
      c.fillStyle = p.c1;
      c.fill();
      if (r > 4) {
        c.beginPath();
        c.arc(p.x - r * 0.28, p.y - r * 0.3, r * 0.42, 0, TAU);
        c.fillStyle = p.c2;
        c.fill();
      }
      break;
    }
    case K_CONF: {
      const fl = Math.cos(p.a + p.age * p.c);
      const cs = Math.cos(p.rot) * DPR;
      const sn = Math.sin(p.rot) * DPR;
      const w = p.size;
      const h = p.size * p.b;
      if (t > 0.8) c.globalAlpha = t > 0.9 ? 0.35 : 0.7;
      c.setTransform(cs, sn, -sn * fl, cs * fl, p.x * DPR, p.y * DPR);
      c.fillStyle = pal.ink;
      c.fillRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3);
      c.fillStyle = p.c1;
      c.fillRect(-w / 2, -h / 2, w, h);
      if (fl < 0) {
        // the back of the paper: the same colour, in shade
        const al = c.globalAlpha;
        c.globalAlpha = al * 0.28;
        c.fillStyle = pal.ink;
        c.fillRect(-w / 2, -h / 2, w, h);
        c.globalAlpha = al;
      }
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      c.globalAlpha = 1;
      break;
    }
    case K_HITLINE: {
      // A lozenge shooting outwards: fat near the centre, pointed at the tip, shrinking as it goes.
      const r0 = p.b + p.c * easeOut3(t);
      const len = p.size * (1 - t * t);
      const w = p.d * (1 - t * 0.6);
      const cs = Math.cos(p.rot);
      const sn = Math.sin(p.rot);
      const mx = r0 + len * 0.28;
      c.beginPath();
      c.moveTo(p.x + cs * r0, p.y + sn * r0);
      c.lineTo(p.x + cs * mx - sn * w, p.y + sn * mx + cs * w);
      c.lineTo(p.x + cs * (r0 + len), p.y + sn * (r0 + len));
      c.lineTo(p.x + cs * mx + sn * w, p.y + sn * mx - cs * w);
      c.closePath();
      c.strokeStyle = pal.ink;
      c.lineWidth = 3.5;
      c.stroke();
      c.fillStyle = p.c1;
      c.fill();
      break;
    }
    case K_HITFLASH: {
      // Punches out to full size in the first quarter, then collapses.
      const s = t < 0.25 ? 0.55 + 0.65 * (t / 0.25) : 1.2 * (1 - ((t - 0.25) / 0.75) ** 2);
      const R = p.size * s;
      if (R < 1) break;
      const spikes = 10;
      c.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const ang = p.rot + (i / (spikes * 2)) * TAU;
        const rr = i % 2 === 0 ? R * (0.82 + 0.4 * hash(p.a, i)) : R * (0.42 + 0.12 * hash(p.a, i));
        const px = p.x + Math.cos(ang) * rr;
        const py = p.y + Math.sin(ang) * rr;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.strokeStyle = pal.ink;
      c.lineWidth = 5;
      c.stroke();
      c.fillStyle = p.c1;
      c.fill();
      break;
    }
    case K_SHARD: {
      const s = p.size * (1 - t * t * t);
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const ang = p.rot + i * 2.094 + (hash(p.a, i) - 0.5) * 0.9;
        const rr = s * (0.7 + 0.7 * hash(p.a, i + 5));
        const px = p.x + Math.cos(ang) * rr;
        const py = p.y + Math.sin(ang) * rr;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.strokeStyle = pal.ink;
      c.lineWidth = 4;
      c.stroke();
      c.fillStyle = p.c1;
      c.fill();
      break;
    }
    case K_RING: {
      const r = p.a + (p.b - p.a) * easeOut3(t);
      const w = p.size * (1 - t) ** 1.3;
      if (w < 0.4) break;
      c.beginPath();
      c.arc(p.x, p.y, r, 0, TAU);
      c.strokeStyle = pal.ink;
      c.lineWidth = w + Math.min(4, w * 1.5);
      c.stroke();
      c.strokeStyle = p.c1;
      c.lineWidth = w;
      c.stroke();
      break;
    }
    case K_FLY: {
      // pops in with an overshoot, shrinks a little as it dives into the target
      let s = 1;
      if (p.age < 0.12) {
        const k = p.age / 0.12;
        s = k * (1.35 - 0.35 * k);
      } else if (p.n === 1) {
        const k = (p.age - p.a) / p.b;
        if (k > 0.6) s = 1 - (k - 0.6) * 1.1;
      }
      const set = p.spr!;
      const f = set.length === 3 ? COIN_SPIN[Math.floor(p.age * 15 + p.rot) & 3] : 2 + (Math.floor(p.age * 12 + p.rot) & 1);
      blit(c, set[f], p.x, p.y, Math.max(1, p.size * s));
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Ambient motes: a handful of slow specks behind everything else
// ---------------------------------------------------------------------------------------------

type AmbientMode = 'day' | 'night' | 'dungeon' | 'none';
const AMB_MAX = 24;
const ambX = new Float32Array(AMB_MAX);
const ambY = new Float32Array(AMB_MAX);
const ambV = new Float32Array(AMB_MAX); // own speed factor
const ambP = new Float32Array(AMB_MAX); // phase
const ambS = new Float32Array(AMB_MAX); // size px
const ambC: string[] = new Array<string>(AMB_MAX).fill('');
let ambMode: AmbientMode = 'none';
let ambWanted: AmbientMode = 'none';
let ambN = 0;
let ambT = 0;

function seedAmbient(): void {
  ambMode = isCalm() ? 'none' : ambWanted;
  ambN = ambMode === 'day' ? 20 : ambMode === 'night' ? 16 : ambMode === 'dungeon' ? 22 : 0;
  ambN = Math.min(AMB_MAX, Math.round(ambN * (quality < 0.7 ? 0.6 : 1)));
  for (let i = 0; i < ambN; i++) {
    ambX[i] = rnd(0, W || 400);
    ambY[i] = rnd(0, H || 700);
    ambV[i] = rnd(0.6, 1.4);
    ambP[i] = rnd(0, TAU);
    ambS[i] = i % 5 === 0 ? 5 : i % 2 === 0 ? 4 : 3;
    if (ambMode === 'day') ambC[i] = i % 3 === 0 ? pal.gum : pal.paper;
    else if (ambMode === 'night') ambC[i] = i % 3 === 0 ? pal.violet : i % 3 === 1 ? pal.leaf : pal.cool;
    else ambC[i] = i % 3 === 0 ? pal.gum : pal.hot;
  }
  if (ambN === 0 && ambCtx) {
    ambCtx.setTransform(1, 0, 0, 1, 0, 0);
    ambCtx.clearRect(0, 0, ambCtx.canvas.width, ambCtx.canvas.height);
  }
}

function stepAmbient(dt: number): void {
  ambT += dt;
  for (let i = 0; i < ambN; i++) {
    const v = ambV[i];
    const ph = ambP[i];
    if (ambMode === 'day') {
      // dust in a sunbeam: sinks slowly to the right
      ambX[i] += (9 * v + Math.sin(ambT * 0.6 + ph) * 5) * dt;
      ambY[i] += (6 * v + Math.cos(ambT * 0.45 + ph) * 4) * dt;
    } else if (ambMode === 'night') {
      // fireflies: wander on lazy loops
      ambX[i] += Math.cos(ambT * 0.35 * v + ph) * 11 * dt;
      ambY[i] += Math.sin(ambT * 0.5 * v + ph * 2) * 8 * dt;
    } else {
      // embers: rise, swaying
      ambX[i] += Math.sin(ambT * 1.1 + ph) * 9 * dt;
      ambY[i] -= 24 * v * dt;
    }
    if (ambX[i] > W + 6) ambX[i] = -6;
    else if (ambX[i] < -6) ambX[i] = W + 6;
    if (ambY[i] > H + 6) ambY[i] = -6;
    else if (ambY[i] < -6) {
      ambY[i] = H + 6;
      ambX[i] = rnd(0, W);
    }
  }
}

function drawAmbient(c: CanvasRenderingContext2D): void {
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);
  for (let i = 0; i < ambN; i++) {
    const ph = ambP[i];
    let a: number;
    if (ambMode === 'day') a = 0.45 + 0.4 * Math.sin(ambT * 0.9 + ph);
    else if (ambMode === 'night') {
      // a firefly: lit most of the time, dark for a moment
      a = clamp(0.4 + 0.75 * Math.sin(ambT * 1.3 * ambV[i] + ph), 0, 1);
    } else a = (0.62 + 0.33 * Math.sin(ambT * 7 * ambV[i] + ph)) * clamp(ambY[i] / (H * 0.6), 0.25, 1);
    if (a < 0.04) continue;
    const s = ambS[i];
    const x = snap(ambX[i]);
    const y = snap(ambY[i]);
    c.fillStyle = ambC[i];
    // a square halo, not a blur: glow in the pixel language
    c.globalAlpha = a * (ambMode === 'day' ? 0.16 : 0.26);
    c.fillRect(x - s, y - s, s * 3, s * 3);
    c.globalAlpha = a;
    c.fillRect(x, y, s, s);
  }
  c.globalAlpha = 1;
}

// ---------------------------------------------------------------------------------------------
// Frame loop (sleeps when nothing is alive)
// ---------------------------------------------------------------------------------------------

let raf = 0;
let lastT = 0;
let frozenUntil = 0;
let ambTick = 0;
let ambDt = 0;
let slowEma = 1 / 60;
let sinceTune = 0;
let dirty = false;

function wake(): void {
  if (raf || !ctx) return;
  lastT = 0;
  raf = requestAnimationFrame(frame);
}

function frame(now: number): void {
  raf = 0;
  const c = ctx;
  if (!c) return;
  const raw = lastT === 0 ? 1 / 60 : (now - lastT) / 1000;
  lastT = now;
  const dt = raw > 0.05 ? 0.05 : raw;
  const frozen = now < frozenUntil;

  if (alive > 0) {
    // Slow frames → fewer particles from now on; back up again once frames are quick.
    // (a slow average: one hitch — a GC pause, a tab switch — must not cost quality)
    slowEma = slowEma * 0.95 + Math.min(raw, 0.05) * 0.05;
    sinceTune++;
    if (slowEma > 0.024 && sinceTune > 24) {
      quality = Math.max(0.4, quality - 0.15);
      sinceTune = 0;
    } else if (slowEma < 0.0185 && sinceTune > 240 && quality < 1) {
      quality = Math.min(1, quality + 0.1);
      sinceTune = 0;
    }
    if (!frozen) {
      step(dt, now);
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      c.clearRect(0, 0, W, H);
      c.imageSmoothingEnabled = false;
      c.lineJoin = 'miter';
      c.lineCap = 'butt';
      c.miterLimit = 6;
      if (puffs > 0) drawPuffRims(c);
      for (let i = 0; i < MAX; i++) {
        const p = pool[i];
        if (p.on && p.age >= 0 && p.kind !== K_FLY) drawParticle(c, p);
      }
      if (flyers > 0) {
        for (let i = 0; i < MAX; i++) {
          const p = pool[i];
          if (p.on && p.kind === K_FLY && p.age >= 0) drawParticle(c, p);
        }
      }
      dirty = true;
    }
  } else if (dirty) {
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, W, H);
    dirty = false;
  }

  // The ambient motes have their own canvas and run at half rate: 30fps is plenty for specks this slow.
  if (ambN > 0 && ambCtx) {
    ambDt += dt;
    if ((ambTick++ & 1) === 0 && !frozen) {
      stepAmbient(ambDt);
      drawAmbient(ambCtx);
      ambDt = 0;
    }
  }

  if (alive > 0 || ambN > 0 || dirty) raf = requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------------------------
// Host box: follows the root
// ---------------------------------------------------------------------------------------------

let shaking = 0;
let hostX = NaN;
let hostY = NaN;

function sync(): void {
  if (!root || !host || !canvas || !ambCanvas) return;
  if (shaking > 0) return; // the root is displaced right now; measured again when the shake ends
  const r = root.getBoundingClientRect();
  // left / top, not a transform: the transform is kept free for the shake
  if (r.left !== hostX || r.top !== hostY) {
    hostX = r.left;
    hostY = r.top;
    host.style.left = `${hostX}px`;
    host.style.top = `${hostY}px`;
  }
  const w = Math.round(r.width);
  const h = Math.round(r.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (w === W && h === H && dpr === DPR) return;
  W = w;
  H = h;
  DPR = dpr;
  host.style.width = `${w}px`;
  host.style.height = `${h}px`;
  canvas.width = ambCanvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = ambCanvas.height = Math.max(1, Math.round(h * dpr));
  dirty = false;
  if (alive > 0 || ambN > 0) wake();
}

function onCalmChange(): void {
  if (isCalm()) clearParticles();
  seedAmbient();
  if (ambN > 0) wake();
}

function unmount(): void {
  clearParticles();
  ambN = 0;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  resizeObs?.disconnect();
  resizeObs = null;
  window.removeEventListener('resize', sync);
  window.removeEventListener('scroll', sync);
  window.removeEventListener('orientationchange', sync);
  window.visualViewport?.removeEventListener('resize', sync);
  calmQuery?.removeEventListener('change', onCalmChange);
  host?.remove();
  root = host = canvas = ctx = ambCanvas = ambCtx = layerBack = layer = wipe = flashEl = probe = null;
  W = H = 0;
  hostX = hostY = NaN;
  wipeState = 'idle';
}

function div(cls: string, parent?: Element | null): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (parent) parent.appendChild(d);
  return d;
}

function mount(target: HTMLElement): void {
  if (root) unmount();
  root = target;
  host = div('fx-host');
  host.setAttribute('aria-hidden', 'true');
  ambCanvas = document.createElement('canvas');
  ambCanvas.className = 'fx-canvas';
  host.appendChild(ambCanvas);
  ambCtx = ambCanvas.getContext('2d');
  layerBack = div('fx-layer', host);
  canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  host.appendChild(canvas);
  ctx = canvas.getContext('2d');
  layer = div('fx-layer', host);
  flashEl = div('fx-flash', host);
  wipe = div('fx-wipe', host);
  probe = div('fx-probe', host);
  // A sibling of the root, not a child: the game morphs the root's children on every render.
  (target.ownerDocument.body ?? target.parentElement ?? target).appendChild(host);
  readPalette();
  sync();
  resizeObs = new ResizeObserver(sync);
  resizeObs.observe(target);
  resizeObs.observe(target.ownerDocument.documentElement);
  window.addEventListener('resize', sync);
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('orientationchange', sync);
  window.visualViewport?.addEventListener('resize', sync);
  calmQuery?.addEventListener('change', onCalmChange);
  seedAmbient();
  if (ambN > 0) wake();
}

// ---------------------------------------------------------------------------------------------
// DOM effects
// ---------------------------------------------------------------------------------------------

/** Animations of ours that a hit-stop must be able to hold. */
const held: Animation[] = [];
let holdTimer = 0;

/**
 * Every animation we start goes through here. One started during a hit-stop is the pay-off of that
 * hit-stop: it must begin when the freeze ends, and show nothing of itself before (so it is given a
 * start time in the future instead of being paused on its first frame).
 */
function track(a: Animation): Animation {
  const wait = frozenUntil - performance.now();
  if (wait > 0) {
    const now = a.timeline ? a.timeline.currentTime : null;
    if (typeof now === 'number') a.startTime = now + wait;
    else {
      a.pause();
      held.push(a);
    }
  }
  return a;
}

function release(): void {
  holdTimer = 0;
  frozenUntil = 0;
  for (const a of held) {
    try {
      if (a.playState === 'paused') a.play();
    } catch {
      /* the element is gone */
    }
  }
  held.length = 0;
  lastT = 0;
}

/** Removes the element when its animation ends (with a timer behind it, in case the tab sleeps). */
function removeAfter(el: Element, a: Animation, ms: number): void {
  let done = false;
  const go = (): void => {
    if (done) return;
    done = true;
    el.remove();
  };
  a.addEventListener('finish', go);
  a.addEventListener('cancel', go);
  window.setTimeout(go, ms + 1200);
}

function anchor(cls: string, x: number, y: number): HTMLDivElement {
  const d = div(`fx-at ${cls}`);
  d.style.left = `${Math.round(x)}px`;
  d.style.top = `${Math.round(y)}px`;
  return d;
}

function showText(text: string, x: number, y: number, opts: TextOptions | undefined): void {
  if (!layer) return;
  const kind = opts?.kind ?? 'info';
  const size = opts?.size ?? (kind === 'crit' ? 46 : kind === 'dmg' ? 36 : kind === 'info' ? 20 : 30);
  let label = text;
  if (kind === 'gain' && !/^[+＋]/.test(label)) label = `+${label}`;
  if (kind === 'loss' && !/^[-−ー－]/.test(label)) label = `−${label}`;
  // a little sideways scatter so numbers stacked on one spot stay readable; never off the screen
  let half = 0; // half the width of the label, estimated (measuring would force a layout)
  for (const ch of label) half += ch.charCodeAt(0) > 0x2e7f ? 0.52 : 0.26;
  half = half * size + 8;
  const px = clamp(x + rnd(-14, 14), half, Math.max(half, W - half));
  const py = clamp(y + rnd(-6, 6), size, Math.max(size, H - size * 0.6));
  const box = anchor(`fx-text fx-text--${kind}`, px, py);
  box.style.fontSize = `${size}px`;
  const mv = div('fx-text-mv', box);
  let burst: HTMLElement | null = null;
  let burst2: HTMLElement | null = null;
  if (kind === 'crit') {
    burst2 = document.createElement('i');
    burst2.className = 'fx-text-burst2';
    mv.appendChild(burst2);
    burst = document.createElement('i');
    burst.className = 'fx-text-burst';
    mv.appendChild(burst);
  }
  const type = document.createElement('span');
  type.className = 'fx-type';
  type.textContent = label;
  mv.appendChild(type);
  layer.appendChild(box);

  if (isCalm()) {
    const a = track(mv.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 900, fill: 'both' }));
    removeAfter(box, a, 900);
    return;
  }

  const tilt = `rotate(${rnd(-7, 7).toFixed(1)}deg)`;
  const dx = rnd(-16, 16).toFixed(0);
  let frames: Keyframe[];
  let ms: number;
  switch (kind) {
    case 'gain':
      ms = 900;
      frames = [
        { opacity: 0, transform: 'translateY(12px) scale(0.3)', easing: EASE_POP },
        { opacity: 1, transform: 'translateY(-12px) scale(1)', offset: 0.26, easing: 'linear' },
        { opacity: 1, transform: 'translateY(-30px) scale(1)', offset: 0.72, easing: EASE_IN },
        { opacity: 0, transform: 'translateY(-50px) scale(0.86)' },
      ];
      break;
    case 'loss':
      ms = 900;
      frames = [
        { opacity: 0, transform: 'translate(0, -12px) scale(1.5)', easing: EASE_OUT },
        { opacity: 1, transform: 'translate(0, 0) scale(1)', offset: 0.14 },
        { opacity: 1, transform: 'translate(-4px, 0) scale(1)', offset: 0.2 },
        { opacity: 1, transform: 'translate(4px, 1px) scale(1)', offset: 0.26 },
        { opacity: 1, transform: 'translate(0, 2px) scale(1)', offset: 0.32, easing: 'linear' },
        { opacity: 1, transform: 'translate(0, 10px) scale(1)', offset: 0.7, easing: EASE_IN },
        { opacity: 0, transform: 'translate(0, 36px) scale(0.9)' },
      ];
      break;
    case 'dmg':
      ms = 820;
      frames = [
        { opacity: 0, transform: `scale(2.6) ${tilt}`, easing: EASE_IN },
        { opacity: 1, transform: `scale(0.84) ${tilt}`, offset: 0.13, easing: EASE_OUT },
        { opacity: 1, transform: `scale(1.1) ${tilt}`, offset: 0.22, easing: EASE_OUT },
        { opacity: 1, transform: `translate(0, 0) scale(1) ${tilt}`, offset: 0.3, easing: EASE_OUT },
        { opacity: 1, transform: `translate(${dx}px, -10px) scale(1) ${tilt}`, offset: 0.66, easing: EASE_IN },
        { opacity: 0, transform: `translate(${dx}px, 24px) scale(0.9) ${tilt}` },
      ];
      break;
    case 'crit':
      ms = 1050;
      frames = [
        { opacity: 0, transform: `scale(3.2) ${tilt}`, easing: EASE_IN },
        { opacity: 1, transform: `scale(0.8) ${tilt}`, offset: 0.11, easing: EASE_OUT },
        { opacity: 1, transform: `scale(1.14) ${tilt}`, offset: 0.2, easing: EASE_OUT },
        { opacity: 1, transform: `scale(1) ${tilt}`, offset: 0.28, easing: 'linear' },
        { opacity: 1, transform: `scale(1.04) ${tilt}`, offset: 0.76, easing: EASE_IN },
        { opacity: 0, transform: `scale(1.3) ${tilt}` },
      ];
      break;
    case 'heal':
      ms = 1000;
      frames = [
        { opacity: 0, transform: 'translate(0, 10px) scale(0.4)', easing: EASE_POP },
        { opacity: 1, transform: 'translate(-3px, -8px) scale(1)', offset: 0.2, easing: 'ease-in-out' },
        { opacity: 1, transform: 'translate(4px, -24px) scale(1)', offset: 0.5, easing: 'ease-in-out' },
        { opacity: 1, transform: 'translate(-3px, -38px) scale(1)', offset: 0.78, easing: 'ease-in' },
        { opacity: 0, transform: 'translate(2px, -52px) scale(0.9)' },
      ];
      break;
    default:
      ms = 1100;
      frames = [
        { opacity: 0, transform: 'translateY(14px) scale(0.6)', easing: EASE_POP },
        { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.2, easing: 'linear' },
        { opacity: 1, transform: 'translateY(-12px) scale(1)', offset: 0.78, easing: EASE_IN },
        { opacity: 0, transform: 'translateY(-26px) scale(0.94)' },
      ];
  }
  const a = track(mv.animate(frames, { duration: ms, fill: 'both' }));
  removeAfter(box, a, ms);
  if (burst && burst2) {
    const spin: Keyframe[] = [
      { transform: 'scale(0) rotate(-30deg)', offset: 0, easing: 'linear' },
      { transform: 'scale(0) rotate(-30deg)', offset: 0.09, easing: EASE_POP },
      { transform: 'scale(1) rotate(0deg)', offset: 0.26, easing: 'linear' },
      { transform: 'scale(1.06) rotate(40deg)', offset: 1 },
    ];
    track(burst.animate(spin, { duration: ms, fill: 'both' }));
    track(burst2.animate(spin, { duration: ms, fill: 'both' }));
  }
}

function showStamp(text: string, x: number, y: number, opts: { color?: string; size?: number } | undefined): void {
  if (!layerBack) return;
  const size = opts?.size ?? 44;
  const box = anchor('fx-stamp', clamp(x, 40, Math.max(40, W - 40)), y);
  box.style.fontSize = `${size}px`;
  if (opts?.color) box.style.setProperty('--fx-c', opts.color);
  const tilt = div('fx-stamp-tilt', box);
  const body = div('fx-stamp-body', tilt);
  const face = div('fx-stamp-face', body);
  div('fx-stamp-print', face).textContent = text;
  const calm = isCalm();
  // a stamp ordered during a hit-stop slams when the freeze ends
  const wait = Math.max(0, frozenUntil - performance.now());
  if (calm) body.style.animation = 'none';
  else if (wait > 0) body.style.animationDelay = `${Math.round(wait)}ms`;
  layerBack.appendChild(box);

  const total = 900;
  if (calm) {
    const a = track(tilt.animate([{ opacity: 0 }, { opacity: 1, offset: 0.14 }, { opacity: 1, offset: 0.78 }, { opacity: 0 }], { duration: total, fill: 'both' }));
    removeAfter(box, a, total);
    return;
  }
  const lean = rnd(-4, 4).toFixed(1);
  const a = track(
    tilt.animate(
      [
        { opacity: 1, transform: `rotate(${lean}deg) scale(1)`, offset: 0 },
        { opacity: 1, transform: `rotate(${lean}deg) scale(1)`, offset: 0.76, easing: EASE_IN },
        { opacity: 0, transform: `rotate(${lean}deg) scale(1.12)`, offset: 1 },
      ],
      { duration: total, fill: 'both' },
    ),
  );
  removeAfter(box, a, total);
  // The slam lands at 60% of stamp-in (≈ 156ms): dust and a ring jump out from under the slab.
  const sx = x;
  const sy = y;
  const s = clamp(size / 44, 0.6, 2);
  let units = 0;
  for (const ch of text) units += ch.charCodeAt(0) > 0x2e7f ? 1.04 : 0.8;
  const reach = Math.min(W * 0.46, (units * size) / 2 + size * 0.45);
  window.setTimeout(() => {
    if (!root || isCalm()) return;
    // the ring starts at the slab's edge: the particles are drawn over the stamp, and must not cross its face
    const ring = spawn(K_RING);
    if (ring) {
      ring.x = sx;
      ring.y = sy;
      ring.a = reach * 0.8;
      ring.b = reach * 1.45;
      ring.size = 7 * s;
      ring.life = 0.4;
      ring.c1 = pal.paper;
    }
    // the dust squirts out from under both ends of the slab (the middle is hidden by it)
    emitPuffs(sx - reach, sy + size * 0.45, amount(undefined, 4), 1.1 * s, '', false);
    emitPuffs(sx + reach, sy + size * 0.3, amount(undefined, 4), 1.1 * s, '', false);
    wake();
  }, 150 + wait);
}

let bannerEnd: (() => void) | null = null;

function showBanner(text: string, opts: { sub?: string; color?: string; ms?: number } | undefined): Promise<void> {
  if (!layerBack || !root) return Promise.resolve();
  // one banner at a time: a new one cuts the old one short
  bannerEnd?.();
  const hold = Math.max(0, opts?.ms ?? 900);
  const box = div('fx-banner');
  if (opts?.color) {
    box.style.setProperty('--fx-c', opts.color);
    // dark bands get paper type (the luminance comes from the resolved rgb() string)
    const m = /(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/.exec(resolveColor(opts.color));
    if (m) {
      const scale = /^color\(/.test(resolveColor(opts.color)) ? 255 : 1;
      const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) * scale;
      if (lum < 120) {
        box.style.setProperty('--fx-t', 'var(--paper)');
        box.style.setProperty('--fx-t2', 'var(--ink)');
        if (lum < 40) box.style.setProperty('--fx-k', 'var(--gum)'); // an ink band needs a bright runner-up
      }
    }
  }
  // fit the type to the width: Latin glyphs of the display face are about 0.72em wide, kana/kanji 1em
  let units = 0;
  for (const ch of text) units += ch.charCodeAt(0) > 0x2e7f ? 1.04 : ch === ' ' ? 0.4 : ch >= 'A' && ch <= 'Z' ? 0.97 : 0.78;
  const fs = clamp((W * 0.84) / Math.max(1, units), 24, 72);
  box.style.fontSize = `${fs.toFixed(1)}px`;
  const trail = div('fx-banner-trail', box);
  const band = div('fx-banner-band', box);
  const tone = document.createElement('i');
  tone.className = 'fx-banner-tone';
  band.appendChild(tone);
  const type = div('fx-banner-type', band);
  const b = document.createElement('b');
  b.textContent = text;
  type.appendChild(b);
  if (opts?.sub) {
    const sm = document.createElement('small');
    sm.textContent = opts.sub;
    type.appendChild(sm);
  }
  layerBack.appendChild(box);

  return new Promise<void>((done) => {
    let over = false;
    const end = (): void => {
      if (over) return;
      over = true;
      if (bannerEnd === end) bannerEnd = null;
      box.remove();
      done();
    };
    bannerEnd = end;

    if (isCalm()) {
      const T = 120 + hold + 150;
      const a = track(box.animate([{ opacity: 0 }, { opacity: 1, offset: 120 / T }, { opacity: 1, offset: (120 + hold) / T }, { opacity: 0 }], { duration: T, fill: 'both' }));
      a.addEventListener('finish', end);
      window.setTimeout(end, T + 1200);
      return;
    }

    const tin = 260;
    const tout = 220;
    const T = tin + hold + tout;
    const A = tin / T;
    const B = (tin + hold) / T;
    const main = track(
      band.animate(
        [
          { transform: 'translateX(-104%)', easing: EASE_OUT },
          { transform: 'translateX(0)', offset: A, easing: 'linear' },
          { transform: 'translateX(0)', offset: B, easing: EASE_IN },
          { transform: 'translateX(104%)' },
        ],
        { duration: T, fill: 'both' },
      ),
    );
    // the ink band runs in a beat later, overshoots, and is the last to leave
    track(
      trail.animate(
        [
          { transform: 'translateX(-104%)', offset: 0, easing: 'linear' },
          { transform: 'translateX(-104%)', offset: 70 / T, easing: EASE_OUT },
          { transform: 'translateX(0)', offset: (tin + 90) / T, easing: 'linear' },
          { transform: 'translateX(0)', offset: Math.min(0.999, (tin + hold + 70) / T), easing: EASE_IN },
          { transform: 'translateX(104%)', offset: 1 },
        ],
        { duration: T, fill: 'both' },
      ),
    );
    // the type punches in against the band's travel, keeps creeping while it holds, and is flung out
    track(
      type.animate(
        [
          { opacity: 0, transform: 'translateX(46%) scale(1)', offset: 0, easing: 'linear' },
          { opacity: 0, transform: 'translateX(46%) scale(1.5)', offset: (tin * 0.35) / T, easing: EASE_OUT },
          { opacity: 1, transform: 'translateX(14px) scale(1.18)', offset: A, easing: EASE_POP },
          { opacity: 1, transform: 'translateX(11px) scale(1)', offset: Math.min(B, (tin + 130) / T), easing: 'linear' },
          { opacity: 1, transform: 'translateX(-12px) scale(1)', offset: B, easing: EASE_IN },
          { opacity: 1, transform: 'translateX(-40%) scale(1)', offset: 1 },
        ],
        { duration: T, fill: 'both' },
      ),
    );
    main.addEventListener('finish', end);
    window.setTimeout(end, T + 1200);
  });
}

let shakeAnims: Animation[] = [];
let lastFlash = -1000;

function doShake(intensity: number, ms: number): void {
  if (!root || !host || isCalm() || ms <= 0 || intensity <= 0) return;
  const amp = clamp(intensity, 0, 24);
  for (const a of shakeAnims) a.cancel();
  shakeAnims = [];
  // jagged, alternating, dying away: a fresh random path each time
  const n = Math.max(4, Math.round(ms / 34));
  const frames: Keyframe[] = [];
  let side = Math.random() < 0.5 ? -1 : 1;
  for (let i = 0; i <= n; i++) {
    const decay = (1 - i / n) ** 2;
    const x = i === 0 || i === n ? 0 : side * amp * decay * rnd(0.6, 1);
    const y = i === 0 || i === n ? 0 : amp * 0.55 * decay * rnd(-1, 1);
    side = -side;
    frames.push({ transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)` });
  }
  // the root and our layers move together, so effects stay glued to what they point at
  const o: KeyframeAnimationOptions = { duration: ms, easing: 'linear' };
  shaking++;
  const a = track(root.animate(frames, o));
  const b = track(host.animate(frames, o));
  shakeAnims = [a, b];
  let over = false;
  const end = (): void => {
    if (over) return;
    over = true;
    shaking = Math.max(0, shaking - 1);
    sync();
  };
  a.addEventListener('finish', end);
  a.addEventListener('cancel', end);
  window.setTimeout(end, ms + 1000);
}

function doFlash(color: string | undefined, ms: number): void {
  if (!flashEl || isCalm()) return;
  // never more than three flashes a second (docs/UI_DIRECTION.md §8)
  const now = performance.now();
  if (now - lastFlash < 340) return;
  lastFlash = now;
  flashEl.style.setProperty('--fx-c', color ?? 'var(--paper)');
  track(flashEl.animate([{ opacity: 0.85 }, { opacity: 0.6, offset: 0.25 }, { opacity: 0 }], { duration: Math.max(40, ms), easing: 'ease-out' }));
}

function doHitStop(ms: number): void {
  if (!root || !host || isCalm() || ms <= 0) return;
  const until = performance.now() + clamp(ms, 0, 300);
  if (until <= frozenUntil) return;
  frozenUntil = until;
  // Hold everything that is moving inside the game and in our own layers (not a running screen wipe).
  const all = document.getAnimations();
  for (const a of all) {
    if (a.playState !== 'running') continue;
    const t = (a.effect as KeyframeEffect | null)?.target;
    if (!t) continue;
    if (!(root.contains(t) || host.contains(t))) continue;
    if (wipe && wipe.contains(t)) continue;
    a.pause();
    held.push(a);
  }
  if (holdTimer) window.clearTimeout(holdTimer);
  holdTimer = window.setTimeout(release, until - performance.now());
}

// ---------------------------------------------------------------------------------------------
// Screen wipes
// ---------------------------------------------------------------------------------------------

type WipeKind = 'slash' | 'bars' | 'iris';
let wipeState: 'idle' | 'cover' | 'reveal' = 'idle';
let wipeSwaps: Array<() => void> = [];
let wipeWaiters: Array<() => void> = [];
let wipeTail: Promise<void> = Promise.resolve();
let irisRaf = 0;

function runSwaps(): void {
  // An index loop on purpose: a swap may itself ask for a transition, which lands in this same list.
  for (let i = 0; i < wipeSwaps.length; i++) {
    try {
      wipeSwaps[i]();
    } catch (err) {
      console.error(err);
    }
  }
  wipeSwaps = [];
}

function startWipe(kind: WipeKind, center: Target | undefined): void {
  const box = wipe;
  if (!box) return;
  box.classList.add('is-busy');
  const calm = isCalm();
  const cover = calm ? 60 : 260;
  const reveal = calm ? 60 : 260;
  /** Starts the way out; called once the screen is covered and swapped. */
  let open: () => void = () => {};

  if (calm) {
    const sheet = div('fx-fade', box);
    sheet.animate([{ opacity: 0 }, { opacity: 1 }], { duration: cover, fill: 'both' });
    open = () => sheet.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reveal, fill: 'both' });
  } else if (kind === 'bars') {
    const n = 7;
    const bars: HTMLDivElement[] = [];
    const each = 150;
    const gap = (cover - each) / (n - 1);
    for (let i = 0; i < n; i++) {
      const bar = div('fx-bar', box);
      bar.style.top = `${(i * 100) / n}%`;
      bar.style.height = `calc(${100 / n}% + 1px)`;
      bar.style.transformOrigin = '50% 0';
      bar.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: each, delay: i * gap, easing: EASE_OUT, fill: 'both' });
      bars.push(bar);
    }
    open = () => {
      for (let i = 0; i < n; i++) {
        bars[i].style.transformOrigin = '50% 100%';
        bars[i].animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: each, delay: i * gap, easing: EASE_IN, fill: 'both' });
      }
    };
  } else if (kind === 'iris') {
    const rim = div('fx-iris fx-iris--rim', box);
    const ink = div('fx-iris', box);
    let cx = W / 2;
    let cy = H / 2;
    if (center && resolve(center, PT)) {
      cx = PT.x;
      cy = PT.y;
    }
    const R = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 12;
    for (const el of [rim, ink]) {
      el.style.setProperty('--fx-ix', `${cx}px`);
      el.style.setProperty('--fx-iy', `${cy}px`);
    }
    let t0 = 0;
    let dir = 1; // 1 closing, -1 opening
    const draw = (now: number): void => {
      irisRaf = 0;
      if (!ink.isConnected) return;
      if (t0 === 0) t0 = now;
      const k = clamp((now - t0) / (dir === 1 ? cover : reveal), 0, 1);
      // closing eases in (slams shut); opening eases out
      const r = dir === 1 ? R * (1 - k * k) : R * (1 - (1 - k) * (1 - k));
      ink.style.setProperty('--fx-ir', `${r.toFixed(1)}px`);
      rim.style.setProperty('--fx-ir', `${Math.max(0, r - 7).toFixed(1)}px`);
      if (k < 1) irisRaf = requestAnimationFrame(draw);
    };
    ink.style.setProperty('--fx-ir', `${R}px`);
    rim.style.setProperty('--fx-ir', `${R}px`);
    irisRaf = requestAnimationFrame(draw);
    open = () => {
      if (irisRaf) cancelAnimationFrame(irisRaf);
      // the frame loop may have slept (hidden tab) before the hole closed: close it now
      ink.style.setProperty('--fx-ir', '0px');
      rim.style.setProperty('--fx-ir', '0px');
      t0 = 0;
      dir = -1;
      irisRaf = requestAnimationFrame(draw);
    };
  } else {
    // slash: three slanted sheets chase each other across — GUM yellow leads, ink closes the screen.
    // The sheets are much wider than the screen; the keyframes stop just past "covered" (-10%) and
    // start again just before "uncovering" (+10%), and begin / end just off the screen (∓84%), so no
    // time is spent moving while nothing changes.
    const names = ['fx-panel fx-panel--gum', 'fx-panel fx-panel--mid', 'fx-panel fx-panel--ink'];
    const panels: HTMLDivElement[] = [];
    const each = 200;
    const gap = (cover - each) / (names.length - 1);
    const skew = 'skewX(-14deg)';
    names.forEach((cls, i) => {
      const p = div(cls, box);
      p.animate([{ transform: `translateX(-84%) ${skew}` }, { transform: `translateX(-10%) ${skew}` }], {
        duration: each,
        delay: i * gap,
        easing: 'cubic-bezier(0.3, 0.2, 0.7, 0.9)',
        fill: 'both',
      });
      panels.push(p);
    });
    open = () => {
      // the ink leaves first, so the yellow edge is the last thing to cross the new screen
      panels.forEach((p, i) => {
        p.animate([{ transform: `translateX(10%) ${skew}` }, { transform: `translateX(84%) ${skew}` }], {
          duration: each,
          delay: (panels.length - 1 - i) * gap,
          easing: 'cubic-bezier(0.3, 0.3, 0.5, 1)',
          fill: 'both',
        });
      });
    };
  }

  // Timers, not animation events, drive the sequence: `swap` must run even in a sleeping tab.
  window.setTimeout(() => {
    runSwaps();
    wipeState = 'reveal';
    window.setTimeout(
      () => {
        open();
        window.setTimeout(() => {
          if (irisRaf) cancelAnimationFrame(irisRaf);
          irisRaf = 0;
          box.textContent = '';
          box.classList.remove('is-busy');
          wipeState = 'idle';
          const waiters = wipeWaiters;
          wipeWaiters = [];
          for (const w of waiters) w();
        }, reveal + 20);
      },
      calm ? 0 : 30,
    );
  }, cover + 10);
}

function doTransition(swap: () => void, kind: WipeKind, center: Target | undefined): Promise<void> {
  if (!wipe || !root) {
    swap();
    return Promise.resolve();
  }
  if (wipeState === 'cover') {
    // Already closing: this change rides along and happens under the same cover.
    wipeSwaps.push(swap);
    return new Promise<void>((res) => wipeWaiters.push(res));
  }
  if (wipeState === 'reveal') {
    // Already opening: wait for it, then run a wipe of its own.
    const next = wipeTail.then(() => doTransition(swap, kind, center));
    wipeTail = next;
    return next;
  }
  wipeState = 'cover';
  wipeSwaps = [swap];
  const done = new Promise<void>((res) => wipeWaiters.push(res));
  wipeTail = done;
  startWipe(kind, center);
  return done;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

export const fx = {
  /**
   * Builds the effect layers over the game root. Call once at start-up (calling again re-mounts).
   * The layers are attached next to the root, not inside it, so re-rendering the root is safe.
   */
  mount(target: HTMLElement): void {
    mount(target);
  },
  /** Removes the layers again (tests, hot reload). */
  unmount(): void {
    unmount();
  },
  /** A burst of particles at a place. */
  burst(kind: BurstKind, at: Target, opts?: BurstOptions): void {
    if (!ctx || isCalm() || !resolve(at, PT)) return;
    const x = PT.x;
    const y = PT.y;
    const s = clamp(opts?.scale ?? 1, 0.3, 3);
    const col = opts?.color ? resolveColor(opts.color) : '';
    const spread = Math.max(0, opts?.spread ?? 0);
    switch (kind) {
      case 'coins':
        emitCoins(x, y, amount(opts?.count, 10, 60), s, spread);
        break;
      case 'sparks':
        emitSparks(x, y, amount(opts?.count, 12), s, col);
        break;
      case 'stars':
        emitStars(x, y, amount(opts?.count, 8), s, col, spread);
        break;
      case 'dust':
        emitPuffs(x, y, amount(opts?.count, 6, 40), s, col, false);
        break;
      case 'smoke':
        emitPuffs(x, y, amount(opts?.count, 7, 40), s, col, true);
        break;
      case 'confetti':
        emitConfetti(x, y, amount(opts?.count, 28, 160), s, col, spread);
        break;
      case 'heal':
        emitHeal(x, y, amount(opts?.count, 6, 30), s, col);
        break;
      case 'hit':
        emitHit(x, y, amount(opts?.count, 9, 24), s, col);
        break;
      case 'shards':
        emitShards(x, y, amount(opts?.count, 7, 40), s, col);
        break;
      case 'ring':
        emitRings(x, y, clamp(opts?.count ?? 2, 1, 5), s, col);
        break;
    }
    wake();
  },
  /**
   * Coins (or stars) pop out of `from`, hang for a beat, then are sucked into `to` along curved paths,
   * one after another. `onArrive` is called once, when the first piece lands — start the counter roll
   * and the coin sound there. It is always called exactly once, even when nothing can be drawn.
   */
  fly(kind: 'coins' | 'stars', from: Target, to: Target, opts?: FlyOptions): void {
    const group: FlyGroup = { fired: false, onArrive: opts?.onArrive, bumpEl: null, bumpSel: '', lastBump: 0 };
    const okFrom = resolve(from, PT);
    const okTo = resolve(to, PT2);
    if (!ctx || isCalm() || !okFrom || !okTo) {
      // nothing travels: the payoff still happens, a beat later
      window.setTimeout(() => fireGroup(group), okFrom && okTo ? 90 : 0);
      return;
    }
    if (opts?.bump !== false) {
      if (typeof to === 'string') group.bumpSel = to;
      else if (to instanceof Element) group.bumpEl = to;
    }
    const n = amount(opts?.count, 8, 24);
    const set = kind === 'coins' ? coins() : tinted(STAR_ART, 'star', pal.gum);
    const side = Math.random() < 0.5 ? -1 : 1;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const p = spawn(K_FLY);
      if (!p) break;
      made++;
      const ang = rnd(0, TAU);
      const sp = rnd(160, 420);
      p.x = PT.x;
      p.y = PT.y;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp - 120; // the scatter leans upwards
      p.tx = PT2.x + rnd(-3, 3);
      p.ty = PT2.y + rnd(-3, 3);
      p.a = 0.2 + i * 0.045 + rnd(0, 0.03); // when this piece leaves: one after another
      p.b = rnd(0.34, 0.46); // its flight time
      // most pieces bow to the same side (a ribbon of coins), a few to the other (a fan)
      p.e = (i % 4 === 3 ? -side : side) * rnd(0.18, 0.5);
      p.size = 2;
      p.rot = rnd(0, 4);
      p.spr = set;
      p.grp = group;
      p.life = 99;
    }
    if (made === 0) {
      window.setTimeout(() => fireGroup(group), 90);
      return;
    }
    flyGroups.add(group);
    // the launch itself: a small ring at the source
    emitRings(PT.x, PT.y, 1, 0.45, pal.gum);
    wake();
  },
  /** A number or short word that pops and floats away. */
  text(text: string, at: Target, opts?: TextOptions): void {
    if (!layer || !resolve(at, PT)) return;
    showText(text, PT.x, PT.y, opts);
  },
  /** A big stamp slammed onto the screen (SOLD, DEAL, WIN …), gone after ~900ms. */
  stamp(text: string, at: Target, opts?: { color?: string; size?: number }): void {
    if (!layerBack || !resolve(at, PT)) return;
    showStamp(text, PT.x, PT.y, opts);
  },
  /** A band with big type sweeping across the screen (OPEN, CLOSED, a skill's name …). Resolves when it has left. */
  banner(text: string, opts?: { sub?: string; color?: string; ms?: number }): Promise<void> {
    return showBanner(text, opts);
  },
  /** Shakes the whole game. intensity in px. */
  shake(intensity = 6, ms = 260): void {
    doShake(intensity, ms);
  },
  /** A full-screen flash of a colour. */
  flash(color?: string, ms = 140): void {
    doFlash(color, ms);
  },
  /** Freezes all motion for a few frames (hit-stop): our particles and every running animation in the game. */
  hitStop(ms = 80): void {
    doHitStop(ms);
  },
  /**
   * Covers the screen with a slanted ink wipe, calls `swap` while it is covered (change the screen there),
   * then uncovers. Resolves when done. With reduced motion: a quick fade.
   * `swap` runs exactly once. Called again while closing, the new swap shares the same cover;
   * called while opening, it waits and gets a wipe of its own.
   */
  transition(swap: () => void, kind: 'slash' | 'bars' | 'iris' = 'slash', opts?: { at?: Target }): Promise<void> {
    return doTransition(swap, kind, opts?.at);
  },
  /** Slow drifting particles behind everything: dust by day, fireflies at night, embers in the dungeon. */
  ambient(mode: 'day' | 'night' | 'dungeon' | 'none'): void {
    if (mode === ambWanted && mode === ambMode) return;
    ambWanted = mode;
    seedAmbient();
    if (ambN > 0) wake();
  },
  /** 演出をひかえる: true stops shakes, flashes and travelling particles (text still shows). */
  setCalm(on: boolean): void {
    if (calmUser === on) return;
    calmUser = on;
    onCalmChange();
  },
  /** True when effects are reduced: by setCalm(true) or by the OS setting. */
  get calm(): boolean {
    return isCalm();
  },
};

/** Numbers for the dev board: how many particles are alive, the current quality, whether the loop runs. */
export function fxDebug(): { alive: number; ambient: number; quality: number; running: boolean } {
  return { alive, ambient: ambN, quality, running: raf !== 0 };
}
