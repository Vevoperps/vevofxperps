import * as math from "./math.js";

/**
 * The venue's rules, as pure functions over plain state.
 *
 * A line-by-line port of the Solana program's instructions (`lib.rs` and
 * `engine.rs`): the same checks in the same order, the same error names, the
 * same arithmetic. Nothing here touches the database or the network — the
 * store loads the rows an operation needs under one lock, calls one of these,
 * and writes back what it changed. That is what makes it testable in
 * isolation, and what the tests in `test/engine.test.ts` exercise.
 */

export class VevoError extends Error {
  readonly code: VevoErrorCode;

  constructor(code: VevoErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = "VevoError";
    this.code = code;
  }
}

export type VevoErrorCode =
  | "ZeroAmount"
  | "InsufficientBalance"
  | "MarketIsPaused"
  | "LeverageTooHigh"
  | "MarginTooSmall"
  | "OpenInterestCap"
  | "InsufficientLiquidity"
  | "EmptyPool"
  | "NotLiquidatable"
  | "NoFeed"
  | "StalePrice"
  | "ZeroPrice"
  | "DeviationTooLarge"
  | "UnknownMarket"
  | "BadCloseAmount"
  | "PositionExists"
  | "NoPosition"
  | "BadMarketParams";

const require = (condition: boolean, code: VevoErrorCode): void => {
  if (!condition) throw new VevoError(code);
};

export interface MarketState {
  symbol: string;
  index: number;
  maxLeverage: number;
  skewScale: bigint;
  maxOpenInterest: bigint;
  minMargin: bigint;
  paused: boolean;
  longOi: bigint;
  shortOi: bigint;
  fundingLong: bigint;
  fundingShort: bigint;
  lastAccrual: number;
  referencePrice: bigint;
  referenceAt: number;
}

export interface MarkState {
  price: bigint;
  /** Unix seconds; 0 when never posted. */
  updatedAt: number;
}

export interface PoolState {
  assets: bigint;
  reserved: bigint;
  shares: bigint;
}

export interface TraderState {
  address: string;
  balance: bigint;
  shares: bigint;
}

export interface PositionState {
  address: string;
  symbol: string;
  margin: bigint;
  notional: bigint;
  payoutCap: bigint;
  entryPrice: bigint;
  entryFunding: bigint;
  openedAt: number;
  isLong: boolean;
}

export interface OracleParams {
  /** Seconds a mark stays usable. */
  maxAge: number;
  /** The most one post may move a fresh mark, in bps. 0 disables the check. */
  maxDeviationBps: number;
}

/** A record of what happened, for the account's history. */
export interface Activity {
  kind: "opened" | "closed" | "reduced" | "liquidated" | "margin" | "deposit" | "withdraw" | "lp_add" | "lp_remove";
  address: string;
  symbol?: string;
  amount: bigint;
  pnl?: bigint;
  fee?: bigint;
  funding?: bigint;
  price?: bigint;
}

export const poolFree = (pool: PoolState): bigint => (pool.assets > pool.reserved ? pool.assets - pool.reserved : 0n);

// ------------------------------------------------------------------- shared

/** The mark for a market, refused if it was never posted or has gone stale. */
export const markPrice = (mark: MarkState | undefined, now: number, maxAge: number): bigint => {
  require(mark !== undefined && mark.updatedAt !== 0, "NoFeed");
  require(now <= (mark as MarkState).updatedAt + maxAge, "StalePrice");
  return (mark as MarkState).price;
};

/** Integrates funding from the last accrual to now. */
export const accrue = (market: MarketState, now: number): void => {
  const elapsed = now - market.lastAccrual;
  if (elapsed <= 0) return;
  const delta = math.fundingAccrue(market.longOi, market.shortOi, market.skewScale, BigInt(elapsed));
  market.lastAccrual = now;
  market.fundingLong += delta.long;
  market.fundingShort += delta.short;
};

/** The funding index a position is measured against: its own side's. */
export const sideIndex = (market: MarketState, isLong: boolean): bigint =>
  isLong ? market.fundingLong : market.fundingShort;

/** The funding indices as they would be at `now`, without mutating. */
export const projectedIndices = (market: MarketState, now: number): { long: bigint; short: bigint } => {
  const elapsed = Math.max(0, now - market.lastAccrual);
  const delta = math.fundingAccrue(market.longOi, market.shortOi, market.skewScale, BigInt(elapsed));
  return { long: market.fundingLong + delta.long, short: market.fundingShort + delta.short };
};

interface Close {
  marginOut: bigint;
  capOut: bigint;
  exitFee: bigint;
  pnl: bigint;
  funding: bigint;
  amount: bigint;
  whole: boolean;
}

const priceClose = (market: MarketState, position: PositionState, closing: bigint, exitPrice: bigint): Close => {
  const whole = closing === position.notional;
  const marginOut = whole ? position.margin : math.proRata(position.margin, closing, position.notional);
  const capOut = whole ? position.payoutCap : math.proRata(position.payoutCap, closing, position.notional);
  const exitFee = math.fee(closing);
  const pnl = math.pnl(closing, position.entryPrice, exitPrice, position.isLong);
  const funding = math.accruedFunding(closing, sideIndex(market, position.isLong), position.entryFunding);
  const amount = math.payout(marginOut, pnl, funding, exitFee, capOut);
  return { marginOut, capOut, exitFee, pnl, funding, amount, whole };
};

/**
 * The book-keeping every close shares: open interest, reserve, pool. The
 * margin was never in `pool.assets`, so the pool's result on the slice is
 * exactly `marginOut - paid`.
 */
const release = (
  pool: PoolState,
  market: MarketState,
  isLong: boolean,
  closing: bigint,
  marginOut: bigint,
  capOut: bigint,
  paid: bigint,
): void => {
  if (isLong) market.longOi -= closing;
  else market.shortOi -= closing;

  const reserve = math.reserveForCap(capOut);
  pool.reserved = pool.reserved > reserve ? pool.reserved - reserve : 0n;

  if (paid > marginOut) {
    const out = paid - marginOut;
    require(pool.assets >= out, "InsufficientLiquidity");
    pool.assets -= out;
  } else {
    pool.assets += marginOut - paid;
  }
};

// ------------------------------------------------------------------- oracle

/**
 * Posts one mark, refusing a fresh mark that moves more than the deviation
 * limit (the price loop walks large moves in steps instead).
 */
export const postMark = (mark: MarkState, price: bigint, now: number, oracle: OracleParams): void => {
  require(price > 0n, "ZeroPrice");
  const fresh = mark.updatedAt !== 0 && now <= mark.updatedAt + oracle.maxAge;
  if (fresh && oracle.maxDeviationBps !== 0 && mark.price !== 0n) {
    const gap = price > mark.price ? price - mark.price : mark.price - price;
    const moved = (gap * math.BPS) / mark.price;
    require(moved <= BigInt(oracle.maxDeviationBps), "DeviationTooLarge");
  }
  mark.price = price;
  mark.updatedAt = now;
};

/** Takes the 24h reference mark if the last one is a window old. */
export const snapshot = (market: MarketState, mark: MarkState | undefined, now: number, maxAge: number): boolean => {
  if (market.referenceAt !== 0 && now < market.referenceAt + math.REFERENCE_WINDOW) return false;
  market.referencePrice = markPrice(mark, now, maxAge);
  market.referenceAt = now;
  return true;
};

// ----------------------------------------------------------------- balances

export const deposit = (trader: TraderState, amount: bigint): Activity => {
  require(amount > 0n, "ZeroAmount");
  trader.balance += amount;
  return { kind: "deposit", address: trader.address, amount };
};

/** Debits the free balance for a withdrawal; the transfer itself is queued. */
export const withdraw = (trader: TraderState, amount: bigint): Activity => {
  require(amount > 0n, "ZeroAmount");
  require(trader.balance >= amount, "InsufficientBalance");
  trader.balance -= amount;
  return { kind: "withdraw", address: trader.address, amount };
};

/** Moves free balance into the pool, for shares. */
export const addLiquidity = (pool: PoolState, trader: TraderState, amount: bigint): { shares: bigint; activity: Activity } => {
  require(amount > 0n, "ZeroAmount");
  require(trader.balance >= amount, "InsufficientBalance");
  let shares: bigint;
  if (pool.shares === 0n) {
    shares = math.INITIAL_SHARES;
  } else {
    require(pool.assets > 0n, "EmptyPool");
    shares = (amount * pool.shares) / pool.assets;
  }
  require(shares > 0n, "ZeroAmount");
  trader.balance -= amount;
  pool.shares += shares;
  pool.assets += amount;
  trader.shares += shares;
  return { shares, activity: { kind: "lp_add", address: trader.address, amount } };
};

/** Redeems shares — only against the part of the pool nothing has reserved. */
export const removeLiquidity = (pool: PoolState, trader: TraderState, shares: bigint): { amount: bigint; activity: Activity } => {
  require(shares > 0n, "ZeroAmount");
  require(trader.shares >= shares, "InsufficientBalance");
  const amount = (shares * pool.assets) / pool.shares;
  require(amount <= poolFree(pool), "InsufficientLiquidity");
  trader.shares -= shares;
  pool.shares -= shares;
  pool.assets -= amount;
  trader.balance += amount;
  return { amount, activity: { kind: "lp_remove", address: trader.address, amount } };
};

// ---------------------------------------------------------------- positions

export interface OpenArgs {
  pool: PoolState;
  market: MarketState;
  mark: MarkState | undefined;
  trader: TraderState;
  existing: PositionState | null;
  isLong: boolean;
  margin: bigint;
  leverage: number;
  now: number;
  oracle: OracleParams;
}

export const openPosition = (args: OpenArgs): { position: PositionState; activity: Activity } => {
  const { pool, market, trader, isLong, margin, leverage, now } = args;
  require(args.existing === null, "PositionExists");
  require(!market.paused, "MarketIsPaused");
  require(Number.isInteger(leverage) && leverage > 0 && leverage <= market.maxLeverage, "LeverageTooHigh");
  require(margin >= market.minMargin && margin > 0n, "MarginTooSmall");

  const notional = margin * BigInt(leverage);
  const entryFee = math.fee(notional);
  const cost = margin + entryFee;
  require(trader.balance >= cost, "InsufficientBalance");

  accrue(market, now);

  const reserve = margin * (math.PAYOUT_CAP - 1n);
  require(reserve <= poolFree(pool), "InsufficientLiquidity");

  const side = (isLong ? market.longOi : market.shortOi) + notional;
  require(side <= market.maxOpenInterest, "OpenInterestCap");

  const entryPrice = markPrice(args.mark, now, args.oracle.maxAge);

  trader.balance -= cost;
  pool.assets += entryFee;
  pool.reserved += reserve;
  if (isLong) market.longOi = side;
  else market.shortOi = side;

  const position: PositionState = {
    address: trader.address,
    symbol: market.symbol,
    margin,
    notional,
    payoutCap: margin * math.PAYOUT_CAP,
    entryPrice,
    entryFunding: sideIndex(market, isLong),
    openedAt: now,
    isLong,
  };

  return {
    position,
    activity: { kind: "opened", address: trader.address, symbol: market.symbol, amount: margin, fee: entryFee, price: entryPrice },
  };
};

/** Adds margin. The payout cap and the reserve stay as fixed at open. */
export const addMargin = (trader: TraderState, position: PositionState | null, amount: bigint): Activity => {
  require(position !== null, "NoPosition");
  require(amount > 0n, "ZeroAmount");
  require(trader.balance >= amount, "InsufficientBalance");
  trader.balance -= amount;
  (position as PositionState).margin += amount;
  return { kind: "margin", address: trader.address, symbol: (position as PositionState).symbol, amount };
};

export interface ReduceArgs {
  pool: PoolState;
  market: MarketState;
  mark: MarkState | undefined;
  trader: TraderState;
  position: PositionState | null;
  closing: bigint;
  now: number;
  oracle: OracleParams;
}

/** Closes `closing` of the notional. Returns null for the position when it is closed whole. */
export const reducePosition = (args: ReduceArgs): { position: PositionState | null; activity: Activity } => {
  const { pool, market, trader, closing, now } = args;
  require(args.position !== null, "NoPosition");
  const position = args.position as PositionState;
  require(closing > 0n && closing <= position.notional, "BadCloseAmount");

  accrue(market, now);
  const exitPrice = markPrice(args.mark, now, args.oracle.maxAge);
  const close = priceClose(market, position, closing, exitPrice);

  release(pool, market, position.isLong, closing, close.marginOut, close.capOut, close.amount);
  trader.balance += close.amount;

  const base = {
    address: trader.address,
    symbol: market.symbol,
    amount: close.amount,
    pnl: close.pnl,
    funding: close.funding,
    fee: close.exitFee,
    price: exitPrice,
  };

  if (close.whole) {
    return { position: null, activity: { kind: "closed", ...base } };
  }

  position.margin -= close.marginOut;
  position.notional -= closing;
  position.payoutCap -= close.capOut;
  require(position.margin >= market.minMargin, "MarginTooSmall");
  return { position, activity: { kind: "reduced", ...base } };
};

export interface LiquidateArgs {
  pool: PoolState;
  market: MarketState;
  mark: MarkState | undefined;
  position: PositionState;
  /** Who receives the reward: the venue's own house account. */
  liquidator: TraderState;
  now: number;
  oracle: OracleParams;
}

export const liquidate = (args: LiquidateArgs): { reward: bigint; activity: Activity } => {
  const { pool, market, position, liquidator, now } = args;
  accrue(market, now);
  const exitPrice = markPrice(args.mark, now, args.oracle.maxAge);

  const result = math.pnl(position.notional, position.entryPrice, exitPrice, position.isLong);
  const funding = math.accruedFunding(position.notional, sideIndex(market, position.isLong), position.entryFunding);
  const value = math.equity(position.margin, result, funding);
  require(value <= math.maintenance(position.notional), "NotLiquidatable");

  const left = value > 0n ? value : 0n;
  const reward = math.liquidatorReward(left);

  release(pool, market, position.isLong, position.notional, position.margin, position.payoutCap, reward);
  liquidator.balance += reward;

  return {
    reward,
    activity: {
      kind: "liquidated",
      address: position.address,
      symbol: market.symbol,
      amount: 0n,
      pnl: result,
      funding,
      price: exitPrice,
    },
  };
};

/** Everything a screen needs about one position, priced at `mark` and `now`. */
export const positionView = (position: PositionState, market: MarketState, mark: bigint, now: number) => {
  const index = projectedIndices(market, now);
  const funding = math.accruedFunding(position.notional, position.isLong ? index.long : index.short, position.entryFunding);
  const result = math.pnl(position.notional, position.entryPrice, mark, position.isLong);
  const value = math.equity(position.margin, result, funding);
  const floor = math.maintenance(position.notional);
  return {
    pnl: result,
    funding,
    equity: value,
    maintenance: floor,
    liquidationPrice: math.liquidationPrice(position.margin, position.notional, position.entryPrice, funding, position.isLong),
    liquidatable: value <= floor,
  };
};
