import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

import { issueNonce, verifySignIn, verifyToken } from "./auth.js";
import { config } from "./config.js";
import { pool as db, read } from "./db.js";
import { VevoError } from "./engine.js";
import * as ops from "./ops.js";
import { buildDeposit, connection, incomingTransfers, isAddress, treasury, treasuryToken, usdcBalance } from "./solana.js";
import { accountView, activityView, marketsView, poolView, positionsView, withdrawalsView } from "./views.js";
import { quoteStatus } from "./workers.js";

/**
 * The API. Reads are public (an address's balance on this venue is shown to
 * whoever asks for it, as it would be on chain); every write needs the
 * session token from a wallet sign-in and acts only on that wallet.
 */

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

type Handler = (ctx: {
  req: IncomingMessage;
  url: URL;
  params: Record<string, string>;
  body: unknown;
  address: string | null;
}) => Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  auth: "none" | "user" | "admin";
}

const routes: Route[] = [];

const route = (method: string, path: string, auth: Route["auth"], handler: Handler): void => {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      keys.push(key);
      return "([^/]+)";
    })}$`,
  );
  routes.push({ method, pattern, keys, handler, auth });
};

// ------------------------------------------------------------------- helpers

const baseUnits = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "expected an integer amount in base units" });
      return z.NEVER;
    }
    return BigInt(text);
  });

const symbol = z.string().regex(/^[A-Z]{6,8}$/);
const address = z.string().refine(isAddress, "expected a Solana address");

const parse = <T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, "bad_request", result.error.issues.map((issue) => issue.message).join("; "));
  return result.data;
};

const readBody = async (req: IncomingMessage): Promise<unknown> => {
  if (req.method === "GET" || req.method === "OPTIONS") return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new HttpError(413, "too_large");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "bad_json");
  }
};

/** A small per-IP budget for writes: 60 per minute. */
const buckets = new Map<string, { tokens: number; at: number }>();
const allow = (ip: string): boolean => {
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { tokens: 60, at: now };
  bucket.tokens = Math.min(60, bucket.tokens + ((now - bucket.at) / 60_000) * 60);
  bucket.at = now;
  if (bucket.tokens < 1) {
    buckets.set(ip, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(ip, bucket);
  return true;
};

const clientIp = (req: IncomingMessage): string =>
  (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";

const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const bigintJson = (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);

// -------------------------------------------------------------------- public

route("GET", "/health", "none", async () => ({ ok: true }));

route("GET", "/v1/venue", "none", async () => ({
  live: true,
  cluster: config.CLUSTER,
  mint: config.USDC_MINT,
  decimals: 6,
  symbol: "USDC",
  treasury: treasury.publicKey.toBase58(),
  treasuryToken: treasuryToken.toBase58(),
  markMaxAge: config.MARK_MAX_AGE,
  minTransfer: config.MIN_TRANSFER.toString(),
  withdrawMaxSingle: config.WITHDRAW_MAX_SINGLE.toString(),
  quote: quoteStatus(),
}));

route("GET", "/v1/markets", "none", async () => marketsView());

route("GET", "/v1/pool", "none", async ({ url }) => {
  const raw = url.searchParams.get("address");
  return poolView(raw ? parse(address, raw) : undefined);
});

route("GET", "/v1/account/:address", "none", async ({ params }) => {
  const who = parse(address, params.address);
  const [account, positions, activity, withdrawals] = await Promise.all([
    accountView(who),
    positionsView(who),
    activityView(who),
    withdrawalsView(who),
  ]);
  return { ...account, positions, activity, withdrawals };
});

// ---------------------------------------------------------------------- auth

route("POST", "/v1/auth/nonce", "none", async ({ body }) => {
  const { address: who } = parse(z.object({ address }), body);
  return { message: await issueNonce(who) };
});

route("POST", "/v1/auth/verify", "none", async ({ body }) => {
  const input = parse(z.object({ address, message: z.string().max(1000), signature: z.string().max(200) }), body);
  const token = await verifySignIn(input.address, input.message, input.signature);
  if (!token) throw new HttpError(401, "bad_signature", "the signature did not verify");
  return { token };
});

// ------------------------------------------------------------ money in / out

route("POST", "/v1/deposit/build", "user", async ({ body, address: who }) => {
  const { amount } = parse(z.object({ amount: baseUnits }), body);
  if (amount < config.MIN_TRANSFER) throw new HttpError(400, "BelowMinimum");
  const owner = new PublicKey(who as string);
  if ((await usdcBalance(owner)) < amount) throw new VevoError("InsufficientBalance", "not enough USDC in the wallet");
  return { transaction: await buildDeposit(owner, amount) };
});

/**
 * For wallets that sign but do not send: the signed deposit, relayed as is.
 * It is the user's own transaction, signed by them; the server only
 * broadcasts it.
 */
route("POST", "/v1/deposit/submit", "user", async ({ body }) => {
  const { transaction } = parse(z.object({ transaction: z.string().max(2000) }), body);
  const signature = await connection.sendRawTransaction(Buffer.from(transaction, "base64"), { skipPreflight: false, maxRetries: 5 });
  return { signature };
});

/**
 * Credits a deposit as soon as it is finalized, instead of waiting for the
 * scanner. Safe to call repeatedly and for any signature: only transfers into
 * the treasury are credited, only to their real sender, and only once.
 */
route("POST", "/v1/deposit/confirm", "user", async ({ body }) => {
  const { signature } = parse(z.object({ signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/) }), body);
  const transfers = await incomingTransfers(signature);
  if (transfers === null) return { status: "pending" };
  let credited = 0n;
  for (const transfer of transfers) {
    if (await ops.creditDeposit(signature, transfer.address, transfer.amount)) credited += transfer.amount;
  }
  return { status: "done", credited: credited.toString() };
});

route("POST", "/v1/withdraw", "user", async ({ body, address: who }) => {
  const { amount } = parse(z.object({ amount: baseUnits }), body);
  return ops.requestWithdrawal(who as string, amount);
});

// ------------------------------------------------------------------- trading

route("POST", "/v1/trade/open", "user", async ({ body, address: who }) => {
  const input = parse(
    z.object({ symbol, isLong: z.boolean(), margin: baseUnits, leverage: z.number().int().positive().max(1000) }),
    body,
  );
  await ops.openPosition(who as string, input.symbol, input.isLong, input.margin, input.leverage);
  return { ok: true };
});

route("POST", "/v1/trade/reduce", "user", async ({ body, address: who }) => {
  const input = parse(z.object({ symbol, notional: baseUnits }), body);
  return ops.reducePosition(who as string, input.symbol, input.notional);
});

route("POST", "/v1/trade/close", "user", async ({ body, address: who }) => {
  const input = parse(z.object({ symbol }), body);
  return ops.reducePosition(who as string, input.symbol, "all");
});

route("POST", "/v1/trade/margin", "user", async ({ body, address: who }) => {
  const input = parse(z.object({ symbol, amount: baseUnits }), body);
  await ops.addMargin(who as string, input.symbol, input.amount);
  return { ok: true };
});

route("POST", "/v1/pool/add", "user", async ({ body, address: who }) => {
  const { amount } = parse(z.object({ amount: baseUnits }), body);
  return { shares: (await ops.addLiquidity(who as string, amount)).toString() };
});

route("POST", "/v1/pool/remove", "user", async ({ body, address: who }) => {
  const { shares } = parse(z.object({ shares: baseUnits }), body);
  return { amount: (await ops.removeLiquidity(who as string, shares)).toString() };
});

/** Kept for the site's warm-up call; every market is priced every round now. */
route("POST", "/warm", "none", async () => ({ ok: true }));

// --------------------------------------------------------------------- admin

/** Solvency at a glance: what the treasury holds against what the ledger owes. */
route("GET", "/v1/admin/overview", "admin", async () => {
  const [held, ledger] = await Promise.all([
    usdcBalance(treasury.publicKey),
    read(async (tx) => {
      const { rows } = await tx.query(
        `SELECT
           (SELECT COALESCE(SUM(balance),0) FROM traders) AS balances,
           (SELECT COALESCE(SUM(margin),0) FROM positions) AS margins,
           (SELECT assets FROM pool WHERE id = 1) AS pool,
           (SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE status IN ('queued','review','sending')) AS pending,
           (SELECT COUNT(*) FROM withdrawals WHERE status = 'review') AS review`,
      );
      return rows[0] as Record<string, string>;
    }),
  ]);
  const owed = BigInt(ledger.balances ?? "0") + BigInt(ledger.margins ?? "0") + BigInt(ledger.pool ?? "0") + BigInt(ledger.pending ?? "0");
  const sol = await connection.getBalance(treasury.publicKey);
  return {
    treasury: treasury.publicKey.toBase58(),
    treasuryUsdc: held.toString(),
    treasurySolLamports: sol,
    owed: owed.toString(),
    surplus: (held - owed).toString(),
    solvent: held >= owed,
    ...ledger,
  };
});

route("GET", "/v1/admin/withdrawals", "admin", async ({ url }) => {
  const status = url.searchParams.get("status") ?? "review";
  const { rows } = await db.query("SELECT * FROM withdrawals WHERE status = $1 ORDER BY id DESC LIMIT 100", [status]);
  return rows;
});

route("POST", "/v1/admin/withdrawals/:id/approve", "admin", async ({ params }) => ({
  ok: await ops.approveWithdrawal(parse(z.string().regex(/^\d+$/), params.id)),
}));

route("POST", "/v1/admin/withdrawals/:id/reject", "admin", async ({ params, body }) => {
  const { reason } = parse(z.object({ reason: z.string().max(200).default("rejected") }), body ?? {});
  return { ok: await ops.rejectWithdrawal(parse(z.string().regex(/^\d+$/), params.id), reason) };
});

route("POST", "/v1/admin/markets/:symbol", "admin", async ({ params, body }) => {
  const input = parse(
    z.object({
      paused: z.boolean().optional(),
      maxLeverage: z.number().int().positive().optional(),
      maxOpenInterest: baseUnits.optional(),
      minMargin: baseUnits.optional(),
    }),
    body,
  );
  const sym = parse(symbol, params.symbol);
  const { rowCount } = await db.query(
    `UPDATE markets SET
       paused = COALESCE($2, paused),
       max_leverage = COALESCE($3, max_leverage),
       max_oi = COALESCE($4, max_oi),
       min_margin = COALESCE($5, min_margin)
     WHERE symbol = $1`,
    [sym, input.paused ?? null, input.maxLeverage ?? null, input.maxOpenInterest?.toString() ?? null, input.minMargin?.toString() ?? null],
  );
  return { ok: rowCount === 1 };
});

// -------------------------------------------------------------------- server

/** Engine refusals are the user's to fix (400); anything else is ours (500). */
const toError = (error: unknown): HttpError => {
  if (error instanceof HttpError) return error;
  if (error instanceof VevoError) return new HttpError(400, error.code, error.message);
  if (error instanceof ops.LimitError) return new HttpError(400, error.code, error.message);
  console.error("[http]", error);
  return new HttpError(500, "internal", "something went wrong on our side");
};

const send = (res: ServerResponse, status: number, payload: unknown, origin: string | null): void => {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    vary: "origin",
  };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = "authorization, content-type, x-admin-token";
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers["access-control-max-age"] = "600";
  }
  res.writeHead(status, headers);
  res.end(status === 204 ? undefined : JSON.stringify(payload, bigintJson));
};

export const startHttp = (): void => {
  const server = createServer(async (req, res) => {
    const requestOrigin = req.headers.origin ?? null;
    const origin = requestOrigin && config.ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : null;

    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "OPTIONS") return send(res, 204, null, origin);

      const match = routes
        .filter((candidate) => candidate.method === req.method)
        .map((candidate) => ({ candidate, found: candidate.pattern.exec(url.pathname) }))
        .find((entry) => entry.found !== null);
      if (!match || !match.found) throw new HttpError(404, "not_found");

      const { candidate, found } = match;
      const params = Object.fromEntries(candidate.keys.map((key, index) => [key, decodeURIComponent(found[index + 1] ?? "")]));

      if (req.method === "POST" && !allow(clientIp(req))) throw new HttpError(429, "slow_down");

      let who: string | null = null;
      if (candidate.auth === "user") {
        const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
        who = token ? verifyToken(token) : null;
        if (!who) throw new HttpError(401, "sign_in", "sign in with your wallet first");
      } else if (candidate.auth === "admin") {
        const given = (req.headers["x-admin-token"] as string | undefined) ?? "";
        if (!safeEqual(given, config.ADMIN_TOKEN)) throw new HttpError(403, "forbidden");
      }

      const body = await readBody(req);
      const data = await candidate.handler({ req, url, params, body, address: who });
      send(res, 200, { data }, origin);
    } catch (error) {
      const failure = toError(error);
      send(res, failure.status, { error: { code: failure.code, message: failure.message } }, origin);
    }
  });

  server.listen(config.PORT, () => console.log(`[http] listening on :${config.PORT}`));
};
