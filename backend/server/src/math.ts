/**
 * Every number the ticket prints, as pure arithmetic.
 *
 * A one-to-one port of the Solana program's `math.rs` (itself a port of the
 * EVM engine), so the site, the handbook and the ledger agree to the last
 * unit:
 *
 *   notional     = margin x leverage
 *   pnl          = notional x (mark - entry) / entry, signed by side
 *   equity       = margin + pnl - accrued funding
 *   maintenance  = 0.5% of notional
 *   payout       = margin + pnl - funding - exit fee, capped at 10x margin
 *
 * Amounts are USDC base units (6 decimals). Prices and funding indices are
 * 1e18 fixed point. Everything is `bigint`; division truncates toward zero,
 * exactly as Rust's integer division does.
 */

export const WAD = 10n ** 18n;
export const BPS = 10_000n;

/** Charged on notional, each way: 0.05%. */
export const FEE_BPS = 5n;
/** The floor equity is measured against: 0.5% of notional. */
export const MAINTENANCE_BPS = 50n;
/** The most a position can return, as a multiple of its margin. */
export const PAYOUT_CAP = 10n;
/** The liquidator's cut of whatever equity is left. */
export const LIQUIDATOR_SHARE_BPS = 5_000n;
/** Funding cap per window, per unit of notional: 0.75%, in WAD. */
export const MAX_FUNDING_RATE = 7_500_000_000_000_000n;
/** The window the funding rate is quoted in: 8 hours. */
export const FUNDING_WINDOW = 8n * 60n * 60n;
/** Shares minted for the very first deposit into an empty pool. */
export const INITIAL_SHARES = 10n ** 18n;
/** How long a 24h reference mark is kept before a new one is taken. */
export const REFERENCE_WINDOW = 86_400;

const abs = (value: bigint): bigint => (value < 0n ? -value : value);
const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

export const fee = (notional: bigint): bigint => (notional * FEE_BPS) / BPS;

export const maintenance = (notional: bigint): bigint => (notional * MAINTENANCE_BPS) / BPS;

/** The result of the move, before costs. Truncates toward zero. */
export const pnl = (notional: bigint, entryPrice: bigint, markPrice: bigint, isLong: boolean): bigint => {
  if (entryPrice === 0n) return 0n;
  const gross = (notional * (markPrice - entryPrice)) / entryPrice;
  return isLong ? gross : -gross;
};

export const equity = (margin: bigint, positionPnl: bigint, accruedFunding: bigint): bigint =>
  margin + positionPnl - accruedFunding;

/** What a slice of notional owes in funding: `notional * (index - entry) / WAD`. */
export const accruedFunding = (notional: bigint, indexNow: bigint, indexAtEntry: bigint): bigint =>
  (notional * (indexNow - indexAtEntry)) / WAD;

/** What lands back in the free balance on close: floored at zero, capped. */
export const payout = (margin: bigint, positionPnl: bigint, funding: bigint, exitFee: bigint, cap: bigint): bigint => {
  const net = margin + positionPnl - funding - exitFee;
  if (net <= 0n) return 0n;
  return min(net, cap);
};

const skewRatio = (longOi: bigint, shortOi: bigint, skewScale: bigint): { longsPay: boolean; ratio: bigint } => {
  const longsPay = longOi > shortOi;
  const gap = abs(longOi - shortOi);
  return { longsPay, ratio: min((gap * WAD) / skewScale, WAD) };
};

/**
 * How far each side's cumulative funding index moves over `elapsed` seconds.
 * Positive means that side pays. Per-window rate floored first, then scaled
 * by time — the same order as the program, so the results are identical.
 */
export const fundingAccrue = (
  longOi: bigint,
  shortOi: bigint,
  skewScale: bigint,
  elapsed: bigint,
): { long: bigint; short: bigint } => {
  if (elapsed <= 0n || skewScale === 0n || longOi === 0n || shortOi === 0n) return { long: 0n, short: 0n };
  const { longsPay, ratio } = skewRatio(longOi, shortOi, skewScale);
  const perWindow = (ratio * MAX_FUNDING_RATE) / WAD;
  const magnitude = (perWindow * elapsed) / FUNDING_WINDOW;
  if (magnitude === 0n) return { long: 0n, short: 0n };
  return longsPay ? { long: magnitude, short: -magnitude } : { long: -magnitude, short: magnitude };
};

/** The rate the ticket prints, per 8h, signed, in WAD. Positive: longs pay. */
export const fundingRate = (longOi: bigint, shortOi: bigint, skewScale: bigint): bigint => {
  if (skewScale === 0n || longOi === 0n || shortOi === 0n) return 0n;
  const { longsPay, ratio } = skewRatio(longOi, shortOi, skewScale);
  const m = (ratio * MAX_FUNDING_RATE) / WAD;
  return longsPay ? m : -m;
};

/** The part of a payout cap the pool reserved: nine tenths, rounded down. */
export const reserveForCap = (cap: bigint): bigint => (cap * (PAYOUT_CAP - 1n)) / PAYOUT_CAP;

export const proRata = (value: bigint, part: bigint, whole: bigint): bigint => (value * part) / whole;

export const liquidatorReward = (equityLeft: bigint): bigint => (equityLeft * LIQUIDATOR_SHARE_BPS) / BPS;

/** The mark at which equity meets maintenance, for display (same as the site's client). */
export const liquidationPrice = (
  margin: bigint,
  notional: bigint,
  entry: bigint,
  funding: bigint,
  isLong: boolean,
): bigint => {
  if (notional === 0n || entry === 0n) return 0n;
  const shortfall = maintenance(notional) + funding - margin;
  const ratio = (shortfall * WAD) / notional;
  const delta = isLong ? ratio : -ratio;
  const price = (entry * (WAD + delta)) / WAD;
  return price > 0n ? price : 0n;
};
