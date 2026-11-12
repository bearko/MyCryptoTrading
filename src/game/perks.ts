/**
 * 商才 (knacks): every time the rent is paid, the shopkeeper picks one of three. Each bends a rule,
 * so every run of the game grows into a different shop.
 */
export type PerkId = 'talker' | 'tagger' | 'regular' | 'nightowl' | 'shelf' | 'bulk' | 'eye' | 'tough' | 'swift' | 'charm' | 'patron';

export interface Perk {
  id: PerkId;
  name: string;
  /** what it changes, in one line */
  text: string;
  /** where it helps: the counter, the night, or the quest */
  kind: 'shop' | 'night' | 'quest';
}

export const PERKS: Perk[] = [
  { id: 'talker', name: '口八丁', text: '値切りの成功率 +12%', kind: 'shop' },
  { id: 'tagger', name: '値札名人', text: '上乗せした値の成功率 +10%', kind: 'shop' },
  { id: 'regular', name: '常連づくり', text: '毎日のお客さん +1 人', kind: 'shop' },
  { id: 'charm', name: '愛想よし', text: '連続成約のおまけが 2 倍', kind: 'shop' },
  { id: 'bulk', name: 'まとめ買いの顔', text: 'まとめ買いの割引 +5%（2 個以上なら必ず割引）', kind: 'shop' },
  { id: 'patron', name: '上客の噂', text: '特別なお客さんが 2 倍来やすい', kind: 'shop' },
  { id: 'shelf', name: '収納上手', text: '棚が 1 段増える', kind: 'shop' },
  { id: 'nightowl', name: '夜型', text: '夜に外出しても、翌朝の客が減らない', kind: 'night' },
  { id: 'eye', name: '目利き', text: '夜のショップの値段 −12%', kind: 'night' },
  { id: 'tough', name: '鍛錬', text: 'クエストでの HP +30%', kind: 'quest' },
  { id: 'swift', name: '逃げ足', text: '逃げる成功率 +20%', kind: 'quest' },
];

export const perkById = (id: PerkId): Perk => PERKS.find((p) => p.id === id)!;
