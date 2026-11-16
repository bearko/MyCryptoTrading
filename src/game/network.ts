import { B } from './balance';
import { MARK_JA, MARKS, SERIES_KIND, type Mark } from './kinds';
import type { GameState } from './state';


/**
 * The merchants' guild, on the other end of the shop's telephone: lasting favours for the shop.
 * Each can be paid for in GUM, or with the guild's trust — which grows a little every day.
 * Waiting costs nothing but days; paying is quicker and costs GUM.
 */
export type ServiceId = 'guest1' | 'guest2' | 'vip' | 'case1' | 'case2' | 'sign' | 'pot' | 'eye' | 'tip' | 'waiver' | `line-${Mark}`;

export interface Service {
  id: ServiceId;
  group: 'intro' | 'shop' | 'craft' | 'lines';
  name: string;
  text: string;
  gum: number;
  trust: number;
  /** the favour that must be had first */
  needs?: ServiceId;
}

export const GROUP_JA = { intro: '紹介', shop: '店構え', craft: '手ほどき', lines: '取り扱いの拡張' } as const;

/** The mark a favour opens as a line of goods, if it is one of those. */
export const lineOf = (id: ServiceId): Mark | null => (id.startsWith('line-') ? (id.slice(5) as Mark) : null);
const seriesWith = (mark: Mark): string[] => Object.keys(SERIES_KIND).filter((name) => SERIES_KIND[name].marks.includes(mark));
/** One favour for each line of goods: the guild finds the shop sellers of goods with that mark. */
const LINES: Service[] = MARKS.map((mark) => {
  const series = seriesWith(mark);
  return {
    id: `line-${mark}` as ServiceId,
    group: 'lines',
    name: `${MARK_JA[mark]}の品`,
    text: `${series.slice(0, 4).join('・')}${series.length > 4 ? ` など ${series.length} 種` : ''}を扱えるようになる`,
    gum: B.lineGum[0] + B.lineGum[1] * series.length,
    trust: Math.round(B.lineTrust[0] + B.lineTrust[1] * series.length),
  };
});

export const SERVICES: Service[] = [
  { id: 'guest1', group: 'intro', name: '客の紹介', text: '毎日の客 +1 人', gum: 450, trust: 60 },
  { id: 'guest2', group: 'intro', name: '客の紹介 II', text: 'さらに毎日の客 +1 人', gum: 1500, trust: 160, needs: 'guest1' },
  { id: 'vip', group: 'intro', name: '上客の口利き', text: 'レア以上のヒーローが来やすくなる', gum: 950, trust: 110 },
  { id: 'case1', group: 'shop', name: 'ショーケースの増設', text: 'ショーケースが 1 列広がる（2 → 3 列）', gum: 350, trust: 50 },
  { id: 'case2', group: 'shop', name: 'ショーケースの増設 II', text: 'ショーケースが 2 列広がる（3 → 5 列）', gum: 1200, trust: 140, needs: 'case1' },
  { id: 'sign', group: 'shop', name: '「求む」の看板', text: 'ショーケースに、買いたい系統を出せる', gum: 250, trust: 40 },
  { id: 'tip', group: 'shop', name: '見回りの知らせ', text: '見回りの来る日が、朝の紙面に出る', gum: 400, trust: 55 },
  { id: 'waiver', group: 'shop', name: '大家への口添え', text: '家賃を 1 回だけ待ってもらえる（払わなかった分は次回に上乗せ）', gum: 600, trust: 80 },
  { id: 'pot', group: 'craft', name: '壺の薪', text: '壺を 1 日にもう 1 回使える', gum: 800, trust: 100 },
  { id: 'eye', group: 'craft', name: '相場の手ほどき', text: `売り客の言い値 −${Math.round(B.serviceAsk * 100)}%`, gum: 700, trust: 90 },
  ...LINES,
];

export const serviceById = (id: ServiceId): Service => SERVICES.find((x) => x.id === id)!;
/** (a line of goods is had however it was taken up: by the guild, or by a house's regard) */
export const hasService = (s: GameState, id: ServiceId): boolean => {
  const mark = lineOf(id);
  return mark ? s.lines.includes(mark) : s.services.includes(id);
};

/** Why a favour cannot be had this way right now ('' when it can). */
export function serviceBlock(s: GameState, id: ServiceId, pay: 'gum' | 'trust'): '' | 'owned' | 'needs' | 'short' {
  const service = serviceById(id);
  if (hasService(s, id)) return 'owned';
  if (service.needs && !hasService(s, service.needs)) return 'needs';
  return (pay === 'gum' ? s.gum < service.gum : s.trust < service.trust) ? 'short' : '';
}

export function buyService(s: GameState, id: ServiceId, pay: 'gum' | 'trust'): boolean {
  if (serviceBlock(s, id, pay)) return false;
  const service = serviceById(id);
  if (pay === 'gum') {
    s.gum -= service.gum;
    s.today.spend += service.gum;
  } else s.trust -= service.trust;
  s.services.push(id);
  if (id === 'waiver') s.graceLeft += 1;
  const mark = lineOf(id);
  if (mark) {
    s.lines.push(mark);
    s.linesNew.push(mark);
  }
  return true;
}

/** How much the guild's trust grows each morning (a well-thought-of shop is trusted a little faster). */
export const trustDaily = (s: GameState): number => B.trustDaily + Math.floor(s.rep / B.trustPerRep);

// ---------------------------------------------------------------- goods to order

/** What the guild sends when asked: goods of the parameter line the shop names, at the door the next morning. */
export type SupplyId = keyof typeof B.supplies;

export interface Supply {
  id: SupplyId;
  name: string;
  text: string;
}

export const SUPPLIES: Supply[] = [
  { id: 'lot', name: '詰め合わせ', text: `コモン〜アンコモンを ${B.supplies.lot.count} 個` },
  { id: 'rare', name: 'レアの取り寄せ', text: 'レアを 1 個' },
  { id: 'epic', name: 'エピックの取り寄せ', text: 'エピックを 1 個' },
];

export const supplyById = (id: SupplyId): Supply => SUPPLIES.find((x) => x.id === id)!;

/** Why an order cannot be placed this way right now ('' when it can): one order at a time. */
export function supplyBlock(s: GameState, id: SupplyId, pay: 'gum' | 'trust'): '' | 'busy' | 'short' {
  if (s.supply) return 'busy';
  const price = B.supplies[id];
  return (pay === 'gum' ? s.gum < price.gum : s.trust < price.trust) ? 'short' : '';
}

// ---------------------------------------------------------------- a loan

/** What a loan costs in all, and what goes back each night. */
export const loanTotal = (amount: number): number => Math.round(amount * (1 + B.loanInterest));
export const loanNightly = (amount: number): number => Math.ceil(loanTotal(amount) / B.loanNights);

/** Why a sum cannot be borrowed right now ('' when it can): one loan at a time, and a name good enough for it. */
export function loanBlock(s: GameState, index: number): '' | 'owing' | 'rep' {
  if (s.loan) return 'owing';
  return s.rep < B.loanRep[index] ? 'rep' : '';
}

export function borrow(s: GameState, index: number): boolean {
  if (loanBlock(s, index) || B.loans[index] === undefined) return false;
  const amount = B.loans[index];
  s.gum += amount;
  s.loan = { left: loanTotal(amount), nightly: loanNightly(amount) };
  return true;
}

/** Pays back everything that is left, at once. */
export function repayAll(s: GameState): boolean {
  if (!s.loan || s.gum < s.loan.left) return false;
  s.gum -= s.loan.left;
  s.today.spend += s.loan.left;
  s.loan = null;
  return true;
}

/**
 * The night's instalment (before the rent is counted). A night that cannot be paid in full: what there is
 * goes to the guild, the rest grows, and the guild thinks less of the shop. Returns a line for the night's note.
 */
export function repayNightly(s: GameState): string {
  if (!s.loan) return '';
  const due = Math.min(s.loan.left, s.loan.nightly);
  const paid = Math.min(due, s.gum);
  s.gum -= paid;
  s.today.spend += paid;
  s.loan.left -= paid;
  if (paid < due) {
    s.loan.left = Math.round(s.loan.left * (1 + B.loanLate));
    s.trust = Math.max(0, s.trust - B.loanLateTrust);
    s.rep = Math.max(0, s.rep - B.loanLateRep);
    return `融資の返済が ${due - paid} GUM 足りませんでした。残りは ${s.loan.left} GUM に増えました。`;
  }
  if (s.loan.left <= 0) {
    s.loan = null;
    return `融資を返しおえました（今夜 ${paid} GUM）。`;
  }
  return `融資の返済 ${paid} GUM（残り ${s.loan.left} GUM）。`;
}
