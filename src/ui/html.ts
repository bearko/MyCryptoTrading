import { B } from '../game/balance';
import { catalog as cat, COND_JA, PARAM_JA, RARITY_JA, ROLE_JA, SLOT_JA, type Item, type Param } from '../game/catalog';
import * as G from '../game/logic';

export const esc = (text: string | number): string =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const num = (n: number): string => n.toLocaleString('ja-JP');
export const gum = (n: number): string => `<span class="gum"><img src="${cat.icons.gum}" alt="GUM" />${num(n)}</span>`;
export const pct = (p: number): string => `${Math.round(p * 100)}%`;

/**
 * A slab button. The sound it makes is derived from its class by the one click handler in app.ts
 * (primary / gold → confirm, ghost → cancel, the rest → tap); `sfx` overrides it ('none' when the
 * action plays its own sound).
 */
export function btn(act: string, label: string, opts: { cls?: string; arg?: string | number; disabled?: boolean; sub?: string; sfx?: string; id?: string } = {}): string {
  const sub = opts.sub ? `<small>${opts.sub}</small>` : '';
  return `<button class="btn ${opts.cls ?? ''}"${opts.id ? ` id="${opts.id}"` : ''} data-act="${act}"${opts.arg !== undefined ? ` data-arg="${opts.arg}"` : ''}${opts.sfx ? ` data-sfx="${opts.sfx}"` : ''}${opts.disabled ? ' disabled' : ''}><span>${label}</span>${sub}</button>`;
}

/**
 * Goods are coloured by their parameter line (PHY / INT / AGI), not by rarity.
 * A good on two lines is split diagonally between the two colours.
 */
export function tone(item: Item): string {
  const a = item.params[0];
  const b = item.params[1] ?? a;
  return `--ta:var(--c-${a});--tb:var(--c-${b})`;
}

/** A shape for each parameter line, so the lines can be told apart without colour. */
export const GLYPH: Record<Param, string> = { phy: '▲', int: '◆', agi: '●', hp: '■' };
export const glyphs = (item: Item): string => item.params.map((p) => `<b class="glyph g-${p}">${GLYPH[p]}</b>`).join('');

/** The two label sets: skill line (攻撃 / バフ …) and parameter line (PHY系 …). */
export function labels(item: Item): string {
  const roles = item.roles.map((r) => `<span class="tag role role-${r}">${ROLE_JA[r]}</span>`).join('');
  const params = item.params.map((p) => `<span class="tag param param-${p}"><i>${GLYPH[p]}</i>${PARAM_JA[p]}</span>`).join('');
  return roles + params;
}

/** The picture of a good on its parameter-coloured tile. */
export function itemTile(item: Item, cls = ''): string {
  return `<span class="tile ${cls}" style="${tone(item)}"><img src="${item.img}" alt="" draggable="false" />${glyphs(item)}</span>`;
}

export function itemCard(itemId: number, cond: number, extra = ''): string {
  const item = G.findItem(cat, itemId);
  return `<div class="item">
    ${itemTile(item, 'lg')}
    <div class="item-body">
      <div class="item-name">${esc(item.ja)}</div>
      <div class="tags">${labels(item)}</div>
      <div class="tags"><span class="tag rar r${item.rarity}">${item.limited ? 'リミテッド' : RARITY_JA[item.rarity]}</span><span class="tag cond c${cond}">${COND_JA[cond]}</span></div>
      <div class="item-val">相場 ${gum(G.itemValue(cat, itemId, cond))}</div>
      ${extra}
    </div>
  </div>`;
}

/** [hp, phy, int, agi] as chips; zero values are left out. */
export function statChips(stats: readonly number[], sign = '+'): string {
  const names = ['HP', 'PHY', 'INT', 'AGI'];
  const keys = ['hp', 'phy', 'int', 'agi'];
  const chips = stats.map((v, i) => (v ? `<span class="stat s-${keys[i]}">${names[i]}<b>${sign}${v}</b></span>` : '')).join('');
  return chips || '<span class="stat">—</span>';
}

/** Everything about a good: its skill, what it adds when worn, and where it is worn. */
export function itemDetail(item: Item): string {
  const where = item.wallet ? `ウォレット（${B.walletSizes[item.rarity][0]}×${B.walletSizes[item.rarity][1]} マス）` : SLOT_JA[item.slot];
  return `<div class="detail">
    <div class="kv"><span>装備する場所</span><b>${where}</b></div>
    <div class="kv"><span>装備時</span><b class="stats">${statChips(item.stats)}</b></div>
    <div class="kv"><span>スキル</span><b class="pix">${esc(item.skill)}</b></div>
    <p class="skill-text">${esc(item.skillText)}</p>
  </div>`;
}

/** A good's footprint on the grid, drawn small (so that room can be made for it before it is bought). */
export function shapeIcon(itemId: number): string {
  const shape = G.shapeOf(cat, itemId, 0);
  return `<span class="shape" style="--w:${shape.w};--h:${shape.h}" role="img" aria-label="${shape.cells.length} マス（横 ${shape.w}・縦 ${shape.h}）">${shape.cells.map(([x, y]) => `<i style="grid-column:${x + 1};grid-row:${y + 1}"></i>`).join('')}</span>`;
}
