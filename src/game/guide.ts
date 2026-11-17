import { B } from './balance';
import { POT_ID, type Catalog } from './catalog';
import { forSale, givePot } from './logic';
import { facingSatoshi } from './mchc';
import type { GameState } from './state';

/**
 * The first days are taught a thing at a time, each when it is needed: a note from the one who took the player in
 * (Fukuzawa Yukichi), and with some of them a thing for the shop. Until its note has come, that thing is not there.
 * A game with no `taught` list (an old save, a test, a bot) knows everything.
 */
export type LessonId = 'sleep' | 'mchc' | 'shop' | 'case' | 'pot' | 'loupe' | 'phone';

export const GUIDE_HERO = 10004;

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
  { id: 'loupe', title: '見抜く', text: ['近ごろ、レプリカを持ちこむ者がいると聞く。', 'カウンターにルーペを置いておく。安すぎる品は、買う前にのぞいてみなさい。'], hint: '客の品を、カウンターのルーペへドラッグ' },
  { id: 'phone', title: '人脈', text: ['家賃をひとつ越えたな。店に電話を引いておいた。', '商人ギルドに頼みごとができる。毎朝たまる「信用」でも払える。'], hint: 'カウンターの電話をクリック' },
];

/** True when the shop has been taught this (so the thing that goes with it is there). */
export const knows = (s: GameState, id: LessonId): boolean => !s.taught || s.taught.includes(id);

/** A new game begins guided: nothing has been taught yet, and the pot comes later, with its note. */
export function startGuided(s: GameState): void {
  s.taught = [];
  s.stock = s.stock.filter((x) => x.itemId !== POT_ID);
}

/** The note that is due now, if any: each comes at the moment its matter comes up. */
export function lessonDue(s: GameState): LessonId | null {
  if (!s.taught) return null;
  const not = (id: LessonId): boolean => !s.taught!.includes(id);
  const evening = s.phase === 'evening';
  const morning = s.phase === 'morning';
  if (not('sleep') && evening && s.day === 1) return 'sleep';
  if (not('mchc') && facingSatoshi(s)) return 'mchc';
  if (not('shop') && evening && !s.wentOut && (s.day >= 2 || forSale(s).length <= 2)) return 'shop';
  // (for now these come by the day; each is to have its own moment)
  if (not('case') && morning && s.day >= 3) return 'case';
  if (not('pot') && morning && s.day >= 4) return 'pot';
  if (not('loupe') && morning && s.day >= B.fakeFromDay) return 'loupe';
  if (not('phone') && morning && s.day >= 8) return 'phone';
  return null;
}

/** The note has been read: the shop knows it now, and what comes with it is handed over. */
export function learn(s: GameState, cat: Catalog, id: LessonId): void {
  if (!s.taught || s.taught.includes(id)) return;
  s.taught.push(id);
  if (id === 'pot') {
    s.potGiven = false;
    givePot(s, cat);
  }
}
