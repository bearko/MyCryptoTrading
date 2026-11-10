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

const items = readJson('Data/Extensions/extensions.json')
  .filter((e) => e.is_dictionary_visible && e.rarity?.id >= 1 && e.rarity.id <= 5)
  .map((e) => ({
    id: e.id,
    ja: e.name.ja,
    en: e.name.en,
    rarity: e.rarity.id,
    kind: kindOf(e.max_level_stats),
    series: e.series?.name?.ja ?? '',
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

// ---------------------------------------------------------------- shopkeeper, icons, backdrop
const keeper = {
  idle: use('Image/Characters/chris_09_idle.png'),
  smile: use('Image/Characters/chris_05_smile.png'),
  cheer: use('Image/Characters/chris_03_cheer.png'),
  sad: use('Image/Characters/chris_08_sad.png'),
  think: use('Image/Characters/chris_01_arms_crossed.png'),
};
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
writeFileSync(outCatalog, JSON.stringify({ items, heroes, keeper, icons, backdrop }));
console.log(`[sync-assets] ${items.length} goods, ${heroes.length} customers, ${copied} files copied`);
