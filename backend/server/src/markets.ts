import { readFileSync } from "node:fs";

import { config } from "./config.js";
import { pool } from "./db.js";

/**
 * The 64 pairs, from the one table the site, the program and the keeper
 * already share (`backend/shared/markets.json`). Their order fixes each
 * market's index. Listing is idempotent: missing markets are added, existing
 * ones are left exactly as they are (an admin may have paused or re-tuned
 * them since).
 */

export interface MarketRow {
  symbol: string;
  maxLeverage: number;
  /** Whole USDC. */
  skewScale: number;
  maxOpenInterest: number;
  minMargin: number;
}

// dist/markets.js and src/markets.ts both sit two levels below backend/.
const file = new URL("../../shared/markets.json", import.meta.url);
export const markets = JSON.parse(readFileSync(file, "utf8")) as MarketRow[];

const usdc = (whole: number): string => (BigInt(Math.round(whole * 1e6))).toString();

export const listMarkets = async (): Promise<number> => {
  const at = Math.floor(Date.now() / 1000);
  let added = 0;
  for (const [index, row] of markets.entries()) {
    const result = await pool.query(
      `INSERT INTO markets (symbol, idx, max_leverage, skew_scale, max_oi, min_margin, last_accrual)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (symbol) DO NOTHING`,
      [row.symbol, index, row.maxLeverage, usdc(row.skewScale), usdc(row.maxOpenInterest), usdc(row.minMargin), at],
    );
    added += result.rowCount ?? 0;
  }
  if (config.MIN_MARGIN !== undefined) {
    await pool.query("UPDATE markets SET min_margin = $1", [config.MIN_MARGIN.toString()]);
    console.log(`[markets] minimum margin set to ${Number(config.MIN_MARGIN) / 1e6} USDC on every market`);
  }
  return added;
};
