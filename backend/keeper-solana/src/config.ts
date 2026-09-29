import {z} from "zod";

/**
 * The environment, validated once at start-up — a keeper that discovers a
 * blank PROGRAM_ID forty minutes in, halfway through a liquidation, has already
 * cost somebody money.
 */

const seconds = z.coerce.number().int().positive();

const schema = z.object({
  RPC_URL: z.string().url(),
  PROGRAM_ID: z.string().min(32),

  /**
   * The publisher's secret key: a JSON byte array (`[12,34,...]`, what
   * `solana-keygen` writes) or base58 (what Phantom exports).
   *
   * A throwaway wallet holding SOL for fees and nothing else. It posts marks
   * and liquidates; neither can move anyone's balance. Never the admin key.
   */
  KEEPER_KEY: z.string().min(40),

  /** The conventional FX source, quoted base=USD. It signs nothing. */
  FX_URL: z.string().url().default("https://api.fxratesapi.com/latest"),

  /**
   * The oldest FX quote worth posting, in seconds. A source that stopped
   * updating must not have its last rate re-posted as a fresh mark.
   */
  MAX_QUOTE_AGE: seconds.default(3 * 60 * 60),

  /** How far a rate must move before it is worth a transaction, in bps. */
  MIN_MOVE_BPS: z.coerce.number().int().nonnegative().default(2),

  PRICE_INTERVAL: seconds.default(15),
  LIQUIDATION_INTERVAL: seconds.default(20),
  SNAPSHOT_INTERVAL: seconds.default(1200),

  /** Pairs kept priced whether or not anyone holds them. */
  ALWAYS_FRESH: z
    .string()
    .default("USDJPY,USDEUR,USDGBP")
    .transform((value) =>
      value
        .split(",")
        .map((symbol) => symbol.trim().toUpperCase())
        .filter((symbol) => symbol.length > 0),
    ),

  /** Most marks per `post_marks` transaction; 40 fits the 1232-byte limit. */
  POST_CHUNK: z.coerce.number().int().min(1).max(48).default(40),

  /**
   * Priority fee, in micro-lamports per compute unit. A mark that lands late
   * is a mark that fills late; a small tip keeps the keeper's transactions
   * out of the back of the queue when the network is busy.
   */
  PRIORITY_FEE: z.coerce.number().int().nonnegative().default(20_000),

  /** Shared with the site's /api/warm. Absent: the endpoint stays closed. */
  // `node --env-file` passes a blank line as "", not as absent.
  WARM_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(16).optional()),
  WARM_TTL: z.coerce.number().int().positive().default(600),
  PORT: z.coerce.number().int().positive().default(8080),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("bad environment:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nsee .env.example, and remember: node --env-file=.env dist/index.js");
  process.exit(1);
}

export const config = parsed.data;
