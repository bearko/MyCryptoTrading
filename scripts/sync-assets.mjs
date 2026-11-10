#!/usr/bin/env node
// Builds the game catalog from the My Crypto Heroes asset database
// (https://github.com/bearko/mycryptoheroes) and copies only the files the game uses.
//
//   node scripts/sync-assets.mjs
//
// Source directory: $MCH_ASSETS_DIR, else vendor/mycryptoheroes (git submodule).
// Outputs: public/mch/** (copied assets) and src/generated/catalog.json.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';

const { PNG } = pngjs;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, process.env.MCH_ASSETS_DIR ?? 'vendor/mycryptoheroes');
const outPublic = join(root, 'public', 'mch');
const outCatalog = join(root, 'src', 'generated', 'catalog.json');

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
/** The stat an extension leans on decides which customers want it. */
function kindOf(stats) {
  const { phy = 0, int = 0, agi = 0 } = stats ?? {};
  const top = Math.max(phy, int, agi);
  if (top <= 0) return 'phy';
  if (top === phy) return 'phy';
  if (top === int) return 'int';
  return 'agi';
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
  .map((e) => ({
    id: e.id,
    ja: e.name.ja,
    en: e.name.en,
    rarity: e.rarity.id,
    kind: kindOf(e.max_level_stats),
    series: e.series?.name?.ja ?? '',
    shape: shapeOf(e.series?.name?.ja ?? '', e.id),
    img: use(e.image_file_path),
  }));

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
writeFileSync(outCatalog, JSON.stringify({ items, heroes, icons, backdrop }));
console.log(`[sync-assets] ${items.length} goods, ${heroes.length} customers, ${copied} files copied`);
