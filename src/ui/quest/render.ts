/**
 * The quest screen as HTML: a pure picture of the game state and the playback state (view.ts).
 * Persistent parts carry stable ids so the page keeps them (and their running motion) between redraws;
 * one-shot parts carry a fresh key in their id so they play their entry animation once.
 */
import { B } from '../../game/balance';
import { catalog as cat, type Item, type StatKey } from '../../game/catalog';
import * as Q from '../../game/quest';
import type { Fighter, GameState } from '../../game/state';
import type { View } from './view';

export const esc = (text: string | number): string =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const num = (n: number): string => n.toLocaleString('ja-JP');
const pct = (p: number): string => `${Math.round(p * 100)}%`;

/** Shape marks of the parameter lines (never colour alone). */
export const GLYPH: Record<string, string> = { phy: '▲', int: '◆', agi: '●', hp: '■' };
export const STAT_JA: Record<string, string> = { phy: 'PHY', int: 'INT', agi: 'AGI', hp: 'HP' };
export const STATUS_LIST = ['気絶', '睡眠', '混乱', '恐怖', '毒', '出血', '衰弱', '呪い'];

const svg = (path: string, box = 16): string => `<svg class="q-ico" viewBox="0 0 ${box} ${box}" aria-hidden="true">${path}</svg>`;
const ICO = {
  hit: svg('<path d="M13.5 1 15 2.5 7.6 10l1.2 1.2-1.3 1.3-1.4-1.4L3.4 13.800 2 15l-1-1 1.200-1.400L4.900 9.900 3.500 8.500l1.300-1.300L6 8.400z"/>'),
  heal: svg('<path d="M6 1h4v5h5v4h-5v5H6v-5H1V6h5z"/>'),
  up: svg('<path d="M8 2l6 7h-4v5H6V9H2z"/>'),
  down: svg('<path d="M8 14 2 7h4V2h4v5h4z"/>'),
  status: svg('<path d="M8 1a6 6 0 0 0-3.500 10.900V14h7v-2.100A6 6 0 0 0 8 1zM5.500 6.200a1.400 1.400 0 1 1 0 2.800 1.400 1.400 0 0 1 0-2.800zm5 0a1.400 1.400 0 1 1 0 2.800 1.400 1.400 0 0 1 0-2.800z"/>'),
  bag: svg('<path d="M5 4a3 3 0 0 1 6 0h3l1 11H1L2 4zm1.500 0h3a1.500 1.500 0 0 0-3 0z"/>'),
  deeper: svg('<path d="M2 2h5v4h4v4h3v4H2z"/>'),
  home: svg('<path d="M8 1 15 8h-2v7H9v-4H7v4H3V8H1z"/>'),
  run: svg('<path d="M10.500 1a1.700 1.700 0 1 1 0 3.400 1.700 1.700 0 0 1 0-3.400zM6 5l3.500-.5 2 2.500 2.500.5v1.700L10.500 8.500 9.500 7.300 8.500 10l2.500 2v3H9.200v-2.200L6.500 11 5 14.500H3l2-5 1-2.700-1.700.5L3.500 9.500H1.800L3 6z"/>'),
  skull: svg('<path d="M8 1a6 6 0 0 0-3.500 10.900V14h7v-2.100A6 6 0 0 0 8 1zM5.500 6.200a1.400 1.400 0 1 1 0 2.800 1.400 1.400 0 0 1 0-2.800zm5 0a1.400 1.400 0 1 1 0 2.800 1.400 1.400 0 0 1 0-2.800z"/>'),
};

const floorName = (depth: number): string => (depth <= 0 ? '入口' : `B${depth}F`);
const enemyById = (id: number, boss: boolean) => (boss ? cat.bosses : cat.enemies).find((e) => e.id === id) ?? cat.enemies[0];

// ---------------------------------------------------------------- shared parts

function hpBar(side: Q.Side, f: Fighter): string {
  const r = Math.max(0, Math.min(1, f.hp / f.maxHp));
  const tone = r > 0.5 ? 'ok' : r > 0.25 ? 'mid' : 'low';
  return `<div class="q-hp q-hp-${tone}" id="q-${side}-hp" role="img" aria-label="HP ${f.hp} / ${f.maxHp}">
    <i class="q-hp-ghost" style="transform:scaleX(${r.toFixed(4)})"></i><i class="q-hp-fill" style="transform:scaleX(${r.toFixed(4)})"></i>
    <span class="q-hp-num"><em>HP</em><b>${num(f.hp)}</b><small>/${num(f.maxHp)}</small></span>
  </div>`;
}

function statChips(side: Q.Side, f: Fighter): string {
  const one = (k: StatKey): string => {
    const d = f[k] - f.base[k];
    const cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
    const word = d > 0 ? `（${d} 上がっている）` : d < 0 ? `（${-d} 下がっている）` : '';
    return `<span class="q-chip q-st-${k} ${cls}" id="q-${side}-st-${k}" role="img" aria-label="${STAT_JA[k]} ${f[k]}${word}"><i>${GLYPH[k]}</i><em>${STAT_JA[k]}</em><b>${f[k]}</b>${d > 0 ? ICO.up : d < 0 ? ICO.down : ''}</span>`;
  };
  return one('phy') + one('int') + one('agi');
}

/** Every status has its own fixed slot (shown or hidden), so one wearing off never disturbs the others. */
function statusBadges(side: Q.Side, f: Fighter): string {
  return STATUS_LIST.map((name, i) => {
    const turns = f.status[name];
    if (!turns) return `<span class="q-status" id="q-${side}-sx-${i}" hidden></span>`;
    const help = Q.STATUS_HELP[name] ?? '';
    return `<span class="q-status" id="q-${side}-sx-${i}" role="img" aria-label="${esc(name)}：${esc(help)}（あと ${turns} 回）" title="${esc(help)}">${esc(name)}<b>${turns}</b></span>`;
  }).join('');
}

function tape(v: View): string {
  const lines = v.tape.slice(-3);
  return `<ul class="q-tape" id="q-tape" aria-live="polite" aria-label="できごと">${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`;
}

const sprite = (item: Item, cls = ''): string => `<img class="q-item ${cls}" src="${item.img}" alt="${esc(item.ja)}" draggable="false" />`;
const lineOf = (item: Item): string => `--la:var(--c-${item.params[0]});--lb:var(--c-${item.params[1] ?? item.params[0]})`;
const lineTags = (item: Item): string => item.params.map((p) => `<span class="q-line q-ln-${p}"><i>${GLYPH[p]}</i>${STAT_JA[p]}</span>`).join('');

// ---------------------------------------------------------------- the corridor

function track(depth: number): string {
  let nodes = '';
  for (let n = 1; n <= B.questDepth; n++) {
    const boss = n === B.questDepth;
    const state = n < depth ? 'done' : n === depth ? 'here' : '';
    nodes += `<li class="${state} ${boss ? 'boss' : ''}" id="q-node-${n}">${boss ? ICO.skull : `<span>${n}</span>`}</li>`;
  }
  const where = depth <= 0 ? 'ダンジョンの入口' : `地下 ${depth} 階 <small>/ ${B.questDepth}</small>`;
  return `<ol class="q-track" id="q-track" aria-label="いま地下 ${depth} 階（最深部は地下 ${B.questDepth} 階）">${nodes}</ol><div class="q-where" id="q-where" aria-hidden="true">${where}</div>`;
}

function card(g: GameState, v: View): string {
  const e = v.card;
  if (!e) return '';
  const id = `q-card-${e.id}`;
  switch (e.t) {
    case 'enter':
      return `<div class="q-card q-card-note" id="${id}"><b>ダンジョンの入口</b><p>地下 ${B.questDepth} 階に主がいる。倒れると、拾った品をすべて失う。</p></div>`;
    case 'quiet':
      return `<div class="q-card q-card-note" id="${id}"><b>……</b><p>静かな通路が続いている。</p></div>`;
    case 'gum':
      return `<div class="q-card q-card-gum" id="${id}"><span class="q-card-tag">ラッキー！</span><b><img src="${cat.icons.gum}" alt="" />+${num(e.amount)}<small>GUM</small></b></div>`;
    case 'heal':
      return `<div class="q-card q-card-heal" id="${id}"><span class="q-card-tag">ラッキー！</span><b>+${num(e.amount)}<small>HP</small></b><p>泉を見つけた。</p></div>`;
    case 'trap':
      return `<div class="q-card q-card-trap" id="${id}"><span class="q-card-tag">アンラッキー！</span><b>−${num(e.amount)}<small>HP</small></b><p>罠にかかった。</p></div>`;
    case 'beaten':
      return `<div class="q-card q-card-note" id="${id}"><b>${esc(enemyById(e.enemyId, e.boss).ja)}</b><p>を倒した。</p></div>`;
    case 'fled':
      return `<div class="q-card q-card-note" id="${id}"><b>ふう……</b><p>敵から逃げ切った。</p></div>`;
    case 'found': {
      const item = cat.itemById.get(e.itemId)!;
      if (e.stowed) {
        return `<div class="q-card q-card-found" id="${id}" style="${lineOf(item)}">
          <span class="q-card-tag">拾った！</span>
          <div class="q-find"><i class="q-rays"></i>${sprite(item, 'q-find-img')}</div>
          <b class="q-find-name">${esc(item.ja)}</b>
          <div class="q-lines">${lineTags(item)}<span class="q-line q-line-plain">ウォレットへ</span></div>
        </div>`;
      }
      const stuck = !!g.quest?.found && !v.playing;
      return `<div class="q-card q-card-stuck" id="${id}" style="${lineOf(item)}">
        <span class="q-card-tag q-bad">ウォレットに入らない</span>
        <div class="q-stuck-row"><div class="q-find">${sprite(item, 'q-find-img')}</div>
          <div><b class="q-find-name">${esc(item.ja)}</b><p>下のウォレットを並べ替えるか、品を捨てて場所を作れる。</p></div></div>
        ${stuck ? `<div class="q-stuck-acts"><button class="q-mini q-mini-go" data-act="q-take">もう一度入れる</button><button class="q-mini" data-act="q-leave">あきらめる</button></div>` : ''}
      </div>`;
    }
    default:
      return '';
  }
}

function lootRow(items: { itemId: number }[], crossed: boolean): string {
  if (items.length === 0) return `<span class="q-none">なし</span>`;
  const shown = items.slice(0, 7);
  const more = items.length - shown.length;
  return `<div class="q-loot ${crossed ? 'q-crossed' : ''}">${shown.map((x, i) => `<span style="--i:${i}">${sprite(cat.itemById.get(x.itemId)!)}</span>`).join('')}${more > 0 ? `<em>+${more}</em>` : ''}</div>`;
}

/** The card that closes a run: what comes home (or what was lost). */
function result(g: GameState, v: View): string {
  const q = g.quest!;
  if (v.ended === 'lost') {
    return `<div class="q-result q-result-lost" id="q-result" role="status">
      <div class="q-result-head"><b>力尽きた……</b><span>${floorName(v.depth)}</span></div>
      <div class="q-result-row"><span>失った品</span>${lootRow(v.lost, true)}</div>
      <div class="q-result-row"><span>拾った GUM</span><b class="q-gumline"><img src="${cat.icons.gum}" alt="" />+${num(v.gumFound)}<small>無事</small></b></div>
      <p>装備と、もとから持っていた品は無事。</p>
    </div>`;
  }
  const loot = g.wallet.items.filter((x) => q.loot.includes(x.uid));
  const cleared = v.ended === 'cleared';
  return `<div class="q-result ${cleared ? 'q-result-clear' : 'q-result-home'}" id="q-result" role="status">
    <div class="q-result-head"><b>${cleared ? '最深部を制覇！' : '引き返す'}</b><span>${cleared ? 'CLEAR' : `${floorName(v.depth)} まで`}</span></div>
    <div class="q-result-row"><span>持ち帰る品</span>${lootRow(loot, false)}</div>
    <div class="q-result-row"><span>拾った GUM</span><b class="q-gumline"><img src="${cat.icons.gum}" alt="" />+${num(v.gumFound)}</b></div>
  </div>`;
}

// ---------------------------------------------------------------- the battle

function order(v: View): string {
  const b = v.battle!;
  const first: Q.Side = v.me.agi >= (v.foe?.agi ?? 0) ? 'me' : 'foe';
  const second: Q.Side = first === 'me' ? 'foe' : 'me';
  const enemy = enemyById(b.enemyId, b.boss);
  const tok = (side: Q.Side, n: number): string =>
    `<span class="q-tok q-tok-${side} ${v.actor === side ? 'on' : ''}" id="q-tok-${side}"><b>${n}</b><img src="${side === 'me' ? cat.player.img : enemy.img}" alt="" draggable="false" /></span>`;
  return `<div class="q-order" id="q-order" role="img" aria-label="ターン ${b.turn}。行動順：${first === 'me' ? 'あなた → 敵' : '敵 → あなた'}（AGI の高いほうが先）">
    <em>TURN<b>${b.turn}</b></em>${tok(first, 1)}<i>▸</i>${tok(second, 2)}
  </div>`;
}

/** Sixteen pieces of the sprite that fly apart when the enemy falls. */
function shards(img: string): string {
  let out = '';
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const dx = (x - 1.5) * 46 + ((x * 7 + y * 13) % 9) * 5 - 20;
      const dy = (y - 1.5) * 34 - 60 - ((x * 5 + y * 3) % 7) * 8;
      const rot = ((x * 37 + y * 53) % 9) * 40 - 160;
      out += `<i style="left:${x * 25}%;top:${y * 25}%;background-image:url('${img}');background-position:${(x / 3) * 100}% ${(y / 3) * 100}%;--dx:${dx}px;--dy:${dy}px;--r:${rot}deg;--d:${(x + y) * 12}ms"></i>`;
    }
  }
  return `<div class="q-shards" id="q-shards" aria-hidden="true">${out}</div>`;
}

function battleStage(v: View): string {
  const b = v.battle!;
  const foe = v.foe!;
  const enemy = enemyById(b.enemyId, b.boss);
  const body =
    b.state === 'won'
      ? shards(enemy.img)
      : b.state === 'fled'
        ? ''
        : `<div class="q-foe-body" id="q-foe-body"><div class="q-foe-bob"><img id="q-foe-img" src="${enemy.img}" alt="${esc(enemy.ja)}" draggable="false" /></div></div>`;
  const cut = v.cutin
    ? `<div class="q-cutin q-cutin-${v.cutin.who} q-cutin-${v.cutin.kind} ${v.cutin.text.length > 13 ? 'q-cutin-xl' : v.cutin.text.length > 9 ? 'q-cutin-l' : ''}" id="q-cutin-${v.cutin.key}" role="status"><div><span>${
        v.cutin.itemId && cat.itemById.get(v.cutin.itemId) ? sprite(cat.itemById.get(v.cutin.itemId)!) : ''
      }<b>${esc(v.cutin.text)}</b></span></div></div>`
    : '';
  const impact = v.impact ? `<i class="q-impact q-impact-${v.impact.side} q-impact-${v.impact.tone} ${v.impact.big ? 'big' : ''}" id="q-impact-${v.impact.key}"></i>` : '';
  const win =
    b.state === 'won'
      ? `<div class="q-win" id="q-win" role="status"><b>WIN</b><span><img src="${cat.icons.gum}" alt="GUM" />+${num(b.reward)}</span></div>`
      : b.state === 'fled'
        ? `<div class="q-win q-win-fled" id="q-fled" role="status"><b>ESCAPE</b><span>うまく逃げ切った</span></div>`
        : '';
  // persistent parts first, in a fixed order; parts that come and go follow (stacking is done by z-index),
  // so the page never has to move a living element when one of them leaves
  return `<div class="q-foe q-foe-${b.state}" id="q-foe"><i class="q-foe-shadow"></i>${body}${v.impact?.side === 'foe' ? impact : ''}</div>
    <div class="q-foeinfo ${b.state === 'won' || b.state === 'fled' ? 'q-gone' : ''}" id="q-foeinfo">
      <div class="q-name" id="q-name">${b.boss ? '<i>BOSS</i>' : ''}<b>${esc(enemy.ja)}</b></div>
      ${hpBar('foe', foe)}
      <div class="q-chips" id="q-foe-chips">${statChips('foe', foe)}${statusBadges('foe', foe)}</div>
    </div>
    ${b.state === 'fight' || b.state === 'intro' ? order(v) : ''}
    ${cut}${win}`;
}

function effectRows(plan: Q.Forecast[]): string[] {
  const range = (lo: number, hi: number): string => (lo === hi ? num(lo) : `${num(lo)}–${num(hi)}`);
  const rows = plan.map((p) => {
    const foe = p.side === 'foe';
    if (p.t === 'dmg') return `<span class="q-ef q-ef-dmg q-st-${p.stat}">${ICO.hit}<i>${GLYPH[p.stat]}</i><b>${foe ? '' : '自分に '}≈${range(p.lo, p.hi)}</b></span>`;
    if (p.t === 'heal') return `<span class="q-ef q-ef-heal">${ICO.heal}<b>${foe ? '敵 ' : ''}${range(p.lo, p.hi)}</b></span>`;
    if (p.t === 'stat') return `<span class="q-ef q-ef-stat q-st-${p.stat} ${p.delta > 0 ? 'up' : 'down'}"><i>${GLYPH[p.stat]}</i><b>${foe ? '敵' : ''}${STAT_JA[p.stat]}${p.delta > 0 ? '+' : '−'}${Math.abs(p.delta)}</b>${p.delta > 0 ? ICO.up : ICO.down}</span>`;
    return `<span class="q-ef q-ef-status">${ICO.status}<b>${foe ? '' : '自分 '}${esc(p.name)} ${p.rate}%</b></span>`;
  });
  return rows.slice(0, 3);
}

function hand(g: GameState, v: View): string {
  const list = Q.skills(g, cat);
  const cards = list
    .map((k, i) => {
      const item = k.itemId ? cat.itemById.get(k.itemId) : undefined;
      const a = item?.params[0] ?? 'phy';
      const b = item?.params[1] ?? a;
      const rows = effectRows(Q.forecast(k.fx, v.me, v.foe!));
      // nothing to forecast right now (say, a skill that feeds on a buff nobody has): show its own words
      const body = rows.length > 0 ? rows.join('') : `<span class="q-ef-text">${esc(k.text)}</span>`;
      const state = `${v.picked === i ? 'q-picked' : ''} ${rows.length >= 3 ? 'q-skill-tight' : ''}`;
      return `<button class="q-skill ${state}" id="q-skill-${i}" data-act="q-skill" data-arg="${i}" style="--i:${i};--la:var(--c-${a});--lb:var(--c-${b})" aria-label="${esc(k.name)}。${esc(k.text)}"${v.playing ? ' aria-disabled="true"' : ''}>
        <span class="q-skill-top"><span class="q-skill-line"><i>${GLYPH[a]}</i>${STAT_JA[a]}${b !== a ? `<i class="q-second">${GLYPH[b]}</i>` : ''}</span><img src="${item ? item.img : cat.player.img}" alt="" draggable="false" /></span>
        <b class="q-skill-name">${esc(k.name)}</b>
        <span class="q-skill-fx">${body}</span>
      </button>`;
    })
    .join('');
  return `<div class="q-hand" id="q-hand" role="group" aria-label="スキルを選ぶ">${cards}</div>`;
}

function runSlab(g: GameState, v: View): string {
  const b = v.battle!;
  const sure = b.runs >= 2;
  const chance = sure ? 1 : Q.runChance(g);
  return `<button class="q-run ${sure ? 'q-run-sure' : ''} ${v.picked === -1 ? 'q-picked' : ''}" id="q-run" data-act="q-run"${v.playing ? ' aria-disabled="true"' : ''} aria-label="逃げる。${sure ? '必ず逃げられる' : `成功率 ${pct(chance)}`}">
    ${ICO.run}<b>逃げる</b><small>${sure ? '必ず逃げられる' : `成功 <em>${pct(chance)}</em>`}</small>
  </button>`;
}

// ---------------------------------------------------------------- the whole screen

/**
 * The enemy's outline as one filter: a crisp paper-white rim and a hard ink shadow. Sprites carry a soft
 * ground shadow of their own; pixels under half opacity are left out of the rim so it stays a shadow.
 */
const outline = (id: string, drop: string): string => `<filter id="${id}" x="-15%" y="-15%" width="135%" height="135%" color-interpolation-filters="sRGB">
    <feComponentTransfer in="SourceAlpha" result="solid"><feFuncA type="discrete" tableValues="0 0 1 1"/></feComponentTransfer>
    <feMorphology in="solid" operator="dilate" radius="2" result="fat"/>
    <feFlood style="flood-color:var(--paper)" result="light"/><feComposite in="light" in2="fat" operator="in" result="rim"/>
    <feOffset in="fat" dx="5" dy="5" result="off"/>
    <feFlood style="flood-color:var(${drop})" result="dark"/><feComposite in="dark" in2="off" operator="in" result="drop"/>
    <feMerge><feMergeNode in="drop"/><feMergeNode in="rim"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;
const DEFS = `<svg class="q-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${outline('q-outline', '--ink')}${outline('q-outline-boss', '--hot')}</defs></svg>`;

const slab = (act: string, cls: string, main: string, sub: string, icon = ''): string =>
  `<button class="q-slab ${cls}" id="q-btn-${act}" data-act="${act}"><span class="q-slab-in">${icon}<b>${main}</b>${sub ? `<small>${sub}</small>` : ''}</span></button>`;

export function screen(g: GameState, v: View): string {
  const q = g.quest!;
  const b = v.battle;
  const fighting = !!b && (b.state === 'fight' || b.state === 'intro');
  const lootCount = q.loot.length;

  let stage: string;
  let deck: string;
  let side = '';
  if (b) {
    stage = battleStage(v) + (b.state === 'lost' && v.ended === 'lost' ? result(g, v) : '');
    if (fighting) {
      deck = b.state === 'intro' ? `<div class="q-hand" id="q-hand"></div>` : hand(g, v);
      side = b.state === 'intro' ? '' : runSlab(g, v);
    } else if (v.playing) {
      deck = `<div class="q-deck-wait" id="q-deck-wait"></div>`;
    } else if (b.state === 'won') {
      deck = slab('q-after', 'q-slab-go q-slab-wide', b.boss ? '戦利品を見る' : 'つづける', b.boss ? '最深部の主を倒した' : '奥か、帰るかを選ぶ', ICO.deeper);
    } else if (b.state === 'fled') {
      deck = slab('q-after', 'q-slab-go q-slab-wide', 'つづける', '奥か、帰るかを選ぶ', ICO.deeper);
    } else {
      deck = slab('q-after', 'q-slab-plain q-slab-wide', '帰宅する', '店の前で目を覚ます', ICO.home);
    }
  } else if (v.ended) {
    const stuck = v.ended === 'cleared' && v.card?.t === 'found' && !v.card.stowed ? card(g, v) : '';
    stage = `${track(v.depth)}${stuck || result(g, v)}`;
    deck = v.playing ? `<div class="q-deck-wait" id="q-deck-wait"></div>` : slab('q-finish', 'q-slab-go q-slab-wide', '帰宅する', stuck ? 'この品はあきらめる' : '品と GUM を店へ持ち帰る', ICO.home);
  } else {
    const next = v.depth + 1;
    const boss = next >= B.questDepth;
    stage = `${track(v.depth)}${card(g, v)}`;
    const carry = `${ICO.bag}品 ${lootCount}　<img src="${cat.icons.gum}" alt="GUM" />+${num(v.gumFound)}`;
    deck = v.playing && q.ended
      ? `<div class="q-deck-wait" id="q-deck-wait"></div>`
      : `<div class="q-choices ${v.playing ? 'q-locked' : ''}" id="q-choices">
      ${slab('q-advance', `q-slab-go ${boss ? 'q-slab-boss' : ''}`, boss ? '最深部へ進む' : '奥へ進む', boss ? `${floorName(next)}　主が待つ` : `${floorName(next)} へ降りる`, ICO.deeper)}
      ${slab('q-back', 'q-slab-plain', '帰る', carry, ICO.home)}
    </div>`;
  }

  const bag = fighting
    ? side
    : `<div class="q-bag" id="q-bag" role="img" aria-label="この回に拾ったもの：品 ${lootCount} 個、${v.gumFound} GUM">
        <span>${ICO.bag}<b>${lootCount}</b></span><span><img src="${cat.icons.gum}" alt="" /><b>+${num(v.gumFound)}</b></span>
      </div>`;

  const cls = [
    'q-root',
    b ? 'q-battle' : 'q-explore',
    b?.boss ? 'q-boss' : '',
    b ? `q-b-${b.state}` : '',
    v.playing ? 'q-playing' : '',
    v.ended ? `q-ended q-ended-${v.ended}` : '',
    v.actor ? `q-actor-${v.actor}` : '',
  ].join(' ');
  const warn = v.warn ? `<div class="q-warn ${v.warn.boss ? 'q-warn-boss' : ''}" id="q-warn-${v.warn.key}" aria-hidden="true"><i></i><b><span>！</span></b><i></i></div>` : '';
  const meImpact = v.impact?.side === 'me' ? `<i class="q-impact q-impact-me q-impact-${v.impact.tone} ${v.impact.big ? 'big' : ''}" id="q-impact-${v.impact.key}"></i>` : '';

  return `<section class="${cls}" id="quest" style="--q-bg:url('${cat.dungeon}')" aria-label="クエスト：${v.depth <= 0 ? 'ダンジョンの入口' : `地下 ${v.depth} 階`}">
    ${DEFS}
    <div class="q-stage" id="q-stage">
      <div class="q-bg" id="q-bg"></div>
      <div class="q-tint"></div>
      <div class="q-dots"></div>
      <div class="q-floor ${v.depth <= 0 ? 'q-floor-door' : ''}" id="q-floor" aria-hidden="true"><b id="q-floor-n">${floorName(v.depth)}</b></div>
      <div class="q-fg" id="q-fg"></div>
      <div class="q-grey" id="q-grey" aria-hidden="true"></div>
      <div class="q-wipe" id="q-wipe" aria-hidden="true"></div>
      ${tape(v)}
      ${stage}
      ${warn}
    </div>
    <div class="q-me" id="q-me">
      <div class="q-face" id="q-me-face"><img src="${cat.player.img}" alt="あなた" draggable="false" /><em>YOU</em>${meImpact}</div>
      <div class="q-me-body">
        <div class="q-me-top">${hpBar('me', v.me)}<div class="q-me-status" id="q-me-status">${statusBadges('me', v.me)}</div></div>
        <div class="q-chips" id="q-me-chips">${statChips('me', v.me)}</div>
      </div>
      ${bag}
    </div>
    <div class="q-deck" id="q-deck">${deck}</div>
  </section>`;
}
