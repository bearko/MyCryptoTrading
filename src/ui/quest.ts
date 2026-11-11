import { B } from '../game/balance';
import { catalog as cat } from '../game/catalog';
import * as Q from '../game/quest';
import type { Fighter, GameState } from '../game/state';
import { btn, esc, num, pct } from './html';

function bar(f: Fighter): string {
  const w = Math.max(0, Math.round((f.hp / f.maxHp) * 100));
  return `<div class="hpbar"><i style="width:${w}%"></i><span>HP ${num(f.hp)} / ${num(f.maxHp)}</span></div>`;
}

function stats(f: Fighter): string {
  const one = (key: 'phy' | 'int' | 'agi'): string => {
    const cls = f[key] > f.base[key] ? 'up' : f[key] < f.base[key] ? 'down' : '';
    return `<span class="st ${cls}">${key.toUpperCase()} ${f[key]}</span>`;
  };
  const status = Object.keys(f.status)
    .map((name) => `<span class="st bad" title="${esc(Q.STATUS_HELP[name] ?? '')}">${esc(name)}</span>`)
    .join('');
  return `<div class="sts">${one('phy')}${one('int')}${one('agi')}${status}</div>`;
}

/** The dungeon: what is ahead (an enemy, or the corridor), the player's state, the log and the choices. */
export function questScreen(g: GameState): string {
  const q = g.quest!;
  const b = q.battle;
  let view: string;
  if (b) {
    const enemy = Q.enemyOf(cat, b);
    view = `<div class="foe ${b.foe.hp <= 0 ? 'down' : ''}">
        <div class="foe-info"><b>${esc(enemy.ja)}${b.boss ? '（最深部の主）' : ''}</b>${bar(b.foe)}${stats(b.foe)}</div>
        <img src="${enemy.img}" alt="" draggable="false" />
      </div>`;
  } else {
    view = `<div class="corridor">${q.ended === 'lost' ? '気がつくと、店の前に倒れていた。' : q.ended === 'cleared' ? '最深部を制覇した！' : q.depth === 0 ? 'ダンジョンの入口' : `地下 ${q.depth} 階`}</div>`;
  }

  const log = (b ? b.log : q.log).map((line) => `<li>${esc(line)}</li>`).join('');
  let actions: string;
  let hint = '';
  if (b && !b.over) {
    const list = Q.skills(g, cat);
    actions =
      list.map((k, i) => `<button class="btn skill" data-act="q-skill" data-arg="${i}"><span>${esc(k.name)}</span><small>${esc(k.text)}</small></button>`).join('') +
      btn('q-run', '逃げる', { cls: 'ghost', sub: `成功率 ${pct(Q.runChance(g))}${b.runs >= 2 ? '（必ず逃げられる）' : ''}` });
    hint = `<p class="hint">ターン ${b.turn}。AGI の高いほうが先に動きます（あなた ${q.me.agi}／敵 ${b.foe.agi}）。</p>`;
  } else if (b) {
    actions = btn('q-after', q.ended ? '帰宅する' : 'つづける', { cls: 'primary big' });
  } else if (q.ended) {
    const text = q.ended === 'lost' ? '今回拾った品はすべて失いました。' : `ウォレットの品と ${num(q.gumFound)} GUM を持ち帰ります。`;
    hint = `<p class="note ${q.ended === 'lost' ? 'bad' : 'good'}">${text}</p>`;
    actions = btn('q-finish', '帰宅する', { cls: 'primary big' });
  } else {
    const found = q.found
      ? `<p class="note bad">「${esc(cat.itemById.get(q.found.itemId)!.ja)}」がウォレットに入りません。下のウォレットを並べ替えるか、いらない品を捨てて場所を作れます。</p>
         <div class="actions">${btn('q-take', 'もう一度入れてみる')}${btn('q-leave', 'あきらめる', { cls: 'ghost' })}</div>`
      : '';
    hint = found;
    actions = btn('q-advance', q.depth + 1 >= B.questDepth ? '最深部へ進む' : '奥へ進む', { cls: 'primary' }) + btn('q-back', '帰る', { sub: 'ウォレットの品を持ち帰る' });
  }
  return `<section class="scene dungeon" style="background-image:url('${cat.dungeon}')">
      <div class="line-left">地下 ${q.depth} / ${B.questDepth} 階</div>${view}
    </section>
    <section class="qpanel">
      <div class="me"><img src="${cat.player.img}" alt="" /><div><b>あなた</b>${bar(q.me)}${stats(q.me)}</div></div>
      <ul class="qlog">${log}</ul>
      ${hint}
      <div class="actions ${b && !b.over ? 'one' : ''}">${actions}</div>
    </section>`;
}

/** Handles the quest's buttons. Returns true when the action was one of them. */
export function questAct(g: GameState, name: string, n: number): boolean {
  switch (name) {
    case 'q-advance':
      Q.advance(g, cat);
      return true;
    case 'q-back':
      Q.turnBack(g);
      return true;
    case 'q-skill':
      Q.fight(g, cat, n);
      return true;
    case 'q-run':
      Q.fight(g, cat, -1);
      return true;
    case 'q-after':
      Q.afterBattle(g, cat);
      if (g.quest?.ended === 'lost') Q.finishQuest(g, cat);
      return true;
    case 'q-take':
      Q.takeFound(g, cat);
      return true;
    case 'q-leave':
      Q.leaveFound(g);
      return true;
    case 'q-finish':
      Q.finishQuest(g, cat);
      return true;
  }
  return false;
}
