import {config} from "./config.js";
import {markets} from "./shared.js";

/**
 * Conventional FX rates, for the deployments that post their own marks.
 *
 * Pyth signs its prices and the chain verifies the signature, which is the
 * arrangement this venue wants. It is also unavailable to us: Pyth's FX feeds
 * are licensed data behind an entitlement, and thirty-five of our sixty-four
 * currencies are not published there at all. This module is the other half of
 * that trade — every pair priced, by a source that signs nothing.
 *
 * **The keeper decides the mark on this path.** That is a real difference in
 * kind, not a detail of plumbing, and `PushOracle` is where the consequences
 * are written down.
 *
 * The source is quoted base=USD, which is already this venue's convention —
 * local currency per one dollar — so nothing is inverted here.
 */

interface RatesResponse {
  success?: boolean;
  timestamp?: number;
  base?: string;
  rates?: Record<string, number>;
}

export interface Mark {
  symbol: string;
  /** Local currency per one dollar, 1e18. */
  value: bigint;
}

const WAD = 10n ** 18n;

/**
 * A float rate to 1e18 without going through the float's own decimal string.
 *
 * `BigInt(Math.round(rate * 1e18))` loses the low digits of any rate above a
 * few thousand — and USDVND is around 26,000, USDIDR around 16,000. Scaling in
 * two steps keeps every digit the source actually published.
 */
const toWad = (rate: number): bigint => {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`bad rate ${rate}`);

  const scaled = Math.round(rate * 1e9);
  if (!Number.isSafeInteger(scaled)) throw new Error(`rate out of range ${rate}`);

  return BigInt(scaled) * 10n ** 9n;
};

/** How old the quote is, in seconds, by the source's own timestamp. */
let lastAge = 0;
export const quoteAge = (): number => lastAge;

export const fetchMarks = async (): Promise<Mark[]> => {
  const response = await fetch(`${config.FX_URL}?base=USD`, {headers: {accept: "application/json"}});
  if (!response.ok) throw new Error(`fx ${response.status} ${response.statusText}`);

  const body = (await response.json()) as RatesResponse;
  const rates = body.rates ?? {};

  if (Object.keys(rates).length === 0) {
    throw new Error("fx source returned no rates — not posting an empty round");
  }

  lastAge = body.timestamp ? Math.max(0, Math.floor(Date.now() / 1000) - body.timestamp) : 0;

  const marks: Mark[] = [];
  const missing: string[] = [];

  for (const market of markets) {
    // Every symbol is USD-first: "USDJPY" is JPY per one USD.
    const currency = market.symbol.slice(3);
    const rate = rates[currency];

    if (rate === undefined) {
      missing.push(market.symbol);
      continue;
    }

    try {
      marks.push({symbol: market.symbol, value: toWad(rate)});
    } catch {
      missing.push(market.symbol);
    }
  }

  if (missing.length > 0) {
    console.warn(`[fx] no rate for ${missing.length}: ${missing.join(" ")}`);
  }

  return marks;
};
