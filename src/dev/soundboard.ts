/**
 * Dev-only page for auditioning every sound (soundboard.html; `vite build` builds index.html only).
 * Everything goes through the same API the screens use.
 */
import { audio, audioStatus, audioTuning, BGM_NAMES, haptic, hapticSettings, renderSfx, SFX_NAMES, VOICE_PITCH, type BgmName, type SfxName } from '../ui/audio';

/** When each sound plays (docs/UI_DIRECTION.md §6). */
const SFX_NOTES: Record<SfxName, string> = {
  tap: 'ボタンを押す',
  confirm: '決定（主ボタン）',
  cancel: '取り消し・閉じる',
  open: '窓が開く',
  close: '窓が閉じる',
  error: 'できない操作',
  pick: '品をつまむ',
  drop: '品を置く',
  dropBad: '品を置けない',
  rotate: '回転',
  shutterUp: '開店（シャッター）',
  shutterDown: '閉店（シャッター）',
  step: '客の足音（1 歩）',
  voice: 'せりふ（1 文字）',
  bell: 'ベル',
  door: 'ドア',
  buy: '買い取り',
  coin: '売れた（コイン）',
  coinBig: '大きく売れた',
  haggleOk: '値切り成功',
  refuse: '断られた',
  angry: '怒って帰る',
  receipt: 'レシート（1 行）',
  stamp: 'スタンプ',
  rent: '家賃を払う',
  event: '本日のイベント',
  equip: '装備',
  stairs: '階を進む',
  found: '品を拾う',
  encounter: '敵と遭遇',
  hit: '攻撃が当たる',
  hitBig: '大きな一撃',
  heal: '回復',
  buff: 'バフ',
  debuff: 'デバフ',
  status: '状態異常',
  run: '逃げる',
  miss: '空振り・逃げそこね',
  win: '勝利',
  lose: '敗北',
  fanfare: '権利書を買う',
};

const BGM_NOTES: Record<BgmName, string> = {
  title: 'タイトル',
  day: '営業中',
  night: '閉店後の店',
  shop: '夜のショップ',
  dungeon: 'クエスト',
  battle: '戦闘',
  boss: 'ボス戦',
  ending: 'エンディング',
};

/** Speech pitch per temper (VOICE_PITCH), and the two ends of the usable range. */
const TEMPERS: Array<[label: string, pitch: number]> = [
  [`気さく ${VOICE_PITCH[0]}`, VOICE_PITCH[0]],
  [`ふつう ${VOICE_PITCH[1]}`, VOICE_PITCH[1]],
  [`頑固 ${VOICE_PITCH[2]}`, VOICE_PITCH[2]],
  ['いちばん低い 0.6', 0.6],
  ['いちばん高い 1.6', 1.6],
];

const app = document.getElementById('app')!;
const stateLine = document.getElementById('state')!;
let pitch = 1;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, children: Array<Node | string> = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function section(title: string, note?: string): HTMLElement {
  app.append(el('h2', { textContent: title }));
  if (note) app.append(el('p', { textContent: note }));
  const box = el('div');
  app.append(box);
  return box;
}

function slider(label: string, min: number, max: number, step: number, value: number, onInput: (v: number) => void): HTMLElement {
  const out = el('output', { textContent: value.toFixed(2) });
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  input.dataset.test = 'slider';
  input.addEventListener('input', () => {
    out.textContent = Number(input.value).toFixed(2);
    onInput(Number(input.value));
  });
  return el('label', { className: 'row' }, [el('span', { textContent: label }), input, out]);
}

function check(label: string, value: boolean, onChange: (on: boolean) => void): HTMLElement {
  const input = el('input', { type: 'checkbox', checked: value });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'check' }, [input, label]);
}

// ---------------------------------------------------------------- settings
{
  const box = section('音量と設定', '音量と振動は、ゲームと同じ場所（localStorage）に保存されます。');
  const panel = el('div', { className: 'panel' });
  const { bgm, se } = audio.settings;
  panel.append(
    slider('BGM', 0, 1, 0.01, bgm, (v) => audio.setVolume('bgm', v)),
    slider('SE', 0, 1, 0.01, se, (v) => audio.setVolume('se', v)),
    slider('ピッチ', 0.5, 2, 0.01, 1, (v) => (pitch = v)),
    check('振動（対応端末のみ）', hapticSettings.enabled, (on) => hapticSettings.set(on)),
    check('戦闘の音に素材の音を重ねる（hit / hitBig / heal / buff / debuff / status）', audioTuning.battleLayers, (on) => (audioTuning.battleLayers = on)),
    check('勝利・敗北を素材のジングルにする（オフ＝合成のフレーズ）', audioTuning.assetJingles, (on) => (audioTuning.assetJingles = on)),
  );
  box.append(panel);
}

// ---------------------------------------------------------------- music
{
  const box = section('BGM', '押すと 600ms でつながります。もう一度同じ曲を押しても何も起きません。');
  const grid = el('div', { className: 'grid' });
  const buttons = new Map<BgmName | null, HTMLButtonElement>();
  const select = (track: BgmName | null): void => {
    audio.unlock();
    audio.bgm(track);
    for (const [name, button] of buttons) button.classList.toggle('on', name === track && track !== null);
  };
  for (const name of BGM_NAMES) {
    const button = el('button', {}, [el('b', { textContent: name }), el('small', { textContent: BGM_NOTES[name] })]);
    button.dataset.bgm = name;
    button.addEventListener('click', () => select(name));
    buttons.set(name, button);
    grid.append(button);
  }
  const stop = el('button', {}, [el('b', { textContent: '停止' }), el('small', { textContent: 'audio.bgm(null)' })]);
  stop.dataset.bgm = 'stop';
  stop.addEventListener('click', () => select(null));
  buttons.set(null, stop);
  grid.append(stop);
  box.append(grid);
}

// ---------------------------------------------------------------- streams (sounds that come in runs)
{
  const box = section('連続で鳴らす', 'せりふ・コイン・レシートは、続けて鳴ったときの聞こえかたが大事です。');
  const grid = el('div', { className: 'grid' });
  const run = (label: string, note: string, fn: () => void): void => {
    const button = el('button', {}, [el('b', { textContent: label }), el('small', { textContent: note })]);
    button.dataset.stream = label;
    button.addEventListener('click', () => {
      audio.unlock();
      fn();
    });
    grid.append(button);
  };
  for (const [label, temper] of TEMPERS) {
    run(`せりふ ${label}`, '24 文字・1 秒に 15 文字', () => {
      for (let i = 0; i < 24; i++) audio.sfx('voice', { pitch: temper * pitch, delay: i / 15 });
    });
  }
  run('コイン ×12', '70ms おき（音階をのぼる）', () => {
    for (let i = 0; i < 12; i++) audio.sfx('coin', { pitch, delay: i * 0.07 });
  });
  run('レシート ×8', '90ms おき → スタンプ', () => {
    for (let i = 0; i < 8; i++) audio.sfx('receipt', { pitch, delay: i * 0.09 });
    audio.sfx('stamp', { pitch, delay: 0.95 });
  });
  run('足音 ×4', '客が入ってくる', () => {
    for (let i = 0; i < 4; i++) audio.sfx('step', { pitch, delay: i * 0.22 });
  });
  run('数字が回る', 'tap を高さを変えて 16 回', () => {
    for (let i = 0; i < 16; i++) audio.sfx('tap', { volume: 0.5, pitch: 1.5 + (i / 16) * 0.9, delay: i * 0.04 });
  });
  run('全部いっぺんに', '重ねても音が割れないことの確認', () => {
    for (const name of ['coinBig', 'fanfare', 'hitBig', 'shutterDown', 'stamp', 'bell'] as const) audio.sfx(name);
  });
  run('振動：軽', 'haptic("light")', () => haptic('light'));
  run('振動：中', 'haptic("medium")', () => haptic('medium'));
  run('振動：強', 'haptic("heavy")', () => haptic('heavy'));
  run('振動：2 回', 'haptic("double")', () => haptic('double'));
  box.append(grid);
}

// ---------------------------------------------------------------- every sound effect
{
  const box = section('効果音', '波形は合成した音だけを描いています（素材の重ね音は含みません）。');
  const grid = el('div', { className: 'grid' });
  const pending: Array<() => Promise<void>> = [];
  for (const name of SFX_NAMES) {
    const canvas = el('canvas', { width: 160, height: 26 });
    const info = el('i', { textContent: ' ' });
    const button = el('button', {}, [el('b', { textContent: name }), el('small', { textContent: SFX_NOTES[name] }), canvas, info]);
    button.dataset.sfx = name;
    button.addEventListener('click', () => {
      audio.unlock();
      audio.sfx(name, { pitch });
    });
    grid.append(button);
    pending.push(async () => {
      const data = (await renderSfx(name)).getChannelData(0);
      const stats = measure(data, 44100);
      info.textContent = `${stats.seconds.toFixed(2)}s  peak ${stats.peak.toFixed(2)}  rms ${stats.rms.toFixed(3)}`;
      // show the sounding part only (at least a quarter of a second, so short sounds stay comparable)
      draw(canvas, data.subarray(0, Math.ceil(Math.max(0.25, stats.seconds + 0.02) * 44100)));
    });
  }
  box.append(grid);
  // draw the waveforms one by one, without holding up the page
  void (async () => {
    for (const job of pending) {
      try {
        await job();
      } catch {
        // no offline rendering on this browser: the buttons still work
      }
    }
  })();
}

/** Peak, loudness of the sounding part, and the time until the sound has died away (-60dB). */
function measure(data: Float32Array, rate: number): { peak: number; rms: number; seconds: number } {
  let peak = 0;
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
    if (a > 0.001) last = i;
  }
  let sum = 0;
  for (let i = 0; i <= last; i++) sum += data[i] * data[i];
  return { peak, rms: Math.sqrt(sum / Math.max(1, last)), seconds: last / rate };
}

function draw(canvas: HTMLCanvasElement, data: Float32Array): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const { width, height } = canvas;
  const per = data.length / width;
  g.fillStyle = '#ffd21f';
  for (let x = 0; x < width; x++) {
    let peak = 0;
    for (let i = Math.floor(x * per); i < (x + 1) * per; i++) peak = Math.max(peak, Math.abs(data[i] ?? 0));
    const h = Math.max(1, Math.round(Math.min(1, peak) * height));
    g.fillRect(x, Math.round((height - h) / 2), 1, h);
  }
}

// ---------------------------------------------------------------- status line, hooks for automated checks
const DECK_NOTES: Record<string, string> = {
  idle: '',
  loading: '読みこみ中…',
  playing: '再生中',
  blocked: 'ブラウザが止めています（もう一度タップ）',
  failed: '読みこめませんでした',
};
setInterval(() => {
  const st = audioStatus();
  if (st.context === 'locked') return;
  const music = st.wanted ? `BGM：${st.wanted} ${DECK_NOTES[st.deck] ?? st.deck}` : 'BGM：なし';
  stateLine.textContent = `音：${st.context === 'running' ? '有効' : `停止中（${st.context}）`} ／ ${music}`;
}, 250);

declare global {
  interface Window {
    __soundboard?: { audio: typeof audio; audioStatus: typeof audioStatus; haptic: typeof haptic; renderSfx: typeof renderSfx; names: SfxName[] };
  }
}
window.__soundboard = { audio, audioStatus, haptic, renderSfx, names: SFX_NAMES };
