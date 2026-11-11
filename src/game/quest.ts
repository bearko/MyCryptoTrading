import { B } from './balance';
import type { Catalog, Enemy, Fx } from './catalog';
import { addTo } from './logic';
import { canGoOut, goHome, playerStats } from './night';
import { pick, pickWeighted, rand, randRange } from './rng';
import { SLOT_IDS, type Battle, type Fighter, type GameState, type LooseItem, type Quest } from './state';

// ---------------------------------------------------------------- the damage rules (after My Crypto Heroes)

/** Damage cut in %: half the defender's matching stat (PHY against PHY attacks, INT against INT), capped at 40. */
export const cutRate = (defenderStat: number): number => Math.min(B.cutCap, Math.floor(defenderStat / 2));

/** PHY / INT damage: attacker's stat × skill % × (100 − cut) %, rounded down. */
export function damage(attackerStat: number, pct: number, defenderStat: number): number {
  return Math.max(0, Math.floor((((attackerStat * pct) / 100) * (100 - cutRate(defenderStat))) / 100));
}

/** Healing coefficient: (user's INT + target's PHY) / 2, or with the two swapped for PHY healing. */
export const healCoef = (kind: 'phy' | 'int', user: Fighter, target: Fighter): number => (kind === 'int' ? (user.int + target.phy) / 2 : (user.phy + target.int) / 2);

const clampStat = (v: number): number => Math.min(999, Math.max(1, Math.round(v)));

function fighter(hp: number, phy: number, int: number, agi: number): Fighter {
  const st = { phy: clampStat(phy), int: clampStat(int), agi: clampStat(agi) };
  return { hp: Math.max(1, Math.round(hp)), maxHp: Math.max(1, Math.round(hp)), ...st, base: { ...st }, status: {} };
}

/** How long a status lasts, in the sufferer's turns. */
const STATUS_TURNS: Record<string, number> = { 気絶: 1, 睡眠: 2, 混乱: 3, 恐怖: 3, 毒: 3, 出血: 3, 衰弱: 3, 呪い: 3 };
export const STATUS_HELP: Record<string, string> = {
  気絶: '1 回行動できない',
  睡眠: '行動できない（攻撃されると目覚める）',
  混乱: '半分の確率で行動に失敗する',
  恐怖: '与えるダメージが 30% 減る',
  毒: '行動のたびに最大 HP の 6% を失う',
  出血: '行動のたびに最大 HP の 6% を失う',
  衰弱: '回復の効果が半分になる',
  呪い: '受けるダメージが 20% 増える',
};

// ---------------------------------------------------------------- skills

export interface Skill {
  /** the worn good it comes from (0: bare hands) */
  itemId: number;
  name: string;
  text: string;
  fx: Fx[];
}

const PUNCH: Skill = { itemId: 0, name: 'なぐる', text: `敵に自身のPHYの${B.punch[0]} ~ ${B.punch[1]}%ダメージ`, fx: [{ t: 'dmg', stat: 'phy', min: B.punch[0], max: B.punch[1], side: 'foe' }] };

/** What the player can do on their turn: one skill per worn good, plus bare hands. */
export function skills(s: GameState, cat: Catalog): Skill[] {
  const list: Skill[] = [];
  for (const slot of SLOT_IDS) {
    const worn = s.equip[slot];
    if (!worn) continue;
    const item = cat.itemById.get(worn.itemId)!;
    if (item.fx.length > 0) list.push({ itemId: item.id, name: item.skill || item.ja, text: item.skillText, fx: item.fx });
  }
  list.push(PUNCH);
  return list;
}

/** Applies a skill's effects in order. Returns what happened, as log lines. */
function useSkill(s: GameState, name: string, fx: Fx[], user: Fighter, target: Fighter, userName: string, targetName: string): string[] {
  const log = [`${userName}の「${name}」`];
  for (const f of fx) {
    const on = f.side === 'foe' ? target : user;
    const onName = f.side === 'foe' ? targetName : userName;
    if (f.t === 'dmg') {
      const pct = randRange(s, f.min, f.max);
      let amount = damage(user[f.stat], pct, on[f.stat]);
      if (user.status['恐怖']) amount = Math.floor(amount * 0.7);
      if (on.status['呪い']) amount = Math.floor(amount * 1.2);
      on.hp = Math.max(0, on.hp - amount);
      if (on.status['睡眠'] && amount > 0) delete on.status['睡眠'];
      log.push(`${onName}に ${amount} ダメージ`);
    } else if (f.t === 'heal') {
      let amount = Math.floor((healCoef(f.coef, user, on) * randRange(s, f.min, f.max)) / 100);
      if (on.status['衰弱']) amount = Math.floor(amount / 2);
      amount = Math.min(amount, on.maxHp - on.hp);
      on.hp += amount;
      log.push(`${onName}の HP が ${amount} 回復`);
    } else if (f.t === 'stat') {
      let from: number;
      if (f.base === 'flat') from = 100;
      else if (f.base === 'gain') from = Math.max(0, on[f.stat] - on.base[f.stat]);
      else if (f.base === 'loss') from = Math.max(0, on.base[f.stat] - on[f.stat]);
      else {
        const [who, stat] = f.base.split(':') as ['user' | 'target', 'phy' | 'int' | 'agi'];
        from = (who === 'user' ? user : on)[stat];
      }
      const delta = Math.floor((from * f.pct) / 100);
      if (delta <= 0) continue;
      const before = on[f.stat];
      on[f.stat] = clampStat(before + f.dir * delta);
      if (on[f.stat] !== before) log.push(`${onName}の ${f.stat.toUpperCase()} が ${Math.abs(on[f.stat] - before)} ${f.dir > 0 ? 'アップ' : 'ダウン'}`);
    } else if (rand(s) * 100 < f.rate) {
      on.status[f.name] = STATUS_TURNS[f.name] ?? 2;
      log.push(`${onName}は${f.name}になった`);
    }
    if (user.hp <= 0 || target.hp <= 0) break;
  }
  return log;
}

/** Start of a fighter's turn: statuses may stop the action. Returns a log line when the turn is lost. */
function blocked(s: GameState, f: Fighter, name: string): string | null {
  for (const key of ['気絶', '睡眠'] as const) {
    if (f.status[key]) {
      tick(f, key);
      return `${name}は${key}で動けない`;
    }
  }
  if (f.status['混乱']) {
    tick(f, '混乱');
    if (rand(s) < 0.5) return `${name}は混乱して動けない`;
  }
  return null;
}

function tick(f: Fighter, key: string): void {
  f.status[key] -= 1;
  if (f.status[key] <= 0) delete f.status[key];
}

/** End of a fighter's turn: poison and bleeding hurt, and timed statuses run down. */
function afterTurn(f: Fighter, name: string): string[] {
  const log: string[] = [];
  for (const key of ['毒', '出血'] as const) {
    if (f.status[key] && f.hp > 0) {
      const amount = Math.max(1, Math.floor(f.maxHp * 0.06));
      f.hp = Math.max(0, f.hp - amount);
      log.push(`${name}は${key}で ${amount} ダメージ`);
    }
  }
  for (const key of ['毒', '出血', '恐怖', '衰弱', '呪い']) if (f.status[key]) tick(f, key);
  return log;
}

// ---------------------------------------------------------------- the dungeon

export const enemyOf = (cat: Catalog, b: Battle): Enemy => (b.boss ? cat.bosses : cat.enemies).find((e) => e.id === b.enemyId)!;

function makeFoe(enemy: Enemy, depth: number, boss: boolean): Fighter {
  const power = B.questPowerBase * B.questPowerGrowth ** (depth - 1) * (boss ? B.questBossMult : 1);
  const [hp, phy, int, agi] = enemy.trend.map((t) => (t / 100) * power);
  return fighter(hp * B.questHpMult, phy, int, agi);
}

/** Sets out for the dungeon with what is worn. Full HP at the door. */
export function startQuest(s: GameState, cat: Catalog): boolean {
  if (!canGoOut(s)) return false;
  s.wentOut = true;
  s.phase = 'quest';
  const [hp, phy, int, agi] = playerStats(s, cat);
  s.quest = { depth: 0, me: fighter(hp, phy, int, agi), battle: null, log: ['ダンジョンの入口に立った。'], found: null, loot: [], gumFound: 0, ended: null };
  return true;
}

function rollLoot(s: GameState, cat: Catalog, depth: number, bonus = 0): LooseItem {
  const weights = [Math.max(5, 60 - depth * 6), 30, 6 + depth * 3, depth * 2, Math.max(0, depth - 5)];
  const rarity = Math.min(5, 1 + pickWeighted(s, weights) + bonus);
  return { itemId: pick(s, cat.itemsByRarity[rarity]).id, cond: pickWeighted(s, B.condWeights), paid: 0 };
}

/** A good turns up: into the wallet if it fits, else it lies on the ground until taken or left. */
function gain(s: GameState, cat: Catalog, q: Quest, loose: LooseItem): void {
  const name = cat.itemById.get(loose.itemId)!.ja;
  const uid = addTo(s, cat, 'wallet', loose.itemId, loose.cond, 0);
  if (uid !== null) {
    q.loot.push(uid);
    q.log.push(`「${name}」をウォレットに入れた。`);
  } else {
    q.found = loose;
    q.log.push(`「${name}」を見つけたが、ウォレットに入らない。`);
  }
}

/** Tries again to put the good on the ground into the wallet (after making room). */
export function takeFound(s: GameState, cat: Catalog): boolean {
  const q = s.quest;
  if (!q?.found) return false;
  const uid = addTo(s, cat, 'wallet', q.found.itemId, q.found.cond, 0);
  if (uid === null) return false;
  q.loot.push(uid);
  q.found = null;
  return true;
}

export function leaveFound(s: GameState): void {
  if (s.quest) s.quest.found = null;
}

/** One step deeper. Something happens: an enemy, a good on the ground, nothing, luck or bad luck. */
export function advance(s: GameState, cat: Catalog): void {
  const q = s.quest;
  if (!q || q.ended || q.battle) return;
  q.found = null;
  q.depth += 1;
  s.totals.deepest = Math.max(s.totals.deepest, q.depth);
  q.log = [`地下 ${q.depth} 階へ進んだ。`];
  const boss = q.depth >= B.questDepth;
  const roll = boss ? 0 : pickWeighted(s, B.questRoll);
  if (roll === 0) {
    const enemy = pick(s, boss ? cat.bosses : cat.enemies);
    q.battle = { enemyId: enemy.id, boss, foe: makeFoe(enemy, q.depth, boss), foeAct: 0, runs: 0, turn: 1, log: [`${enemy.ja}が現れた！`], over: null };
  } else if (roll === 1) {
    gain(s, cat, q, rollLoot(s, cat, q.depth));
  } else if (roll === 2) {
    q.log.push('静かな通路が続いている。');
  } else if (roll === 3) {
    if (rand(s) < 0.5) {
      const found = Math.round(randRange(s, 15, 30) * q.depth);
      s.gum += found;
      q.gumFound += found;
      q.log.push(`ラッキー！ ${found} GUM を拾った。`);
    } else {
      const amount = Math.min(q.me.maxHp - q.me.hp, Math.floor(q.me.maxHp * 0.3));
      q.me.hp += amount;
      q.log.push(`ラッキー！ 泉を見つけた。HP が ${amount} 回復。`);
    }
  } else {
    const amount = Math.min(q.me.hp - 1, Math.floor(q.me.maxHp * 0.12));
    q.me.hp -= amount;
    q.log.push(`アンラッキー！ 罠にかかった。${amount} ダメージ。`);
  }
}

/** Chance that running works right now (the third try always does). */
export function runChance(s: GameState): number {
  const b = s.quest?.battle;
  if (!s.quest || !b) return 0;
  if (b.runs >= 2) return 1;
  return Math.min(B.runMax, Math.max(B.runMin, B.runBase + (s.quest.me.agi - b.foe.agi) * B.runPerAgi));
}

function foeTurn(s: GameState, cat: Catalog, q: Quest, b: Battle): void {
  const enemy = enemyOf(cat, b);
  const stop = blocked(s, b.foe, enemy.ja);
  if (stop) b.log.push(stop);
  else {
    const act = enemy.acts[b.foeAct % Math.max(1, enemy.acts.length)] ?? { name: '攻撃', fx: PUNCH.fx };
    b.foeAct += 1;
    b.log.push(...useSkill(s, act.name, act.fx, b.foe, q.me, enemy.ja, 'あなた'));
  }
  b.log.push(...afterTurn(b.foe, enemy.ja));
}

function settle(s: GameState, cat: Catalog, q: Quest, b: Battle): boolean {
  if (q.me.hp <= 0) {
    b.over = 'lost';
    b.log.push('あなたは倒れた……');
    // everything picked up on this run is lost
    s.wallet.items = s.wallet.items.filter((x) => !q.loot.includes(x.uid));
    q.loot = [];
    q.found = null;
    q.ended = 'lost';
    return true;
  }
  if (b.foe.hp <= 0) {
    b.over = 'won';
    const reward = Math.round(randRange(s, 6, 12) * q.depth * (b.boss ? 4 : 1));
    s.gum += reward;
    q.gumFound += reward;
    b.log.push(`${enemyOf(cat, b).ja}を倒した！ ${reward} GUM を手に入れた。`);
    return true;
  }
  return false;
}

/**
 * One round: the player uses a skill (or tries to run), the enemy acts; the higher AGI goes first.
 * `skillIndex` −1 means running away.
 */
export function fight(s: GameState, cat: Catalog, skillIndex: number): void {
  const q = s.quest;
  const b = q?.battle;
  if (!q || !b || b.over) return;
  const enemy = enemyOf(cat, b);
  b.log = [];
  const mine = (): void => {
    const stop = blocked(s, q.me, 'あなた');
    if (stop) b.log.push(stop);
    else if (skillIndex < 0) {
      const chance = runChance(s);
      b.runs += 1;
      if (rand(s) < chance) {
        b.over = 'fled';
        b.log.push('うまく逃げ切った。');
        return;
      }
      b.log.push('逃げられなかった！');
    } else {
      const skill = skills(s, cat)[skillIndex] ?? PUNCH;
      b.log.push(...useSkill(s, skill.name, skill.fx, q.me, b.foe, 'あなた', enemy.ja));
    }
    b.log.push(...afterTurn(q.me, 'あなた'));
  };
  const order = q.me.agi >= b.foe.agi ? [mine, () => foeTurn(s, cat, q, b)] : [() => foeTurn(s, cat, q, b), mine];
  for (const turn of order) {
    turn();
    if (b.over || settle(s, cat, q, b)) break;
  }
  b.turn += 1;
}

/** Leaves the finished battle: loot may drop; beating the boss ends the run. */
export function afterBattle(s: GameState, cat: Catalog): void {
  const q = s.quest;
  const b = q?.battle;
  if (!q || !b || !b.over) return;
  q.battle = null;
  q.log = [];
  if (b.over === 'won') {
    q.log.push(`${enemyOf(cat, b).ja}を倒した。`);
    if (b.boss) {
      gain(s, cat, q, rollLoot(s, cat, q.depth, 1));
      q.ended = 'cleared';
      q.log.push('最深部を制覇した！');
    } else if (rand(s) < B.questDropChance) {
      gain(s, cat, q, rollLoot(s, cat, q.depth));
    }
  } else if (b.over === 'fled') {
    q.log.push('敵から逃げた。');
  }
}

/** Turns back. Everything in the wallet comes home. */
export function turnBack(s: GameState): void {
  const q = s.quest;
  if (q && !q.battle && !q.ended) q.ended = 'home';
}

/** Back at the shop (after walking home, a defeat, or clearing the deepest floor). */
export function finishQuest(s: GameState, cat: Catalog): void {
  if (s.quest?.ended) goHome(s, cat);
}
