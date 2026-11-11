/**
 * Sound. Screens call only this API (docs/UI_DIRECTION.md §6).
 *
 * How it is built:
 *   - One AudioContext, made on the first gesture (`unlock`). Graph:
 *       sound effects ─► se ──────────┐
 *       music decks ─► bgm ─► duck ───┴─► master ─► compressor ─► trim ─► soft clip ─► speakers
 *     The compressor glues stacked sounds together; the soft clip is the hard guarantee that the
 *     output never reaches full scale.
 *   - Sound effects are synthesized (oscillators, filtered noise, envelopes): nothing to download,
 *     no latency, and every sound sits in one palette — chiptune voices, brass, a little metal —
 *     tuned to C major pentatonic so that they sit well over the day theme (A minor).
 *     The battle sounds get a recorded layer underneath once it has loaded (see `audioTuning`).
 *   - Music streams through two <audio> elements (`preload="none"`) into the bgm bus: one track is
 *     downloaded at a time, and only when a scene asks for it. Scenes crossfade over 600ms with
 *     equal power. Which file plays where is decided in scripts/sync-assets.mjs.
 *   - Nothing here throws, and everything may be called before `unlock`: effects are dropped, the
 *     requested music is remembered and starts with the first gesture.
 */
import assetJson from '../generated/audio.json';

export type SfxName =
  | 'tap' | 'confirm' | 'cancel' | 'open' | 'close' | 'error'
  | 'pick' | 'drop' | 'dropBad' | 'rotate'
  | 'shutterUp' | 'shutterDown' | 'step' | 'voice' | 'bell' | 'door'
  | 'buy' | 'coin' | 'coinBig' | 'haggleOk' | 'refuse' | 'angry'
  | 'receipt' | 'stamp' | 'rent' | 'event' | 'equip'
  | 'stairs' | 'found' | 'encounter' | 'hit' | 'hitBig' | 'heal' | 'buff' | 'debuff' | 'status' | 'run' | 'miss'
  | 'win' | 'lose' | 'fanfare';

export type BgmName = 'title' | 'day' | 'night' | 'shop' | 'dungeon' | 'battle' | 'boss' | 'ending';

export interface AudioSettings {
  /** 0–1 */
  bgm: number;
  /** 0–1 */
  se: number;
}

export interface SfxOptions {
  /** playback rate / pitch multiplier (1 = normal). `voice` uses this for a customer's temper */
  pitch?: number;
  /** 0–1, multiplied with the SE volume */
  volume?: number;
  /** seconds to wait before playing */
  delay?: number;
}

// ---------------------------------------------------------------- assets, settings

interface TrackAsset {
  url: string;
  /** evens the tracks out in loudness */
  gain: number;
  /** seconds of silence at the start / the end, skipped when the track loops */
  head: number;
  tail: number;
}
interface SampleAsset {
  url: string;
  gain: number;
}
const ASSETS = assetJson as { bgm: Record<BgmName, TrackAsset>; se: Record<string, SampleAsset> };

/**
 * Switches for the recorded layers; soundboard.html flips them to compare by ear.
 *   battleLayers — lay the recorded battle effects under hit / hitBig / heal / buff / debuff / status.
 *   assetJingles — play the recorded win / lose jingles in place of the synthesized phrases. Off:
 *                  they are dense full-band masters (about -10 LUFS, peaks above full scale, `win`
 *                  ends on a hard cut), which sits badly next to the rest of the palette.
 */
export const audioTuning = { battleLayers: true, assetJingles: false };

const STORE_KEY = 'mycryptotrading.audio.v1';
const CROSSFADE = 0.6;

interface Stored {
  bgm: number;
  se: number;
  haptic: boolean;
}
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function loadStored(): Stored {
  const out: Stored = { bgm: 0.6, se: 0.8, haptic: true };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Partial<Stored> | null;
    if (raw && typeof raw === 'object') {
      if (typeof raw.bgm === 'number') out.bgm = clamp01(raw.bgm);
      if (typeof raw.se === 'number') out.se = clamp01(raw.se);
      if (typeof raw.haptic === 'boolean') out.haptic = raw.haptic;
    }
  } catch {
    // no storage (private mode, tests): the defaults stand
  }
  return out;
}
const stored = loadStored();
function saveStored(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(stored));
  } catch {
    // not kept; the session still works
  }
}

/** Slider position (0–1) to gain: squared, so that the middle of the slider sounds like the middle. */
const taper = (v: number): number => v * v;

// ---------------------------------------------------------------- the synth: a small helper layer

interface EnvOpts {
  /** peak gain */
  vol?: number;
  /** attack, seconds */
  a?: number;
  /** time held at the peak, seconds */
  hold?: number;
  /** decay to silence, seconds */
  d?: number;
  /** where to connect (default: the sound being built) */
  dest?: AudioNode;
}
interface ToneOpts extends EnvOpts {
  /** frequency, Hz */
  f: number;
  /** glide to this frequency … */
  to?: number;
  /** … over this many seconds (default: the whole note) */
  glide?: number;
  type?: OscillatorType | PeriodicWave;
  /** cents */
  detune?: number;
  /** low-pass cutoff, Hz (softens squares and saws) */
  lp?: number;
}
interface NoiseOpts extends EnvOpts {
  /** filter frequency, Hz */
  f: number;
  to?: number;
  glide?: number;
  type?: BiquadFilterType;
  q?: number;
}
interface FmOpts extends EnvOpts {
  /** carrier frequency, Hz */
  f: number;
  /** modulator frequency = f × ratio (not a whole number: metallic) */
  ratio: number;
  /** modulation depth at the start, in multiples of the modulator frequency; it dies away with the note */
  index: number;
}

const midi = (note: number): number => 440 * 2 ** ((note - 69) / 12);
const rnd = (min: number, max: number): number => min + Math.random() * (max - min);

class Synth {
  /** The node the sound being built writes to. Set before every sound. */
  out: AudioNode;
  private readonly noiseBuf: AudioBuffer;
  private voiceWave: PeriodicWave | null = null;
  private crunchCurve: Float32Array<ArrayBuffer> | null = null;

  constructor(readonly ctx: BaseAudioContext, out: AudioNode) {
    this.out = out;
    // two seconds of white noise, shared by every noise burst (each starts at a random offset)
    const len = Math.floor(ctx.sampleRate * 2);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Attack → hold → exponential decay on a gain. Returns the time the sound is over. */
  env(param: AudioParam, t: number, o: EnvOpts): number {
    const vol = Math.max(0.0002, o.vol ?? 0.5);
    const a = Math.max(0.001, o.a ?? 0.002);
    const hold = o.hold ?? 0;
    const end = t + a + hold + Math.max(0.005, o.d ?? 0.1);
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(vol, t + a);
    if (hold > 0) param.setValueAtTime(vol, t + a + hold);
    param.exponentialRampToValueAtTime(vol * 0.001, end);
    param.setValueAtTime(0, end);
    return end;
  }

  /** Exponential glide of any parameter (a pitch or a filter). */
  sweep(param: AudioParam, t: number, from: number, to: number, dur: number): void {
    param.setValueAtTime(Math.max(1, from), t);
    param.exponentialRampToValueAtTime(Math.max(1, to), t + Math.max(0.005, dur));
  }

  /** A gain to mix several voices through (for a shared tremolo, a distortion …). */
  bus(vol = 1, dest?: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(dest ?? this.out);
    return g;
  }

  /** One oscillator with an envelope. */
  tone(t: number, o: ToneOpts): OscillatorNode {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    if (typeof o.type === 'object') osc.setPeriodicWave(o.type);
    else osc.type = o.type ?? 'sine';
    const g = ctx.createGain();
    const end = this.env(g.gain, t, o);
    if (o.to) this.sweep(osc.frequency, t, o.f, o.to, o.glide ?? end - t);
    else osc.frequency.setValueAtTime(o.f, t);
    if (o.detune) osc.detune.value = o.detune;
    let node: AudioNode = osc;
    if (o.lp) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lp;
      lp.Q.value = 0.5;
      node.connect(lp);
      node = lp;
    }
    node.connect(g);
    g.connect(o.dest ?? this.out);
    osc.start(t);
    osc.stop(end + 0.02);
    return osc;
  }

  /** A burst of filtered noise. */
  noise(t: number, o: NoiseOpts): void {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = o.type ?? 'bandpass';
    fl.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const end = this.env(g.gain, t, o);
    if (o.to) this.sweep(fl.frequency, t, o.f, o.to, o.glide ?? end - t);
    else fl.frequency.setValueAtTime(o.f, t);
    src.connect(fl);
    fl.connect(g);
    g.connect(o.dest ?? this.out);
    src.start(t, Math.random() * 1.5);
    src.stop(end + 0.02);
  }

  /** Two-operator FM: a struck piece of metal (slats, latches, clasps). */
  fm(t: number, o: FmOpts): void {
    const { ctx } = this;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const depth = ctx.createGain();
    const g = ctx.createGain();
    const end = this.env(g.gain, t, o);
    const fm = o.f * o.ratio;
    car.frequency.setValueAtTime(o.f, t);
    mod.frequency.setValueAtTime(fm, t);
    depth.gain.setValueAtTime(o.index * fm, t);
    depth.gain.exponentialRampToValueAtTime(Math.max(1, o.index * fm * 0.02), end);
    mod.connect(depth);
    depth.connect(car.frequency);
    car.connect(g);
    g.connect(o.dest ?? this.out);
    for (const osc of [car, mod]) {
      osc.start(t);
      osc.stop(end + 0.02);
    }
  }

  /** A slow wobble on any parameter (vibrato, tremolo, a sticking hinge). */
  lfo(t: number, param: AudioParam, rate: number, depth: number, dur: number, type: OscillatorType = 'sine'): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    osc.connect(g);
    g.connect(param);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** A struck bell: sine partials that are not whole multiples, the high ones dying first. */
  bell(t: number, f: number, d: number, vol: number, partials: ReadonlyArray<readonly [ratio: number, level: number, life: number]>): void {
    for (const [ratio, level, life] of partials) {
      this.tone(t, { f: f * ratio, vol: vol * level, a: 0.001, d: d * life });
    }
  }

  /** A plucked chip voice: a triangle body with a square's bite at the front. */
  pluck(t: number, f: number, d: number, vol: number): void {
    this.tone(t, { f, type: 'triangle', vol, a: 0.002, d });
    this.tone(t, { f, type: 'square', lp: f * 4, vol: vol * 0.22, a: 0.002, d: d * 0.45 });
    this.tone(t, { f: f * 2, vol: vol * 0.16, a: 0.002, d: d * 0.6 });
  }

  /** A brass note: two saws a few cents apart, the filter opening with the attack. `bright` < 1 mutes it. */
  brass(t: number, f: number, dur: number, vol: number, bright = 1): void {
    const { ctx } = this;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(f * 1.3, t);
    lp.frequency.linearRampToValueAtTime(f * 5.5 * bright, t + 0.035);
    lp.frequency.setTargetAtTime(f * 2.8 * bright, t + 0.035, 0.09);
    const g = ctx.createGain();
    // a hard tongued attack, settling to the sustained level, then the release
    const settle = t + 0.016 + Math.min(0.08, dur * 0.5);
    const release = Math.max(settle + 0.005, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.016);
    g.gain.linearRampToValueAtTime(vol * 0.8, settle);
    g.gain.setValueAtTime(vol * 0.8, release);
    g.gain.exponentialRampToValueAtTime(vol * 0.001, release + 0.1);
    g.gain.setValueAtTime(0, release + 0.1);
    lp.connect(g);
    g.connect(this.out);
    for (const cents of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.detune.value = cents;
      osc.connect(lp);
      osc.start(t);
      osc.stop(release + 0.12);
    }
  }

  /** A reedy, vowel-like wave for the customers' speech blips. */
  voice(): PeriodicWave {
    if (!this.voiceWave) {
      const imag = new Float32Array([0, 1, 0.52, 0.34, 0.1, 0.2, 0.06, 0.03]);
      this.voiceWave = this.ctx.createPeriodicWave(new Float32Array(imag.length), imag);
    }
    return this.voiceWave;
  }

  /** A distortion to push noise through (the crunch of a heavy hit). Connected to the current sound. */
  crunch(drive = 3): WaveShaperNode {
    if (!this.crunchCurve) {
      const n = 1025;
      this.crunchCurve = new Float32Array(n);
      for (let i = 0; i < n; i++) this.crunchCurve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * drive);
    }
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.crunchCurve;
    shaper.connect(this.out);
    return shaper;
  }
}

// ---------------------------------------------------------------- the sounds, one function each
// (s, t, p): the synth, the start time, the pitch multiplier (the caller's `pitch` × a small random drift).

type Sound = (s: Synth, t: number, p: number) => void;

/** Bell partials: a small brass counter bell, a register ding, a soft chime. */
const COUNTER_BELL = [[1, 1, 1], [1.003, 0.45, 0.9], [2.0, 0.5, 0.62], [2.76, 0.36, 0.42], [4.07, 0.2, 0.26], [5.4, 0.1, 0.16]] as const;
const DING = [[1, 1, 1], [2.76, 0.3, 0.3], [5.4, 0.12, 0.15]] as const;
const CHIME = [[1, 1, 1], [2, 0.3, 0.6], [3.01, 0.12, 0.35]] as const;

/** C major pentatonic, in semitones above C: the scale every coin and sparkle is drawn from. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

// A few sounds remember the last call, so that a stream of them is not one sound repeated.
const memory = { coinStep: 0, coinAt: -9, foot: false, line: 0 };

/** One coin: a grace note a fourth below, then a ringing ping with a metallic overtone. */
function coinPing(s: Synth, t: number, f: number, vol: number, life = 1): void {
  s.tone(t, { f: f * 0.749, type: 'square', lp: 5200, vol: vol * 0.3, a: 0.001, d: 0.04 });
  s.tone(t + 0.03, { f, vol, a: 0.001, d: 0.3 * life });
  s.tone(t + 0.03, { f: f * 2, type: 'triangle', vol: vol * 0.22, a: 0.001, d: 0.15 * life });
  s.tone(t + 0.03, { f: f * 2.76, vol: vol * 0.2, a: 0.001, d: 0.07 * life });
}

/** A sparkle: a few tiny high pings scattered over a span. */
function twinkles(s: Synth, t: number, span: number, count: number, vol: number, p: number): void {
  for (let i = 0; i < count; i++) {
    const note = 96 + PENTA[Math.floor(rnd(0, 8))];
    s.tone(t + rnd(0, span), { f: midi(note) * p, vol: vol * rnd(0.5, 1), a: 0.002, d: rnd(0.06, 0.14) });
  }
}

const SOUNDS: Record<SfxName, Sound> = {
  // ---- buttons and windows

  /** Any button: a soft woody tick. */
  tap(s, t, p) {
    s.tone(t, { f: 760 * p, to: 520 * p, glide: 0.03, vol: 0.5, a: 0.001, d: 0.045 });
    s.tone(t, { f: 1180 * p, type: 'triangle', vol: 0.2, a: 0.001, d: 0.022 });
    s.noise(t, { f: 2400, q: 1.2, vol: 0.3, a: 0.001, d: 0.012 });
  },

  /** The main button: a bright two-note pluck, a fourth up. */
  confirm(s, t, p) {
    s.pluck(t, midi(79) * p, 0.12, 0.42);
    s.pluck(t + 0.075, midi(84) * p, 0.28, 0.5);
    s.tone(t + 0.075, { f: midi(96) * p, vol: 0.07, a: 0.002, d: 0.2 });
  },

  /** Back / close: a short blip falling away. */
  cancel(s, t, p) {
    s.tone(t, { f: 560 * p, to: 300 * p, glide: 0.09, type: 'triangle', vol: 0.5, a: 0.002, d: 0.12 });
    s.tone(t, { f: 280 * p, to: 150 * p, glide: 0.09, vol: 0.25, a: 0.002, d: 0.1 });
  },

  /** A window slides in: a swish upwards with a small rising tone. */
  open(s, t, p) {
    s.noise(t, { f: 500, to: 2600, q: 1.5, vol: 0.5, a: 0.02, d: 0.11 });
    s.tone(t, { f: midi(67) * p, to: midi(74) * p, glide: 0.08, type: 'triangle', vol: 0.34, a: 0.005, d: 0.13 });
  },

  /** A window slides away: the same swish, downwards. */
  close(s, t, p) {
    s.noise(t, { f: 2600, to: 500, q: 1.5, vol: 0.45, a: 0.01, d: 0.12 });
    s.tone(t, { f: midi(74) * p, to: midi(67) * p, glide: 0.08, type: 'triangle', vol: 0.3, a: 0.005, d: 0.12 });
  },

  /** Not allowed: two soft square notes, the second lower. */
  error(s, t, p) {
    for (const [at, note] of [[0, 55], [0.11, 51]] as const) {
      s.tone(t + at, { f: midi(note) * p, type: 'square', lp: 1400, vol: 0.4, a: 0.004, hold: 0.05, d: 0.045 });
      s.tone(t + at, { f: midi(note - 12) * p, vol: 0.15, a: 0.004, hold: 0.05, d: 0.045 });
    }
  },

  // ---- goods in the hand

  /** Lifting a good: a short pop upwards. */
  pick(s, t, p) {
    s.tone(t, { f: 320 * p, to: 960 * p, glide: 0.055, vol: 0.5, a: 0.002, d: 0.075 });
    s.noise(t, { f: 3200, q: 1, vol: 0.2, a: 0.001, d: 0.01 });
  },

  /** Setting a good down: a thud, then the tiny click of it settling. */
  drop(s, t, p) {
    s.tone(t, { f: 300 * p, to: 85 * p, glide: 0.08, vol: 0.6, a: 0.001, d: 0.12 });
    s.tone(t, { f: 620 * p, to: 260 * p, glide: 0.04, type: 'triangle', vol: 0.4, a: 0.001, d: 0.05 });
    s.noise(t, { type: 'lowpass', f: 1500, vol: 0.5, a: 0.001, d: 0.04 });
    s.noise(t + 0.038, { type: 'highpass', f: 3000, vol: 0.2, a: 0.001, d: 0.008 });
  },

  /** It does not fit: a dull double buzz. */
  dropBad(s, t, p) {
    for (const [at, f] of [[0, 138], [0.1, 126]] as const) {
      s.tone(t + at, { f: f * p, type: 'sawtooth', lp: 700, vol: 0.55, a: 0.003, hold: 0.045, d: 0.04 });
      s.noise(t + at, { type: 'lowpass', f: 650, vol: 0.5, a: 0.002, d: 0.05 });
    }
  },

  /** Turning a good: a quick ratchet, four teeth, rising. */
  rotate(s, t, p) {
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.022;
      s.noise(at, { f: 2200 + i * 450, q: 4, vol: 0.7, a: 0.001, d: 0.012 });
      s.tone(at, { f: (900 + i * 160) * p, type: 'square', lp: 3000, vol: 0.09, a: 0.001, d: 0.012 });
    }
  },

  // ---- the shop

  /** Opening: the shutter rattles up, slat after slat, faster and higher, and locks with a clank. */
  shutterUp(s, t, p) {
    const slats = 13;
    for (let i = 0; i < slats; i++) {
      const x = i / (slats - 1);
      const at = t + 0.8 * x ** 0.8;
      s.noise(at, { f: 520 + 1500 * x, q: 3, vol: 0.9, a: 0.002, d: 0.05 });
      s.fm(at, { f: (300 + 480 * x) * p, ratio: 2.41, index: 2, vol: 0.1, a: 0.001, d: 0.04 });
    }
    s.noise(t, { type: 'lowpass', f: 240, vol: 0.5, a: 0.05, hold: 0.7, d: 0.15 });
    const clank = t + 0.86;
    s.fm(clank, { f: 420 * p, ratio: 1.47, index: 4, vol: 0.3, a: 0.001, d: 0.24 });
    s.tone(clank, { f: 150, to: 70, glide: 0.1, vol: 0.5, a: 0.001, d: 0.13 });
    s.noise(clank, { type: 'highpass', f: 3000, vol: 0.2, a: 0.001, d: 0.05 });
  },

  /** Closing: the shutter drops — the slats fall faster and lower — and slams on the sill. */
  shutterDown(s, t, p) {
    const slats = 10;
    for (let i = 0; i < slats; i++) {
      const x = i / (slats - 1);
      const at = t + 0.46 * x ** 0.7;
      s.noise(at, { f: 1900 - 1450 * x, q: 3, vol: 0.8, a: 0.002, d: 0.045 });
      s.fm(at, { f: (760 - 430 * x) * p, ratio: 2.41, index: 2, vol: 0.09, a: 0.001, d: 0.035 });
    }
    const slam = t + 0.5;
    s.tone(slam, { f: 150, to: 40, glide: 0.2, vol: 0.6, a: 0.001, hold: 0.03, d: 0.3 });
    s.tone(slam, { f: 440, to: 130, glide: 0.07, type: 'triangle', vol: 0.5, a: 0.001, d: 0.12 });
    s.noise(slam, { type: 'lowpass', f: 2200, to: 300, vol: 0.8, a: 0.001, d: 0.26 });
    s.noise(slam, { f: 900, q: 0.7, vol: 0.8, a: 0.001, d: 0.14 });
    s.fm(slam, { f: 300 * p, ratio: 1.47, index: 4, vol: 0.26, a: 0.001, d: 0.3 });
    // the slats bounce once or twice
    s.noise(slam + 0.13, { f: 900, q: 3, vol: 0.35, a: 0.002, d: 0.04 });
    s.noise(slam + 0.21, { f: 700, q: 3, vol: 0.18, a: 0.002, d: 0.04 });
  },

  /** One footstep of a customer; left and right feet differ a little. */
  step(s, t, p) {
    memory.foot = !memory.foot;
    const k = memory.foot ? 1 : 0.86;
    s.noise(t, { f: 850 * k, q: 0.7, vol: 0.5, a: 0.003, d: 0.05 });
    s.noise(t, { type: 'lowpass', f: 420 * k, vol: 0.5, a: 0.003, d: 0.06 });
    s.tone(t, { f: 210 * k * p, to: 100 * k * p, glide: 0.05, vol: 0.35, a: 0.002, d: 0.07 });
  },

  /**
   * One letter of speech. `pitch` is the speaker (1 = an even temper, lower = gruff, higher = bright);
   * each blip picks a nearby note and bends a little, so a line has the rise and fall of talking.
   * One oscillator: cheap enough for 15 a second.
   */
  voice(s, t, p) {
    const f = 330 * p * 2 ** ([0, 0, 2, -2, 4, -3][Math.floor(rnd(0, 6))] / 12);
    s.tone(t, { f, to: f * rnd(0.94, 1.07), type: s.voice(), vol: 0.34, a: 0.004, hold: 0.018, d: 0.036 });
  },

  /** The counter bell: struck brass, partials that beat against each other, a long tail. */
  bell(s, t, p) {
    s.noise(t, { type: 'highpass', f: 5000, vol: 0.25, a: 0.001, d: 0.008 });
    s.tone(t, { f: 700 * p, to: 500 * p, glide: 0.02, vol: 0.2, a: 0.001, d: 0.025 });
    s.bell(t, 1568 * p, 1.5, 0.42, COUNTER_BELL);
  },

  /** The door: a hinge that sticks and creaks, then the latch, twice. */
  door(s, t, p) {
    const { ctx } = s;
    const body = ctx.createBiquadFilter();
    body.type = 'bandpass';
    body.Q.value = 9;
    s.sweep(body.frequency, t, 640, 1150, 0.36);
    body.connect(s.out);
    const osc = s.tone(t, { f: 62 * p, to: 96 * p, glide: 0.36, type: 'sawtooth', vol: 1.6, a: 0.03, hold: 0.26, d: 0.08, dest: body });
    s.lfo(t, osc.frequency, 23, 9, 0.4, 'square');
    s.noise(t, { f: 1900, q: 6, vol: 0.12, a: 0.04, hold: 0.2, d: 0.1 });
    const latch = t + 0.43;
    s.noise(latch, { f: 1700, q: 3, vol: 0.9, a: 0.001, d: 0.014 });
    s.tone(latch, { f: 240, to: 180, vol: 0.4, a: 0.001, d: 0.05 });
    s.noise(latch + 0.07, { f: 2600, q: 3, vol: 0.5, a: 0.001, d: 0.01 });
    s.tone(latch + 0.07, { f: 160, vol: 0.3, a: 0.001, d: 0.045 });
  },

  // ---- money

  /** Buying a good in: the register — "cha", the drawer's "chunk", a small ding. */
  buy(s, t, p) {
    s.noise(t, { f: 3200, q: 2, vol: 0.7, a: 0.001, d: 0.03 });
    s.fm(t, { f: 1800 * p, ratio: 1.4, index: 1.5, vol: 0.12, a: 0.001, d: 0.03 });
    const chunk = t + 0.085;
    s.tone(chunk, { f: 260, to: 90, glide: 0.07, vol: 0.55, a: 0.001, d: 0.11 });
    s.noise(chunk, { type: 'lowpass', f: 1600, vol: 0.55, a: 0.001, d: 0.06 });
    s.noise(chunk + 0.004, { type: 'highpass', f: 3500, vol: 0.12, a: 0.001, d: 0.008 });
    s.bell(chunk + 0.02, 2093 * p, 0.32, 0.15, DING);
  },

  /** A coin. Coins that follow each other closely climb the scale, so a stream of them is a cascade. */
  coin(s, t, p) {
    memory.coinStep = t - memory.coinAt < 0.45 ? memory.coinStep + 1 : 0;
    memory.coinAt = t;
    // up six notes, then keep dancing between the top two
    const step = memory.coinStep < 6 ? memory.coinStep : 4 + (memory.coinStep % 2);
    coinPing(s, t, midi(84 + PENTA[step]) * p, 0.5);
  },

  /** A big sale: the drawer, a run of coins up the scale, a chord and a shimmer of small change. */
  coinBig(s, t, p) {
    s.tone(t, { f: 180, to: 80, glide: 0.08, vol: 0.5, a: 0.001, d: 0.1 });
    s.noise(t, { f: 2500, q: 1.5, vol: 0.5, a: 0.001, d: 0.03 });
    for (let i = 0; i < 8; i++) coinPing(s, t + 0.03 + i * 0.055, midi(84 + PENTA[i]) * p, 0.34, 0.8);
    const chord = t + 0.5;
    for (const [i, note] of [84, 88, 91, 96].entries()) s.bell(chord + i * 0.012, midi(note) * p, 0.8, 0.24, CHIME);
    const shimmer = s.bus(1);
    s.noise(chord - 0.1, { type: 'highpass', f: 6500, vol: 0.14, a: 0.08, hold: 0.3, d: 0.6, dest: shimmer });
    s.lfo(chord - 0.1, shimmer.gain, 17, 0.5, 1.1);
    twinkles(s, chord + 0.05, 0.5, 6, 0.1, p);
  },

  /** A haggle won: a quick brass run up to a held note. */
  haggleOk(s, t, p) {
    for (const [i, note] of [67, 72, 76].entries()) s.brass(t + i * 0.075, midi(note) * p, 0.05, 0.2);
    const top = t + 0.225;
    s.brass(top, midi(79) * p, 0.26, 0.24);
    s.brass(top, midi(72) * p, 0.26, 0.12);
    s.brass(top, midi(76) * p, 0.26, 0.12);
    s.noise(top, { f: 1800, q: 0.8, vol: 0.25, a: 0.001, d: 0.08 });
    s.tone(top, { f: midi(96) * p, vol: 0.1, a: 0.002, d: 0.3 });
  },

  /** A customer says no: a low, voice-like "uh-uh". */
  refuse(s, t, p) {
    const { ctx } = s;
    const mouth = ctx.createBiquadFilter();
    mouth.type = 'bandpass';
    mouth.frequency.value = 520;
    mouth.Q.value = 2.2;
    mouth.connect(s.out);
    s.tone(t, { f: 185 * p, to: 165 * p, type: s.voice(), vol: 1.2, a: 0.012, hold: 0.07, d: 0.05, dest: mouth });
    s.tone(t + 0.17, { f: 150 * p, to: 116 * p, type: s.voice(), vol: 1.2, a: 0.012, hold: 0.1, d: 0.08, dest: mouth });
    s.tone(t, { f: 92 * p, vol: 0.2, a: 0.01, hold: 0.07, d: 0.05 });
    s.tone(t + 0.17, { f: 75 * p, to: 58 * p, vol: 0.25, a: 0.01, hold: 0.1, d: 0.08 });
  },

  /** A customer storms out: a thump on the counter and an angry, shaking buzz. */
  angry(s, t, p) {
    s.tone(t, { f: 260, to: 60, glide: 0.1, vol: 0.6, a: 0.001, d: 0.16 });
    s.noise(t, { f: 1500, q: 0.8, vol: 0.8, a: 0.001, d: 0.09 });
    const shake = s.bus(0.7);
    s.lfo(t, shake.gain, 31, 0.3, 0.4, 'square');
    s.tone(t + 0.02, { f: 92 * p, type: 'sawtooth', lp: 2200, vol: 0.5, a: 0.005, hold: 0.2, d: 0.13, dest: shake });
    s.tone(t + 0.02, { f: 195 * p, to: 160 * p, type: 'square', lp: 1500, vol: 0.2, a: 0.005, hold: 0.2, d: 0.13, dest: shake });
    s.tone(t + 0.13, { f: 220, to: 60, glide: 0.1, vol: 0.4, a: 0.001, d: 0.12 });
  },

  // ---- the end of the day

  /** One printed line of the receipt: a tiny tick; alternate lines differ. */
  receipt(s, t, p) {
    memory.line += 1;
    const k = memory.line % 2 ? 1 : 1.12;
    s.noise(t, { type: 'highpass', f: 4500, vol: 0.3, a: 0.001, d: 0.012 });
    s.tone(t, { f: 1650 * k * p, type: 'square', lp: 6000, vol: 0.1, a: 0.001, d: 0.012 });
    s.tone(t, { f: 300 * k, vol: 0.2, a: 0.001, d: 0.012 });
  },

  /** The stamp on the total: a heavy thunk through paper onto wood. */
  stamp(s, t, p) {
    s.tone(t, { f: 240 * p, to: 55, glide: 0.09, vol: 0.6, a: 0.001, hold: 0.02, d: 0.18 });
    s.tone(t, { f: 480 * p, to: 190, glide: 0.05, type: 'triangle', vol: 0.5, a: 0.001, d: 0.07 });
    s.noise(t, { type: 'lowpass', f: 1200, vol: 0.9, a: 0.001, d: 0.09 });
    s.noise(t, { f: 1600, q: 1, vol: 0.9, a: 0.001, d: 0.035 });
    s.noise(t, { type: 'highpass', f: 4000, vol: 0.15, a: 0.001, d: 0.006 });
  },

  /** Rent: coins running down the scale, each duller than the last, into a drain. */
  rent(s, t, p) {
    for (const [i, step] of [5, 4, 3, 2, 1, 0].entries()) {
      coinPing(s, t + i * 0.075, midi(84 + PENTA[step]) * p, 0.42 - i * 0.045, 0.7);
    }
    s.tone(t, { f: 700 * p, to: 140 * p, glide: 0.55, type: 'triangle', vol: 0.12, a: 0.02, hold: 0.35, d: 0.2 });
    s.tone(t + 0.5, { f: 200, to: 90, glide: 0.1, vol: 0.4, a: 0.002, d: 0.13 });
    s.noise(t + 0.5, { type: 'lowpass', f: 500, vol: 0.3, a: 0.002, d: 0.08 });
  },

  /** The morning's news: a sheet whooshes in, slaps down, and a ding calls for attention. */
  event(s, t, p) {
    s.noise(t, { f: 350, to: 3200, glide: 0.17, q: 1.2, vol: 0.7, a: 0.04, hold: 0.08, d: 0.1 });
    const slap = t + 0.2;
    s.noise(slap, { type: 'lowpass', f: 1800, vol: 0.55, a: 0.001, d: 0.05 });
    s.tone(slap, { f: 140, to: 80, vol: 0.5, a: 0.001, d: 0.07 });
    s.bell(slap + 0.06, midi(88) * p, 0.6, 0.28, CHIME);
    s.bell(slap + 0.06, midi(81) * p, 0.45, 0.12, CHIME);
  },

  /** Equipping: a clasp clicks shut, then a shimmer runs up. */
  equip(s, t, p) {
    s.fm(t, { f: 2100 * p, ratio: 1.41, index: 3, vol: 0.28, a: 0.001, d: 0.035 });
    s.tone(t, { f: 190, to: 110, vol: 0.5, a: 0.001, d: 0.06 });
    s.noise(t, { f: 3000, q: 2, vol: 0.4, a: 0.001, d: 0.015 });
    for (const [i, note] of [84, 88, 91, 95, 98].entries()) {
      const at = t + 0.07 + i * 0.04;
      s.tone(at, { f: midi(note) * p, vol: 0.2, a: 0.003, d: 0.24 });
      s.tone(at, { f: midi(note + 12) * p, type: 'triangle', vol: 0.05, a: 0.003, d: 0.12 });
    }
    s.noise(t + 0.07, { type: 'highpass', f: 7000, vol: 0.06, a: 0.15, d: 0.25 });
  },

  // ---- the quest

  /** Down to the next floor: four steps descending under a falling rush of air. */
  stairs(s, t, p) {
    s.noise(t, { f: 1900, to: 320, glide: 0.5, q: 1.4, vol: 0.5, a: 0.05, hold: 0.3, d: 0.2 });
    for (const [i, f] of [210, 180, 150, 122].entries()) {
      const at = t + 0.03 + i * 0.1;
      s.tone(at, { f: f * 1.5 * p, to: f * 0.6 * p, glide: 0.05, vol: 0.5, a: 0.002, d: 0.075 });
      s.noise(at, { f: f * 4, q: 0.8, vol: 0.5, a: 0.002, d: 0.04 });
    }
  },

  /** Treasure: a pop, a bright run up a major chord, and sparkles. */
  found(s, t, p) {
    s.noise(t, { type: 'lowpass', f: 1500, vol: 0.4, a: 0.001, d: 0.03 });
    s.tone(t, { f: 300 * p, to: 700 * p, glide: 0.04, vol: 0.3, a: 0.001, d: 0.05 });
    for (const [i, note] of [84, 88, 91, 96].entries()) {
      const at = t + 0.05 + i * 0.055;
      s.tone(at, { f: midi(note) * p, vol: 0.26, a: 0.002, d: 0.36 });
      s.tone(at, { f: midi(note) * p, type: 'triangle', vol: 0.1, a: 0.002, d: 0.16 });
    }
    twinkles(s, t + 0.28, 0.45, 6, 0.08, p);
    s.noise(t + 0.2, { type: 'highpass', f: 8000, vol: 0.05, a: 0.1, hold: 0.2, d: 0.4 });
  },

  /** An enemy: a swoop up into two brass stabs a tritone wide, the second a half step higher. */
  encounter(s, t, p) {
    s.tone(t, { f: 110 * p, to: 330 * p, glide: 0.1, type: 'sawtooth', lp: 1400, vol: 0.2, a: 0.01, d: 0.1 });
    for (const [at, shift, dur] of [[0.1, 0, 0.09], [0.25, 1, 0.24]] as const) {
      for (const note of [64, 70, 76]) s.brass(t + at, midi(note + shift) * p, dur, 0.15);
      s.noise(t + at, { f: 2000, q: 0.8, vol: 0.3, a: 0.001, d: 0.06 });
      s.tone(t + at, { f: 180, to: 55, glide: 0.12, vol: 0.4, a: 0.001, d: 0.18 });
    }
  },

  /** A blow lands: a crack, a body of noise, and a sine dropping through the floor. */
  hit(s, t, p) {
    s.noise(t, { type: 'highpass', f: 4000, vol: 0.3, a: 0.001, d: 0.006 });
    s.noise(t, { f: 1500 * p, to: 500 * p, glide: 0.06, q: 0.7, vol: 1.8, a: 0.001, d: 0.07 });
    s.tone(t, { f: 340 * p, to: 70 * p, glide: 0.08, vol: 0.7, a: 0.001, d: 0.12 });
  },

  /** A heavy blow: the same, with a sub underneath, a distorted crunch and falling debris. */
  hitBig(s, t, p) {
    s.noise(t, { type: 'highpass', f: 3500, vol: 0.5, a: 0.001, d: 0.012 });
    s.noise(t, { type: 'lowpass', f: 3600 * p, to: 500, glide: 0.2, vol: 0.8, a: 0.001, hold: 0.03, d: 0.22, dest: s.crunch() });
    s.tone(t, { f: 160 * p, to: 36, glide: 0.2, vol: 0.6, a: 0.002, hold: 0.04, d: 0.28 });
    s.tone(t, { f: 420 * p, to: 100 * p, glide: 0.08, type: 'triangle', vol: 0.6, a: 0.001, d: 0.11 });
    for (const at of [0.13, 0.2, 0.29]) s.noise(t + at + rnd(0, 0.02), { f: rnd(600, 1300), q: 2, vol: 0.3, a: 0.002, d: 0.04 });
  },

  /** Healing: a chime climbing a major chord, soft-edged. */
  heal(s, t, p) {
    for (const [i, note] of [72, 76, 79, 84].entries()) {
      const at = t + i * 0.065;
      s.tone(at, { f: midi(note) * p, vol: 0.3, a: 0.012, d: 0.42 });
      s.tone(at, { f: midi(note + 12) * p, vol: 0.08, a: 0.012, d: 0.3 });
    }
    const pad = s.tone(t, { f: midi(72) * p, type: 'triangle', vol: 0.1, a: 0.08, hold: 0.25, d: 0.3 });
    s.lfo(t, pad.frequency, 5.5, 4, 0.65);
    s.noise(t + 0.1, { type: 'highpass', f: 7000, vol: 0.03, a: 0.1, hold: 0.1, d: 0.3 });
  },

  /** A buff: a chip arpeggio racing up two octaves, capped with a ping. */
  buff(s, t, p) {
    const notes = [60, 64, 67, 72, 76, 79, 84];
    const stepLen = 0.038;
    const lead = s.tone(t, { f: midi(notes[0]) * p, type: 'square', lp: 3500, vol: 0.2, a: 0.003, hold: stepLen * notes.length, d: 0.1 });
    const sub = s.tone(t, { f: midi(notes[0] - 12) * p, type: 'triangle', vol: 0.25, a: 0.003, hold: stepLen * notes.length, d: 0.1 });
    for (const [i, note] of notes.entries()) {
      lead.frequency.setValueAtTime(midi(note) * p, t + i * stepLen);
      sub.frequency.setValueAtTime(midi(note - 12) * p, t + i * stepLen);
    }
    const top = t + stepLen * notes.length;
    s.tone(top, { f: midi(96) * p, vol: 0.18, a: 0.002, d: 0.28 });
    s.noise(t, { type: 'highpass', f: 2000, to: 8000, vol: 0.06, a: 0.25, d: 0.08 });
  },

  /** A debuff: two saws slightly apart sliding down, growing unsteady. */
  debuff(s, t, p) {
    for (const cents of [-14, 14]) {
      const osc = s.tone(t, { f: 520 * p, to: 120 * p, glide: 0.38, type: 'sawtooth', lp: 1100, detune: cents, vol: 0.24, a: 0.01, hold: 0.28, d: 0.12 });
      s.lfo(t + 0.1, osc.frequency, 9, 14, 0.32);
    }
    s.tone(t + 0.3, { f: 95 * p, to: 60 * p, vol: 0.35, a: 0.01, d: 0.16 });
  },

  /** A status effect (poison, sleep, confusion …): a queasy wobble with bubbles. */
  status(s, t, p) {
    const a = s.tone(t, { f: 440 * p, to: 330 * p, glide: 0.45, type: 'triangle', vol: 0.4, a: 0.02, hold: 0.3, d: 0.15 });
    s.lfo(t, a.frequency, 12, 60 * p, 0.5);
    const b = s.tone(t, { f: 660 * p, to: 495 * p, glide: 0.45, vol: 0.14, a: 0.02, hold: 0.3, d: 0.15 });
    s.lfo(t, b.frequency, 12, -40 * p, 0.5);
    for (const at of [0.08, 0.2, 0.31]) s.tone(t + at, { f: 900 * p, to: 1400 * p, glide: 0.03, vol: 0.1, a: 0.002, d: 0.035 });
  },

  /** Running away: a rush of air and pattering feet. */
  run(s, t, p) {
    s.noise(t, { f: 450, to: 3800 * p, glide: 0.16, q: 1, vol: 0.8, a: 0.03, hold: 0.08, d: 0.12 });
    for (let i = 0; i < 4; i++) {
      const at = t + 0.02 + i * 0.05;
      s.noise(at, { type: 'lowpass', f: 700, vol: 0.4, a: 0.002, d: 0.025 });
      s.tone(at, { f: 150, to: 100, vol: 0.25, a: 0.002, d: 0.025 });
    }
    s.noise(t + 0.1, { type: 'highpass', f: 5000, vol: 0.06, a: 0.1, d: 0.15 });
  },

  /** A swing that meets nothing: thin air. */
  miss(s, t, p) {
    s.noise(t, { f: 3400 * p, to: 900 * p, glide: 0.13, q: 2, vol: 0.8, a: 0.015, hold: 0.03, d: 0.09 });
    s.tone(t, { f: 760 * p, to: 380 * p, glide: 0.12, vol: 0.08, a: 0.01, d: 0.1 });
  },

  // ---- jingles (C major; the music ducks under them)

  /** Battle won: brass up the chord, a breath, and the top note again, held. */
  win(s, t, p) {
    for (const [i, note] of [72, 76, 79].entries()) s.brass(t + i * 0.1, midi(note) * p, 0.07, 0.2);
    s.brass(t + 0.3, midi(84) * p, 0.24, 0.22);
    s.brass(t + 0.62, midi(79) * p, 0.07, 0.2);
    const last = t + 0.74;
    s.brass(last, midi(84) * p, 0.55, 0.24);
    s.brass(last, midi(76) * p, 0.55, 0.11);
    s.brass(last, midi(79) * p, 0.55, 0.11);
    for (const at of [0.3, 0.74]) {
      s.tone(t + at, { f: midi(48) * p, type: 'triangle', vol: 0.26, a: 0.005, hold: 0.15, d: 0.3 });
      s.tone(t + at, { f: 180, to: 60, glide: 0.08, vol: 0.3, a: 0.001, d: 0.16 });
    }
    s.noise(last, { type: 'highpass', f: 6000, vol: 0.14, a: 0.003, d: 0.7 });
    twinkles(s, last + 0.1, 0.4, 5, 0.07, p);
  },

  /** Battle lost: muted brass walking down the minor scale to a low note that wavers and fades. */
  lose(s, t, p) {
    for (const [i, note] of [67, 63, 62].entries()) {
      s.brass(t + i * 0.28, midi(note) * p, 0.2, 0.26, 0.7);
      s.tone(t + i * 0.28, { f: midi(note - 12) * p, type: 'triangle', vol: 0.14, a: 0.01, hold: 0.18, d: 0.12 });
    }
    const last = t + 0.84;
    s.brass(last, midi(60) * p, 0.6, 0.26, 0.65);
    const low = s.tone(last, { f: midi(48) * p, type: 'triangle', vol: 0.22, a: 0.02, hold: 0.5, d: 0.5 });
    s.lfo(last + 0.2, low.frequency, 5, 2.5, 0.9);
    s.tone(last, { f: midi(36) * p, vol: 0.12, a: 0.02, hold: 0.4, d: 0.5 });
    s.tone(last, { f: midi(79) * p, to: midi(72) * p, glide: 0.5, vol: 0.05, a: 0.05, hold: 0.3, d: 0.4 });
  },

  /** The deed is bought: a full fanfare — run up, I, IV, V, and a long final chord with drums, cymbal and sparkles. */
  fanfare(s, t, p) {
    const chord = (at: number, notes: number[], dur: number, vol: number): void => {
      for (const [i, note] of notes.entries()) s.brass(t + at, midi(note) * p, dur, i === notes.length - 1 ? vol : vol * 0.55);
    };
    const drum = (at: number, f: number, vol: number): void => {
      s.tone(t + at, { f: f * 2.4, to: f, glide: 0.06, vol: vol * 0.55, a: 0.001, d: 0.2 });
      s.noise(t + at, { type: 'lowpass', f: 700, vol: vol * 0.5, a: 0.001, d: 0.08 });
    };
    for (const [i, note] of [67, 72, 76, 79].entries()) s.brass(t + i * 0.09, midi(note) * p, 0.06, 0.2);
    chord(0.36, [76, 79, 84], 0.28, 0.22);
    drum(0.36, 65.4, 0.7);
    chord(0.78, [77, 81, 84], 0.12, 0.2);
    chord(0.96, [77, 81, 84], 0.08, 0.2);
    drum(0.78, 87.3, 0.5);
    chord(1.1, [79, 83, 86], 0.28, 0.22);
    drum(1.1, 98, 0.6);
    // a roll into the last chord
    for (let i = 0; i < 6; i++) drum(1.2 + i * 0.05, 65.4, 0.18 + i * 0.05);
    const last = 1.5;
    chord(last, [72, 79, 84, 88, 91], 1.0, 0.2);
    drum(last, 65.4, 0.9);
    s.tone(t + last, { f: midi(48) * p, type: 'triangle', vol: 0.26, a: 0.005, hold: 0.8, d: 0.5 });
    s.noise(t + last, { type: 'highpass', f: 5500, vol: 0.2, a: 0.004, d: 1.3 });
    for (const [i, note] of [96, 100, 103, 108].entries()) s.bell(t + last + 0.12 + i * 0.07, midi(note) * p, 0.6, 0.08, CHIME);
    twinkles(s, t + last + 0.3, 0.9, 10, 0.07, p);
  },
};

/**
 * The mix.
 * level: the gain of the sound. Not set by hand: each sound was rendered off line and its level
 *        adjusted until its measured loudness (A-weighted, loudest 50ms) met a target — from about
 *        -30dB for tap and receipt, around -21dB for the everyday sounds, up to -13dB / -12dB for
 *        coinBig and fanfare — with a cap on the peak for the very short ones. After changing a
 *        sound, look at its numbers on soundboard.html and bring the level back in line.
 * len:   how long it lasts, seconds.
 * vary:  random pitch drift per call (default ±3%; phrases and bells stay in tune).
 * duck:  the music steps back for this long while a jingle plays.
 */
interface Meta {
  level: number;
  len: number;
  vary?: number;
  duck?: number;
}
const META: Record<SfxName, Meta> = {
  tap: { level: 0.32, len: 0.08 },
  confirm: { level: 0.48, len: 0.4, vary: 0.01 },
  cancel: { level: 0.46, len: 0.16 },
  open: { level: 0.79, len: 0.18 },
  close: { level: 0.68, len: 0.18 },
  error: { level: 0.69, len: 0.26 },
  pick: { level: 0.52, len: 0.1 },
  drop: { level: 0.47, len: 0.18 },
  dropBad: { level: 0.85, len: 0.24 },
  rotate: { level: 0.96, len: 0.12 },
  shutterUp: { level: 0.73, len: 1.2 },
  shutterDown: { level: 1.13, len: 0.95 },
  step: { level: 0.52, len: 0.1 },
  voice: { level: 0.67, len: 0.07 },
  bell: { level: 0.31, len: 1.6, vary: 0.01 },
  door: { level: 0.96, len: 0.6 },
  buy: { level: 0.97, len: 0.45 },
  coin: { level: 0.53, len: 0.36, vary: 0.005 },
  coinBig: { level: 1.11, len: 1.5, vary: 0.005 },
  haggleOk: { level: 0.91, len: 0.65, vary: 0 },
  refuse: { level: 0.59, len: 0.38 },
  angry: { level: 1.11, len: 0.42 },
  receipt: { level: 0.51, len: 0.03 },
  stamp: { level: 1.01, len: 0.25 },
  rent: { level: 0.61, len: 0.75, vary: 0.005 },
  event: { level: 0.66, len: 0.9, vary: 0.01 },
  equip: { level: 0.69, len: 0.5, vary: 0.01 },
  stairs: { level: 0.71, len: 0.6 },
  found: { level: 0.83, len: 1.0, vary: 0.01 },
  encounter: { level: 1.59, len: 0.65, vary: 0 },
  hit: { level: 0.62, len: 0.14 },
  hitBig: { level: 0.81, len: 0.4 },
  heal: { level: 0.68, len: 0.7, vary: 0.01 },
  buff: { level: 0.58, len: 0.6, vary: 0.01 },
  debuff: { level: 0.94, len: 0.5 },
  status: { level: 0.64, len: 0.5 },
  run: { level: 0.56, len: 0.3 },
  miss: { level: 0.41, len: 0.16 },
  win: { level: 1.3, len: 1.6, vary: 0, duck: 1.5 },
  lose: { level: 1.6, len: 2.0, vary: 0, duck: 1.9 },
  fanfare: { level: 1.67, len: 3.0, vary: 0, duck: 2.9 },
};

/** Recorded layers under the synthesized battle sounds: [sample, gain]. */
const LAYERS: Partial<Record<SfxName, readonly [string, number]>> = {
  hit: ['hit', 0.6],
  hitBig: ['hitBig', 0.8],
  heal: ['heal', 0.6],
  buff: ['buff', 0.6],
  debuff: ['debuff', 0.7],
  status: ['debuff', 0.4],
};
/** Recorded jingles that can stand in for the synthesized phrases (audioTuning.assetJingles). */
const JINGLES: Partial<Record<SfxName, string>> = { win: 'win', lose: 'lose' };
/** Sounds that say "the quest has begun": the recorded battle layers are fetched then, ahead of the first blow. */
const QUEST_SOUNDS: ReadonlySet<SfxName> = new Set(['stairs', 'found', 'encounter', 'hit', 'hitBig', 'heal', 'buff', 'debuff', 'status', 'run', 'miss']);
const QUEST_TRACKS: ReadonlySet<BgmName> = new Set(['dungeon', 'battle', 'boss']);

/**
 * Recommended `pitch` for `voice`, by a customer's temper (0 friendly · 1 ordinary · 2 stubborn):
 *   audio.sfx('voice', { pitch: VOICE_PITCH[visitor.temper] })
 * Anything from 0.6 (a growl) to 1.6 (a chirp) sounds like speech; multiply by a small per-person
 * factor (±8%) if two customers of one temper should not sound alike.
 */
export const VOICE_PITCH = [1.25, 1, 0.75] as const;

export const SFX_NAMES = Object.keys(META) as SfxName[];
export const BGM_NAMES = Object.keys(ASSETS.bgm) as BgmName[];

// ---------------------------------------------------------------- the engine

interface Chain {
  master: GainNode;
  se: GainNode;
  bgm: GainNode;
  duck: GainNode;
}

/**
 * The compressor adds its own make-up gain (measured: ×1.52 with these settings); `trim` takes most of
 * it back. What is left: quiet sounds pass at about ×1.3, a full-scale input comes out near 0.66, and
 * twice full scale near 0.77 — where the soft clip takes over.
 */
const COMP_TRIM = 0.85;

/** Straight up to 0.7, then bending over: the output never passes 0.93 however much goes in. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2049;
  const curve = new Float32Array(n);
  const knee = 0.7;
  const room = 0.29;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= knee ? a : knee + room * Math.tanh((a - knee) / room));
  }
  return curve;
}

/** Builds the buses and the master chain on a live or an offline context. */
function buildChain(ctx: BaseAudioContext): Chain {
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 10;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.16;
  const trim = ctx.createGain();
  trim.gain.value = COMP_TRIM;
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  master.connect(comp);
  comp.connect(trim);
  trim.connect(clip);
  clip.connect(ctx.destination);

  const se = ctx.createGain();
  se.gain.value = taper(stored.se);
  se.connect(master);
  const duck = ctx.createGain();
  duck.connect(master);
  const bgm = ctx.createGain();
  bgm.gain.value = taper(stored.bgm);
  bgm.connect(duck);
  return { master, se, bgm, duck };
}

/** One of the two music players. Two, so that one can fade out while the other fades in. */
interface Deck {
  el: HTMLAudioElement;
  gain: GainNode;
  track: BgmName | null;
  /** idle: empty · loading: asked to play · playing · blocked: the browser wants a gesture first · failed: no such file / no network */
  state: 'idle' | 'loading' | 'playing' | 'blocked' | 'failed';
  /** goes up whenever the deck is given something else to do; late callbacks compare it and step aside */
  job: number;
  /** played once inside a gesture (phones then let it play later without one) */
  blessed: boolean;
  /** in the middle of jumping back to the start */
  looping: boolean;
}

interface Engine {
  ctx: AudioContext;
  chain: Chain;
  synth: Synth;
  decks: Deck[];
  /** the deck that carries the wanted track */
  live: Deck | null;
  /** the deck still playing the previous track until the new one has started */
  leaving: Deck | null;
  samples: Map<string, AudioBuffer | null>;
}

let engine: Engine | null = null;
/** When the context was last asked to wake (performance.now()). It takes a few ms to actually run. */
let wokenAt = -1e9;
/** The music the game has asked for (kept from before `unlock`, too). */
let wanted: BgmName | null = null;
const lastPlayed = new Map<SfxName, number>();

/** Stops whatever is scheduled on a parameter and pins it where it is now. */
function pin(param: AudioParam, t: number): number {
  const v = param.value;
  param.cancelScheduledValues(t);
  param.setValueAtTime(v, t);
  return v;
}

/** An equal-power fade (sine up, cosine down), drawn with a few straight segments. */
function fade(ctx: BaseAudioContext, param: AudioParam, to: number, dur: number): void {
  const t = ctx.currentTime;
  const from = pin(param, t);
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const x = (i / steps) * (Math.PI / 2);
    const v = to >= from ? from + (to - from) * Math.sin(x) : to + (from - to) * Math.cos(x);
    param.linearRampToValueAtTime(v, t + (dur * i) / steps);
  }
}

/** A sliver of silence as a WAV file: something to play inside the gesture so the phone trusts the player. */
function silentClip(): string {
  const bytes = new Uint8Array(44 + 64);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + 64, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, 64, true);
  bytes.fill(128, 44); // 8-bit silence
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}

function makeDeck(e: Pick<Engine, 'ctx' | 'chain'>): Deck {
  const el = new Audio();
  el.preload = 'none';
  el.loop = false; // looping is done by hand: the files end in silence, which a plain loop would play
  const gain = e.ctx.createGain();
  gain.gain.value = 0;
  e.ctx.createMediaElementSource(el).connect(gain);
  gain.connect(e.chain.bgm);
  const deck: Deck = { el, gain, track: null, state: 'idle', job: 0, blessed: false, looping: false };
  el.addEventListener('playing', () => guard(() => onDeckPlaying(deck)));
  el.addEventListener('ended', () => guard(() => restartDeck(deck)));
  el.addEventListener('error', () => {
    if (deck.track) deck.state = 'failed';
  });
  return deck;
}

/** Runs something that must never throw into the game. */
function guard(fn: () => void): void {
  try {
    fn();
  } catch {
    // sound is never worth breaking the game for
  }
}

/** Empties a deck at once (no fade). */
function stopDeck(e: Engine, deck: Deck): void {
  deck.job += 1;
  deck.track = null;
  deck.state = 'idle';
  deck.looping = false;
  pin(deck.gain.gain, e.ctx.currentTime);
  deck.gain.gain.setValueAtTime(0, e.ctx.currentTime);
  deck.el.pause();
  deck.el.removeAttribute('src');
  deck.el.load(); // drops the download
}

/** Fades a deck out, then empties it. */
function fadeOutDeck(e: Engine, deck: Deck): void {
  const job = ++deck.job;
  fade(e.ctx, deck.gain.gain, 0, CROSSFADE);
  setTimeout(() => guard(() => {
    if (deck.job === job) stopDeck(e, deck);
  }), CROSSFADE * 1000 + 60);
}

function play(deck: Deck): void {
  const job = deck.job;
  const promise = deck.el.play();
  if (!promise) return;
  promise.then(
    () => {
      deck.blessed = true;
    },
    (err: unknown) => {
      if (deck.job !== job || !deck.track) return;
      // NotAllowedError: no gesture yet — the next one tries again. AbortError: the track changed meanwhile.
      const name = (err as { name?: string } | null)?.name;
      if (name === 'NotAllowedError') deck.state = 'blocked';
      else if (name !== 'AbortError') deck.state = 'failed';
    },
  );
}

/** Puts a track on a deck, silent; it fades in when the stream has actually started (`onDeckPlaying`). */
function startDeck(e: Engine, deck: Deck, track: BgmName): void {
  deck.job += 1;
  deck.track = track;
  deck.state = 'loading';
  deck.looping = false;
  pin(deck.gain.gain, e.ctx.currentTime);
  deck.gain.gain.setValueAtTime(0, e.ctx.currentTime);
  deck.el.src = ASSETS.bgm[track].url;
  play(deck);
}

function onDeckPlaying(deck: Deck): void {
  const e = engine;
  if (!e || !deck.track || deck.state === 'playing') return;
  if (deck !== e.live) return;
  deck.state = 'playing';
  fade(e.ctx, deck.gain.gain, ASSETS.bgm[deck.track].gain, CROSSFADE);
  releaseLeaving(e);
}

/** The previous track's deck starts its fade (together with the new track's fade-in: a crossfade). */
function releaseLeaving(e: Engine): void {
  const deck = e.leaving;
  e.leaving = null;
  if (deck && deck.track) fadeOutDeck(e, deck);
}

/** Makes the decks play what the game wants. */
function syncBgm(e: Engine): void {
  const cur = e.live;
  if (cur && cur.track === wanted) return;
  if (e.leaving) {
    // a switch in the middle of a switch: the oldest track goes at once
    stopDeck(e, e.leaving);
    e.leaving = null;
  }
  if (!wanted) {
    if (cur) {
      if (cur.state === 'playing') fadeOutDeck(e, cur);
      else stopDeck(e, cur);
    }
    e.live = null;
    return;
  }
  const deck = e.decks.find((d) => d !== cur) ?? e.decks[0];
  if (deck.track) stopDeck(e, deck);
  if (cur) {
    if (cur.state === 'playing') {
      // keep the old track until the new one sounds, but not for ever on a slow line
      e.leaving = cur;
      setTimeout(() => guard(() => {
        if (e.leaving === cur) releaseLeaving(e);
      }), 1500);
    } else {
      stopDeck(e, cur);
    }
  }
  e.live = deck;
  startDeck(e, deck, wanted);
  if (QUEST_TRACKS.has(wanted)) warmQuest(e);
}

/** Jumps back to the start of the track (the file's leading silence skipped). */
function restartDeck(deck: Deck): void {
  if (!deck.track) return;
  deck.el.currentTime = ASSETS.bgm[deck.track].head;
  if (deck.state === 'playing' && deck.el.paused && !isHidden()) play(deck);
}

/** Watches the live track and loops it just before the silence at its end. */
function watchLoop(e: Engine): void {
  const deck = e.live;
  if (!deck || !deck.track || deck.state !== 'playing' || deck.looping) return;
  const { tail } = ASSETS.bgm[deck.track];
  const { duration, currentTime } = deck.el;
  if (!Number.isFinite(duration) || duration <= 0 || currentTime < duration - tail - 0.06) return;
  // a 40ms dip hides the jump
  deck.looping = true;
  const job = deck.job;
  const level = ASSETS.bgm[deck.track].gain;
  const t = e.ctx.currentTime;
  pin(deck.gain.gain, t);
  deck.gain.gain.setTargetAtTime(0, t, 0.01);
  setTimeout(() => guard(() => {
    if (deck.job !== job) return;
    deck.looping = false;
    restartDeck(deck);
    const now = e.ctx.currentTime;
    pin(deck.gain.gain, now);
    deck.gain.gain.linearRampToValueAtTime(level, now + 0.04);
  }), 45);
}

const isHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** The tab went away / came back: music and context rest while nobody is listening. */
function onVisibility(): void {
  const e = engine;
  if (!e) return;
  const { ctx } = e;
  if (isHidden()) {
    pin(e.chain.duck.gain, ctx.currentTime);
    e.chain.duck.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
    setTimeout(() => guard(() => {
      if (!isHidden()) return;
      for (const deck of e.decks) deck.el.pause();
      void ctx.suspend().catch(() => {});
    }), 160);
  } else {
    void ctx.resume().catch(() => {});
    for (const deck of e.decks) if (deck.track && (deck.state === 'playing' || deck.state === 'loading')) play(deck);
    pin(e.chain.duck.gain, ctx.currentTime);
    e.chain.duck.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.4);
  }
}

/** The music steps back under a jingle and returns after it. */
function duckMusic(e: Engine, t: number, dur: number): void {
  const g = e.chain.duck.gain;
  pin(g, e.ctx.currentTime);
  g.setTargetAtTime(0.25, t, 0.04);
  g.setTargetAtTime(1, t + dur, 0.25);
}

// ---- recorded samples (small files, fetched in the background, decoded once)

function decode(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    // the callback form works everywhere; newer browsers also return a promise
    const promise = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
    promise?.catch(reject);
  });
}

function loadSample(e: Engine, key: string): void {
  const asset = ASSETS.se[key];
  if (!asset || e.samples.has(key)) return;
  e.samples.set(key, null);
  fetch(asset.url)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
    .then((data) => decode(e.ctx, data))
    .then((buffer) => e.samples.set(key, buffer))
    .catch(() => {
      // stays null: the synthesized sound plays alone
    });
}

function warmQuest(e: Engine): void {
  if (audioTuning.battleLayers) for (const layer of Object.values(LAYERS)) loadSample(e, layer[0]);
  if (audioTuning.assetJingles) for (const key of Object.values(JINGLES)) loadSample(e, key);
}

/** Plays a loaded sample; false when it is not there (yet). */
function playSample(e: Engine, key: string, t: number, rate: number, vol: number): boolean {
  const buffer = e.samples.get(key);
  if (!buffer) return false;
  const src = e.ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = e.ctx.createGain();
  const level = vol * ASSETS.se[key].gain;
  const end = t + buffer.duration / rate;
  // a short fade at both ends: some of the files start or stop abruptly
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.004);
  g.gain.setValueAtTime(level, Math.max(t + 0.005, end - 0.06));
  g.gain.linearRampToValueAtTime(0, end);
  src.connect(g);
  g.connect(e.chain.se);
  src.start(t);
  return true;
}

// ---- starting up

function createEngine(): Engine | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor({ latencyHint: 'interactive' });
  const chain = buildChain(ctx);
  const e: Engine = { ctx, chain, synth: new Synth(ctx, chain.se), decks: [], live: null, leaving: null, samples: new Map() };
  try {
    e.decks = [makeDeck(e), makeDeck(e)];
  } catch {
    e.decks = []; // no music on this browser; the effects still work
  }
  document.addEventListener('visibilitychange', () => guard(onVisibility));
  setInterval(() => guard(() => watchLoop(e)), 100);
  return e;
}

/** Inside a gesture: wake the context and let the phone see every player play once. */
function wake(e: Engine): void {
  const { ctx } = e;
  if (ctx.state !== 'running' && !isHidden()) {
    // only a real gesture will wake it; a call from anywhere else must not open the door for queued sounds
    if (navigator.userActivation?.isActive ?? true) wokenAt = performance.now();
    void ctx.resume().catch(() => {});
    // a one-sample buffer: older phones only open the output when something is actually played
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start();
  }
  if (e.decks.length === 0) return;
  if (e.live?.state === 'blocked') {
    e.live.state = 'loading';
    play(e.live);
  }
  syncBgm(e);
  for (const deck of e.decks) {
    if (deck.blessed || deck.track) continue;
    const job = deck.job;
    deck.el.src = silentClip();
    deck.el.play().then(
      () => {
        deck.blessed = true;
        if (deck.job === job && !deck.track) deck.el.pause();
      },
      () => {},
    );
  }
}

export const audio = {
  /** Call on the first pointer / key event: browsers allow sound only after a gesture. Safe to call often. */
  unlock(): void {
    try {
      if (typeof window === 'undefined') return;
      // called before any gesture (at start-up, say): too early — the browser would refuse and complain
      if (!engine && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      engine ??= createEngine();
      if (engine) wake(engine);
    } catch {
      // no sound on this device
    }
  },

  /** Plays a sound effect. Never throws; silent until unlocked. */
  sfx(name: SfxName, opts?: SfxOptions): void {
    try {
      const e = engine;
      const meta = META[name];
      if (!e || !meta || isHidden()) return;
      // A sleeping context would pile sounds up and play them all at once on waking. The exception is
      // the moment right after `unlock`: the tap that woke it should still be heard.
      if (e.ctx.state !== 'running' && performance.now() - wokenAt > 1000) return;
      const volume = clamp01(opts?.volume ?? 1);
      if (volume <= 0 || stored.se <= 0) return;
      const t = e.ctx.currentTime + 0.003 + Math.max(0, Number(opts?.delay) || 0);
      // the same sound twice within 25ms is one sound (and twice as loud): drop the second
      const last = lastPlayed.get(name);
      if (last !== undefined && Math.abs(t - last) < 0.025) return;
      lastPlayed.set(name, t);

      const pitch = Math.min(4, Math.max(0.25, Number(opts?.pitch) || 1));
      if (QUEST_SOUNDS.has(name)) warmQuest(e);
      if (meta.duck) duckMusic(e, t, meta.duck);

      const jingle = JINGLES[name];
      if (jingle && audioTuning.assetJingles) {
        loadSample(e, jingle);
        if (playSample(e, jingle, t, pitch, volume)) return;
      }

      const out = e.ctx.createGain();
      out.gain.value = meta.level * volume;
      out.connect(e.chain.se);
      e.synth.out = out;
      SOUNDS[name](e.synth, t, pitch * (1 + rnd(-1, 1) * (meta.vary ?? 0.03)));

      const layer = LAYERS[name];
      if (layer && audioTuning.battleLayers) playSample(e, layer[0], t, pitch, layer[1] * volume);
    } catch {
      // never into the game
    }
  },

  /** Switches the music with a 600ms crossfade. Null fades to silence. The same track again is a no-op. */
  bgm(track: BgmName | null): void {
    try {
      wanted = track && ASSETS.bgm[track] ? track : null;
      const e = engine;
      if (!e || e.decks.length === 0) return;
      if (e.live && e.live.state === 'failed') {
        // asking again is the moment to try again (the network may be back)
        stopDeck(e, e.live);
        e.live = null;
      }
      syncBgm(e);
    } catch {
      // never into the game
    }
  },

  /** Current volumes (kept in localStorage). */
  get settings(): AudioSettings {
    return { bgm: stored.bgm, se: stored.se };
  },

  setVolume(kind: 'bgm' | 'se', value: number): void {
    try {
      if (kind !== 'bgm' && kind !== 'se') return;
      stored[kind] = clamp01(value);
      saveStored();
      if (engine) engine.chain[kind].gain.setTargetAtTime(taper(stored[kind]), engine.ctx.currentTime, 0.02);
    } catch {
      // never into the game
    }
  },
};

/**
 * Renders one sound effect through the same master chain, off line (for soundboard.html and for checks).
 * Synthesis only: the recorded layers are left out.
 */
export async function renderSfx(name: SfxName, opts?: SfxOptions): Promise<AudioBuffer> {
  const rate = 44100;
  // The compressor fades its gain in over the first moments of a context, so the sound starts after
  // a silent lead-in (cut off again below); otherwise short sounds would measure far too quiet.
  const lead = 0.4;
  const delay = Math.max(0, opts?.delay ?? 0);
  const ctx = new OfflineAudioContext(1, Math.ceil(rate * (lead + META[name].len + delay + 0.25)), rate);
  const chain = buildChain(ctx);
  const out = ctx.createGain();
  out.gain.value = META[name].level * clamp01(opts?.volume ?? 1);
  out.connect(chain.se);
  const keep = { ...memory };
  Object.assign(memory, { coinStep: 0, coinAt: -9, foot: false, line: 0 });
  SOUNDS[name](new Synth(ctx, out), lead + 0.005 + delay, opts?.pitch ?? 1);
  Object.assign(memory, keep);
  const full = await ctx.startRendering();
  const skip = Math.floor(lead * rate);
  const cut = ctx.createBuffer(1, full.length - skip, rate);
  cut.getChannelData(0).set(full.getChannelData(0).subarray(skip));
  return cut;
}

/** What the engine is doing right now (for soundboard.html and for debugging; the game does not need it). */
export function audioStatus(): { context: string; wanted: BgmName | null; playing: BgmName | null; deck: string } {
  const live = engine?.live ?? null;
  return {
    context: engine ? engine.ctx.state : 'locked',
    wanted,
    playing: live && live.state === 'playing' ? live.track : null,
    deck: live ? live.state : 'idle',
  };
}

// ---------------------------------------------------------------- vibration

const PATTERNS = { light: 8, medium: 18, heavy: [30, 40, 30], double: [12, 60, 12] } as const;

/** Vibration on phones that have it (docs/UI_DIRECTION.md §6). Off when the setting is off. */
export function haptic(strength: 'light' | 'medium' | 'heavy' | 'double'): void {
  try {
    if (!stored.haptic || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    // browsers refuse (and log) vibration before the first gesture
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    const pattern = PATTERNS[strength];
    if (pattern !== undefined) navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    // no vibration here
  }
}
export const hapticSettings = {
  get enabled(): boolean {
    return stored.haptic;
  },
  set(on: boolean): void {
    stored.haptic = Boolean(on);
    saveStored();
  },
};

// ---------------------------------------------------------------- gestures
// The screens call `unlock` themselves; these listeners are the safety net. Phones count only the end
// of a touch (not `pointerdown`) as a gesture, and a context that the system interrupted (a call,
// another app) needs a fresh one to wake again.
if (typeof window !== 'undefined') {
  for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) {
    window.addEventListener(type, () => audio.unlock(), { capture: true, passive: true });
  }
}
