/** Every number that shapes the economy lives here. Tune with `npm run sim`. */
export const B = {
  startGum: 300,
  startRep: 30,
  startStock: 4,

  /** the shelf is a grid; each good takes a footprint on it. Each upgrade adds a row */
  gridCols: 6,
  startRows: 4,
  shelfCost: [200, 400, 700, 1100],

  /** market value by rarity (index 1–5), before condition */
  rarityValue: [0, 20, 50, 120, 300, 800],
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
  /** reputation for a sale: at the fair price or under, up to +30%, above that */
  saleRep: [1, 0, -1],

  /** reputation shifts every chance by (rep - 50) / repDivisor */
  repDivisor: 250,
  angryLeaveRep: -2,

  /** wholesaler: every morning, a few plain goods slightly under market value */
  wholesaleCount: 3,
  wholesaleRate: [0.86, 0.96],
  /** selling a good back to the wholesaler */
  disposeRate: 0.5,

  rentFirst: 550,
  rentGrowth: 1.2,
  rentEvery: 7,
  grace: 1,
  deedPrice: 10000,
} as const;

export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
