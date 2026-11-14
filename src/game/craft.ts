import { B } from './balance';
import type { Catalog, Item } from './catalog';
import { addRep, addTo, gridOf, type GridId } from './logic';
import type { GameState, StockItem } from './state';

/**
 * The pot: two or three goods go in, one comes out.
 *
 * The first good is the base. It comes out as the next good of its own line — one rarity up
 * (a legendary comes out as the line's limited legendary, where the line has one).
 * The others are partners: what they count for (by rarity) must add up to what the base itself counts for.
 * Partners of the base's own parameter line make a good match, and the result comes out one grade better kept.
 */

/** The good a base turns into, or null at the top of its line. */
export function nextOf(cat: Catalog, item: Item): Item | null {
  if (item.wallet || item.limited) return null;
  const next = cat.itemById.get(item.id + (item.rarity === 5 ? 500 : 1000));
  // (a limited legendary is only ever made from its own legendary)
  return next && next.limited === (item.rarity === 5) ? next : null;
}

/** A line's number: the last three digits of its goods' ids (1001, 2001 … 5001 and the limited 5501 are line 1). */
export const lineNo = (item: Item): number => (item.limited ? item.id - 500 : item.id) % 1000;

/**
 * Special pairings: a base of one line with a partner of another comes out as a good of a third line
 * (one rarity above the base, and always in the best condition). Either of the two can be the base.
 * [line, line, the line that comes out]
 */
export const CROSSES: readonly (readonly [number, number, number])[] = [
  // blades and guns
  [1, 6, 82], // ブレード × カタナ → ツインブレード
  [1, 57, 100], // ブレード × ワンド → 魔法剣
  [11, 14, 15], // アックス × クロススピア → ハルバード
  [13, 2, 35], // ユミ × マスケット → ボウガン
  [2, 29, 74], // マスケット × リボルバー → ハンドカノン
  [74, 143, 130], // ハンドカノン × 天体模型 → レーザーガン
  [48, 16, 124], // ナイフ × スクロール → 手裏剣
  [34, 79, 152], // ハンマー × スタッフ → メイス
  [152, 51, 183], // メイス × ウィップ → フレイル
  [14, 188, 187], // クロススピア × ブーメラン → ジャベリン
  [1, 123, 161], // ブレード × 合体ロボ → サイバーソード
  [79, 123, 158], // スタッフ × 合体ロボ → サイバースタッフ
  [99, 97, 164], // ガントレット × クロー → メリケンサック
  [14, 61, 140], // クロススピア × マント → オリフラム
  // armour and dress
  [4, 18, 81], // アーマー × カブト → ヨロイ
  [10, 123, 147], // シールド × 合体ロボ → シールドシステム
  [61, 110, 141], // マント × リボン → 羽織
  [59, 110, 193], // ハット × リボン → ボンネット
  [75, 111, 102], // グラス × 懐中時計 → モノクル
  [4, 108, 116], // アーマー × ゴーレム → 帝国式魔導機甲兵
  // mounts
  [5, 112, 120], // ホース × 妖精 → ペガサス
  [5, 22, 117], // ホース × ドラゴン → ライドラゴン
  [5, 38, 115], // ホース × ステアリング → 二輪車
  [47, 143, 121], // シップ × 天体模型 → 宇宙船
  [47, 20, 155], // シップ × ルースター → スワンボート
  // creatures
  [22, 46, 189], // ドラゴン × ルビー → ジュエルドラゴン
  [189, 26, 185], // ジュエルドラゴン × スネーク → ジュエルワームドラゴン
  [20, 26, 186], // ルースター × スネーク → バードキメラ
  [21, 36, 194], // タイガー × クラウン → ライオン
  [108, 163, 177], // ゴーレム × 盆栽 → ナチュレゴーレム
  [131, 163, 184], // バッタ × 盆栽 → プランツインセクト
  [88, 87, 22], // ティラノサウルス × プテラノドン → ドラゴン
  // the table
  [39, 55, 176], // ストロベリー × スイーツ → いちごケーキ
  [93, 58, 157], // メガロドン × サケ → お寿司
  [157, 55, 142], // お寿司 × スイーツ → お花見弁当
  // charms and curios
  [57, 110, 174], // ワンド × リボン → 魔法少女ステッキ&ブローチ
  [17, 98, 173], // ネックレス × ギョク → タリスマン
  [16, 98, 103], // スクロール × ギョク → オフダ
  [8, 50, 178], // ブック × リソグラフィ → マジックカード
  [8, 22, 181], // ブック × ドラゴン → サモンボード
  [127, 170, 182], // 日本人形 × 椅子 → ドールハウス
  [111, 65, 165], // 懐中時計 × ハープ → オルゴール
  [111, 143, 156], // 懐中時計 × 天体模型 → コンパス
];

export const crossKey = (a: number, b: number): string => (a < b ? `${a}x${b}` : `${b}x${a}`);
const CROSS_BY_KEY = new Map(CROSSES.map(([a, b, out]) => [crossKey(a, b), out]));

/** The good of a line at a rarity (6 = its limited legendary), or null. */
export function goodOfLine(cat: Catalog, line: number, rarity: number): Item | null {
  const item = cat.itemById.get(rarity === 6 ? 5500 + line : rarity * 1000 + line);
  return item && !item.wallet && item.limited === (rarity === 6) && (rarity === 6 || item.rarity === rarity) ? item : null;
}

/** The special pairing a base makes with one of these partners, if any (and if that line has a good one rarity up). */
export function crossOf(cat: Catalog, base: Item, partners: readonly Item[]): { item: Item; key: string } | null {
  if (base.wallet || base.limited) return null;
  for (const partner of partners) {
    const key = crossKey(lineNo(base), lineNo(partner));
    const line = CROSS_BY_KEY.get(key);
    const item = line === undefined ? null : goodOfLine(cat, line, base.rarity + 1);
    if (item) return { item, key };
  }
  return null;
}

/** The special pairings a line takes part in: [the other line, what comes out]. */
export const crossesOfLine = (line: number): [number, number][] =>
  CROSSES.filter(([a, b]) => a === line || b === line).map(([a, b, out]) => [a === line ? b : a, out]);

/** A line from its first good up (for the recipe book). */
export function lineOf(cat: Catalog, item: Item): Item[] {
  let first = item;
  for (;;) {
    const below = cat.itemById.get(first.id - (first.limited ? 500 : 1000));
    if (!below || below.wallet) break;
    first = below;
  }
  const line = [first];
  for (let next = nextOf(cat, first); next; next = nextOf(cat, next)) line.push(next);
  return line;
}

export const pointsOf = (item: Item): number => B.craftPoints[item.rarity];

export interface CraftPlan {
  base: Item | null;
  result: Item | null;
  /** how well the result is kept (condition) */
  cond: number;
  need: number;
  have: number;
  /** every partner shares a parameter line with the base */
  match: boolean;
  /** the offering the pot takes */
  fee: number;
  /** a special pairing (its key), or '' for the base's own line */
  cross: string;
  /** why it cannot be made yet: nothing in, at the top of its line, no partner, partners too weak, the pot is spent for today, not enough GUM */
  block: '' | 'empty' | 'top' | 'alone' | 'short' | 'spent' | 'poor';
}

/** The offering for a result: a share of what it is worth at its rarity (the same for every good of that rarity). */
export const feeOf = (item: Item): number => Math.round((item.limited ? B.limitedValue : B.rarityValue[item.rarity]) * B.craftFee);
export const craftsLeft = (s: GameState): number => Math.max(0, B.craftPerDay - s.today.crafts);

function find(s: GameState, uid: number): { grid: GridId; stock: StockItem } | null {
  const shelf = s.stock.find((x) => x.uid === uid);
  if (shelf) return { grid: 'shelf', stock: shelf };
  const bag = s.wallet.items.find((x) => x.uid === uid);
  return bag ? { grid: 'wallet', stock: bag } : null;
}

/** What the goods in the pot would make (the first one is the base). */
export function planCraft(s: GameState, cat: Catalog, uids: readonly number[]): CraftPlan {
  const inputs = uids.map((uid) => find(s, uid)?.stock).filter((x): x is StockItem => !!x);
  const none: CraftPlan = { base: null, result: null, cond: 1, need: 0, have: 0, match: false, fee: 0, cross: '', block: 'empty' };
  if (inputs.length === 0) return none;
  const base = cat.itemById.get(inputs[0].itemId)!;
  const partners = inputs.slice(1).map((x) => cat.itemById.get(x.itemId)!);
  const cross = crossOf(cat, base, partners);
  const result = cross?.item ?? nextOf(cat, base);
  const need = pointsOf(base);
  const have = partners.reduce((sum, p) => sum + pointsOf(p), 0);
  const match = partners.length > 0 && partners.every((p) => p.params.some((param) => base.params.includes(param)));
  const cond = cross ? B.condMult.length - 1 : Math.min(B.condMult.length - 1, inputs[0].cond + (match ? 1 : 0));
  const fee = result ? feeOf(result) : 0;
  const block = !result ? 'top' : partners.length === 0 ? 'alone' : have < need ? 'short' : craftsLeft(s) === 0 ? 'spent' : s.gum < fee ? 'poor' : '';
  return { base, result, cond, need, have, match, fee, cross: cross?.key ?? '', block };
}

export const CRAFT_MAX = 3;

/** Makes it: the goods are used up and the result is put on the shelf (in the wallet when the shelf has no room). */
export function craft(
  s: GameState,
  cat: Catalog,
  uids: readonly number[],
): { ok: true; uid: number; item: Item; first: boolean; cross: boolean; found: boolean } | { ok: false; reason: 'plan' | 'room' } {
  const plan = planCraft(s, cat, uids);
  const found = uids.map((uid) => find(s, uid));
  if (plan.block || !plan.result || uids.length > CRAFT_MAX || new Set(uids).size !== uids.length || found.some((f) => !f)) return { ok: false, reason: 'plan' };
  const used = found.map((f) => f!);
  const paid = used.reduce((sum, f) => sum + f.stock.paid, 0) + plan.fee;
  // taken out first: the room they leave is room for the result
  const before = { stock: [...s.stock], bag: [...s.wallet.items] };
  for (const f of used) {
    const list = gridOf(s, cat, f.grid).items;
    list.splice(list.indexOf(f.stock), 1);
  }
  const uid = addTo(s, cat, 'shelf', plan.result.id, plan.cond, paid) ?? addTo(s, cat, 'wallet', plan.result.id, plan.cond, paid);
  if (uid === null) {
    s.stock = before.stock;
    s.wallet.items = before.bag;
    return { ok: false, reason: 'room' };
  }
  s.gum -= plan.fee;
  s.today.spend += plan.fee;
  s.today.crafts += 1;
  const first = !s.made.includes(plan.result.id);
  if (first) s.made.push(plan.result.id);
  s.totals.crafts += 1;
  // a special pairing found for the first time
  const fresh = !!plan.cross && !s.crosses.includes(plan.cross);
  if (fresh) {
    s.crosses.push(plan.cross);
    addRep(s, B.crossRep);
  }
  return { ok: true, uid, item: plan.result, first, cross: !!plan.cross, found: fresh };
}
