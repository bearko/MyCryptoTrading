import { B } from '../game/balance';
import { catalog as cat, COND_JA, PARAM_JA, RARITY_JA, ROLE_JA, SLOT_JA, type Item } from '../game/catalog';
import * as G from '../game/logic';

export const esc = (text: string | number): string =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const num = (n: number): string => n.toLocaleString('ja-JP');
export const gum = (n: number): string => `<span class="gum"><img src="${cat.icons.gum}" alt="GUM" />${num(n)}</span>`;
export const pct = (p: number): string => `${Math.round(p * 100)}%`;

export function btn(act: string, label: string, opts: { cls?: string; arg?: string | number; disabled?: boolean; sub?: string } = {}): string {
  const sub = opts.sub ? `<small>${opts.sub}</small>` : '';
  return `<button class="btn ${opts.cls ?? ''}" data-act="${act}"${opts.arg !== undefined ? ` data-arg="${opts.arg}"` : ''}${opts.disabled ? ' disabled' : ''}><span>${label}</span>${sub}</button>`;
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

/** The two label sets: skill line (攻撃 / バフ …) and parameter line (PHY系 …). */
export function labels(item: Item): string {
  const roles = item.roles.map((r) => `<span class="tag role-${r}">${ROLE_JA[r]}</span>`).join('');
  const params = item.params.map((p) => `<span class="tag param-${p}">${PARAM_JA[p]}</span>`).join('');
  return roles + params;
}

export function itemCard(itemId: number, cond: number, extra = ''): string {
  const item = G.findItem(cat, itemId);
  return `<div class="item" style="${tone(item)}">
    <div class="item-img"><img src="${item.img}" alt="" /></div>
    <div class="item-body">
      <div class="item-name">${esc(item.ja)}</div>
      <div class="tags">${labels(item)}</div>
      <div class="tags"><span class="tag">${RARITY_JA[item.rarity]}</span><span class="tag c${cond}">${COND_JA[cond]}</span></div>
      <div class="item-val">相場 ${gum(G.itemValue(cat, itemId, cond))}</div>
      ${extra}
    </div>
  </div>`;
}

/** Everything about a good: its skill, what it adds when worn, and where it is worn. */
export function itemDetail(item: Item): string {
  const [hp, phy, int, agi] = item.stats;
  const where = item.wallet ? `ウォレット（${B.walletSizes[item.rarity][0]}×${B.walletSizes[item.rarity][1]} マス）` : SLOT_JA[item.slot];
  return `<div class="detail">
    <div class="win-row"><span>装備する場所</span><b>${where}</b></div>
    <div class="win-row"><span>装備時</span><b>HP+${hp}　PHY+${phy}　INT+${int}　AGI+${agi}</b></div>
    <div class="win-row"><span>スキル</span><b>${esc(item.skill)}</b></div>
    <p class="skill-text">${esc(item.skillText)}</p>
  </div>`;
}
