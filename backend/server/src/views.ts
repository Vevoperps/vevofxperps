import { PublicKey } from "@solana/web3.js";

import { config } from "./config.js";
import { positionFromRow, read } from "./db.js";
import { positionView } from "./engine.js";
import { fundingRate } from "./math.js";
import { now } from "./ops.js";
import { usdcBalance } from "./solana.js";

/**
 * What the site reads, in exactly the shapes its screens were written
 * against (`src/lib/chain/read.ts`): plain numbers, no fixed point.
 */

/** A fixed-point bigint to a JS number without going through a lossy float first. */
const toNumber = (value: bigint, decimals: number): number => {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  const text = `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
  return (negative ? -1 : 1) * Number(text);
};

const amount = (value: bigint): number => toNumber(value, 6);
const price = (value: bigint): number => toNumber(value, 18);

export const marketsView = async () => {
  const at = now();
  const markets = await read((tx) => tx.markets());
  return markets.map((market) => {
    const priced = market.mark.updatedAt !== 0 && at <= market.mark.updatedAt + config.MARK_MAX_AGE;
    return {
      symbol: market.symbol,
      listed: true,
      paused: market.paused,
      priced,
      mark: priced ? price(market.mark.price) : 0,
      fundingRate: price(fundingRate(market.longOi, market.shortOi, market.skewScale)),
      longOpenInterest: amount(market.longOi),
      shortOpenInterest: amount(market.shortOi),
      maxLeverage: market.maxLeverage,
      referencePrice: price(market.referencePrice),
      referenceAt: market.referenceAt,
    };
  });
};

export const positionsView = async (address: string) => {
  const at = now();
  const { rows, markets } = await read(async (tx) => {
    const [p, m] = await Promise.all([
      tx.query("SELECT * FROM positions WHERE address = $1 ORDER BY opened_at", [address]),
      tx.markets(),
    ]);
    return { rows: p.rows, markets: new Map(m.map((row) => [row.symbol, row])) };
  });

  return rows.flatMap((row) => {
    const position = positionFromRow(row as Record<string, unknown>);
    const market = markets.get(position.symbol);
    if (!market) return [];
    const fresh = market.mark.updatedAt !== 0 && at <= market.mark.updatedAt + config.MARK_MAX_AGE;
    // An unpriced market still has a true position; shown at entry, no live result.
    const mark = fresh ? market.mark.price : position.entryPrice;
    const view = positionView(position, market, mark, at);
    return [
      {
        symbol: position.symbol,
        isLong: position.isLong,
        margin: amount(position.margin),
        notional: amount(position.notional),
        payoutCap: amount(position.payoutCap),
        entryPrice: price(position.entryPrice),
        mark: price(mark),
        pnl: amount(view.pnl),
        accruedFunding: amount(view.funding),
        equity: amount(view.equity),
        maintenance: amount(view.maintenance),
        liquidationPrice: price(view.liquidationPrice),
        liquidatable: view.liquidatable,
        openedAt: position.openedAt,
      },
    ];
  });
};

/** Per-address cache for the wallet's USDC: the portfolio polls. */
const walletCache = new Map<string, { at: number; value: bigint }>();

export const accountView = async (address: string) => {
  const trader = await read((tx) => tx.trader(address));
  const cached = walletCache.get(address);
  let wallet: bigint;
  if (cached && Date.now() - cached.at < 15_000) {
    wallet = cached.value;
  } else {
    wallet = await usdcBalance(new PublicKey(address));
    walletCache.set(address, { at: Date.now(), value: wallet });
  }
  return { free: amount(trader.balance), wallet: amount(wallet), shares: trader.shares.toString() };
};

export const poolView = async (address?: string) => {
  const { pool, mine } = await read(async (tx) => ({
    pool: await tx.pool(),
    mine: address ? (await tx.trader(address)).shares : 0n,
  }));
  const assets = amount(pool.assets);
  const reserved = amount(pool.reserved);
  const ownership = pool.shares === 0n ? 0 : Number((mine * 10n ** 18n) / pool.shares) / 1e18;
  return {
    assets,
    reserved,
    free: Math.max(0, assets - reserved),
    utilisation: assets === 0 ? 0 : Math.min(1, reserved / assets),
    shares: mine.toString(),
    value: assets * ownership,
    ownership,
  };
};

type Kind = "closed" | "reduced" | "liquidated" | "deposit" | "withdraw";
const SHOWN = new Set<string>(["closed", "reduced", "liquidated", "deposit", "withdraw"]);

export const activityView = async (address: string, limit = 40) => {
  const { rows } = await read((tx) =>
    tx.query("SELECT * FROM activity WHERE address = $1 ORDER BY id DESC LIMIT $2", [address, limit * 2]),
  );
  const opt = (value: unknown) => (value === null || value === undefined ? undefined : amount(BigInt(value as string)));
  return rows
    .filter((row) => SHOWN.has(row.kind as string))
    .slice(0, limit)
    .map((row) => ({
      kind: row.kind as Kind,
      ...(row.symbol ? { symbol: row.symbol as string } : {}),
      amount: amount(BigInt(row.amount as string)),
      ...(row.pnl !== null ? { pnl: opt(row.pnl) } : {}),
      ...(row.fee !== null ? { fee: opt(row.fee) } : {}),
      ...(row.funding !== null ? { funding: opt(row.funding) } : {}),
      ...(row.price !== null ? { price: price(BigInt(row.price as string)) } : {}),
      /** The ledger's own sequence; the screens only sort by it. */
      block: Number(row.id),
      at: Number(row.at),
      /** A deposit's Solana signature, or the ledger reference. */
      hash: (row.ref as string | null) ?? `vevo:${row.id as string}`,
    }));
};

export const withdrawalsView = async (address: string) => {
  const { rows } = await read((tx) =>
    tx.query("SELECT id, amount, status, signature, created_at FROM withdrawals WHERE address = $1 ORDER BY id DESC LIMIT 20", [address]),
  );
  return rows.map((row) => ({
    id: String(row.id),
    amount: amount(BigInt(row.amount as string)),
    status: row.status as string,
    signature: (row.signature as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
};
