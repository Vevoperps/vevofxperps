import { venue } from "./venue";

/**
 * Reading the venue. No wallet, no signing, no browser required.
 *
 * Runs on the site's server behind `/api/*` and asks the vevo server, so one
 * request serves every tab. The shapes are the ones the screens were written
 * against: plain numbers, fixed point already resolved.
 */

/** The batch view the rates table and the pair pages read. */
export interface ChainMarket {
  symbol: string;
  listed: boolean;
  paused: boolean;
  /** False when the mark is missing or stale right now. */
  priced: boolean;
  mark: number;
  /** Fractional per 8h. Positive means longs pay. */
  fundingRate: number;
  longOpenInterest: number;
  shortOpenInterest: number;
  maxLeverage: number;
  /** The mark one window ago, and when it was taken. Zero when never. */
  referencePrice: number;
  referenceAt: number;
}

/** One open position, priced now. */
export interface ChainPosition {
  symbol: string;
  isLong: boolean;
  margin: number;
  notional: number;
  payoutCap: number;
  entryPrice: number;
  mark: number;
  pnl: number;
  accruedFunding: number;
  equity: number;
  maintenance: number;
  liquidationPrice: number;
  liquidatable: boolean;
  openedAt: number;
}

/** The pool that takes the other side of every trade. */
export interface Pool {
  assets: number;
  reserved: number;
  free: number;
  utilisation: number;
  shares: bigint;
  value: number;
  ownership: number;
}

export interface Account {
  /** Free balance inside the venue, withdrawable. */
  free: number;
  /** USDC still in the wallet. */
  wallet: number;
  /** Kept for the screens written against the EVM venue; always the maximum. */
  allowance: bigint;
}

/** One thing this account did, from the venue's ledger. */
export interface Activity {
  kind: "closed" | "reduced" | "liquidated" | "deposit" | "withdraw";
  symbol?: string;
  amount: number;
  pnl?: number;
  fee?: number;
  funding?: number;
  price?: number;
  /** The ledger's own sequence number. */
  block: number;
  at?: number;
  /** A Solana transaction signature for deposits; a ledger reference otherwise. */
  hash: string;
}

export interface Withdrawal {
  id: string;
  amount: number;
  status: "queued" | "review" | "sending" | "sent" | "rejected";
  signature: string | null;
  createdAt: string;
}

/** Thrown when something asks the venue a question with no server configured. */
export class VenueNotLive extends Error {
  constructor() {
    super("the venue has no server configured");
    this.name = "VenueNotLive";
  }
}

/** The server's URL as seen from the site's server (a private URL may be set). */
const base = (): string => {
  const url = process.env.VEVO_API_URL?.trim() || venue.apiUrl;
  if (!url) throw new VenueNotLive();
  return url.replace(/\/+$/, "");
};

const get = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${base()}${path}`, { cache: "no-store", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`venue ${response.status} on ${path}`);
  const body = (await response.json()) as { data: T };
  return body.data;
};

let meta: Promise<{ decimals: number; symbol: string }> | null = null;

export const settlementMeta = (): Promise<{ decimals: number; symbol: string }> => {
  meta ??= get<{ decimals: number; symbol: string }>("/v1/venue")
    .then(({ decimals, symbol }) => ({ decimals, symbol }))
    .catch((error: unknown) => {
      meta = null;
      throw error;
    });
  return meta;
};

/** Every market asked for, priced. */
export const readChainMarkets = async (symbols: string[]): Promise<ChainMarket[]> => {
  const all = await get<ChainMarket[]>("/v1/markets");
  const bySymbol = new Map(all.map((market) => [market.symbol, market]));
  return symbols.map(
    (symbol) =>
      bySymbol.get(symbol) ?? {
        symbol,
        listed: false,
        paused: false,
        priced: false,
        mark: 0,
        fundingRate: 0,
        longOpenInterest: 0,
        shortOpenInterest: 0,
        maxLeverage: 0,
        referencePrice: 0,
        referenceAt: 0,
      },
  );
};

interface AccountPayload {
  free: number;
  wallet: number;
  shares: string;
  positions: ChainPosition[];
  activity: Activity[];
  withdrawals: Withdrawal[];
}

/** One fetch serves the balance, the positions and the history of a request. */
const accountCache = new Map<string, { at: number; value: Promise<AccountPayload> }>();

const loadAccount = (address: string): Promise<AccountPayload> => {
  const cached = accountCache.get(address);
  if (cached && Date.now() - cached.at < 1_500) return cached.value;
  const value = get<AccountPayload>(`/v1/account/${address}`);
  accountCache.set(address, { at: Date.now(), value });
  value.catch(() => accountCache.delete(address));
  return value;
};

export const readChainPositions = async (address: string, symbols: string[]): Promise<ChainPosition[]> => {
  const wanted = new Set(symbols);
  return (await loadAccount(address)).positions.filter((position) => wanted.has(position.symbol));
};

export const readAccount = async (address: string): Promise<Account> => {
  const account = await loadAccount(address);
  return { free: account.free, wallet: account.wallet, allowance: (1n << 64n) - 1n };
};

export const readActivity = async (address: string, symbols: string[], limit = 40): Promise<Activity[]> => {
  void symbols;
  return (await loadAccount(address)).activity.slice(0, limit);
};

export const readWithdrawals = async (address: string): Promise<Withdrawal[]> => (await loadAccount(address)).withdrawals;

/** The pool, and one account's part of it. */
export const readPool = async (address?: string): Promise<Pool> => {
  const pool = await get<Omit<Pool, "shares"> & { shares: string }>(address ? `/v1/pool?address=${address}` : "/v1/pool");
  return { ...pool, shares: BigInt(pool.shares) };
};
