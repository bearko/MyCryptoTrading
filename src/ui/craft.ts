/**
 * The pot (the 合成 tab): two or three goods go in, one comes out. The rules are in src/game/craft.ts;
 * this is the board, the recipe book, and the show when something is made.
 */
import { B } from '../game/balance';
import { catalog as cat, POT_ID, COND_JA, RARITY_JA, type Item } from '../game/catalog';
import * as C from '../game/craft';
import * as G from '../game/logic';
import type { GameState, StockItem } from '../game/state';
import { ctx, ui, popsOn } from './core';
import { btn, esc, gum, itemCard, itemTile, num, tone } from './html';

/** The pot itself: an epic good of the catalogue lends its picture. */
const potImg = (): string => cat.itemById.get(POT_ID)?.img ?? '';

const own = (g: GameState, uid: number): StockItem | undefined => g.stock.find((x) => x.uid === uid) ?? g.wallet.items.find((x) => x.uid === uid);

/** Keeps the pot's contents honest: goods that were sold, moved to the counter or used up drop out. */
export function tidyCraft(g: GameState): void {
  ui.craft = ui.craft.filter((uid, i, all) => all.indexOf(uid) === i && !!own(g, uid) && !ui.counter.includes(uid)).slice(0, C.CRAFT_MAX);
}

const WHY: Record<Exclude<C.CraftPlan['block'], ''>, string> = {
  empty: '',
  top: 'この品は、これより上がありません',
  alone: '素材をもう 1 つ入れる',
  short: 'ほかの素材の点が足りません',
  spent: '壺は、今日はもう使えません',
  poor: 'お布施の GUM が足りません',
  nopot: '壺が棚にありません',
  special: '特別な効果のある品は、壺に入れられません',
};

const mark = (item: Item): string => (item.limited ? 'リミテッド' : RARITY_JA[item.rarity]);

/** What the goods in the pot could become, and the one picked out (the first that can be made, until another is chosen). */
export function potCandidates(g: GameState): { all: C.Candidate[]; picked: C.Candidate | null; at: number } {
  tidyCraft(g);
  const all = C.candidates(g, cat, ui.craft);
  const at = all.length === 0 ? -1 : Math.min(Math.max(0, ui.craftPick), all.length - 1);
  return { all, picked: at < 0 ? null : all[at], at };
}

/** The card for a candidate under the pointer: the good it would be — or, for a pairing not made before, only its shadow and its worth. */
export function candidateCard(g: GameState, index: number): string | null {
  const c = potCandidates(g).all[index];
  if (!c?.plan.result) return null;
  const item = c.plan.result;
  if (!c.secret) return `${itemCard(item.id, c.plan.cond)}<p class="tip-skill"><b>${esc(item.skill)}</b>${esc(item.skillText)}</p>`;
  return `<div class="item-card secret"><span class="tile lg secret-tile" style="${tone(item)}"><img src="${item.img}" alt="" draggable="false" /></span>
      <div class="item-main"><b class="pix item-name">？？？？</b>
      <div class="tags"><span class="tag rar r${item.rarity}">${mark(item)}</span><span class="tag">${COND_JA[c.plan.cond]}</span><span class="tag mark">変わり配合</span></div>
      <div class="item-val">相場 ${gum(G.itemValue(cat, item.id, c.plan.cond))}</div></div></div>
    <p class="tip-skill"><b>？？？</b>作ると、正体がわかります。</p>`;
}

export function craftBoard(g: GameState): string {
  const { all, picked, at } = potCandidates(g);
  const base = picked?.order[0];
  // up above: what could come out (up to three), to choose from
  const cand = (i: number): string => {
    const c = all[i];
    if (!c?.plan.result) return `<span class="pcand empty"><small>候補 ${i + 1}</small></span>`;
    const item = c.plan.result;
    const cls = `pcand ${i === at ? 'picked' : ''} ${c.plan.block ? 'dim' : ''} ${c.secret ? 'secret' : ''} ${c.plan.cross ? 'cross' : ''}`;
    return `<button class="${cls}" id="pcand-${i}" data-cand="${i}" data-act="craft-pick" data-arg="${i}" data-sfx="none" ${c.secret ? '' : `style="${tone(item)}"`} aria-pressed="${i === at}" aria-label="候補 ${i + 1}：${c.secret ? '？？？？（変わり配合）' : esc(item.ja)}">
        ${c.secret ? '<b class="pcand-q">？</b>' : `<img src="${item.img}" alt="" draggable="false" />`}<em>${mark(item)}</em></button>`;
  };
  // down below: what goes in (up to three); the one that grows into the picked candidate is marked
  const slot = (i: number): string => {
    const x = ui.craft[i] !== undefined ? own(g, ui.craft[i]) : undefined;
    if (!x) return `<span class="pslot empty"><small>素材 ${i + 1}</small></span>`;
    const item = G.findItem(cat, x.itemId);
    const grows = x.uid === base;
    return `<button class="pslot ${grows ? 'base' : ''}" id="pslot-${x.uid}" style="${tone(item)}" data-act="craft-del" data-arg="${i}" data-sfx="cancel" aria-label="素材：${esc(item.ja)}（クリックで戻す）">
        <img src="${item.img}" alt="" draggable="false" />${grows ? '<small>土台</small>' : ''}<em>${grows ? mark(item) : `${C.pointsOf(item)}点`}</em></button>`;
  };
  const left = C.craftsLeft(g);
  const plan = picked?.plan;
  const info = plan?.result
    ? `<p class="pout-text"><b class="pix">${picked!.secret ? '？？？？' : esc(plan.result.ja)}</b><small>${mark(plan.result)}・${COND_JA[plan.cond]}</small><small>相場 ${gum(G.itemValue(cat, plan.result.id, plan.cond))}</small></p>
      <div class="pinfo">${plan.cross ? '<span class="pchip cross">変わり配合！ 美品</span>' : ''}<span class="pchip ${plan.have >= plan.need ? 'ok' : 'ng'}">素材 <b>${plan.have}</b>/${plan.need} 点</span>${plan.match && !plan.cross ? '<span class="pchip ok">相性◎ 品質+1</span>' : ''}<span class="pchip ${g.gum < plan.fee ? 'ng' : ''}">お布施 <b>${num(plan.fee)}</b></span><span class="pchip ${left === 0 ? 'ng' : ''}">今日あと <b>${left}</b> 回</span>${plan.block ? `<span class="pwhy">${WHY[plan.block]}</span>` : ''}</div>`
    : `<div class="pinfo"><span class="pchip ${left === 0 ? 'ng' : ''}">今日あと <b>${left}</b> 回</span>${ui.craft.length > 0 ? `<span class="pwhy">${ui.craft.length === 1 ? WHY.alone : 'この組み合わせでは、何もできません'}</span>` : ''}</div>`;
  const used = new Set(ui.craft);
  const mine = [...g.stock, ...g.wallet.items]
    .filter((x) => !used.has(x.uid) && !ui.counter.includes(x.uid) && !x.bag && !G.findItem(cat, x.itemId).effect)
    .sort((a, b) => G.findItem(cat, b.itemId).rarity - G.findItem(cat, a.itemId).rarity || a.itemId - b.itemId)
    .map((x) => {
      const item = G.findItem(cat, x.itemId);
      return `<button class="pgood" id="pgood-${x.uid}" style="${tone(item)}" data-act="craft-add" data-arg="${x.uid}" data-sfx="none" aria-label="${esc(item.ja)}（${RARITY_JA[item.rarity]}・${C.pointsOf(item)} 点）を壺に入れる">
          <img src="${item.img}" alt="" draggable="false" /><em>${C.pointsOf(item)}</em><i class="r${item.rarity}"></i></button>`;
    })
    .join('');
  return `<div class="craft" id="craft">
    <div class="pcands" id="pcands" aria-label="できる品の候補">${cand(0)}${cand(1)}${cand(2)}</div>
    ${info}
    <span class="pot" id="pot" aria-hidden="true"><img src="${potImg()}" alt="" draggable="false" /></span>
    <div class="pslots" id="pslots" aria-label="壺に入れた素材">${slot(0)}${slot(1)}${slot(2)}</div>
    <div class="pgoods" id="pgoods" aria-label="持ちもの（クリックかドラッグで壺に入れる）">${mine || '<small class="pnone">入れられる品がありません</small>'}</div>
    <div class="pacts">${btn('craft-go', '配合する', { cls: 'primary', disabled: !plan || !!plan.block, sfx: 'none' })}${btn('recipes', '配合表', { cls: 'ghost', sfx: 'open' })}${popsOn(g) ? '' : btn('grid', '棚へ戻る', { arg: 'shelf', cls: 'ghost', sfx: 'close' })}</div>
  </div>`;
}

/** The recipe book: the rules, the line of the base in the pot, and the limited legendaries made so far. */
export function recipesModal(g: GameState): string {
  const plan = potCandidates(g).picked?.plan ?? C.planCraft(g, cat, ui.craft);
  const names = ['', 'コモン', 'アンコモン', 'レア', 'エピック', 'レジェンダリー'];
  const fee = (rarity: number): number => Math.round(B.rarityValue[rarity] * B.craftFee);
  const rows = [1, 2, 3, 4, 5]
    .map(
      (r) =>
        `<tr><td><span class="tag rar r${r}">${names[r]}</span></td><td>${B.craftPoints[r]} 点</td><td>${r < 5 ? names[r + 1] : 'リミテッド'}</td><td>${num(r < 5 ? fee(r + 1) : Math.round(B.limitedValue * B.craftFee))}</td></tr>`,
    )
    .join('');
  const line = plan.base
    ? `<h3 class="rc-sub">いまの土台の系列</h3><div class="lineage">${C.lineOf(cat, plan.base)
        .map((item) => `<span class="lin ${item.id === plan.base!.id ? 'here' : ''} ${g.made.includes(item.id) ? 'made' : ''}" style="${tone(item)}">${itemTile(item, 'sm')}<small>${esc(item.ja)}</small><em>${mark(item)}</em></span>`)
        .join('<i class="lin-arrow">▶</i>')}</div>`
    : '';
  // the special pairings: the ones the base in the pot takes part in come first
  const tile = (line: number): Item | null => C.goodOfLine(cat, line, 1) ?? C.goodOfLine(cat, line, 2) ?? C.goodOfLine(cat, line, 5);
  const mine = plan.base ? C.lineNo(plan.base) : -1;
  const crossRows = [...C.CROSSES]
    .sort((x, y) => Number(y[0] === mine || y[1] === mine) - Number(x[0] === mine || x[1] === mine))
    .map(([a, b, out]) => {
      const known = g.crosses.includes(C.crossKey(a, b));
      const cell = (line: number, hide = false): string => {
        const item = tile(line);
        return item ? `<span class="cx-cell ${hide ? 'unknown' : ''}">${hide ? '<b>？</b>' : itemTile(item, 'sm')}<small>${hide ? '？？？' : esc(item.series)}</small></span>` : '';
      };
      return `<div class="cx ${known ? 'known' : ''} ${a === mine || b === mine ? 'mine' : ''}">${cell(a)}<i>×</i>${cell(b)}<i>▶</i>${cell(out, !known)}</div>`;
    })
    .join('');
  const limited = cat.items.filter((i) => i.limited);
  const got = limited.filter((i) => g.made.includes(i.id)).length;
  const book = limited
    .map((item) => {
      const from = cat.itemById.get(item.id - 500) ?? cat.itemById.get(item.id - 1000);
      return g.made.includes(item.id)
        ? `<span class="lim made" style="${tone(item)}" title="${esc(item.ja)}">${itemTile(item, 'sm')}<small>${esc(item.ja)}</small></span>`
        : `<span class="lim"><b>？</b><small>${from ? `${esc(from.ja)} から` : ''}</small></span>`;
    })
    .join('');
  return `<div class="modal" id="modal-recipes" data-ui><div class="modal-box tall">
    <h2 class="modal-title"><small>RECIPES</small>配合表</h2>
    <div class="modal-scroll">
      <ul class="rc-rules">
        <li>壺に<b>素材を 3 つまで</b>入れると、できる品の<b>候補</b>が上に出ます（3 つまで）。作りたい候補を選んで配合します。</li>
        <li>素材のどれか 1 つが<b>土台</b>になり、同じ系列の <b>1 つ上のレアリティ</b>の品になります。どれを土台にするかで、候補が変わります。</li>
        <li>ほかの素材の点の合計が、<b>土台と同じ点</b>に届けば配合できます。安い素材 2 個でも足ります。</li>
        <li>ほかの素材がすべて土台と<b>同じ系統</b>（PHY・INT・AGI）なら<b>相性◎</b>。品質が 1 段上がります。</li>
        <li>壺は <b>1 日 ${B.craftPerDay} 回</b>まで。配合のたびに、お布施（できる品の相場の ${Math.round(B.craftFee * 100)}%）を納めます。</li>
        <li><b>変わり配合</b>：決まった 2 つの系列を合わせると、別の系列の品になります（下の一覧）。まだ作ったことのない変わり配合は、候補に「？」で出ます。</li>
        <li><b>リミテッド</b>（リミテッドレジェンダリー）は、お客さんが持ちこむことはありません。レジェンダリーを土台に、壺で作るしかありません。</li>
      </ul>
      <table class="rc-table"><thead><tr><th>品</th><th>点</th><th>土台にするとできる品</th><th>お布施</th></tr></thead><tbody>${rows}</tbody></table>
      ${line}
      <h3 class="rc-sub">変わり配合 <em>${g.crosses.length} / ${C.CROSSES.length}</em></h3>
      <p class="rc-note">決まった 2 つの系列を合わせると、別の系列の品（土台の 1 つ上のレアリティ・必ず美品）になります。どちらを土台にしてもかまいません。できる品は、作ると載ります。</p>
      <div class="cxbook">${crossRows}</div>
      <h3 class="rc-sub">リミテッド図鑑 <em>${got} / ${limited.length}</em></h3>
      <div class="limbook">${book}</div>
    </div>
    <div class="actions one">${btn('modal-close', '閉じる', { cls: 'primary' })}</div>
  </div></div>`;
}

/** In a good's details: what the pot can make of it (so that buying it can be weighed against that). */
export function craftNote(g: GameState, item: Item): string {
  if (item.wallet) return '';
  const next = C.nextOf(cat, item);
  const name = (line: number): string => (C.goodOfLine(cat, line, 1) ?? C.goodOfLine(cat, line, 2) ?? C.goodOfLine(cat, line, 5))?.series ?? '？';
  const line = C.lineNo(item);
  const pairs = item.limited ? [] : C.crossesOfLine(line).filter(([, out]) => C.goodOfLine(cat, out, item.rarity + 1));
  if (!next && pairs.length === 0) return '';
  const own = next ? `<li>土台にすると ▶ <b>${esc(next.ja)}</b>（${mark(next)}・相手 ${C.pointsOf(item)} 点・お布施 ${num(C.feeOf(next))}）</li>` : '';
  const cross = pairs.map(([other, out]) => `<li>変わり配合：${esc(name(other))} と ▶ <b>${g.crosses.includes(C.crossKey(line, other)) ? esc(name(out)) : '？？？'}</b></li>`).join('');
  return `<div class="item-craft"><h4>合成</h4><ul>${own}${cross}<li>相手にすると ${C.pointsOf(item)} 点</li></ul></div>`;
}

/** Where the board's pieces are, for the show (after a render). */
export const potEl = (): HTMLElement | null => ctx.root.querySelector<HTMLElement>('#pot');
