import { B } from './balance';
import type { GameState } from './state';


/**
 * The merchants' guild, on the other end of the shop's telephone: lasting favours for the shop.
 * Each can be paid for in GUM, or with the guild's trust — which grows a little every day.
 * Waiting costs nothing but days; paying is quicker and costs GUM.
 */
export type ServiceId = 'guest1' | 'guest2' | 'vip' | 'case1' | 'case2' | 'sign' | 'pot' | 'eye' | 'tip';

export interface Service {
  id: ServiceId;
  group: 'intro' | 'shop' | 'craft';
  name: string;
  text: string;
  gum: number;
  trust: number;
  /** the favour that must be had first */
  needs?: ServiceId;
}

export const GROUP_JA = { intro: '紹介', shop: '店構え', craft: '手ほどき' } as const;

export const SERVICES: Service[] = [
  { id: 'guest1', group: 'intro', name: '客の紹介', text: '毎日の客 +1 人', gum: 450, trust: 60 },
  { id: 'guest2', group: 'intro', name: '客の紹介 II', text: 'さらに毎日の客 +1 人', gum: 1500, trust: 160, needs: 'guest1' },
  { id: 'vip', group: 'intro', name: '上客の口利き', text: 'レア以上のヒーローが来やすくなる', gum: 950, trust: 110 },
  { id: 'case1', group: 'shop', name: 'ショーケースの増設', text: '飾れる品 2 → 4 個', gum: 350, trust: 50 },
  { id: 'case2', group: 'shop', name: 'ショーケースの増設 II', text: '飾れる品 4 → 6 個', gum: 1200, trust: 140, needs: 'case1' },
  { id: 'sign', group: 'shop', name: '「求む」の看板', text: 'ショーケースに、買いたい系統を出せる', gum: 250, trust: 40 },
  { id: 'tip', group: 'shop', name: '見回りの知らせ', text: '見回りの来る日が、朝の紙面に出る', gum: 400, trust: 55 },
  { id: 'pot', group: 'craft', name: '壺の薪', text: '壺を 1 日にもう 1 回使える', gum: 800, trust: 100 },
  { id: 'eye', group: 'craft', name: '相場の手ほどき', text: `売り客の言い値 −${Math.round(B.serviceAsk * 100)}%`, gum: 700, trust: 90 },
];

export const serviceById = (id: ServiceId): Service => SERVICES.find((x) => x.id === id)!;
export const hasService = (s: GameState, id: ServiceId): boolean => s.services.includes(id);

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
