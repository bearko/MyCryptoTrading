import { B } from './balance';
import { POT_ID, type Catalog } from './catalog';
import { lineNo } from './craft';
import { rankOf } from './factions';
import { closing, currentVisitor, forSale, givePot, matches } from './logic';
import { facingSatoshi } from './mchc';
import type { GameState } from './state';

/**
 * The first days are taught a thing at a time, each when it is needed: a note from the one who took the player in
 * (Fukuzawa Yukichi), and with some of them a thing for the shop. Until its note has come, that thing is not there.
 * A game with no `taught` list (an old save, a test, a bot) knows everything.
 */
export type LessonId = 'sleep' | 'mchc' | 'shop' | 'case' | 'pot' | 'loupe' | 'hot' | 'rent' | 'phone' | 'houses' | 'quest';

export const GUIDE_HERO = B.guideHero;

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
  { id: 'hot', title: '危ない品', text: ['いま持ちこまれた品には、訳ありのものが混じっている。出どころを言えない品だ。', '安く買えるが、見回りに見つかれば、棚から持っていかれる。見回りが改めるのは棚だけで、ウォレットの中までは見ない。'], hint: '訳ありの品は、売れるまでウォレットにしまっておく' },
  { id: 'rent', title: '家賃の日', text: ['今日は家賃の日だ。このあと、店の持ち主の伊能忠敬が取りに来る。', 'いま来ているのは引取の商人。手持ちが足りなければ、品を買い取ってもらうといい。値は定価より安くなるがね。', '家賃を払えば、次の週も店を続けられる。いつか店ごと買い取れば、もう家賃はいらない。それが君の当面の目標だ。'], hint: '売りたい品をカウンターへ。済んだらベルで見送る' },
  { id: 'phone', title: '人脈', text: ['家賃をひとつ越えたな。店に電話を引いておいた。', '商人ギルドに頼みごとができる。毎朝たまる「信用」でも払える。'], hint: 'カウンターの電話をクリック' },
  { id: 'houses', title: '5 つの勢力', text: ['この世界には、まだ王がいない。かつて国を治めた者たちが 5 つの勢力に分かれて、新世界の王の座を争っている。', '店に来る客も、たいていはどこかの勢力の者だ。商いのしかたひとつで、勢力ごとの評価は上がりも下がりもする。', 'ここ Zentral は、どの勢力のものでもない土地だ。だが肩入れが過ぎれば、敵に回る勢力も出てくる。'], hint: '右の壁の「評判」をクリックすると、勢力ごとの評価が見られる' },
  { id: 'quest', title: 'ダンジョン', text: ['MCHC が心もとないようだな。', 'ドアの先には、もうひとつ行き先がある。ダンジョンだ。エネミーという、この世界の化け物が棲んでいる。', 'エクステンションも GUM も、もとはあそこから掘り出されたものでね。身じたくをして、行ってみるといい。'], hint: '閉店後、ドアから「クエスト」へ。装備は右下の装備棚で' },
];

/** What he says in a note: the same for most, but the one on replicas turns on how the first one went. */
export function lessonText(s: GameState, lesson: Lesson): string[] {
  // (said at the moment it came up, it begins from what has just happened)
  if (lesson.id === 'case' && s.phase === 'open') return ['いまの客は、欲しい品が見つからずに帰っていったな。', '壁にショーケースを取りつけておいた。飾った品を見て、それを欲しがる客が寄ってくる。いい品ほど、懐の深い客を呼ぶ。'];
  if (lesson.id === 'pot' && s.phase === 'evening') return ['同じような品が、いくつか売れ残っているな。', '合成の壺を届けておいた。品を 2 つ 3 つ入れると、1 つ上の品に生まれかわる。'];
  if (lesson.id === 'quest' && s.mchc >= B.mchc.start / 2) return lesson.text.slice(1);
  if (lesson.id !== 'loupe' || !s.bait) return lesson.text;
  if (s.bait.at === 'caught') return ['やられたな。さっき売った品は、レプリカだった。', '客の信用を少し落としたが、高い授業料ではない。', LOUPE];
  if (s.bait.at === 'bought') return ['今朝いちばんに買った品を、よく見てごらん。あれはレプリカだ。', '客に売ってしまう前で、よかった。', LOUPE];
  return ['あの品を見送ったのは、いい判断だった。安すぎる話には、たいてい裏がある。', 'あれはレプリカだ。これからも、ああいう品は持ちこまれる。', LOUPE];
}

/** True when the shop has been taught this (so the thing that goes with it is there). */
export const knows = (s: GameState, id: LessonId): boolean => !s.taught || s.taught.includes(id);

/**
 * The evening the night shop is first spoken of: until the player has been out, the door calls and the bed will not
 * let them sleep (the note told them to go). Only that evening — a later night may be slept through as it likes.
 */
export const mustShop = (s: GameState): boolean =>
  !!s.taught && s.taught.includes('shop') && s.shopDay === s.day && s.phase === 'evening' && !s.wentOut;

/** Said when the bed is tried before the first trip to the night shop. */
export const MUST_SHOP_LINE = '先生がショップに行くように言っていたな……';

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

/** He stands at the counter as the day's last caller. */
export const teacherHere = (s: GameState): boolean => {
  const v = currentVisitor(s);
  return s.phase === 'open' && !!v && v.special === 'teacher' && !v.done;
};

/**
 * The note that is due. What belongs to the day's end (how to sleep, where to buy, the pot, the dungeon…) is not
 * found lying there after closing: he comes as the last caller and says it — `closing` is that moment (he is at
 * the counter; or, asked beforehand, whether he should come).
 */
export function lessonDue(s: GameState, cat: Catalog, closingNow = teacherHere(s)): LessonId | null {
  if (!s.taught) return null;
  // (one note in a phase of a day, so that no two come on top of each other — but what is happening at the counter is not put off)
  const evening = closingNow && s.closeNote !== s.day;
  const spaced = evening || s.taughtAt !== when(s);
  const not = (id: LessonId): boolean => !s.taught!.includes(id);
  // (what he leaves overnight lies outside the shutter: it is found when the shop opens, before the first caller is seen to)
  const morning = atDawn(s);
  if (not('sleep') && evening && s.day === 1) return 'sleep';
  if (not('mchc') && facingSatoshi(s)) return 'mchc';
  // (the rent day comes once a week: its note is not put off either)
  const v = currentVisitor(s);
  const here = s.phase === 'open' && !!v && !v.done;
  if (not('rent') && here && v!.special === 'dealer') return 'rent';
  if (!spaced) return not('loupe') && s.bait?.at === 'caught' ? 'loupe' : null;
  // hot goods: when a caller first lays one on the counter
  if (not('hot') && here && v!.kind === 'sell' && v!.offers.some((o) => o.hot)) return 'hot';
  if (not('shop') && evening && !s.wentOut && (s.day >= 2 || forSale(s).length <= 2)) return 'shop';
  // the showcase: when a buyer has gone away with nothing (from the third day; by the fifth morning at the latest)
  if (not('case') && s.day >= 3 && (wentWithout(s, cat) || (morning && s.day >= 5))) return 'case';
  // the pot: when like goods lie unsold at closing (from the third day; by the sixth morning at the latest)
  if (not('pot') && s.day >= 3 && ((evening && leftOver(s, cat)) || (morning && s.day >= 6))) return 'pot';
  // (replicas: after the one led into — found out by its buyer, or passed up — or, if it was bought and not sold, at the day's end)
  if (not('loupe') && s.bait) {
    const gone = s.cursor !== s.bait.cursor || !!s.queue[s.cursor]?.done;
    if (s.bait.at === 'caught' || (s.bait.at === 'offered' && gone) || (s.bait.at === 'bought' && evening)) return 'loupe';
  }
  if (not('phone') && morning && s.day >= 8) return 'phone';
  // the houses: when the regard of one of them has first moved a rung (from the fourth day)
  if (not('houses') && s.day >= 4 && (morning || evening) && Object.values(s.favor).some((p) => rankOf(p) !== 0)) return 'houses';
  // the dungeon: on an evening when there is too little MCHC for the night shop (from the fourth day; by the ninth evening at the latest)
  if (not('quest') && !not('shop') && evening && !s.wentOut && s.day >= 4 && (s.mchc < B.mchc.start / 2 || s.day >= 9)) return 'quest';
  return null;
}

/**
 * The note that is due is left on the counter (he leaves it overnight, or as he goes): it waits there until it is
 * read, and no other comes while it does. Returns the note just left, if any.
 */
/** The shop has just opened: the first caller is at the counter, not yet seen to (and no overnight note has been found today). */
export const atDawn = (s: GameState): boolean => s.phase === 'open' && s.cursor === 0 && !!currentVisitor(s) && !currentVisitor(s)!.done && s.dawnNote !== s.day;

const OVERNIGHT: LessonId[] = ['case', 'pot', 'phone', 'houses'];

export function placeMemo(s: GameState, cat: Catalog): LessonId | null {
  if (!s.taught || s.memoOut) return null;
  const dawn = atDawn(s);
  const due = lessonDue(s, cat);
  if (due) s.memoOut = due;
  // (left overnight, it lies on the outer counter, where callers lay their goods; he does not come in to speak of it)
  s.memoOutside = !!due && dawn && OVERNIGHT.includes(due);
  if (s.memoOutside) s.dawnNote = s.day;
  if (due && teacherHere(s)) s.closeNote = s.day;
  return due;
}

/** The notes read so far, in the order they are taught (the binder keeps them). A game without the guide has them all. */
export const filed = (s: GameState): Lesson[] => LESSONS.filter((l) => !s.taught || (s.taught.includes(l.id) && s.memoOut !== l.id));

/** The note has been read: the shop knows it now, and what comes with it is handed over. */
export function learn(s: GameState, cat: Catalog, id: LessonId): void {
  if (s.memoOut === id) s.memoOut = null;
  if (!s.taught || s.taught.includes(id)) return;
  s.taught.push(id);
  // (a note left overnight does not use up the day's one note while the shop is open)
  s.taughtAt = s.memoOutside ? `${s.day}:morning` : when(s);
  s.memoOutside = false;
  if (id === 'shop') s.shopDay = s.day;
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

// (the rules ask here whether he should come before closing: when a note of the day's end is due, and none lies unread)
closing.due = (s, cat) => {
  if (!s.taught || s.memoOut || s.closeNote === s.day) return false;
  const due = lessonDue(s, cat, true);
  return !!due && due !== lessonDue(s, cat, false);
};
