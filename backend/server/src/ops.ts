import { config } from "./config.js";
import { withVenue, type Tx } from "./db.js";
import * as engine from "./engine.js";
import type { MarketState, MarkState } from "./engine.js";

/**
 * The venue's operations: load what the engine needs under the lock, run the
 * rule, write back. Every function here is one database transaction.
 */

export const now = (): number => Math.floor(Date.now() / 1000);

export const oracle = (): engine.OracleParams => ({ maxAge: config.MARK_MAX_AGE, maxDeviationBps: config.MAX_DEVIATION_BPS });

const marketOrThrow = async (tx: Tx, symbol: string): Promise<MarketState & { mark: MarkState }> => {
  const market = await tx.market(symbol);
  if (!market) throw new engine.VevoError("UnknownMarket");
  return market;
};

// ------------------------------------------------------------------- trading

export const openPosition = (address: string, symbol: string, isLong: boolean, margin: bigint, leverage: number) =>
  withVenue(async (tx) => {
    const at = now();
    const [pool, market, trader, existing] = await Promise.all([
      tx.pool(),
      marketOrThrow(tx, symbol),
      tx.trader(address),
      tx.position(address, symbol),
    ]);
    const { position, activity } = engine.openPosition({
      pool,
      market,
      mark: market.mark,
      trader,
      existing,
      isLong,
      margin,
      leverage,
      now: at,
      oracle: oracle(),
    });
    await tx.savePool(pool);
    await tx.saveMarket(market);
    await tx.saveTrader(trader);
    await tx.savePosition(position);
    await tx.record(activity, at);
    return position;
  });

export const reducePosition = (address: string, symbol: string, closing: bigint | "all") =>
  withVenue(async (tx) => {
    const at = now();
    const [pool, market, trader, position] = await Promise.all([
      tx.pool(),
      marketOrThrow(tx, symbol),
      tx.trader(address),
      tx.position(address, symbol),
    ]);
    const amount = closing === "all" ? (position?.notional ?? 0n) : closing;
    const result = engine.reducePosition({
      pool,
      market,
      mark: market.mark,
      trader,
      position,
      closing: amount,
      now: at,
      oracle: oracle(),
    });
    await tx.savePool(pool);
    await tx.saveMarket(market);
    await tx.saveTrader(trader);
    if (result.position) await tx.savePosition(result.position);
    else await tx.deletePosition(address, symbol);
    await tx.record(result.activity, at);
    return result.activity;
  });

export const addMargin = (address: string, symbol: string, amount: bigint) =>
  withVenue(async (tx) => {
    const at = now();
    const [trader, position] = await Promise.all([tx.trader(address), tx.position(address, symbol)]);
    const activity = engine.addMargin(trader, position, amount);
    await tx.saveTrader(trader);
    if (position) await tx.savePosition(position);
    await tx.record(activity, at);
  });

// ---------------------------------------------------------------------- pool

export const addLiquidity = (address: string, amount: bigint) =>
  withVenue(async (tx) => {
    const [pool, trader] = await Promise.all([tx.pool(), tx.trader(address)]);
    const { shares, activity } = engine.addLiquidity(pool, trader, amount);
    await tx.savePool(pool);
    await tx.saveTrader(trader);
    await tx.record(activity, now());
    return shares;
  });

export const removeLiquidity = (address: string, shares: bigint) =>
  withVenue(async (tx) => {
    const [pool, trader] = await Promise.all([tx.pool(), tx.trader(address)]);
    const { amount, activity } = engine.removeLiquidity(pool, trader, shares);
    await tx.savePool(pool);
    await tx.saveTrader(trader);
    await tx.record(activity, now());
    return amount;
  });

// ------------------------------------------------------------ money in / out

/**
 * Credits one sender's part of a deposit transaction, once. The primary key
 * on (signature, address) is what makes a replayed confirmation harmless.
 */
export const creditDeposit = (signature: string, address: string, amount: bigint) =>
  withVenue(async (tx) => {
    const inserted = await tx.query(
      "INSERT INTO deposits (signature, address, amount) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING signature",
      [signature, address, amount.toString()],
    );
    if (inserted.rowCount === 0) return false;
    const trader = await tx.trader(address);
    const activity = engine.deposit(trader, amount);
    await tx.saveTrader(trader);
    await tx.record(activity, now(), signature);
    return true;
  });

export class LimitError extends Error {
  readonly code = "BelowMinimum";
}

/**
 * Debits the balance and queues the transfer. Inside the limits it goes out
 * automatically; above them it waits for an admin.
 */
export const requestWithdrawal = (address: string, amount: bigint) =>
  withVenue(async (tx) => {
    if (amount < config.MIN_TRANSFER) throw new LimitError(`minimum is ${config.MIN_TRANSFER} base units`);
    const trader = await tx.trader(address);
    const activity = engine.withdraw(trader, amount);

    const { rows } = await tx.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawals
       WHERE status IN ('queued','sending','sent') AND created_at > now() - interval '24 hours'`,
    );
    const lastDay = BigInt((rows[0] as { total: string }).total);
    const automatic = amount <= config.WITHDRAW_MAX_SINGLE && lastDay + amount <= config.WITHDRAW_MAX_DAILY;
    const status = automatic ? "queued" : "review";

    const inserted = await tx.query(
      "INSERT INTO withdrawals (address, amount, status) VALUES ($1, $2, $3) RETURNING id",
      [address, amount.toString(), status],
    );
    await tx.saveTrader(trader);
    const id = String((inserted.rows[0] as { id: string }).id);
    await tx.record(activity, now(), `withdrawal:${id}`);
    return { id, status };
  });

/** Admin: send a withdrawal that was waiting for review. */
export const approveWithdrawal = (id: string) =>
  withVenue(async (tx) => {
    const { rowCount } = await tx.query(
      "UPDATE withdrawals SET status = 'queued', updated_at = now() WHERE id = $1 AND status = 'review'",
      [id],
    );
    return rowCount === 1;
  });

/** Admin: refuse a withdrawal under review; the amount returns to the balance. */
export const rejectWithdrawal = (id: string, reason: string) =>
  withVenue(async (tx) => {
    const { rows } = await tx.query(
      "UPDATE withdrawals SET status = 'rejected', error = $2, updated_at = now() WHERE id = $1 AND status = 'review' RETURNING address, amount",
      [id, reason],
    );
    const row = rows[0] as { address: string; amount: string } | undefined;
    if (!row) return false;
    const trader = await tx.trader(row.address);
    engine.deposit(trader, BigInt(row.amount));
    await tx.saveTrader(trader);
    await tx.record({ kind: "deposit", address: row.address, amount: BigInt(row.amount) }, now(), `refund:${id}`);
    return true;
  });

// ------------------------------------------------------------------ keeping

/** Posts a round of marks, walking any move larger than the deviation limit. */
export const postMarks = (targets: Map<string, bigint>) =>
  withVenue(async (tx) => {
    const at = now();
    const params = oracle();
    const markets = await tx.markets();
    let posted = 0;
    for (const market of markets) {
      const target = targets.get(market.symbol);
      if (target === undefined) continue;

      let price = target;
      const mark = market.mark;
      const fresh = mark.updatedAt !== 0 && at <= mark.updatedAt + params.maxAge;
      if (fresh && params.maxDeviationBps > 0 && mark.price > 0n) {
        const limit = BigInt(params.maxDeviationBps);
        const gap = price > mark.price ? price - mark.price : mark.price - price;
        if ((gap * 10_000n) / mark.price > limit) {
          const step = (mark.price * limit) / 10_000n;
          price = price > mark.price ? mark.price + step : mark.price - step;
          console.warn(`[prices] ${market.symbol} moved past ${limit} bps; stepping toward it`);
        }
      }

      engine.postMark(mark, price, at, params);
      engine.accrue(market, at);
      try {
        engine.snapshot(market, mark, at, params.maxAge);
      } catch {
        // A market without a usable mark simply has no reference yet.
      }
      await tx.saveMarket(market);
      posted += 1;
    }
    return posted;
  });

/** Liquidates one position if, under the lock, it is still liquidatable. */
export const liquidateOne = (address: string, symbol: string) =>
  withVenue(async (tx) => {
    const at = now();
    const [pool, market, position] = await Promise.all([tx.pool(), marketOrThrow(tx, symbol), tx.position(address, symbol)]);
    if (!position) return false;

    const house = config.HOUSE_ADDRESS ? await tx.trader(config.HOUSE_ADDRESS) : { address: "pool", balance: 0n, shares: 0n };
    const { reward, activity } = engine.liquidate({
      pool,
      market,
      mark: market.mark,
      position,
      liquidator: house,
      now: at,
      oracle: oracle(),
    });
    // With no house address the reward stays with the pool.
    if (!config.HOUSE_ADDRESS) pool.assets += reward;
    else await tx.saveTrader(house);

    await tx.savePool(pool);
    await tx.saveMarket(market);
    await tx.deletePosition(address, symbol);
    await tx.record(activity, at);
    return true;
  });
