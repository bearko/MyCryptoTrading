/** Every number that shapes the economy lives here. Tune with `npm run sim`. */
export const B = {
  startGum: 300,
  startRep: 30,
  startStock: 4,

  /** the shelf is a grid; each good takes a footprint on it. Each upgrade adds a row */
  /** the shelf is a long counter under the shop: this deep, and two columns wider with each level (`rows` in the state is that level) */
  shelfDepth: 10,
  shelfColsPerLevel: 2,
  startRows: 12,
  shelfCost: [200, 400, 700, 1100],

  /** market value by rarity (index 1–5), before condition */
  rarityValue: [0, 20, 50, 130, 420, 1500],
  /** a limited legendary (made in the pot only) */
  limitedValue: 4500,
  /**
   * What a hero brings to sell is of the hero's own rarity; now and then it is one below, more seldom one above
   * (a novice brings common goods, and an uncommon one once in a while).
   */
  broughtDown: 0.15,
  broughtUp: 0.12,
  /** how often each rarity turns up (the night shop's stock, and what buyers ask for): [base, per point of reputation, per step of the hero's rarity] for rarities 1–5 */
  rarityOdds: [
    [52, -0.25, 0],
    [30, 0, 0],
    [12, 0.08, 2],
    [2.5, 0.035, 1.2],
    [0.3, 0.008, 0.45],
  ],
  /**
   * The clientele: at first only novice heroes come. Each rarer class of hero (2–5) starts to come once the shop
   * has handled (bought, sold or made) this many goods of that rarity or better — and a good of that rarity in
   * the showcase counts for `clienteleShow` of them.
   */
  clienteleNeed: [0, 0, 3, 4, 3, 2],
  clienteleShow: 2,
  /**
   * How each house trades. The rulers: a fuller purse, after goods of at least their own standing (2–4), seldom
   * selling, and coming only when the window shows a good of `haouShown` steps below their own rarity or better.
   * The captains: a fuller purse, less patience. The scholars: no replicas among what they bring, harder to
   * bargain with. The artists: what they bring is in better condition, and they buy one good more. The outlaws:
   * a thinner purse, lower asks, and hot goods and replicas this many times as often.
   * `houseWant`: how often a buyer is after the house's own line of goods; `houseBring`: how often a seller brings it.
   */
  /**
   * What a house's buyer pays for a good to its taste, over the list price: for its kind (very fond / not much),
   * for a kind it also passes for, and for each mark the house is very fond of or likes well enough. Capped.
   */
  taste: { fond: 0.15, cold: -0.1, also: 0.08, mark: 0.05, liked: 0.02, cap: 0.35 },
  /** what the guild asks to open a line of goods to the shop: a floor, and so much for each series in the line */
  lineGum: [200, 30],
  lineTrust: [30, 4],
  house: {
    houseWant: 0.6,
    houseBring: 0.65,
    haouPurse: 1.6,
    haouShown: 1,
    haouSells: 0.25,
    buyuPurse: 1.15,
    eichiChance: -0.1,
    muhouPurse: 0.8,
    muhouAsk: 0.85,
    muhouShady: 4,
  },
  /** which heroes come: weights for rarities 1–5 (a legendary hero is always a rich buyer, and comes from the third day) */
  heroOdds: [0, 30, 30, 22, 14, 2.5],
  /** what a buyer brings, by the hero's rarity (index 1–4; a legendary hero is rich, see richFloor): the purse decides what can be sold to whom */
  heroWealth: [0, 45, 85, 180, 500],
  /** the purse varies this much, and grows with the shop's reputation (per point) */
  wealthSpread: [0.8, 1.5],
  wealthPerRep: 0.004,
  /** a rich buyer (a legendary hero) brings at least this much, or this many times the dearest good on the shelf */
  richFloor: 2500,
  /**
   * The showcase is a small grid of its own, four cells deep: goods are fitted into it by their shape.
   * Its width in columns, by the guild's favours (none, one, two) — one more column, then two more.
   */
  caseDepth: 4,
  /** the bin: a grid of its own, so only so much can be thrown away in a day */
  trashCols: 10,
  trashRows: 10,
  caseCols: [4, 6, 10],
  /** a good with an effect of its own is worth this many times a plain good of its rarity */
  effectValue: { pot: 1.3 },
  /** a showcase packed with no cell left empty counts for this much more appeal */
  showFull: 3,
  /** a buyer is after what is shown this often (base, and more per good shown; at most showPullMax) */
  showPull: [0.3, 0.08],
  showPullMax: 0.8,
  /** what is shown draws richer heroes: each step of rarity above common, of each good shown, adds this to the odds of a hero of rarity 3, 4, 5 */
  showAppeal: [0, 0, 0, 0.04, 0.07, 0.05],
  /** with a "wanted" sign up, this share of what sellers bring is of that parameter line */
  seekPull: 0.65,
  /** the guild: trust gained each morning, and one more per this much reputation */
  trustDaily: 8,
  trustPerRep: 20,
  /** the guild's favours: asking prices, and how much likelier a hero of rarity 3 and up is */
  serviceAsk: 0.05,
  /**
   * Goods ordered from the guild by telephone (one order at a time; they come the next morning):
   * how many, the odds of each rarity, and the price in GUM or in trust. Dearer than a seller at the
   * counter, but the parameter line is the shop's choice.
   */
  supplies: {
    lot: { count: 3, rarity: [1, 2], odds: [0.6, 0.4], gum: 90, trust: 15 },
    rare: { count: 1, rarity: [3], odds: [1], gum: 115, trust: 20 },
    epic: { count: 1, rarity: [4], odds: [1], gum: 380, trust: 64 },
  },
  serviceVip: 1.35,
  /** the pot: what a good counts for as a partner, by rarity (index 1–5). The partners must add up to the base's own count */
  craftPoints: [0, 1, 2, 4, 8, 16],
  /** the pot takes an offering: this share of what the result is worth at its rarity */
  craftFee: 0.2,
  /** and it can be used this many times a day */
  craftPerDay: 2,
  /** finding a special pairing for the first time is talked about */
  crossRep: 1,
  /** condition: 傷あり / 並品 / 美品 */
  condMult: [0.7, 1, 1.25],
  condWeights: [25, 55, 20],
  /** each good's own value drifts this much around its rarity's value (fixed per good) */
  itemSpread: 0.15,

  /** customers pay this much over market value at the "fair" price */
  retail: 1.1,

  /** customers per day = base + floor(rep / perRep) */
  visitorsBase: 5,
  visitorsPerRep: 25,
  /** share of visitors who come to sell */
  sellerShare: 0.5,
  /** a customer line is never shorter than this */
  visitorsMin: 2,
  /** chance that a buyer wants something that is on the shelf right now */
  buyerKnowsStock: 0.6,

  /** temper: 0 気さく / 1 ふつう / 2 頑固 */
  temperWeights: [30, 45, 25],
  temperPatience: [3, 2, 1],
  temperMod: [0.12, 0, -0.15],
  /** seller's asking price as a share of market value, by temper */
  askRange: [
    [0.58, 0.7],
    [0.66, 0.78],
    [0.74, 0.88],
  ],

  /** buying: how much is knocked off the asking price, and how often it works */
  discountTiers: [0.15, 0.3, 0.45],
  discountChance: [0.8, 0.5, 0.2],
  discountRep: [0, 0, -1],
  /** how many goods a seller brings (1, 2, 3, 4) */
  offerCountWeights: [55, 28, 12, 5],
  /** discount for buying everything a seller brought at once (only when they brought 2 or more) */
  bundleRates: [0, 0.05, 0.1, 0.15],
  bundleWeights: [35, 25, 25, 15],
  /** how many goods' worth of money a buyer carries (1, 2, 3); rarer heroes lean higher */
  budgetCountWeights: [60, 28, 12],
  /** a buyer with less than this left is done shopping */
  budgetFloor: 10,

  /** selling: markup over the fair price, and how often it is accepted (in between: a straight line) */
  markupTiers: [0, 0.15, 0.3, 0.5],
  markupChance: [1, 0.8, 0.5, 0.22],
  /** a kind price: this much under the fair price when selling, or over the asking price when buying. Never refused */
  generousTiers: [0.1, 0.2],
  /** a house's regard for one deal: at a plain price, at each kind price, and after driving a hard bargain */
  favorDeal: 1,
  favorGenerous: [5, 10],
  favorHard: -1,
  /** the houses are at odds two by two: a kind price costs the rival house this share of what was earned, and a house's loss cheers its rival by this much */
  rivalShare: 0.4,
  /** … but no lower than this (shown as −80): only what is done to a house itself takes it to the foot of its ladder */
  rivalFloor: -160,
  rivalGlee: 1,
  /**
   * Regard runs from −200 to +200 points, shown as −100 to +100. Every `favorStep` points is a rung of the
   * house's ladder (five up, five down), each with an effect of its own (see factions.ts).
   */
  favorStep: 40,
  favorFloor: -200,
  favorCap: 200,
  /** a customer who storms off costs their house this much */
  favorAngry: 2,
  /** regard needed for ranks 1–3 */
  /** what the rungs of the houses' ladders are worth (the ladders themselves are in factions.ts) */
  rung: {
    tip: 0.1,
    purse: 0.25,
    extra: 0.2,
    gift: 0.25,
    shun: 0.5,
    patrol: 0.5,
    chance: [0.04, 0.06],
    chanceLow: -0.08,
    looks: 2,
    ask: 0.05,
    dealer: 0.1,
    fakes: 1,
    theft: 0.15,
  },
  /** reputation for a sale: at the fair price or under, up to +30%, above that */
  saleRep: [1, 0, -1],

  /** reputation shifts every chance by (rep - 50) / repDivisor */
  repDivisor: 250,
  angryLeaveRep: -2,

  /** selling a good back to the trade (処分) */
  disposeRate: 0.5,

  /** the wallet is the bag: [columns, rows] by the wallet's rarity (index 1–5) */
  // (the first wallet is small on purpose: a night at the shop cannot bring back much until a larger one is found)
  walletSizes: [[4, 3], [4, 3], [5, 4], [6, 5], [8, 6], [10, 8]],
  /** the night shop: how many goods, and their price against market value */
  /**
   * MCHC: the token the night shop takes. It is had for GUM or medals — from the caller who comes each Tuesday,
   * or at any time through the exchange (a favour of the guild, for a fee). What it costs in GUM moves every day.
   */
  mchc: {
    start: 20,
    /** GUM for one MCHC: where the price rests, how far it may go, how much it moves in a day, how hard it is drawn back */
    base: 2,
    min: 1.2,
    max: 3.4,
    swing: 0.12,
    pull: 0.12,
    /** the Tuesday caller: who he is, the day of the week (1 = Monday), and the MCHC he carries (and more each week) */
    hero: 2025,
    weekday: 2,
    purse: 120,
    purseWeek: 30,
    /** a medal is worth this much more to those who deal in MCHC */
    medal: 1.15,
    /** the exchange keeps this share of every swap */
    dexFee: 0.04,
  },
  shopCount: 12,
  /** the night shop's floor: goods stand on it at their real size */
  shopFloor: 24,
  /** boxes to send home what the wallet cannot carry: the box and the postage are both paid (it comes a day later) */
  boxes: [
    // (in MCHC, like everything at the night shop)
    { ja: '小', cols: 4, rows: 4, price: 8, post: 12 },
    { ja: '中', cols: 5, rows: 4, price: 10, post: 18 },
    { ja: '大', cols: 6, rows: 5, price: 15, post: 25 },
  ],
  shopRate: [0.8, 0.96],
  /** chance that the shop also has the next wallet up */
  shopWalletChance: 0.35,
  /** going out at night: the shop opens late and this many customers are missed */
  lateOpenLoss: 1,

  /** today's event: none / demand for a parameter line / caravan / rain / sellers in a hurry */
  eventWeights: [40, 25, 12, 12, 11],
  demandBudget: 1.25,
  caravanVisitors: 2,
  rainVisitors: -1,
  bargainAsk: 0.88,

  /** the quest: floors to the boss, and how enemies grow with depth */
  questDepth: 10,
  /** enemy strength at depth d = questPowerBase × questPowerGrowth^(d − 1), spread over its stats by its trend */
  questPowerBase: 100,
  questPowerGrowth: 1.3,
  questHpMult: 2.5,
  questBossMult: 1.3,
  /** what a step brings: enemy / a good on the ground / nothing / luck / bad luck */
  questRoll: [50, 28, 8, 7, 7],
  questDropChance: 0.35,
  /** running away: base chance, plus this per point of AGI over the enemy's; the third try always works */
  runBase: 0.5,
  runPerAgi: 0.01,
  runMin: 0.2,
  runMax: 0.9,
  /** the bare-handed attack every fighter has: PHY × this % */
  punch: [35, 45],
  /** damage cut: half the defender's matching stat, in %, capped */
  cutCap: 40,

  /** the streak: each deal in a row adds this much to the next sale, up to the cap */
  comboStep: 0.02,
  comboCap: 0.1,
  /** today's order: reward = orderBase + orderPerDay × day */
  orderBase: 30,
  orderPerDay: 6,
  orderRep: 1,
  /** unusual customers: from this day on, each customer has this chance to be one */
  specialFromDay: 3,
  /**
   * A wanted notice: from this day on, when none is up, the odds each morning that a house posts one for a
   * hero of its rival house. The hero comes to the shop within a few days — with a fat purse, or goods going
   * cheap — and the shop turns them in (the bounty, by the hero's rarity, and the regard of the house that
   * asked) or deals with them (the regard of their own house).
   */
  /**
   * Replicas among what sellers bring, from this day on: the odds by rarity; what a replica is worth once it
   * is known for one (a share of the real thing); how much lower its asking price is (a hint for a sharp eye);
   * what a seller found out will take for it (a share of the replica's worth); the looks through the loupe a
   * day; and what selling one as the real thing costs when the buyer finds out (the odds, reputation, regard).
   */
  fakeFromDay: 5,
  fakeOdds: [0, 0.03, 0.05, 0.12, 0.18, 0.2],
  fakeValue: 0.3,
  fakeAsk: 0.88,
  fakeCaughtAsk: 0.5,
  looksPerDay: 3,
  fakeFound: 0.5,
  fakeRep: 3,
  fakeFavor: 5,
  /**
   * A loan from the guild (one at a time): what can be borrowed, the reputation each sum needs, the interest,
   * and over how many nights it is paid back. A night that cannot be paid adds to the debt and costs the
   * guild's trust and the shop's name. The deed cannot be bought while in debt.
   */
  loans: [500, 1200, 2500],
  loanRep: [20, 45, 70],
  loanInterest: 0.2,
  loanNights: 7,
  loanLate: 0.1,
  loanLateTrust: 10,
  loanLateRep: 2,
  /**
   * Hot goods (no questions asked): from this day, the share of what sellers bring, and how cheap it goes.
   * A patrol comes by on some days and goes through the shelf — not the wallet: every hot good it finds is
   * taken away, with a fine each, and the shop's name suffers.
   */
  hotFromDay: 6,
  hotOdds: 0.07,
  hotAsk: 0.55,
  patrolChance: 0.22,
  patrolFine: 40,
  patrolRep: 2,
  wantedFromDay: 4,
  wantedChance: 0.35,
  wantedWithin: 2,
  wantedBounty: [0, 90, 140, 230, 400, 700],
  wantedBudget: 1.6,
  wantedAsk: 0.65,
  wantedFavor: 8,
  wantedGrudge: 6,
  harbourFavor: 6,
  harbourGrudge: 4,
  /** turning in the wrong customer: a fine, and their house thinks less of the shop */
  wantedFine: 60,
  wantedSlight: 3,
  specialChance: 0.055,
  richBudget: 1.5,
  collectorBudget: 2.5,
  hurryAsk: 0.6,
  /** 商才 */
  perkTalker: 0.12,
  perkTagger: 0.1,
  perkBulk: 0.05,
  perkEye: 0.88,
  perkTough: 1.3,
  perkSwift: 0.2,

  rentFirst: 760,
  rentGrowth: 1.3,
  rentEvery: 7,
  /** (no grace of its own: the guild's word buys one, once) */
  grace: 0,
  /** the landlord who comes for the rent, last of all on a rent day */
  landlordHero: 1005,
  /**
   * The dealer who calls just before the landlord: takes anything, at this much off the list price, as far as
   * his purse goes (a share of the rent that is due, and never less than the floor).
   */
  dealerHero: 4008,
  dealerCut: 0.15,
  dealerPurse: 1,
  dealerFloor: 500,
  deedPrice: 24000,
} as const;

export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
