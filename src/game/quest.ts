import { B } from './balance';
import type { Catalog, Enemy, Fx, StatKey } from './catalog';
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

// ---------------------------------------------------------------- what happened (for the screen to stage)

export type Side = 'me' | 'foe';

/**
 * One thing that happened in a battle round, in the order it happened. The rules have already applied it;
 * `hp` / `value` are the numbers right after it, so the screen can follow along without redoing the maths.
 */
export type BattleEventBody =
  | { t: 'skill'; who: Side; name: string; itemId: number }
  | { t: 'dmg'; who: Side; target: Side; amount: number; stat: 'phy' | 'int'; cut: number; hp: number }
  | { t: 'heal'; who: Side; target: Side; amount: number; hp: number }
  | { t: 'stat'; target: Side; stat: StatKey; delta: number; value: number }
  | { t: 'status'; target: Side; name: string; turns: number }
  | { t: 'statusEnd'; target: Side; name: string }
  | { t: 'blocked'; who: Side; why: string }
  | { t: 'tick'; target: Side; name: string; amount: number; hp: number }
  | { t: 'run'; ok: boolean; chance: number; tries: number }
  | { t: 'ko'; who: Side }
  | { t: 'reward'; gum: number }
  | { t: 'lost'; items: { itemId: number; cond: number }[] };
export type BattleEvent = BattleEventBody & { id: number };

/** One thing that happened while walking the dungeon (outside a battle). */
export type QuestEventBody =
  | { t: 'enter' }
  | { t: 'floor'; depth: number }
  | { t: 'encounter'; enemyId: number; boss: boolean }
  | { t: 'found'; itemId: number; cond: number; stowed: boolean; uid: number | null }
  | { t: 'quiet' }
  | { t: 'gum'; amount: number }
  | { t: 'heal'; amount: number; hp: number }
  | { t: 'trap'; amount: number; hp: number }
  | { t: 'beaten'; enemyId: number; boss: boolean }
  | { t: 'fled' }
  | { t: 'cleared' }
  | { t: 'home' };
export type QuestEvent = QuestEventBody & { id: number };

/** Event ids only ever grow within a run, across battle and exploration, so a screen can tell which are new. */
const nextId = (q: Quest): number => (q.eid = (q.eid ?? 0) + 1);
const tell = (q: Quest, body: QuestEventBody): void => void q.events.push({ ...body, id: nextId(q) });
const report = (q: Quest, b: Battle, body: BattleEventBody): void => void b.events.push({ ...body, id: nextId(q) });

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

/** Damage of one hit at a given skill %: the damage rule, then fear (dealer) and curse (receiver). */
function hitAmount(user: Fighter, on: Fighter, stat: 'phy' | 'int', pct: number): number {
  let amount = damage(user[stat], pct, on[stat]);
  if (user.status['恐怖']) amount = Math.floor(amount * 0.7);
  if (on.status['呪い']) amount = Math.floor(amount * 1.2);
  return amount;
}

/** HP given back at a given skill %: halved by weakness, never above what is missing. */
function healAmount(user: Fighter, on: Fighter, coef: 'phy' | 'int', pct: number): number {
  let amount = Math.floor((healCoef(coef, user, on) * pct) / 100);
  if (on.status['衰弱']) amount = Math.floor(amount / 2);
  return Math.min(amount, on.maxHp - on.hp);
}

/** The new value of a stat after a buff / debuff (unchanged when the effect comes to nothing). */
function statAfter(f: Extract<Fx, { t: 'stat' }>, user: Fighter, on: Fighter): number {
  let from: number;
  if (f.base === 'flat') from = 100;
  else if (f.base === 'gain') from = Math.max(0, on[f.stat] - on.base[f.stat]);
  else if (f.base === 'loss') from = Math.max(0, on.base[f.stat] - on[f.stat]);
  else {
    const [who, stat] = f.base.split(':') as ['user' | 'target', StatKey];
    from = (who === 'user' ? user : on)[stat];
  }
  const delta = Math.floor((from * f.pct) / 100);
  return delta <= 0 ? on[f.stat] : clampStat(on[f.stat] + f.dir * delta);
}

/** Applies a skill's effects in order, noting each as a log line and as an event. */
function useSkill(s: GameState, q: Quest, b: Battle, skill: { name: string; itemId: number; fx: Fx[] }, who: Side, userName: string, targetName: string): void {
  const other: Side = who === 'me' ? 'foe' : 'me';
  const user = who === 'me' ? q.me : b.foe;
  const target = who === 'me' ? b.foe : q.me;
  b.log.push(`${userName}の「${skill.name}」`);
  report(q, b, { t: 'skill', who, name: skill.name, itemId: skill.itemId });
  for (const f of skill.fx) {
    const on = f.side === 'foe' ? target : user;
    const side = f.side === 'foe' ? other : who;
    const onName = f.side === 'foe' ? targetName : userName;
    if (f.t === 'dmg') {
      const amount = hitAmount(user, on, f.stat, randRange(s, f.min, f.max));
      const cut = cutRate(on[f.stat]);
      on.hp = Math.max(0, on.hp - amount);
      b.log.push(`${onName}に ${amount} ダメージ`);
      report(q, b, { t: 'dmg', who, target: side, amount, stat: f.stat, cut, hp: on.hp });
      if (on.status['睡眠'] && amount > 0) {
        delete on.status['睡眠'];
        report(q, b, { t: 'statusEnd', target: side, name: '睡眠' });
      }
    } else if (f.t === 'heal') {
      const amount = healAmount(user, on, f.coef, randRange(s, f.min, f.max));
      on.hp += amount;
      b.log.push(`${onName}の HP が ${amount} 回復`);
      report(q, b, { t: 'heal', who, target: side, amount, hp: on.hp });
    } else if (f.t === 'stat') {
      const before = on[f.stat];
      on[f.stat] = statAfter(f, user, on);
      if (on[f.stat] !== before) {
        b.log.push(`${onName}の ${f.stat.toUpperCase()} が ${Math.abs(on[f.stat] - before)} ${f.dir > 0 ? 'アップ' : 'ダウン'}`);
        report(q, b, { t: 'stat', target: side, stat: f.stat, delta: on[f.stat] - before, value: on[f.stat] });
      } else continue;
    } else if (rand(s) * 100 < f.rate) {
      on.status[f.name] = STATUS_TURNS[f.name] ?? 2;
      b.log.push(`${onName}は${f.name}になった`);
      report(q, b, { t: 'status', target: side, name: f.name, turns: on.status[f.name] });
    }
    if (user.hp <= 0 || target.hp <= 0) break;
  }
}

/** What one effect of a skill is expected to do right now (the lowest and highest roll). */
export type Forecast =
  | { t: 'dmg'; side: 'foe' | 'self'; stat: 'phy' | 'int'; lo: number; hi: number }
  | { t: 'heal'; side: 'foe' | 'self'; lo: number; hi: number }
  | { t: 'stat'; side: 'foe' | 'self'; stat: StatKey; delta: number }
  | { t: 'status'; side: 'foe' | 'self'; name: string; rate: number };

const cloneFighter = (f: Fighter): Fighter => ({ ...f, base: { ...f.base }, status: { ...f.status } });

/**
 * What a skill would do if used now, effect by effect, by the same rules as the battle (so a buff earlier in
 * the skill counts for a hit later in it). Chance-based statuses are listed with their chance, not applied.
 * Touches nothing and uses no random numbers.
 */
export function forecast(fx: Fx[], user: Fighter, target: Fighter): Forecast[] {
  const worlds = [0, 1].map(() => ({ user: cloneFighter(user), target: cloneFighter(target) }));
  const out: Forecast[] = [];
  for (const f of fx) {
    if (f.t === 'status') {
      out.push({ t: 'status', side: f.side, name: f.name, rate: f.rate });
      continue;
    }
    const got = worlds.map((w, i) => {
      const on = f.side === 'foe' ? w.target : w.user;
      if (f.t === 'dmg') {
        const amount = hitAmount(w.user, on, f.stat, i === 0 ? f.min : f.max);
        on.hp = Math.max(0, on.hp - amount);
        return amount;
      }
      if (f.t === 'heal') {
        const amount = healAmount(w.user, on, f.coef, i === 0 ? f.min : f.max);
        on.hp += amount;
        return amount;
      }
      const before = on[f.stat];
      on[f.stat] = statAfter(f, w.user, on);
      return on[f.stat] - before;
    });
    if (f.t === 'dmg') out.push({ t: 'dmg', side: f.side, stat: f.stat, lo: Math.min(...got), hi: Math.max(...got) });
    else if (f.t === 'heal') out.push({ t: 'heal', side: f.side, lo: Math.min(...got), hi: Math.max(...got) });
    else if (got[0] !== 0) out.push({ t: 'stat', side: f.side, stat: f.stat, delta: got[0] });
  }
  return out;
}

/** Start of a fighter's turn: statuses may stop the action. Returns a log line when the turn is lost. */
function blocked(s: GameState, q: Quest, b: Battle, who: Side, name: string): string | null {
  const f = who === 'me' ? q.me : b.foe;
  for (const key of ['気絶', '睡眠'] as const) {
    if (f.status[key]) {
      report(q, b, { t: 'blocked', who, why: key });
      tick(q, b, who, key);
      return `${name}は${key}で動けない`;
    }
  }
  if (f.status['混乱']) {
    const lost = rand(s) < 0.5;
    if (lost) report(q, b, { t: 'blocked', who, why: '混乱' });
    tick(q, b, who, '混乱');
    if (lost) return `${name}は混乱して動けない`;
  }
  return null;
}

function tick(q: Quest, b: Battle, who: Side, key: string): void {
  const f = who === 'me' ? q.me : b.foe;
  f.status[key] -= 1;
  if (f.status[key] <= 0) {
    delete f.status[key];
    report(q, b, { t: 'statusEnd', target: who, name: key });
  }
}

/** End of a fighter's turn: poison and bleeding hurt, and timed statuses run down. */
function afterTurn(q: Quest, b: Battle, who: Side, name: string): void {
  const f = who === 'me' ? q.me : b.foe;
  for (const key of ['毒', '出血'] as const) {
    if (f.status[key] && f.hp > 0) {
      const amount = Math.max(1, Math.floor(f.maxHp * 0.06));
      f.hp = Math.max(0, f.hp - amount);
      b.log.push(`${name}は${key}で ${amount} ダメージ`);
      report(q, b, { t: 'tick', target: who, name: key, amount, hp: f.hp });
    }
  }
  for (const key of ['毒', '出血', '恐怖', '衰弱', '呪い']) if (f.status[key]) tick(q, b, who, key);
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
  s.quest = { depth: 0, me: fighter(hp, phy, int, agi), battle: null, log: ['ダンジョンの入口に立った。'], found: null, loot: [], gumFound: 0, ended: null, events: [], eid: 0 };
  tell(s.quest, { t: 'enter' });
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
  tell(q, { t: 'found', itemId: loose.itemId, cond: loose.cond, stowed: uid !== null, uid });
}

/** Tries again to put the good on the ground into the wallet (after making room). */
export function takeFound(s: GameState, cat: Catalog): boolean {
  const q = s.quest;
  if (!q?.found) return false;
  const uid = addTo(s, cat, 'wallet', q.found.itemId, q.found.cond, 0);
  if (uid === null) return false;
  q.loot.push(uid);
  q.events = [];
  tell(q, { t: 'found', itemId: q.found.itemId, cond: q.found.cond, stowed: true, uid });
  q.found = null;
  return true;
}

export function leaveFound(s: GameState): void {
  if (!s.quest) return;
  s.quest.found = null;
  s.quest.events = [];
}

/** One step deeper. Something happens: an enemy, a good on the ground, nothing, luck or bad luck. */
export function advance(s: GameState, cat: Catalog): void {
  const q = s.quest;
  if (!q || q.ended || q.battle) return;
  q.found = null;
  q.depth += 1;
  s.totals.deepest = Math.max(s.totals.deepest, q.depth);
  q.log = [`地下 ${q.depth} 階へ進んだ。`];
  q.events = [];
  tell(q, { t: 'floor', depth: q.depth });
  const boss = q.depth >= B.questDepth;
  const roll = boss ? 0 : pickWeighted(s, B.questRoll);
  if (roll === 0) {
    const enemy = pick(s, boss ? cat.bosses : cat.enemies);
    q.battle = { enemyId: enemy.id, boss, foe: makeFoe(enemy, q.depth, boss), foeAct: 0, runs: 0, turn: 1, log: [`${enemy.ja}が現れた！`], over: null, events: [] };
    tell(q, { t: 'encounter', enemyId: enemy.id, boss });
  } else if (roll === 1) {
    gain(s, cat, q, rollLoot(s, cat, q.depth));
  } else if (roll === 2) {
    q.log.push('静かな通路が続いている。');
    tell(q, { t: 'quiet' });
  } else if (roll === 3) {
    if (rand(s) < 0.5) {
      const found = Math.round(randRange(s, 15, 30) * q.depth);
      s.gum += found;
      q.gumFound += found;
      q.log.push(`ラッキー！ ${found} GUM を拾った。`);
      tell(q, { t: 'gum', amount: found });
    } else {
      const amount = Math.min(q.me.maxHp - q.me.hp, Math.floor(q.me.maxHp * 0.3));
      q.me.hp += amount;
      q.log.push(`ラッキー！ 泉を見つけた。HP が ${amount} 回復。`);
      tell(q, { t: 'heal', amount, hp: q.me.hp });
    }
  } else {
    const amount = Math.min(q.me.hp - 1, Math.floor(q.me.maxHp * 0.12));
    q.me.hp -= amount;
    q.log.push(`アンラッキー！ 罠にかかった。${amount} ダメージ。`);
    tell(q, { t: 'trap', amount, hp: q.me.hp });
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
  const stop = blocked(s, q, b, 'foe', enemy.ja);
  if (stop) b.log.push(stop);
  else {
    const act = enemy.acts[b.foeAct % Math.max(1, enemy.acts.length)] ?? { name: '攻撃', fx: PUNCH.fx };
    b.foeAct += 1;
    useSkill(s, q, b, { name: act.name, itemId: 0, fx: act.fx }, 'foe', enemy.ja, 'あなた');
  }
  afterTurn(q, b, 'foe', enemy.ja);
}

function settle(s: GameState, cat: Catalog, q: Quest, b: Battle): boolean {
  if (q.me.hp <= 0) {
    b.over = 'lost';
    b.log.push('あなたは倒れた……');
    report(q, b, { t: 'ko', who: 'me' });
    // everything picked up on this run is lost
    const gone = s.wallet.items.filter((x) => q.loot.includes(x.uid)).map((x) => ({ itemId: x.itemId, cond: x.cond }));
    if (q.found) gone.push({ itemId: q.found.itemId, cond: q.found.cond });
    report(q, b, { t: 'lost', items: gone });
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
    report(q, b, { t: 'ko', who: 'foe' });
    report(q, b, { t: 'reward', gum: reward });
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
  b.events = [];
  const mine = (): void => {
    const stop = blocked(s, q, b, 'me', 'あなた');
    if (stop) b.log.push(stop);
    else if (skillIndex < 0) {
      const chance = runChance(s);
      b.runs += 1;
      const ok = rand(s) < chance;
      report(q, b, { t: 'run', ok, chance, tries: b.runs });
      if (ok) {
        b.over = 'fled';
        b.log.push('うまく逃げ切った。');
        return;
      }
      b.log.push('逃げられなかった！');
    } else {
      const skill = skills(s, cat)[skillIndex] ?? PUNCH;
      useSkill(s, q, b, skill, 'me', 'あなた', enemy.ja);
    }
    afterTurn(q, b, 'me', 'あなた');
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
  q.events = [];
  if (b.over === 'won') {
    q.log.push(`${enemyOf(cat, b).ja}を倒した。`);
    tell(q, { t: 'beaten', enemyId: b.enemyId, boss: b.boss });
    if (b.boss) {
      gain(s, cat, q, rollLoot(s, cat, q.depth, 1));
      q.ended = 'cleared';
      q.log.push('最深部を制覇した！');
      tell(q, { t: 'cleared' });
    } else if (rand(s) < B.questDropChance) {
      gain(s, cat, q, rollLoot(s, cat, q.depth));
    }
  } else if (b.over === 'fled') {
    q.log.push('敵から逃げた。');
    tell(q, { t: 'fled' });
  }
}

/** Turns back. Everything in the wallet comes home. */
export function turnBack(s: GameState): void {
  const q = s.quest;
  if (!q || q.battle || q.ended) return;
  q.ended = 'home';
  q.events = [];
  tell(q, { t: 'home' });
}

/** Back at the shop (after walking home, a defeat, or clearing the deepest floor). */
export function finishQuest(s: GameState, cat: Catalog): void {
  if (s.quest?.ended) goHome(s, cat);
}
