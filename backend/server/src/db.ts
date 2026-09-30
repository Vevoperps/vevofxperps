import pg, { type PoolClient } from "pg";

import { config } from "./config.js";
import type { Activity, MarketState, MarkState, PoolState, PositionState, TraderState } from "./engine.js";

/**
 * The ledger, in Postgres.
 *
 * Every write to venue state runs inside `withVenue`: one transaction that
 * first takes a single advisory lock, so writes are strictly one at a time.
 * The venue's volume is nowhere near what that would limit, and it removes
 * every question about two trades racing over the pool. A thrown error rolls
 * the whole operation back — the same all-or-nothing a Solana transaction
 * gives.
 *
 * Amounts are USDC base units and prices 1e18, stored as NUMERIC and read
 * back as `bigint`. Nothing passes through a float.
 */

// NUMERIC arrives as a string; keep it that way and parse to bigint ourselves.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value: string) => value);
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => value);

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
});

const VENUE_LOCK = 7_001;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pool (
  id        INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  assets    NUMERIC(40,0) NOT NULL DEFAULT 0 CHECK (assets >= 0),
  reserved  NUMERIC(40,0) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  shares    NUMERIC(60,0) NOT NULL DEFAULT 0 CHECK (shares >= 0)
);
INSERT INTO pool (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS markets (
  symbol           TEXT PRIMARY KEY,
  idx              INT NOT NULL UNIQUE,
  max_leverage     INT NOT NULL,
  skew_scale       NUMERIC(40,0) NOT NULL,
  max_oi           NUMERIC(40,0) NOT NULL,
  min_margin       NUMERIC(40,0) NOT NULL,
  paused           BOOLEAN NOT NULL DEFAULT FALSE,
  long_oi          NUMERIC(40,0) NOT NULL DEFAULT 0,
  short_oi         NUMERIC(40,0) NOT NULL DEFAULT 0,
  funding_long     NUMERIC(60,0) NOT NULL DEFAULT 0,
  funding_short    NUMERIC(60,0) NOT NULL DEFAULT 0,
  last_accrual     BIGINT NOT NULL,
  reference_price  NUMERIC(60,0) NOT NULL DEFAULT 0,
  reference_at     BIGINT NOT NULL DEFAULT 0,
  mark_price       NUMERIC(60,0) NOT NULL DEFAULT 0,
  mark_at          BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS traders (
  address     TEXT PRIMARY KEY,
  balance     NUMERIC(40,0) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  shares      NUMERIC(60,0) NOT NULL DEFAULT 0 CHECK (shares >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS positions (
  address        TEXT NOT NULL,
  symbol         TEXT NOT NULL REFERENCES markets(symbol),
  margin         NUMERIC(40,0) NOT NULL,
  notional       NUMERIC(40,0) NOT NULL,
  payout_cap     NUMERIC(40,0) NOT NULL,
  entry_price    NUMERIC(60,0) NOT NULL,
  entry_funding  NUMERIC(60,0) NOT NULL,
  opened_at      BIGINT NOT NULL,
  is_long        BOOLEAN NOT NULL,
  PRIMARY KEY (address, symbol)
);

CREATE TABLE IF NOT EXISTS activity (
  id       BIGSERIAL PRIMARY KEY,
  address  TEXT NOT NULL,
  kind     TEXT NOT NULL,
  symbol   TEXT,
  amount   NUMERIC(40,0) NOT NULL DEFAULT 0,
  pnl      NUMERIC(40,0),
  fee      NUMERIC(40,0),
  funding  NUMERIC(40,0),
  price    NUMERIC(60,0),
  ref      TEXT,
  at       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_by_address ON activity (address, id DESC);

CREATE TABLE IF NOT EXISTS deposits (
  signature   TEXT NOT NULL,
  address     TEXT NOT NULL,
  amount      NUMERIC(40,0) NOT NULL CHECK (amount > 0),
  credited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (signature, address)
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id                 BIGSERIAL PRIMARY KEY,
  address            TEXT NOT NULL,
  amount             NUMERIC(40,0) NOT NULL CHECK (amount > 0),
  status             TEXT NOT NULL CHECK (status IN ('queued','review','sending','sent','rejected')),
  signature          TEXT,
  last_valid_height  BIGINT,
  attempts           INT NOT NULL DEFAULT 0,
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS withdrawals_by_status ON withdrawals (status, id);
CREATE INDEX IF NOT EXISTS withdrawals_by_address ON withdrawals (address, id DESC);

CREATE TABLE IF NOT EXISTS nonces (
  nonce       TEXT PRIMARY KEY,
  address     TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
`;

export const migrate = async (): Promise<void> => {
  await pool.query(SCHEMA);
};

const big = (value: unknown): bigint => (value === null || value === undefined ? 0n : BigInt(value as string));
const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
const str = (value: bigint): string => value.toString();

// --------------------------------------------------------------- row mapping

export const marketFromRow = (row: Record<string, unknown>): MarketState & { mark: MarkState } => ({
  symbol: row.symbol as string,
  index: num(row.idx),
  maxLeverage: num(row.max_leverage),
  skewScale: big(row.skew_scale),
  maxOpenInterest: big(row.max_oi),
  minMargin: big(row.min_margin),
  paused: Boolean(row.paused),
  longOi: big(row.long_oi),
  shortOi: big(row.short_oi),
  fundingLong: big(row.funding_long),
  fundingShort: big(row.funding_short),
  lastAccrual: num(row.last_accrual),
  referencePrice: big(row.reference_price),
  referenceAt: num(row.reference_at),
  mark: { price: big(row.mark_price), updatedAt: num(row.mark_at) },
});

export const positionFromRow = (row: Record<string, unknown>): PositionState => ({
  address: row.address as string,
  symbol: row.symbol as string,
  margin: big(row.margin),
  notional: big(row.notional),
  payoutCap: big(row.payout_cap),
  entryPrice: big(row.entry_price),
  entryFunding: big(row.entry_funding),
  openedAt: num(row.opened_at),
  isLong: Boolean(row.is_long),
});

// --------------------------------------------------------------- transaction

export class Tx {
  readonly client: PoolClient;

  constructor(client: PoolClient) {
    this.client = client;
  }

  query(text: string, values: unknown[] = []) {
    return this.client.query(text, values);
  }

  async pool(): Promise<PoolState> {
    const { rows } = await this.query("SELECT assets, reserved, shares FROM pool WHERE id = 1");
    const row = rows[0] as Record<string, unknown>;
    return { assets: big(row.assets), reserved: big(row.reserved), shares: big(row.shares) };
  }

  async savePool(state: PoolState): Promise<void> {
    await this.query("UPDATE pool SET assets = $1, reserved = $2, shares = $3 WHERE id = 1", [
      str(state.assets),
      str(state.reserved),
      str(state.shares),
    ]);
  }

  async market(symbol: string): Promise<(MarketState & { mark: MarkState }) | null> {
    const { rows } = await this.query("SELECT * FROM markets WHERE symbol = $1", [symbol]);
    return rows[0] ? marketFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async markets(): Promise<(MarketState & { mark: MarkState })[]> {
    const { rows } = await this.query("SELECT * FROM markets ORDER BY idx");
    return rows.map((row) => marketFromRow(row as Record<string, unknown>));
  }

  async saveMarket(state: MarketState & { mark: MarkState }): Promise<void> {
    await this.query(
      `UPDATE markets SET
         max_leverage = $2, skew_scale = $3, max_oi = $4, min_margin = $5, paused = $6,
         long_oi = $7, short_oi = $8, funding_long = $9, funding_short = $10, last_accrual = $11,
         reference_price = $12, reference_at = $13, mark_price = $14, mark_at = $15
       WHERE symbol = $1`,
      [
        state.symbol,
        state.maxLeverage,
        str(state.skewScale),
        str(state.maxOpenInterest),
        str(state.minMargin),
        state.paused,
        str(state.longOi),
        str(state.shortOi),
        str(state.fundingLong),
        str(state.fundingShort),
        state.lastAccrual,
        str(state.referencePrice),
        state.referenceAt,
        str(state.mark.price),
        state.mark.updatedAt,
      ],
    );
  }

  /** The trader row, or a fresh zero one (saved on `saveTrader`). */
  async trader(address: string): Promise<TraderState> {
    const { rows } = await this.query("SELECT balance, shares FROM traders WHERE address = $1", [address]);
    const row = rows[0] as Record<string, unknown> | undefined;
    return { address, balance: big(row?.balance), shares: big(row?.shares) };
  }

  async saveTrader(state: TraderState): Promise<void> {
    await this.query(
      `INSERT INTO traders (address, balance, shares) VALUES ($1, $2, $3)
       ON CONFLICT (address) DO UPDATE SET balance = EXCLUDED.balance, shares = EXCLUDED.shares`,
      [state.address, str(state.balance), str(state.shares)],
    );
  }

  async position(address: string, symbol: string): Promise<PositionState | null> {
    const { rows } = await this.query("SELECT * FROM positions WHERE address = $1 AND symbol = $2", [address, symbol]);
    return rows[0] ? positionFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async savePosition(state: PositionState): Promise<void> {
    await this.query(
      `INSERT INTO positions (address, symbol, margin, notional, payout_cap, entry_price, entry_funding, opened_at, is_long)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (address, symbol) DO UPDATE SET
         margin = EXCLUDED.margin, notional = EXCLUDED.notional, payout_cap = EXCLUDED.payout_cap,
         entry_price = EXCLUDED.entry_price, entry_funding = EXCLUDED.entry_funding,
         opened_at = EXCLUDED.opened_at, is_long = EXCLUDED.is_long`,
      [
        state.address,
        state.symbol,
        str(state.margin),
        str(state.notional),
        str(state.payoutCap),
        str(state.entryPrice),
        str(state.entryFunding),
        state.openedAt,
        state.isLong,
      ],
    );
  }

  async deletePosition(address: string, symbol: string): Promise<void> {
    await this.query("DELETE FROM positions WHERE address = $1 AND symbol = $2", [address, symbol]);
  }

  async record(activity: Activity, at: number, ref?: string): Promise<void> {
    const opt = (value: bigint | undefined) => (value === undefined ? null : str(value));
    await this.query(
      `INSERT INTO activity (address, kind, symbol, amount, pnl, fee, funding, price, ref, at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        activity.address,
        activity.kind,
        activity.symbol ?? null,
        str(activity.amount),
        opt(activity.pnl),
        opt(activity.fee),
        opt(activity.funding),
        opt(activity.price),
        ref ?? null,
        at,
      ],
    );
  }
}

/** Runs `fn` as one transaction holding the venue lock. */
export const withVenue = async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [VENUE_LOCK]);
    const result = await fn(new Tx(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

/** Reads without the lock (views, background scans). */
export const read = async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    return await fn(new Tx(client));
  } finally {
    client.release();
  }
};

export const getKv = async (key: string): Promise<string | null> => {
  const { rows } = await pool.query("SELECT value FROM kv WHERE key = $1", [key]);
  return (rows[0]?.value as string | undefined) ?? null;
};

export const setKv = async (key: string, value: string): Promise<void> => {
  await pool.query("INSERT INTO kv (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [
    key,
    value,
  ]);
};
