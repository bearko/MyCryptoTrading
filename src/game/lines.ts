import { KIND_JA, RARITY_JA } from './catalog';
import { pick, type RngHolder } from './rng';
import type { Want } from './state';

/** What customers say. Indexed by temper (0 気さく / 1 ふつう / 2 頑固) where it matters. */
const SELL_OPEN = [
  ['買い取ってもらえるかな？', '旅の荷物を軽くしたくてね。見ていってよ。', 'いい品だよ。見ていってくれ！'],
  ['売りたい品があるのですが。', '買い取りをお願いできますか。', '引き取ってもらえますか。'],
  ['値は決めてある。まける気はないぞ。', '目利きなら価値が分かるはずだ。', 'この値で買え。話はそれからだ。'],
];
const BUY_OPEN = ['{want}を探しているんだ。', '{want}は置いてあるかい？', '{want}が要る。予算は見てのとおりだ。'];
const HAGGLE_OK = ['まあ、いいだろう。その値で手を打とう。', '仕方ないね。それでいいよ。', '……分かった。持っていけ。'];
const HAGGLE_NG = ['それは安すぎるよ。', 'その値では手放せません。', '冗談はよせ。'];
const MARKUP_NG = ['うーん、その値段は出せないな。', '少し高すぎますね。', '足元を見るつもりか。'];
const LEAVE_ANGRY = ['もういい、ほかを当たるよ。', '失礼します。', '二度と来るか！'];
const DEAL_SELLER = ['助かったよ、ありがとう！', '確かに。ではこれで。', 'ふん、大事に扱えよ。'];
const MORE_SELLER = ['残りもどうだい？', '残りの品もいかがですか。', '残りも買うのか、買わないのか。'];
const MORE_BUYER = ['まだ予算があるんだ。ほかには？', 'ほかにも見せていただけますか。', 'まだ買える。次を出せ。'];
const DEAL_BUYER = ['いい買い物ができた！', 'ありがとうございます。', '悪くない品だ。'];
const PASS = ['そうか、残念だ。', 'では、またの機会に。', 'ふん。'];
const NO_MATCH = 'それは探している物と違うな。';

export function wantText(want: Want): string {
  if (want.type === 'kind') return KIND_JA[want.kind];
  if (want.type === 'rarity') return `${RARITY_JA[want.min]}以上の品`;
  return '何かいい品';
}

export const lines = {
  sellOpen: (h: RngHolder, temper: number) => pick(h, SELL_OPEN[temper]),
  buyOpen: (h: RngHolder, want: Want) => pick(h, BUY_OPEN).replace('{want}', wantText(want)),
  haggleOk: (temper: number) => HAGGLE_OK[temper],
  haggleNg: (temper: number) => HAGGLE_NG[temper],
  markupNg: (temper: number) => MARKUP_NG[temper],
  leaveAngry: (temper: number) => LEAVE_ANGRY[temper],
  dealSeller: (temper: number) => DEAL_SELLER[temper],
  moreSeller: (temper: number) => MORE_SELLER[temper],
  moreBuyer: (temper: number) => MORE_BUYER[temper],
  dealBuyer: (temper: number) => DEAL_BUYER[temper],
  pass: (temper: number) => PASS[temper],
  noMatch: () => NO_MATCH,
};
