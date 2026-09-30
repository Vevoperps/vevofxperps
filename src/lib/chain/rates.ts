import { getServerEnv } from "@/env";
import { PAIRS } from "@/lib/markets";

/**
 * Live rates for every pair, from the same feed the oracle publishes from.
 *
 * **Why the site needs its own read at all.** The engine keeps a mark for a
 * market only while somebody is trading it — keeping sixty-four of them warm
 * around the clock costs more in gas than the venue makes. So a pair nobody
 * has touched has no price on chain, and the table used to fall back to the
 * static `base` column: a number from a config file, presented as a rate. That
 * is the one thing worse than showing nothing.
 *
 * The rate here is real and it moves. It is not the mark: the mark is what a
 * position opens and closes at, it lives on chain, and the two are labelled
 * differently everywhere they meet. But it comes from the same source, so the
 * number a visitor browses and the number they eventually fill at are the same
 * quote seen a minute apart rather than two different opinions.
 *
 * **It never throws.** A feed that is down returns an empty map and the caller
 * falls back to what the chain knows. A rates table is not worth a 500.
 *
 * Server side only: it reads `getServerEnv()`, which the client bundle must
 * never evaluate, and one visitor's browser has no business making sixty-four
 * visitors' worth of requests to somebody else's API.
 */

interface RatesResponse {
  timestamp?: number;
  rates?: Record<string, number>;
}

export interface Rates {
  /** Local currency per one dollar, by pair symbol. */
  by: Map<string, number>;
  /** When the source says it quoted, in seconds. Zero when unknown. */
  at: number;
}

const EMPTY: Rates = { by: new Map(), at: 0 };

/**
 * How long one fetch serves.
 *
 * The markets route is polled every fifteen seconds by every open tab, and the
 * rates behind it move on the minute, not the tick. Sixty seconds keeps the
 * table alive without turning a hundred visitors into a hundred requests to
 * somebody else's API.
 */
const TTL = 60_000;

/** Two seconds: past that the page is better off stale than waiting. */
const TIMEOUT = 2_000;

let cached: Rates = EMPTY;
let cachedAt = 0;
let inFlight: Promise<Rates> | null = null;

const load = async (): Promise<Rates> => {
  const { FX_URL } = getServerEnv();

  const response = await fetch(`${FX_URL}?base=USD`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`fx ${response.status}`);

  const body = (await response.json()) as RatesResponse;
  const rates = body.rates ?? {};

  const by = new Map<string, number>();
  for (const pair of PAIRS) {
    // Every symbol is USD-first: USDJPY is yen per one dollar, so the currency
    // to look up is the back half. The same convention the keeper uses.
    const rate = rates[pair.symbol.slice(3)];
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      by.set(pair.symbol, rate);
    }
  }

  if (by.size === 0) throw new Error("fx returned nothing usable");

  return { by, at: body.timestamp ?? Math.floor(Date.now() / 1000) };
};

export const readRates = async (): Promise<Rates> => {
  const now = Date.now();
  if (now - cachedAt < TTL) return cached;

  // One request per instance at a time. Without this, a burst of polls past
  // the TTL all miss together and each opens its own connection.
  inFlight ??= load()
    .then((fresh) => {
      cached = fresh;
      cachedAt = Date.now();
      return fresh;
    })
    .catch(() => {
      // Keep whatever was last good rather than blanking the table. Only the
      // timestamp ages, and that is what the caller should judge it by.
      cachedAt = Date.now();
      return cached;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};
