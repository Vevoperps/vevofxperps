import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js";

import {
  associatedTokenAddress,
  decodeConfig,
  decodeEvents,
  decodeMarket,
  decodeMarks,
  decodePosition,
  decodeTrader,
  fundingRate,
  pdas,
  positionView,
  type MarkSlot,
  type MarketAccount,
} from "./solana/vevo-client";
import { fromAmount, fromPrice } from "./units";
import { venue } from "./venue";

/**
 * Reading the venue. No wallet, no signing, no browser required.
 *
 * Runs on the server behind `/api/*`, so the RPC stays off the public page and
 * one request serves every tab. Every function returns plain numbers:
 * fixed-point belongs in the program, and a component that has to remember
 * whether a number is 1e18 or 1e6 will eventually forget.
 *
 * **No program-wide scans.** Every market and every position lives at an
 * address derived from its symbol (and owner), so the addresses are computed
 * here and fetched in one `getMultipleAccounts` call — which every RPC
 * answers, unlike the `getProgramAccounts` scans public endpoints refuse.
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
  /**
   * Kept for the screens written against the EVM venue, where the token had
   * to be approved first. Solana has no approvals: the owner signs each
   * transfer, so this is always the maximum.
   */
  allowance: bigint;
}

/** Thrown when something asks the chain a question on an unconfigured venue. */
export class VenueNotLive extends Error {
  constructor() {
    super("the venue has no program configured");
    this.name = "VenueNotLive";
  }
}

let connection: Connection | null = null;

/**
 * The server's connection. `SOLANA_RPC_URL` (server only) wins, so a keyed
 * provider URL never has to be public; the public one is the fallback.
 */
export const reader = (): Connection => {
  if (!venue.live || !venue.rpcUrl) throw new VenueNotLive();
  const url = process.env.SOLANA_RPC_URL?.trim() || venue.rpcUrl;
  connection ??= new Connection(url, "confirmed");
  return connection;
};

const programId = (): PublicKey => new PublicKey(venue.engine as string);
const mint = (): PublicKey => new PublicKey(venue.settlement as string);
const at = () => pdas(programId());

const now = (): number => Math.floor(Date.now() / 1000);

/** USDC's decimals, read off the mint once; it cannot change. */
let meta: Promise<{ decimals: number; symbol: string }> | null = null;

export const settlementMeta = (): Promise<{ decimals: number; symbol: string }> => {
  meta ??= (async () => {
    const info = await reader().getAccountInfo(mint());
    // SPL mint layout: decimals is the byte at offset 44.
    const decimals = info?.data[44] ?? 6;
    return { decimals, symbol: "USDC" };
  })().catch((error: unknown) => {
    // A failed read must not be cached: the next request asks again.
    meta = null;
    throw error;
  });
  return meta;
};

/** Config, marks and the listed markets, in two round trips. */
const loadVenue = async (symbols: string[]) => {
  const addresses = at();
  const marketKeys = symbols.map((symbol) => addresses.market(symbol));

  const [head, markets] = await Promise.all([
    reader().getMultipleAccountsInfo([addresses.config, addresses.marks]),
    reader().getMultipleAccountsInfo(marketKeys),
  ]);

  const [configInfo, marksInfo] = head;
  if (!configInfo || !marksInfo) throw new VenueNotLive();

  return {
    config: decodeConfig(configInfo.data),
    marks: decodeMarks(marksInfo.data),
    markets: markets.map((info, index) => ({
      symbol: symbols[index] as string,
      address: marketKeys[index] as PublicKey,
      account: info ? decodeMarket(info.data) : null,
    })),
  };
};

const freshMark = (slot: MarkSlot | undefined, maxAge: number): bigint | null =>
  slot && slot.updatedAt !== 0 && now() <= slot.updatedAt + maxAge ? slot.price : null;

/** Every market asked for, priced. */
export const readChainMarkets = async (symbols: string[]): Promise<ChainMarket[]> => {
  const { decimals } = await settlementMeta();
  const { config, marks, markets } = await loadVenue(symbols);

  return markets.map(({ symbol, account }) => {
    if (!account) {
      return {
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
      };
    }

    const mark = freshMark(marks[account.index], config.maxAge);

    return {
      symbol,
      listed: true,
      paused: account.paused,
      priced: mark !== null,
      mark: mark === null ? 0 : fromPrice(mark),
      fundingRate: fromPrice(fundingRate(account.longOpenInterest, account.shortOpenInterest, account.skewScale)),
      longOpenInterest: fromAmount(account.longOpenInterest, decimals),
      shortOpenInterest: fromAmount(account.shortOpenInterest, decimals),
      maxLeverage: account.maxLeverage,
      referencePrice: fromPrice(account.referencePrice),
      referenceAt: account.referenceAt,
    };
  });
};

/** Only the markets this account actually has something open on. */
export const readChainPositions = async (address: string, symbols: string[]): Promise<ChainPosition[]> => {
  const { decimals } = await settlementMeta();
  const owner = new PublicKey(address);
  const { config, marks, markets } = await loadVenue(symbols);

  const listed = markets.filter(
    (row): row is typeof row & { account: MarketAccount } => row.account !== null,
  );
  const positionKeys = listed.map(({ address: market }) => at().position(market, owner));
  const infos = await reader().getMultipleAccountsInfo(positionKeys);

  const out: ChainPosition[] = [];

  infos.forEach((info: AccountInfo<Buffer> | null, index) => {
    const row = listed[index];
    if (!info || !row) return;

    const position = decodePosition(info.data);
    const slot = marks[row.account.index];
    // An unpriced market still has a true position; it is shown at its entry
    // with no live result rather than hidden.
    const mark = freshMark(slot, config.maxAge) ?? position.entryPrice;
    const view = positionView(position, row.account, mark, now());

    out.push({
      symbol: row.symbol,
      isLong: position.isLong,
      margin: fromAmount(position.margin, decimals),
      notional: fromAmount(position.notional, decimals),
      payoutCap: fromAmount(position.payoutCap, decimals),
      entryPrice: fromPrice(position.entryPrice),
      mark: fromPrice(mark),
      pnl: fromAmount(view.pnl, decimals),
      accruedFunding: fromAmount(view.funding, decimals),
      equity: fromAmount(view.equity, decimals),
      maintenance: fromAmount(view.maintenance, decimals),
      liquidationPrice: fromPrice(view.liquidationPrice),
      liquidatable: view.liquidatable,
      openedAt: position.openedAt,
    });
  });

  return out;
};

/** SPL token account layout: the amount is a u64 at offset 64. */
const tokenAmount = (info: AccountInfo<Buffer> | null): bigint =>
  info && info.data.length >= 72 ? info.data.readBigUInt64LE(64) : 0n;

export const readAccount = async (address: string): Promise<Account> => {
  const { decimals } = await settlementMeta();
  const owner = new PublicKey(address);

  const [traderInfo, walletInfo] = await reader().getMultipleAccountsInfo([
    at().trader(owner),
    associatedTokenAddress(mint(), owner),
  ]);

  const free = traderInfo ? decodeTrader(traderInfo.data).balance : 0n;

  return {
    free: fromAmount(free, decimals),
    wallet: fromAmount(tokenAmount(walletInfo ?? null), decimals),
    allowance: (1n << 64n) - 1n,
  };
};

/** The pool, and one account's part of it. */
export const readPool = async (address?: string): Promise<Pool> => {
  const { decimals } = await settlementMeta();
  const keys = [at().config];
  if (address) keys.push(at().trader(new PublicKey(address)));

  const [configInfo, traderInfo] = await reader().getMultipleAccountsInfo(keys);
  if (!configInfo) throw new VenueNotLive();

  const config = decodeConfig(configInfo.data);
  const mine = traderInfo ? decodeTrader(traderInfo.data).shares : 0n;

  const assets = fromAmount(config.poolAssets, decimals);
  const reserved = fromAmount(config.poolReserved, decimals);
  const ownership = config.poolShares === 0n ? 0 : Number((mine * 10n ** 18n) / config.poolShares) / 1e18;

  return {
    assets,
    reserved,
    free: Math.max(0, assets - reserved),
    utilisation: assets === 0 ? 0 : Math.min(1, reserved / assets),
    shares: mine,
    value: assets * ownership,
    ownership,
  };
};

// ------------------------------------------------------------------ activity

/** One thing this account did, as the program recorded it. */
export interface Activity {
  kind: "closed" | "reduced" | "liquidated" | "deposit" | "withdraw";
  symbol?: string;
  amount: number;
  pnl?: number;
  fee?: number;
  funding?: number;
  price?: number;
  /** The slot, on Solana. */
  block: number;
  at?: number;
  /** The transaction signature. */
  hash: string;
}

/**
 * What one account has done, newest first.
 *
 * Read from the program's own events in the account's recent transactions,
 * rather than from a database: the events are the record. The wallet is the
 * address queried because it appears in every one of its own transactions and
 * in a liquidation of its position (it receives the account's rent). An RPC
 * that refuses gives an empty list, not an error.
 */
/** Per-address cache: the portfolio polls, the history changes per trade. */
const activityCache = new Map<string, { at: number; rows: Activity[] }>();
const ACTIVITY_TTL_MS = 15_000;

export const readActivity = async (address: string, symbols: string[], limit = 40): Promise<Activity[]> => {
  const cached = activityCache.get(address);
  if (cached && Date.now() - cached.at < ACTIVITY_TTL_MS) return cached.rows;

  const rows = await loadActivity(address, symbols, limit);
  activityCache.set(address, { at: Date.now(), rows });
  return rows;
};

const loadActivity = async (address: string, symbols: string[], limit: number): Promise<Activity[]> => {
  const { decimals } = await settlementMeta();
  const owner = new PublicKey(address);
  const program = programId();

  const bySymbol = new Map(symbols.map((symbol) => [at().market(symbol).toBase58(), symbol]));
  const amount = (value: bigint) => fromAmount(value, decimals);

  try {
    // The trader account is touched by every deposit, withdrawal and trade of
    // this owner and by nothing else, so its history is exactly the venue's.
    // Liquidations do not touch it; they touch the owner wallet (which gets
    // the position's rent back), so a short page of that is added.
    const [mine, wallet] = await Promise.all([
      reader().getSignaturesForAddress(at().trader(owner), { limit }),
      reader().getSignaturesForAddress(owner, { limit: 25 }),
    ]);
    const seen = new Set<string>();
    const ok = [...mine, ...wallet].filter((row) => {
      if (row.err !== null || seen.has(row.signature)) return false;
      seen.add(row.signature);
      return true;
    });
    if (ok.length === 0) return [];

    // One at a time in small groups rather than one large batch: some keyed
    // RPC plans refuse JSON-RPC batches outright.
    const transactions: Awaited<ReturnType<Connection["getTransaction"]>>[] = [];
    for (let i = 0; i < ok.length; i += 8) {
      const group = ok.slice(i, i + 8);
      transactions.push(
        ...(await Promise.all(
          group.map((row) =>
            reader()
              .getTransaction(row.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })
              .catch(() => null),
          ),
        )),
      );
    }

    const rows: Activity[] = [];

    transactions.forEach((tx, index) => {
      const logs = tx?.meta?.logMessages;
      const signature = ok[index]?.signature;
      if (!tx || !logs || !signature) return;
      if (!logs.some((line) => line.includes(program.toBase58()))) return;

      const base = { block: tx.slot, hash: signature, ...(tx.blockTime ? { at: tx.blockTime } : {}) };

      for (const event of decodeEvents(logs, program)) {
        if (event.name === "Deposited" && event.owner.equals(owner)) {
          rows.push({ kind: "deposit", amount: amount(event.amount), ...base });
        } else if (event.name === "Withdrawn" && event.owner.equals(owner)) {
          rows.push({ kind: "withdraw", amount: amount(event.amount), ...base });
        } else if (event.name === "PositionClosed" && event.owner.equals(owner)) {
          rows.push({
            kind: "closed",
            symbol: bySymbol.get(event.market.toBase58()),
            price: fromPrice(event.exitPrice),
            amount: amount(event.payout),
            pnl: amount(event.pnl),
            funding: amount(event.funding),
            fee: amount(event.fee),
            ...base,
          });
        } else if (event.name === "PositionReduced" && event.owner.equals(owner)) {
          rows.push({
            kind: "reduced",
            symbol: bySymbol.get(event.market.toBase58()),
            price: fromPrice(event.exitPrice),
            amount: amount(event.payout),
            pnl: amount(event.pnl),
            funding: amount(event.funding),
            fee: amount(event.fee),
            ...base,
          });
        } else if (event.name === "PositionLiquidated" && event.owner.equals(owner)) {
          rows.push({
            kind: "liquidated",
            symbol: bySymbol.get(event.market.toBase58()),
            price: fromPrice(event.exitPrice),
            amount: 0,
            ...base,
          });
        }
      }
    });

    rows.sort((a, b) => b.block - a.block);
    return rows.slice(0, limit);
  } catch {
    return [];
  }
};
