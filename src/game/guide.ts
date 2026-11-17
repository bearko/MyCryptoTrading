import { POT_ID, type Catalog } from './catalog';
import { lineNo } from './craft';
import { currentVisitor, forSale, givePot, matches } from './logic';
import { facingSatoshi } from './mchc';
import type { GameState } from './state';

/**
 * The first days are taught a thing at a time, each when it is needed: a note from the one who took the player in
 * (Fukuzawa Yukichi), and with some of them a thing for the shop. Until its note has come, that thing is not there.
 * A game with no `taught` list (an old save, a test, a bot) knows everything.
 */
export type LessonId = 'sleep' | 'mchc' | 'shop' | 'case' | 'pot' | 'loupe' | 'phone';

export const GUIDE_HERO = 10004;

const LOUPE = 'カウンターにルーペを置いておく。安すぎる品は、買う前にのぞいてみなさい。';

export interface Lesson {
  id: LessonId;
  title: string;
  /** what he says (a few lines, as he would speak) */
  text: string[];
  /** where to look, in a line */
  hint: string;
}

export const LESSONS: Lesson[] = [
  { id: 'sleep', title: '一日の終わり', text: ['初日、おつかれさま。', '今日はもう客は来ない。寝床で休めば、次の日が始まる。'], hint: '右下の寝床をクリック' },
  { id: 'mchc', title: '両替', text: ['この男はサトシ・ナカモト。火曜になるたびに、GUM を MCHC という通貨に替えてくれる。', '夜の店は MCHC しか受けとらない。仕入れのぶんだけ、少し替えておくといい。'], hint: '数量を入れて「スワップ」' },
  { id: 'shop', title: '仕入れ', text: ['棚がさびしくなってきたな。', '店を閉めたあとは、左のドアから夜の店へ仕入れに行ける。払いは MCHC。持ち帰れるのは、ウォレットに入るぶんだけだ。'], hint: '閉店後、左下のドアをクリック' },
  { id: 'case', title: '飾る', text: ['壁にショーケースを取りつけておいた。', '飾った品を見て、それを欲しがる客が寄ってくる。いい品ほど、懐の深い客を呼ぶ。'], hint: '棚の品を、左の壁のショーケースへドラッグ' },
  { id: 'pot', title: '合成', text: ['合成の壺を届けておいた。棚に置いてある。', '品を 2 つ 3 つ入れると、1 つ上の品に生まれかわる。売れ残りの使い道にしなさい。'], hint: '棚の壺をクリック' },
  { id: 'loupe', title: '見抜く', text: ['近ごろ、レプリカを持ちこむ者がいると聞く。', LOUPE], hint: '客の品を、カウンターのルーペへドラッグ' },
  { id: 'phone', title: '人脈', text: ['家賃をひとつ越えたな。店に電話を引いておいた。', '商人ギルドに頼みごとができる。毎朝たまる「信用」でも払える。'], hint: 'カウンターの電話をクリック' },
];

/** What he says in a note: the same for most, but the one on replicas turns on how the first one went. */
export function lessonText(s: GameState, lesson: Lesson): string[] {
  // (said at the moment it came up, it begins from what has just happened)
  if (lesson.id === 'case' && s.phase === 'open') return ['いまの客は、欲しい品が見つからずに帰っていったな。', '壁にショーケースを取りつけておいた。飾った品を見て、それを欲しがる客が寄ってくる。いい品ほど、懐の深い客を呼ぶ。'];
  if (lesson.id === 'pot' && s.phase === 'evening') return ['同じような品が、いくつか売れ残っているな。', '合成の壺を届けておいた。品を 2 つ 3 つ入れると、1 つ上の品に生まれかわる。'];
  if (lesson.id !== 'loupe' || !s.bait) return lesson.text;
  if (s.bait.at === 'caught') return ['やられたな。さっき売った品は、レプリカだった。', '客の信用を少し落としたが、高い授業料ではない。', LOUPE];
  if (s.bait.at === 'bought') return ['今朝いちばんに買った品を、よく見てごらん。あれはレプリカだ。', '客に売ってしまう前で、よかった。', LOUPE];
  return ['あの品を見送ったのは、いい判断だった。安すぎる話には、たいてい裏がある。', 'あれはレプリカだ。これからも、ああいう品は持ちこまれる。', LOUPE];
}

/** True when the shop has been taught this (so the thing that goes with it is there). */
export const knows = (s: GameState, id: LessonId): boolean => !s.taught || s.taught.includes(id);

/** A new game begins guided: nothing has been taught yet, and the pot comes later, with its note. */
export function startGuided(s: GameState): void {
  s.taught = [];
  s.stock = s.stock.filter((x) => x.itemId !== POT_ID);
}

/** The note that is due now, if any: each comes at the moment its matter comes up. */
/** A buyer has just gone away with nothing, there being nothing in the shop of the kind asked for. */
const wentWithout = (s: GameState, cat: Catalog): boolean => {
  const v = currentVisitor(s);
  return s.phase === 'open' && !!v && v.done && v.kind === 'buy' && !['dealer', 'landlord', 'courier', 'satoshi', 'patrol'].includes(v.special ?? '') && v.mood !== 'happy' && !forSale(s).some((x) => matches(cat, v.want, x.itemId));
};

/** Two or more cheap goods of one line lie unsold: the pot would make something of them. */
const leftOver = (s: GameState, cat: Catalog): boolean => {
  const lines = forSale(s)
    .map((x) => cat.itemById.get(x.itemId)!)
    .filter((i) => i.rarity <= 2 && !i.effect && !i.wallet)
    .map((i) => `${lineNo(i)}:${i.rarity}`);
  return lines.some((l, n) => lines.indexOf(l) !== n);
};

const when = (s: GameState): string => `${s.day}:${s.phase}`;

export function lessonDue(s: GameState, cat: Catalog): LessonId | null {
  if (!s.taught) return null;
  // (one note in a phase of a day, so that no two come on top of each other — but what is happening at the counter is not put off)
  const spaced = s.taughtAt !== when(s);
  const not = (id: LessonId): boolean => !s.taught!.includes(id);
  const evening = s.phase === 'evening';
  const morning = s.phase === 'morning';
  if (not('sleep') && evening && s.day === 1) return 'sleep';
  if (not('mchc') && facingSatoshi(s)) return 'mchc';
  if (!spaced) return not('loupe') && s.bait?.at === 'caught' ? 'loupe' : null;
  if (not('shop') && evening && !s.wentOut && (s.day >= 2 || forSale(s).length <= 2)) return 'shop';
  // the showcase: when a buyer has gone away with nothing (from the third day; by the fifth morning at the latest)
  if (not('case') && s.day >= 3 && (wentWithout(s, cat) || (morning && s.day >= 5))) return 'case';
  // the pot: when like goods lie unsold at closing (from the third day; by the sixth morning at the latest)
  if (not('pot') && s.day >= 3 && ((evening && leftOver(s, cat)) || (morning && s.day >= 6))) return 'pot';
  // (replicas: after the one led into — found out by its buyer, or passed up — or, if it was bought and not sold, at the day's end)
  if (not('loupe') && s.bait) {
    const gone = s.cursor !== s.bait.cursor || !!s.queue[s.cursor]?.done || s.phase !== 'open';
    if (s.bait.at === 'caught' || (s.bait.at === 'offered' && gone) || (s.bait.at === 'bought' && evening)) return 'loupe';
  }
  if (not('phone') && morning && s.day >= 8) return 'phone';
  return null;
}

/** The note has been read: the shop knows it now, and what comes with it is handed over. */
export function learn(s: GameState, cat: Catalog, id: LessonId): void {
  if (!s.taught || s.taught.includes(id)) return;
  s.taught.push(id);
  s.taughtAt = when(s);
  if (id === 'loupe' && s.bait?.at === 'bought') {
    // (it was bought and is still here: he points it out)
    const x = [...s.stock, ...s.showcase, ...s.wallet.items].find((it) => it.uid === s.bait!.uid);
    if (x) x.seen = true;
  }
  if (id === 'pot') {
    s.potGiven = false;
    givePot(s, cat);
  }
}
