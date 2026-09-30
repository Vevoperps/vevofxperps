/**
 * The market table, and the one function that decides where its prices come
 * from.
 *
 * Every pair's `base` is a plausible mid for "local currency per one dollar",
 * and `maxLeverage` is the cap that pair actually gets: high on liquid majors,
 * low on the volatile frontier. Those two columns are product configuration and
 * stay here whatever the price source is.
 *
 * **The prices are generated, not fetched.** `readMarks` is the seam: swap its
 * body for a call to a real feed and nothing else in the app changes, because
 * the route, the ticker and the table all read the same `Market` shape. Until
 * a feed exists, generated marks let the whole page be built and tuned against
 * numbers that move.
 */

export interface Market {
  id: string;
  symbol: string;
  /** Country or area the currency belongs to. */
  name: string;
  flag: string;
  type: "fx";
  mark: number;
  /** Fractional, not percent: 0.0042 is +0.42%. */
  change24h: number;
  /**
   * False when `change24h` is not a real number.
   *
   * The engine stores a mark, not a history, so a chain read cannot know
   * yesterday's price. A row that says so gets a dash rather than a zero that
   * looks like a flat market. Absent means the value is trustworthy.
   */
  changeKnown?: boolean;
  /** Fractional per 8h. */
  fundingRate: number;
  maxLeverage: number;
  /**
   * What this market is doing.
   *
   * `warming` is the state a pair is in before its first mark: the pair is quoted and the
   * rate on screen is real, but no mark has been posted on chain for it yet,
   * so nothing can fill against it until the keeper writes one. It is a few
   * seconds, not an outage, and the ticket says which it is.
   */
  status: "live" | "warming" | "paused" | "closed";
  /** Notional on each side, when the feed is the chain. */
  longOpenInterest?: number;
  shortOpenInterest?: number;
}

interface PairSpec {
  symbol: string;
  name: string;
  flag: string;
  base: number;
  maxLeverage: number;
}

export const PAIRS: PairSpec[] = [
  {
    symbol: "USDJPY",
    name: "Japan",
    flag: "jp",
    base: 147.31,
    maxLeverage: 25,
  },
  {
    symbol: "USDEUR",
    name: "Euro area",
    flag: "eu",
    base: 0.9182,
    maxLeverage: 25,
  },
  { symbol: "USDGBP", name: "UK", flag: "gb", base: 0.7784, maxLeverage: 25 },
  {
    symbol: "USDCHF",
    name: "Switzerland",
    flag: "ch",
    base: 0.8461,
    maxLeverage: 25,
  },
  {
    symbol: "USDCAD",
    name: "Canada",
    flag: "ca",
    base: 1.3742,
    maxLeverage: 25,
  },
  {
    symbol: "USDAUD",
    name: "Australia",
    flag: "au",
    base: 1.5133,
    maxLeverage: 25,
  },
  {
    symbol: "USDNZD",
    name: "New Zealand",
    flag: "nz",
    base: 1.6604,
    maxLeverage: 20,
  },
  {
    symbol: "USDSEK",
    name: "Sweden",
    flag: "se",
    base: 10.412,
    maxLeverage: 20,
  },
  {
    symbol: "USDNOK",
    name: "Norway",
    flag: "no",
    base: 10.733,
    maxLeverage: 20,
  },
  {
    symbol: "USDDKK",
    name: "Denmark",
    flag: "dk",
    base: 6.8471,
    maxLeverage: 20,
  },
  {
    symbol: "USDCNY",
    name: "China",
    flag: "cn",
    base: 7.1204,
    maxLeverage: 15,
  },
  {
    symbol: "USDHKD",
    name: "Hong Kong",
    flag: "hk",
    base: 7.7902,
    maxLeverage: 20,
  },
  {
    symbol: "USDSGD",
    name: "Singapore",
    flag: "sg",
    base: 1.2871,
    maxLeverage: 20,
  },
  {
    symbol: "USDKRW",
    name: "Korea",
    flag: "kr",
    base: 1342.8,
    maxLeverage: 15,
  },
  {
    symbol: "USDTWD",
    name: "Taiwan",
    flag: "tw",
    base: 31.842,
    maxLeverage: 15,
  },
  {
    symbol: "USDINR",
    name: "India",
    flag: "in",
    base: 87.214,
    maxLeverage: 15,
  },
  {
    symbol: "USDTHB",
    name: "Thailand",
    flag: "th",
    base: 33.517,
    maxLeverage: 12,
  },
  {
    symbol: "USDIDR",
    name: "Indonesia",
    flag: "id",
    base: 16284,
    maxLeverage: 10,
  },
  {
    symbol: "USDMYR",
    name: "Malaysia",
    flag: "my",
    base: 4.2183,
    maxLeverage: 12,
  },
  {
    symbol: "USDPHP",
    name: "Philippines",
    flag: "ph",
    base: 57.412,
    maxLeverage: 10,
  },
  {
    symbol: "USDVND",
    name: "Vietnam",
    flag: "vn",
    base: 25384,
    maxLeverage: 8,
  },
  {
    symbol: "USDPKR",
    name: "Pakistan",
    flag: "pk",
    base: 278.41,
    maxLeverage: 6,
  },
  {
    symbol: "USDBDT",
    name: "Bangladesh",
    flag: "bd",
    base: 119.82,
    maxLeverage: 6,
  },
  {
    symbol: "USDKZT",
    name: "Kazakhstan",
    flag: "kz",
    base: 478.21,
    maxLeverage: 6,
  },
  {
    symbol: "USDMNT",
    name: "Mongolia",
    flag: "mn",
    base: 3418.2,
    maxLeverage: 4,
  },
  {
    symbol: "USDPLN",
    name: "Poland",
    flag: "pl",
    base: 3.9124,
    maxLeverage: 15,
  },
  {
    symbol: "USDCZK",
    name: "Czechia",
    flag: "cz",
    base: 22.841,
    maxLeverage: 15,
  },
  {
    symbol: "USDHUF",
    name: "Hungary",
    flag: "hu",
    base: 361.42,
    maxLeverage: 12,
  },
  {
    symbol: "USDRON",
    name: "Romania",
    flag: "ro",
    base: 4.5712,
    maxLeverage: 10,
  },
  {
    symbol: "USDTRY",
    name: "Turkey",
    flag: "tr",
    base: 38.412,
    maxLeverage: 4,
  },
  {
    symbol: "USDUAH",
    name: "Ukraine",
    flag: "ua",
    base: 41.284,
    maxLeverage: 4,
  },
  {
    symbol: "USDAMD",
    name: "Armenia",
    flag: "am",
    base: 387.21,
    maxLeverage: 5,
  },
  {
    symbol: "USDMXN",
    name: "Mexico",
    flag: "mx",
    base: 18.412,
    maxLeverage: 12,
  },
  {
    symbol: "USDBRL",
    name: "Brazil",
    flag: "br",
    base: 5.4218,
    maxLeverage: 10,
  },
  {
    symbol: "USDARS",
    name: "Argentina",
    flag: "ar",
    base: 1284.2,
    maxLeverage: 3,
  },
  { symbol: "USDCLP", name: "Chile", flag: "cl", base: 941.28, maxLeverage: 8 },
  {
    symbol: "USDCOP",
    name: "Colombia",
    flag: "co",
    base: 4182.4,
    maxLeverage: 6,
  },
  { symbol: "USDPEN", name: "Peru", flag: "pe", base: 3.7124, maxLeverage: 8 },
  {
    symbol: "USDUYU",
    name: "Uruguay",
    flag: "uy",
    base: 40.218,
    maxLeverage: 5,
  },
  {
    symbol: "USDPYG",
    name: "Paraguay",
    flag: "py",
    base: 7681.2,
    maxLeverage: 4,
  },
  {
    symbol: "USDDOP",
    name: "Dominican Republic",
    flag: "do",
    base: 60.412,
    maxLeverage: 5,
  },
  {
    symbol: "USDCRC",
    name: "Costa Rica",
    flag: "cr",
    base: 512.84,
    maxLeverage: 5,
  },
  {
    symbol: "USDJMD",
    name: "Jamaica",
    flag: "jm",
    base: 157.21,
    maxLeverage: 4,
  },
  {
    symbol: "USDGTQ",
    name: "Guatemala",
    flag: "gt",
    base: 7.7124,
    maxLeverage: 5,
  },
  {
    symbol: "USDSAR",
    name: "Saudi Arabia",
    flag: "sa",
    base: 3.7503,
    maxLeverage: 20,
  },
  {
    symbol: "USDAED",
    name: "United Arab Emirates",
    flag: "ae",
    base: 3.6725,
    maxLeverage: 20,
  },
  {
    symbol: "USDQAR",
    name: "Qatar",
    flag: "qa",
    base: 3.6412,
    maxLeverage: 15,
  },
  {
    symbol: "USDKWD",
    name: "Kuwait",
    flag: "kw",
    base: 0.3062,
    maxLeverage: 15,
  },
  {
    symbol: "USDBHD",
    name: "Bahrain",
    flag: "bh",
    base: 0.3771,
    maxLeverage: 15,
  },
  { symbol: "USDOMR", name: "Oman", flag: "om", base: 0.3845, maxLeverage: 15 },
  {
    symbol: "USDJOD",
    name: "Jordan",
    flag: "jo",
    base: 0.7091,
    maxLeverage: 10,
  },
  {
    symbol: "USDILS",
    name: "Israel",
    flag: "il",
    base: 3.6284,
    maxLeverage: 10,
  },
  {
    symbol: "USDZAR",
    name: "South Africa",
    flag: "za",
    base: 17.842,
    maxLeverage: 8,
  },
  {
    symbol: "USDNGN",
    name: "Nigeria",
    flag: "ng",
    base: 1541.2,
    maxLeverage: 4,
  },
  { symbol: "USDEGP", name: "Egypt", flag: "eg", base: 48.412, maxLeverage: 4 },
  { symbol: "USDKES", name: "Kenya", flag: "ke", base: 129.18, maxLeverage: 5 },
  { symbol: "USDGHS", name: "Ghana", flag: "gh", base: 12.418, maxLeverage: 4 },
  {
    symbol: "USDMAD",
    name: "Morocco",
    flag: "ma",
    base: 9.8412,
    maxLeverage: 8,
  },
  {
    symbol: "USDTND",
    name: "Tunisia",
    flag: "tn",
    base: 3.1284,
    maxLeverage: 5,
  },
  {
    symbol: "USDDZD",
    name: "Algeria",
    flag: "dz",
    base: 134.21,
    maxLeverage: 4,
  },
  {
    symbol: "USDTZS",
    name: "Tanzania",
    flag: "tz",
    base: 2684.2,
    maxLeverage: 3,
  },
  {
    symbol: "USDUGX",
    name: "Uganda",
    flag: "ug",
    base: 3712.8,
    maxLeverage: 3,
  },
  {
    symbol: "USDZMW",
    name: "Zambia",
    flag: "zm",
    base: 26.412,
    maxLeverage: 3,
  },
  {
    symbol: "USDMUR",
    name: "Mauritius",
    flag: "mu",
    base: 46.218,
    maxLeverage: 4,
  },
];

/** Stable per-symbol seed, so a pair's drift is its own and does not jump. */
const seedOf = (symbol: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < symbol.length; i += 1) {
    hash ^= symbol.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
};

/**
 * Where the numbers come from.
 *
 * Replace this body with a feed call and the rest of the app is untouched.
 * The generated version walks each pair on its own slow sine so the table is
 * never twice the same and never jumps: a real mark does not teleport, and a
 * page tuned against random noise is tuned against the wrong thing.
 */
export const readMarks = (now = Date.now()): Market[] => {
  const minutes = now / 60000;

  return PAIRS.map((pair) => {
    const seed = seedOf(pair.symbol);
    // Volatility scales inversely with the pair's leverage cap — the frontier
    // pairs are capped low precisely because they move.
    const volatility = 0.004 + (25 - pair.maxLeverage) * 0.0009;
    const phase = seed * Math.PI * 2;
    const slow = Math.sin(minutes * 0.017 + phase);
    const fast = Math.sin(minutes * 0.11 + phase * 3) * 0.35;
    const drift = (slow + fast) * volatility;

    const mark = pair.base * (1 + drift);
    const change24h = drift * 0.8;
    const fundingRate = Math.sin(minutes * 0.008 + phase * 2) * 0.0075;

    return {
      id: pair.symbol.toLowerCase(),
      symbol: pair.symbol,
      name: pair.name,
      flag: pair.flag,
      type: "fx" as const,
      mark,
      change24h,
      fundingRate,
      maxLeverage: pair.maxLeverage,
      status: "live" as const,
    };
  });
};

/** One pair's configuration, or nothing if the symbol is not listed. */
export const pairOf = (symbol: string): PairSpec | undefined =>
  PAIRS.find((pair) => pair.symbol === symbol.toUpperCase());

/** One pair's current mark, on the same generator the table reads. */
export const marketOf = (
  symbol: string,
  now = Date.now(),
): Market | undefined =>
  readMarks(now).find((market) => market.symbol === symbol.toUpperCase());

/** The ranges the terminal's chart offers, and how much time each covers. */
export const RANGES = [
  { id: "1d", label: "1D", hours: 24, step: 0.5 },
  { id: "5d", label: "5D", hours: 120, step: 2 },
  { id: "1m", label: "1M", hours: 720, step: 12 },
  { id: "6m", label: "6M", hours: 4320, step: 72 },
  { id: "1y", label: "1Y", hours: 8760, step: 144 },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];

export interface Candle {
  /** Milliseconds, the candle's opening time. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * The series behind the terminal's chart.
 *
 * Built from the same per-symbol seed the marks are, and walked backwards from
 * the current mark, so the last candle closes exactly where the board says the
 * pair is. A chart that disagrees with the number printed above it is worse
 * than no chart.
 *
 * It is a deterministic function of the symbol and the hour, not a random
 * walk: the same pair drawn twice in one hour is the same picture, which is
 * what stops the chart reshuffling itself on every re-render.
 */
export const readSeries = (
  symbol: string,
  range: RangeId,
  /** The mark the last candle must close on. Defaults to the generated one. */
  live?: number,
  now = Date.now(),
): Candle[] => {
  const pair = pairOf(symbol);
  const window = RANGES.find((entry) => entry.id === range) ?? RANGES[0];
  if (!pair) return [];

  const seed = seedOf(pair.symbol);
  const phase = seed * Math.PI * 2;
  const volatility = 0.004 + (25 - pair.maxLeverage) * 0.0009;
  const count = Math.max(24, Math.round(window.hours / window.step));
  const stepMs = window.step * 3600000;

  // The close of the last candle has to be the live mark, so the series is
  // built as a shape first and then shifted onto it.
  const close = live ?? marketOf(pair.symbol, now)?.mark ?? pair.base;

  const at = (index: number): number => {
    const hours = (count - index) * window.step;
    const slow = Math.sin(hours * 0.0038 + phase);
    const mid = Math.sin(hours * 0.017 + phase * 2) * 0.55;
    const fast = Math.sin(hours * 0.094 + phase * 5) * 0.22;
    const trend = (hours / window.hours) * Math.sin(phase * 3) * 1.4;
    return (
      (slow + mid + fast + trend) * volatility * Math.sqrt(window.hours / 24)
    );
  };

  const shift = close / (pair.base * (1 + at(count)));
  const candles: Candle[] = [];

  for (let index = 0; index < count; index += 1) {
    const open = pair.base * (1 + at(index)) * shift;
    const close = pair.base * (1 + at(index + 1)) * shift;
    // The wick is a fraction of the body's own move plus a floor, so a flat
    // candle still has one and a violent one does not grow a mast.
    const spread =
      (Math.abs(close - open) * 0.7 + open * volatility * 0.22) *
      (0.6 + Math.abs(Math.sin(index * 2.399 + phase)) * 0.8);

    candles.push({
      time: now - (count - index) * stepMs,
      open,
      close,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
    });
  }

  return candles;
};
