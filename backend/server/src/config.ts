import { z } from "zod";

/**
 * The environment, validated once at start-up. A server that discovers a
 * missing key halfway through a withdrawal has already cost somebody money.
 */

const seconds = z.coerce.number().int().positive();
const blankIsUnset = (value: unknown) => (value === "" ? undefined : value);
const flag = z.preprocess(blankIsUnset, z.enum(["true", "false", "1", "0"]).optional()).transform((v) => v === "true" || v === "1");

/** Whole USDC → base units. */
const usdc = z.coerce.number().nonnegative().transform((value) => BigInt(Math.round(value * 1e6)));

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),

  // --- storage ---------------------------------------------------------------
  DATABASE_URL: z.string().min(1),
  /** Railway's internal Postgres URL needs no TLS; a public one does. */
  DATABASE_SSL: flag,

  // --- chain -----------------------------------------------------------------
  /** A provider URL (Helius, QuickNode...). The public endpoint rate-limits. */
  RPC_URL: z.string().url(),
  CLUSTER: z.enum(["mainnet", "devnet"]).default("mainnet"),
  USDC_MINT: z.string().min(32).default("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  /**
   * The hot wallet's secret key: JSON byte array or base58. It receives every
   * deposit and signs every withdrawal. Only what the limits below allow can
   * leave it without an admin approving.
   */
  TREASURY_KEY: z.string().min(40),

  // --- withdrawals -----------------------------------------------------------
  /** One withdrawal above this (whole USDC) waits for an admin. */
  WITHDRAW_MAX_SINGLE: usdc.default(2_000),
  /** All automatic withdrawals in the last 24h together (whole USDC). */
  WITHDRAW_MAX_DAILY: usdc.default(10_000),
  /** Smallest deposit or withdrawal accepted (whole USDC). */
  MIN_TRANSFER: usdc.default(1),
  WITHDRAW_INTERVAL: seconds.default(10),
  DEPOSIT_SCAN_INTERVAL: seconds.default(20),

  // --- access ----------------------------------------------------------------
  /** Signs session tokens. 32+ random characters. */
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL: seconds.default(7 * 24 * 3600),
  /** Header `x-admin-token` for the admin endpoints. 32+ random characters. */
  ADMIN_TOKEN: z.string().min(32),
  /** Comma-separated origins allowed to call the API from a browser. */
  ALLOWED_ORIGINS: z
    .string()
    .default("https://vevoperps.com,https://www.vevoperps.com,http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),
  /** The domain named in the sign-in message. */
  SIGNIN_DOMAIN: z.string().default("vevoperps.com"),

  // --- prices ----------------------------------------------------------------
  FX_URL: z.string().url().default("https://api.fxratesapi.com/latest"),
  PRICE_INTERVAL: seconds.default(15),
  /** Seconds a mark stays usable for trading. */
  MARK_MAX_AGE: seconds.default(120),
  /** The most one update may move a live mark, in bps. Larger moves are walked. */
  MAX_DEVIATION_BPS: z.coerce.number().int().nonnegative().default(500),
  /** The oldest FX quote worth using, by the source's own timestamp, in seconds. */
  MAX_QUOTE_AGE: seconds.default(3 * 3600),
  LIQUIDATION_INTERVAL: seconds.default(5),

  /**
   * Minimum margin for every market, in whole USDC, applied at start-up.
   * Blank keeps each market's own (10 USDC). A small pool needs a small
   * minimum: every position reserves 9x its margin from the pool.
   */
  MIN_MARGIN: z.preprocess(blankIsUnset, usdc.optional()),

  /**
   * Who receives the liquidation reward. Blank: it stays in the pool, for the
   * liquidity providers. Otherwise a wallet address credited in the ledger.
   */
  HOUSE_ADDRESS: z.preprocess(blankIsUnset, z.string().min(32).optional()),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("bad environment:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  console.error("\nsee .env.example");
  process.exit(1);
}

export const config = parsed.data;
