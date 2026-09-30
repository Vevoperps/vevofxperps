/**
 * The handbook as assertions — the same scenarios and the same numbers as the
 * Solana program's `tests/vevo.ts`, run against the server's engine.
 *
 * `Venue` below is a tiny in-memory store with the same all-or-nothing
 * behaviour as the database transaction: an operation that throws leaves
 * nothing changed.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as engine from "../src/engine.js";
import type { MarketState, MarkState, OracleParams, PoolState, PositionState, TraderState } from "../src/engine.js";
import { WAD } from "../src/math.js";

const USDC = 1_000_000n;
const usdc = (whole: number | bigint): bigint => BigInt(whole) * USDC;
/** A price like 150.25 as 1e18, from thousandths to stay exact. */
const price = (thousandths: bigint): bigint => (thousandths * WAD) / 1000n;

interface State {
  pool: PoolState;
  markets: Map<string, MarketState>;
  marks: Map<string, MarkState>;
  traders: Map<string, TraderState>;
  positions: Map<string, PositionState>;
}

const clone = <T>(value: T): T => structuredClone(value);

class Venue {
  state: State;
  now = 1_700_000_000;
  oracle: OracleParams = { maxAge: 60, maxDeviationBps: 500 };

  constructor() {
    this.state = {
      pool: { assets: 0n, reserved: 0n, shares: 0n },
      markets: new Map(),
      marks: new Map(),
      traders: new Map(),
      positions: new Map(),
    };
  }

  /** Runs `fn` on a copy and keeps it only if nothing threw. */
  atomic<T>(fn: (s: State) => T): T {
    const draft = clone(this.state);
    const result = fn(draft);
    this.state = draft;
    return result;
  }

  list(symbol: string, maxLeverage = 25): void {
    this.state.markets.set(symbol, {
      symbol,
      index: this.state.markets.size,
      maxLeverage,
      skewScale: usdc(2_000_000),
      maxOpenInterest: usdc(5_000_000),
      minMargin: usdc(10),
      paused: false,
      longOi: 0n,
      shortOi: 0n,
      fundingLong: 0n,
      fundingShort: 0n,
      lastAccrual: this.now,
      referencePrice: 0n,
      referenceAt: 0,
    });
    this.state.marks.set(symbol, { price: 0n, updatedAt: 0 });
  }

  trader(s: State, address: string): TraderState {
    let row = s.traders.get(address);
    if (!row) {
      row = { address, balance: 0n, shares: 0n };
      s.traders.set(address, row);
    }
    return row;
  }

  post(symbol: string, value: bigint): void {
    this.atomic((s) => engine.postMark(s.marks.get(symbol) as MarkState, value, this.now, this.oracle));
  }

  deposit(address: string, amount: bigint): void {
    this.atomic((s) => engine.deposit(this.trader(s, address), amount));
  }

  open(address: string, symbol: string, isLong: boolean, margin: bigint, leverage: number): void {
    this.atomic((s) => {
      const key = `${address}:${symbol}`;
      const { position } = engine.openPosition({
        pool: s.pool,
        market: s.markets.get(symbol) as MarketState,
        mark: s.marks.get(symbol),
        trader: this.trader(s, address),
        existing: s.positions.get(key) ?? null,
        isLong,
        margin,
        leverage,
        now: this.now,
        oracle: this.oracle,
      });
      s.positions.set(key, position);
    });
  }

  reduce(address: string, symbol: string, closing: bigint): void {
    this.atomic((s) => {
      const key = `${address}:${symbol}`;
      const { position } = engine.reducePosition({
        pool: s.pool,
        market: s.markets.get(symbol) as MarketState,
        mark: s.marks.get(symbol),
        trader: this.trader(s, address),
        position: s.positions.get(key) ?? null,
        closing,
        now: this.now,
        oracle: this.oracle,
      });
      if (position) s.positions.set(key, position);
      else s.positions.delete(key);
    });
  }

  liquidate(address: string, symbol: string, house: string): void {
    this.atomic((s) => {
      const key = `${address}:${symbol}`;
      const position = s.positions.get(key);
      if (!position) throw new engine.VevoError("NoPosition");
      engine.liquidate({
        pool: s.pool,
        market: s.markets.get(symbol) as MarketState,
        mark: s.marks.get(symbol),
        position,
        liquidator: this.trader(s, house),
        now: this.now,
        oracle: this.oracle,
      });
      s.positions.delete(key);
    });
  }

  balance(address: string): bigint {
    return this.state.traders.get(address)?.balance ?? 0n;
  }

  position(address: string, symbol: string): PositionState | undefined {
    return this.state.positions.get(`${address}:${symbol}`);
  }

  /** Everything the treasury must hold: free balances, pool, open margin. */
  claims(): bigint {
    let total = this.state.pool.assets;
    for (const trader of this.state.traders.values()) total += trader.balance;
    for (const position of this.state.positions.values()) total += position.margin;
    return total;
  }
}

const rejects = (fn: () => unknown, code: engine.VevoErrorCode): void => {
  assert.throws(fn, (error: unknown) => error instanceof engine.VevoError && error.code === code);
};

const LP = "lp";
const TRADER = "trader";
const HOUSE = "house";
const JPY = "USDJPY";
const EUR = "USDEUR";

describe("vevo engine", () => {
  const venue = new Venue();
  venue.list(JPY);
  venue.list(EUR);

  /** What came in from outside: deposits only (withdrawals subtract). */
  let inflow = 0n;
  const solvent = () => assert.equal(venue.claims(), inflow);

  describe("oracle", () => {
    it("posts marks", () => {
      venue.post(JPY, price(150_000n));
      venue.post(EUR, price(900n));
      assert.equal(venue.state.marks.get(JPY)?.price, price(150_000n));
    });

    it("refuses a move past the deviation limit", () => {
      rejects(() => venue.post(JPY, price(160_000n)), "DeviationTooLarge");
      assert.equal(venue.state.marks.get(JPY)?.price, price(150_000n));
    });
  });

  describe("balances and the pool", () => {
    it("takes liquidity in shares", () => {
      venue.deposit(LP, usdc(10_000));
      inflow += usdc(10_000);
      venue.atomic((s) => engine.addLiquidity(s.pool, venue.trader(s, LP), usdc(10_000)));
      assert.equal(venue.state.pool.assets, usdc(10_000));
      assert.equal(venue.state.pool.shares, 10n ** 18n);
      solvent();
    });

    it("takes a deposit into the free balance", () => {
      venue.deposit(TRADER, usdc(1_000));
      inflow += usdc(1_000);
      assert.equal(venue.balance(TRADER), usdc(1_000));
      solvent();
    });
  });

  describe("a position, open to close", () => {
    it("opens at the mark, charges 0.05%, reserves nine tenths of the cap", () => {
      venue.open(TRADER, JPY, true, usdc(100), 10);
      const position = venue.position(TRADER, JPY) as PositionState;
      assert.equal(position.notional, usdc(1_000));
      assert.equal(position.payoutCap, usdc(1_000));
      assert.equal(venue.balance(TRADER), 899_500_000n);
      assert.equal(venue.state.pool.reserved, usdc(900));
      assert.equal(venue.state.pool.assets, 10_000_500_000n);
      solvent();
    });

    it("refuses a second position on the same market", () => {
      rejects(() => venue.open(TRADER, JPY, true, usdc(10), 2), "PositionExists");
    });

    it("closes half: half the margin, half the fee, the move on half", () => {
      venue.post(JPY, price(156_000n)); // +4%
      venue.reduce(TRADER, JPY, usdc(500));
      assert.equal(venue.balance(TRADER), 899_500_000n + 69_750_000n);
      assert.equal(venue.position(TRADER, JPY)?.margin, usdc(50));
      solvent();
    });

    it("closes the rest", () => {
      venue.reduce(TRADER, JPY, usdc(500));
      assert.equal(venue.balance(TRADER), 899_500_000n + 2n * 69_750_000n);
      assert.equal(venue.position(TRADER, JPY), undefined);
      assert.equal(venue.state.pool.reserved, 0n);
      solvent();
    });
  });

  describe("liquidation", () => {
    it("is refused above the maintenance margin", () => {
      venue.open(TRADER, JPY, true, usdc(100), 10);
      venue.post(JPY, price(148_200n)); // -5%
      rejects(() => venue.liquidate(TRADER, JPY, HOUSE), "NotLiquidatable");
      solvent();
    });

    it("pays the liquidator half the equity left, 9.5% from entry at 10x", () => {
      venue.post(JPY, price(141_180n)); // 156 x 0.905
      const before = venue.balance(TRADER);
      venue.liquidate(TRADER, JPY, HOUSE);
      assert.equal(venue.balance(HOUSE), 2_500_000n);
      assert.equal(venue.balance(TRADER), before);
      assert.equal(venue.position(TRADER, JPY), undefined);
      solvent();
    });
  });

  describe("reference, margin and the cap", () => {
    it("takes the first 24h reference at once, then waits a window", () => {
      const took = venue.atomic((s) => engine.snapshot(s.markets.get(JPY) as MarketState, s.marks.get(JPY), venue.now, 60));
      assert.equal(took, true);
      const first = venue.state.markets.get(JPY) as MarketState;
      assert.equal(first.referencePrice, price(141_180n));
      venue.now += 10;
      venue.post(JPY, price(141_180n));
      const again = venue.atomic((s) => engine.snapshot(s.markets.get(JPY) as MarketState, s.marks.get(JPY), venue.now, 60));
      assert.equal(again, false);
    });

    it("adds margin without raising the cap or the reserve", () => {
      venue.open(TRADER, JPY, true, usdc(20), 5); // 100 notional
      const reserved = venue.state.pool.reserved;
      venue.atomic((s) => engine.addMargin(venue.trader(s, TRADER), s.positions.get(`${TRADER}:${JPY}`) ?? null, usdc(10)));
      const position = venue.position(TRADER, JPY) as PositionState;
      assert.equal(position.margin, usdc(30));
      assert.equal(position.payoutCap, usdc(200));
      assert.equal(venue.state.pool.reserved, reserved);
      solvent();
    });

    it("refuses a partial close that leaves a stub under the minimum margin, and changes nothing", () => {
      const before = clone(venue.state);
      rejects(() => venue.reduce(TRADER, JPY, usdc(70)), "MarginTooSmall");
      assert.deepEqual(venue.state, before);
    });

    it("pays no more than the cap fixed at open, however far the mark runs", () => {
      venue.oracle = { ...venue.oracle, maxDeviationBps: 0 };
      venue.post(JPY, price(564_720n)); // 4x
      const before = venue.balance(TRADER);
      venue.reduce(TRADER, JPY, usdc(100));
      assert.equal(venue.balance(TRADER), before + usdc(200));
      venue.post(JPY, price(141_180n));
      venue.oracle = { ...venue.oracle, maxDeviationBps: 500 };
      solvent();
    });
  });

  describe("guards", () => {
    it("refuses a stale mark", () => {
      venue.now += 61;
      rejects(() => venue.open(TRADER, EUR, false, usdc(10), 2), "StalePrice");
    });

    it("refuses new positions on a paused market", () => {
      venue.post(EUR, price(900n));
      (venue.state.markets.get(EUR) as MarketState).paused = true;
      rejects(() => venue.open(TRADER, EUR, false, usdc(10), 2), "MarketIsPaused");
      (venue.state.markets.get(EUR) as MarketState).paused = false;
    });

    it("refuses leverage above the market's cap", () => {
      venue.post(JPY, price(141_180n));
      rejects(() => venue.open(TRADER, JPY, true, usdc(10), 26), "LeverageTooHigh");
    });

    it("refuses a market with no mark yet", () => {
      venue.list("USDGBP");
      rejects(() => venue.open(TRADER, "USDGBP", true, usdc(10), 2), "NoFeed");
    });
  });

  describe("funding", () => {
    it("accrues on the heavier side and nets to zero across sides", () => {
      const market: MarketState = { ...(venue.state.markets.get(EUR) as MarketState), longOi: usdc(20_000), shortOi: usdc(10_000), lastAccrual: 0 };
      engine.accrue(market, 8 * 3600);
      assert.ok(market.fundingLong > 0n);
      assert.equal(market.fundingLong, -market.fundingShort);
    });
  });

  describe("exits", () => {
    it("pays out the free balance", () => {
      const free = venue.balance(TRADER);
      venue.atomic((s) => engine.withdraw(venue.trader(s, TRADER), free));
      inflow -= free;
      assert.equal(venue.balance(TRADER), 0n);
      solvent();
    });

    it("redeems LP shares for their part of the pool", () => {
      const shares = venue.state.traders.get(LP)?.shares as bigint;
      venue.atomic((s) => engine.removeLiquidity(s.pool, venue.trader(s, LP), shares));
      assert.equal(venue.state.pool.shares, 0n);
      assert.equal(venue.state.pool.assets, 0n);
      solvent();
    });

    it("refuses a withdrawal larger than the free balance", () => {
      rejects(() => venue.atomic((s) => engine.withdraw(venue.trader(s, TRADER), 1n)), "InsufficientBalance");
    });
  });
});
