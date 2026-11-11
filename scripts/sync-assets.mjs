#!/usr/bin/env node
// Builds the game catalog from the My Crypto Heroes asset database
// (https://github.com/bearko/mycryptoheroes) and copies only the files the game uses.
//
//   node scripts/sync-assets.mjs
//
// Source directory: $MCH_ASSETS_DIR, else vendor/mycryptoheroes (git submodule).
// Outputs: public/mch/** (copied assets), src/generated/catalog.json and src/generated/audio.json.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';

const { PNG } = pngjs;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, process.env.MCH_ASSETS_DIR ?? 'vendor/mycryptoheroes');
const outPublic = join(root, 'public', 'mch');
const outCatalog = join(root, 'src', 'generated', 'catalog.json');
const outAudio = join(root, 'src', 'generated', 'audio.json');

if (!existsSync(join(src, 'Data'))) {
  console.error(`[sync-assets] asset database not found at ${src}`);
  console.error('Run `git submodule update --init` or set MCH_ASSETS_DIR.');
  process.exit(1);
}

const readJson = (p) => JSON.parse(readFileSync(join(src, p), 'utf8'));
let copied = 0;
/** Copies a file from the asset DB and returns its URL path relative to the site root. */
function use(relPath) {
  const from = join(src, relPath);
  if (!existsSync(from)) throw new Error(`missing asset: ${relPath}`);
  const to = join(outPublic, relPath);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied += 1;
  return `mch/${relPath}`;
}

rmSync(outPublic, { recursive: true, force: true });

// ---------------------------------------------------------------- goods (extensions)
// Only the entries shown in the public dictionary; replicas are left out.

/** Parameter lines: every stat tied for the highest of PHY / INT / AGI (so 魔法剣 is both PHY and INT). */
function paramsOf(stats) {
  const { phy = 0, int = 0, agi = 0 } = stats ?? {};
  const top = Math.max(phy, int, agi);
  if (top <= 0) return ['hp'];
  return [['phy', phy], ['int', int], ['agi', agi]].filter(([, v]) => v === top).map(([k]) => k);
}

const STATUSES = ['恐怖', '気絶', '混乱', '睡眠', '毒', '衰弱', '出血', '呪い'];
const STAT = { PHY: 'phy', INT: 'int', AGI: 'agi' };

/**
 * Turns an active skill's effect lines into simple battle effects.
 * side: 'foe' (the line targets enemies) or 'self' (the user or allies — the player fights alone).
 */
function parseEffects(effects) {
  const out = [];
  for (const f of effects ?? []) {
    const d = f.description ?? '';
    const side = /敵/.test(d.split('に自身の')[0].split('を')[0]) || /^[^自味]*敵/.test(d) ? 'foe' : 'self';
    const min = f.min_rate ?? 0;
    const max = f.max_rate ?? min;
    let m;
    if (/ダメージ/.test(d) && (m = d.match(/自身の(PHY|INT)の/))) {
      out.push({ t: 'dmg', stat: STAT[m[1]], min, max, side });
    } else if (/回復係数/.test(d)) {
      out.push({ t: 'heal', coef: /PHY回復係数/.test(d) ? 'phy' : 'int', min, max, side });
    } else if ((m = d.match(/の(PHY|INT|AGI)を(自身|対象)の(PHY|INT|AGI)(増加量|減少量)?の.*?(アップ|ダウン)/))) {
      const base = m[4] ? (m[4] === '増加量' ? 'gain' : 'loss') : `${m[2] === '自身' ? 'user' : 'target'}:${STAT[m[3]]}`;
      out.push({ t: 'stat', stat: STAT[m[1]], dir: m[5] === 'アップ' ? 1 : -1, base, pct: (min + max) / 2, side });
    } else if ((m = d.match(/の(PHY|INT|AGI)を(\d+)(アップ|ダウン)/))) {
      out.push({ t: 'stat', stat: STAT[m[1]], dir: m[3] === 'アップ' ? 1 : -1, base: 'flat', pct: Number(m[2]), side });
    } else if ((m = d.match(/確率で(.+?)を付与/)) && STATUSES.includes(m[1])) {
      out.push({ t: 'status', name: m[1], rate: f.success_rate ?? 20, side });
    }
  }
  return out;
}

/** Skill lines: what the active skill does. A stat raised and lowered again on the user (a stat swap) is not a buff. */
function rolesOf(fx) {
  const roles = new Set();
  const selfDown = new Set(fx.filter((f) => f.t === 'stat' && f.side === 'self' && f.dir < 0).map((f) => f.stat));
  for (const f of fx) {
    if (f.t === 'dmg' && f.side === 'foe') roles.add('atk');
    if (f.t === 'heal') roles.add('heal');
    if (f.t === 'stat' && f.side === 'self' && f.dir > 0 && !selfDown.has(f.stat)) roles.add('buff');
    if (f.t === 'stat' && f.side === 'foe' && f.dir < 0) roles.add('debuff');
    if (f.t === 'status' && f.side === 'foe') roles.add('status');
  }
  return ['atk', 'buff', 'debuff', 'heal', 'status'].filter((r) => roles.has(r));
}

// Where a good is worn, by what kind of thing it is (its series name). Checked top to bottom.
const SLOT_WORDS = {
  body: ['シールドシステム', 'アーマー', 'ヨロイ', 'マント', '羽織', 'ネックレス', 'ベルト', 'メダル'],
  head: ['ハット', 'カブト', 'クラウン', 'ボンネット', 'モノクル', 'リボン', 'グラス'],
  leg: ['ブーツ', 'ホース', '二輪車', 'ペガサス', 'スワンボート', 'イカダ', 'シップ', '宇宙船', 'パンダマシン', 'ライドラゴン', 'タイガー', 'ブル', 'エレファント'],
  arm: ['ブレード', '魔法剣', 'カタナ', 'ハルバード', 'レイピア', 'スタッフ', 'ホーキ', 'スピア', 'ジャベリン', 'ソード', 'ユミ', 'ステッキ', 'オリフラム', 'メイス', 'アックス', 'シックル', 'ウィップ', 'フレイル', 'ハンマー', 'マレット', 'グンバイ', 'ナイフ', 'ワンド', 'ペン', 'マスケット', 'リボルバー', 'アルケブス', 'ハンドカノン', 'レーザーガン', 'ボウガン', 'ブーメラン', 'チャクラム', '手裏剣', 'メリケンサック', 'シールド', 'ガントレット', 'クロー', 'リング', 'センス', 'サイハイ', '鋏', '傘'],
};
function slotOf(series) {
  if (/ブルーベリー/.test(series)) return 'special';
  for (const [slot, words] of Object.entries(SLOT_WORDS)) if (words.some((w) => series.includes(w))) return slot;
  return 'special';
}

// The footprint a good takes on the shelf grid, by what kind of thing it is (its series name).
// Shapes are defined in src/game/shapes.ts.
// Checked top to bottom; the first match wins (so ステアリング is matched before リング, ブルーベリー before ブル).
const SHAPE_WORDS = {
  t4: ['クラヴィア', 'ハープ', 'オルゴール', 'お花見弁当', 'ラーメン', 'ハンバーガー', 'パンジャンドラム', 'ステアリング', 'スコーピオン', 'ビートル', 'リミュラス'],
  s1: ['リング', 'ネックレス', 'メダル', 'ギョク', 'ベリー', 'ルビー', 'タンジェリン', 'ライム', 'グレープ', 'グラファイト', 'セージ', '懐中時計', 'モノクル', 'コンパス', 'タリスマン', 'リボン', 'りんご', '梨', '財布', 'チャクラム', '手裏剣', 'パンケーキ', 'いちごケーキ', 'マジックカード', 'スイーツ', 'バッタ', 'ハチ', 'モス', '蝶々', '象蟲', 'Sweet', 'プランツインセクト', 'アンモナイト', 'ロンギスクアマ', 'スカル', 'キューティー', '鏡'],
  v3: ['ブレード', '魔法剣', 'カタナ', 'ハルバード', 'レイピア', 'スタッフ', 'ホーキ', 'スピア', 'ジャベリン', 'ソード', 'ユミ', 'ステッキ', 'オリフラム', 'メイス', 'アックス', 'シックル', '傘', 'ウィップ', 'フレイル', 'ハンマー', 'マレット', 'グンバイ'],
  v2: ['ナイフ', 'ワンド', 'ペン', 'スクロール', 'サケ', 'グラス', 'ゴブレット', 'ブーツ', 'サイハイ', 'センス', 'オフダ', '筆パレ', 'マラカス', 'ランタン', 'フルート', '猫じゃらし', '日本人形', '雪だるま', '盆栽', 'マンドラゴラ', '液浸標本', 'ツノ', '鋏'],
  h2: ['マスケット', 'リボルバー', 'アルケブス', 'ハンドカノン', 'レーザーガン', 'ボウガン', 'ベルト', 'ホルン', 'イカダ', 'ブーメラン', 'ヴァイオリン', 'シタール', 'お寿司', 'スネーク', 'メリケンサック', '二輪車', 'スワンボート', 'シップ'],
  sq: ['アーマー', 'ヨロイ', 'シールド', 'ホース', 'タイガー', 'ドラゴン', 'ブル', 'エレファント', 'サウルス', 'ノドン', 'トプス', 'メガロドン', 'ゴーレム', 'モアイ', '機甲兵', '観覧車', 'パンダマシン', 'ペガサス', '宇宙船', '合体ロボ', 'ドールハウス', 'アクアリウム', '天体模型', 'ライオン', 'キメラ', 'ドラム', 'RYU', 'ETHEREMON'],
  l3: ['ハット', 'カブト', 'クラウン', 'マント', 'ガントレット', 'クロー', '羽織', 'ボンネット', '椅子', 'ブック', 'リソグラフィ', 'ツインブレード', 'パロット', 'ルースター', 'モンキー', 'ドッグ', 'タートル', 'カエル', '妖精', 'ピエロ', 'ニコ', 'サモンボード', 'トラップ'],
};
const FALLBACK_SHAPES = ['s1', 's1', 's1', 'v2', 'h2', 'l3'];
function shapeOf(series, id) {
  for (const [shape, words] of Object.entries(SHAPE_WORDS)) if (words.some((w) => series.includes(w))) return shape;
  // everything else is small (jewels, fruit, medals, trinkets …); the series decides, so a set shares a shape
  let hash = 0;
  for (const ch of series || String(id)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return FALLBACK_SHAPES[hash % FALLBACK_SHAPES.length];
}

const items = readJson('Data/Extensions/extensions.json')
  .filter((e) => e.is_dictionary_visible && e.rarity?.id >= 1 && e.rarity.id <= 5)
  .map((e) => {
    const series = e.series?.name?.ja ?? '';
    const ja = e.active_skill?.description?.ja;
    const fx = parseEffects(ja?.effects);
    const s = e.max_level_stats ?? {};
    return {
      id: e.id,
      ja: e.name.ja,
      en: e.name.en,
      rarity: e.rarity.id,
      params: paramsOf(s),
      roles: rolesOf(fx),
      series,
      shape: shapeOf(series, e.id),
      slot: slotOf(series),
      wallet: series === '財布',
      stats: [s.hp ?? 0, s.phy ?? 0, s.int ?? 0, s.agi ?? 0],
      skill: e.active_skill?.name?.ja ?? '',
      skillText: (ja?.effects ?? []).map((f) => f.description.replace('{successRate}', f.success_rate)).join(' / '),
      fx,
      img: use(e.image_file_path),
    };
  });

// ---------------------------------------------------------------- customers (heroes)
const RARITY_ID = { Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5 };
const heroes = readJson('Data/Heroes/heroes.json')
  .filter((h) => h.is_dictionary_visible)
  .map((h) => ({
    id: h.id,
    ja: h.name.ja,
    en: h.name.en,
    rarity: RARITY_ID[h.rarity?.name] ?? 1,
    faction: h.faction?.name?.ja ?? '',
    img: use(h.image_file_path),
  }));

// ---------------------------------------------------------------- the player and the enemies of the quest
const warrior = readJson('Data/Heroes/heroes.json').find((h) => h.id === 10001);
const player = {
  ja: warrior.name.ja,
  img: use(warrior.image_file_path),
  stats: [warrior.max_level_stats.hp, warrior.max_level_stats.phy, warrior.max_level_stats.int, warrior.max_level_stats.agi],
};

/** Enemy skill texts are free-form; this picks out what the quest battle can use. */
function parseEnemySkill(text) {
  const fx = [];
  let m;
  if (/ダメージ/.test(text) && (m = text.match(/(PHY|INT)の\s*(\d+)(?:\s*[〜~\-]\s*(\d+))?\s*[%％]/))) {
    fx.push({ t: 'dmg', stat: STAT[m[1]], min: Number(m[2]), max: Number(m[3] ?? m[2]), side: 'foe' });
  } else if (/ダメージ|攻撃/.test(text)) {
    fx.push({ t: 'dmg', stat: /INT/.test(text) ? 'int' : 'phy', min: 30, max: 50, side: 'foe' });
  }
  if (/回復/.test(text)) fx.push({ t: 'heal', coef: 'int', min: 10, max: 20, side: 'self' });
  if ((m = text.match(/(?:自分|自身)の(PHY|INT|AGI)を\s*(\d+)\s*[%％]\s*アップ/))) {
    fx.push({ t: 'stat', stat: STAT[m[1]], dir: 1, base: `user:${STAT[m[1]]}`, pct: Number(m[2]), side: 'self' });
  }
  const status = STATUSES.find((name) => text.includes(name));
  if (status) fx.push({ t: 'status', name: status, rate: 20, side: 'foe' });
  if (fx.length === 0) fx.push({ t: 'dmg', stat: 'phy', min: 30, max: 50, side: 'foe' });
  return fx;
}

const enemyRows = readJson('Data/Enemies/enemies.json').filter((e) => e.image_exists && e.trend);
const toEnemy = (e) => ({
  id: e.id,
  ja: e.name.ja,
  img: use(e.image_file_path),
  trend: [e.trend.hp, e.trend.phy, e.trend.int, e.trend.agi],
  acts: (e.active_skills ?? []).slice(0, 3).map((sk) => ({ name: sk.name?.ja ?? '攻撃', fx: parseEnemySkill(sk.description?.ja?.text ?? '') })),
});
const total = (e) => e.base_param.hp + e.base_param.phy + e.base_param.int + e.base_param.agi;
// ordinary monsters (small base values, grown by the quest's depth); every 4th keeps the download small
const enemies = enemyRows.filter((e) => total(e) < 100).filter((_, i) => i % 4 === 0).map(toEnemy);
// bosses: the big ones, a handful
const bosses = enemyRows.filter((e) => total(e) >= 800 && total(e) < 100000).filter((_, i) => i % 40 === 0).map(toEnemy);

// ---------------------------------------------------------------- icons, backdrop
const icons = { gum: use('Image/Icons/gum.png') };

/** Halves a large backdrop (box filter) so phones do not download a 1000×1500 image. */
function halve(relPath) {
  const png = PNG.sync.read(readFileSync(join(src, relPath)));
  const w = png.width >> 1;
  const h = png.height >> 1;
  const out = new PNG({ width: w, height: h, colorType: 2 });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) sum += png.data[((y * 2 + dy) * png.width + x * 2 + dx) * 4 + c];
        out.data[(y * w + x) * 4 + c] = sum >> 2;
      }
      out.data[(y * w + x) * 4 + 3] = 255;
    }
  }
  const rel = relPath.replace(/\.png$/, '.half.png');
  const to = join(outPublic, rel);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, PNG.sync.write(out, { colorType: 2 }));
  return `mch/${rel}`;
}
const backdrop = halve('Image/Backgrounds/1002.png');

mkdirSync(dirname(outCatalog), { recursive: true });
const dungeon = halve('Image/Backgrounds/1006.png');

// ---------------------------------------------------------------- sound
// Only the files the game plays are copied (the whole Audio folder is 24MB). src/ui/audio.ts streams
// the music one track at a time and makes almost every sound effect itself, so nothing here is
// downloaded before it is needed.
//
// Which track plays where. Chosen from the track names and from measurements (ffmpeg ebur128,
// key and tempo estimates), not by ear — audition them on soundboard.html and swap freely:
//
//   scene    file             length  loudness    notes
//   title    9on9             2:31    -12.3 LUFS  the one clearly major-key track (A major): bright and welcoming
//   day      land             2:08    -12.5 LUFS  the town theme (A minor), fewest highs, steady: opening hours
//   night    cryptid-wars     2:24    -13.7 LUFS  lowest level of all, A minor like the day theme, so day -> night blends
//   shop     pvp              2:15    -13.9 LUFS  light and quick without being heavy: the night market
//   dungeon  pve              1:01    -12.6 LUFS  the quest theme (C minor), a short loop
//   battle   land-battle      1:37    -13.6 LUFS  D minor, about 164 bpm
//   boss     raid             3:00    -12.3 LUFS  the brightest, busiest and fastest track
//   ending   pve-event        2:23    -10.2 LUFS  the loudest, festive; hovers between F minor and F major
//   (colosseum.mp3 is not used.)
//
// gain: evens the tracks out to about -14 LUFS. head / tail: seconds of silence at the start and the
// end (below -40 dBFS), skipped when the track loops.
const lufsGain = (lufs, target = -14) => Math.min(1, Math.round(10 ** ((target - lufs) / 20) * 100) / 100);
const track = (file, lufs, head, tail) => ({ url: use(`Audio/BGM/${file}.mp3`), gain: lufsGain(lufs), head, tail });
const sample = (relPath, gain) => ({ url: use(`Audio/SE/${relPath}`), gain });
const audio = {
  bgm: {
    title: track('9on9', -12.3, 0.13, 1.19),
    day: track('land', -12.5, 0.02, 2.12),
    night: track('cryptid-wars', -13.7, 0.27, 0.84),
    shop: track('pvp', -13.9, 0.03, 1.23),
    dungeon: track('pve', -12.6, 0, 0.63),
    battle: track('land-battle', -13.6, 0.05, 0.21),
    boss: track('raid', -12.3, 0.01, 1.51),
    ending: track('pve-event', -10.2, 0.02, 0.76),
  },
  // Recorded effects. The battle ones are laid quietly under the synthesized sound of the same name;
  // the two jingles are an alternative to the synthesized phrases (off by default, see audioTuning).
  // MP3 only: every browser decodes it.
  se: {
    hit: sample('Battle/1_single_damage.mp3', 0.5), // 0.3s, a dry punch
    hitBig: sample('Battle/2_area_damage.mp3', 0.7), // 2.3s, -19.3 LUFS, a long rumbling tail
    heal: sample('Battle/3_heal_resurrection.mp3', 0.4), // 1.6s, -15.5 LUFS, bright sparkles
    buff: sample('Battle/4_buff.mp3', 0.5), // 2.1s, -17.3 LUFS, rising
    debuff: sample('Battle/5_debuff_status_effect.mp3', 0.55), // 2.1s, -18.6 LUFS, dark
    win: sample('Jingles/win.mp3', 0.4), // 3.5s, -10.2 LUFS, peaks over full scale, ends on a hard cut
    lose: sample('Jingles/lose.mp3', 0.5), // 5.3s, -12.8 LUFS
  },
};
writeFileSync(outAudio, JSON.stringify(audio));

writeFileSync(outCatalog, JSON.stringify({ items, heroes, icons, backdrop, dungeon, player, enemies, bosses }));
console.log(`[sync-assets] ${items.length} goods, ${heroes.length} customers, ${enemies.length} enemies, ${bosses.length} bosses, ${copied} files copied`);
