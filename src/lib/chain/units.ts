/**
 * Moving between the chain's integers and the screen's numbers.
 *
 * Two scales are in play: **prices are always 1e18**, whatever the pair, and
 * **amounts are in USDC's own six decimals**. The program's arithmetic is
 * immune to the difference — a pnl is a notional scaled by a ratio of two
 * prices — but the moment a number reaches a screen it has to be the right one.
 */

export const PRICE_DECIMALS = 18;

/** On Solana a market is named by its symbol (it seeds the market's address). */
export const marketId = (symbol: string): string => symbol.toUpperCase();

const format = (value: bigint, decimals: number): string => {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
};

const parse = (value: string, decimals: number): bigint => {
  const negative = value.trim().startsWith("-");
  const [whole = "0", fraction = ""] = value.trim().replace(/^-/, "").split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const magnitude = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
  return negative ? -magnitude : magnitude;
};

export const fromPrice = (value: bigint): number => Number(format(value, PRICE_DECIMALS));

export const toPrice = (value: number): bigint => parse(value.toFixed(PRICE_DECIMALS), PRICE_DECIMALS);

/** Settlement amounts. */
export const fromAmount = (value: bigint, decimals: number): number => Number(format(value, decimals));

/**
 * Parses what somebody typed. Anything past the token's own precision is
 * dropped rather than rounded up: a deposit is not the place to invent a
 * fraction of a cent the user did not have.
 */
export const toAmount = (value: string, decimals: number): bigint => {
  const cleaned = value.trim().replace(/,/g, "");
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return 0n;

  const [whole, fraction = ""] = cleaned.split(".");
  return parse(`${whole || "0"}.${fraction.slice(0, decimals) || "0"}`, decimals);
};

/** For display, at the precision money is read in. */
export const money = (value: number): string =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * The same, signed. Below half a cent there is no direction left to report,
 * so no sign is printed — `−0.00` reads as a broken number.
 */
export const signed = (value: number): string => {
  const magnitude = money(Math.abs(value));
  if (Math.abs(value) < 0.005) return magnitude;
  return `${value >= 0 ? "+" : "−"}${magnitude}`;
};
