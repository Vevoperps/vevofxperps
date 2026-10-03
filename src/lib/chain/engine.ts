"use client";

import { venue } from "./venue";
import { connectedAddress, signAndSend, signMessage } from "./wallet";

/**
 * Everything the app changes, and nothing else.
 *
 * **Deposits are real Solana transactions.** The server builds a USDC
 * transfer from the connected wallet to the venue's treasury; the wallet
 * signs and sends it; the balance is credited once the transfer is final.
 *
 * **Everything else is a signed-in request.** Trading, margin, the pool and
 * withdrawals change the venue's ledger, so they need no transaction and no
 * fee: the wallet signs one sign-in message (no transaction, no cost), and the
 * session it opens lets the ledger act for that wallet only.
 */

// ------------------------------------------------------------------ session

const SESSION_KEY = (address: string) => `vevo:session:${address}`;

const storedToken = (address: string): string | null => {
  try {
    return window.localStorage.getItem(SESSION_KEY(address));
  } catch {
    return null;
  }
};

const storeToken = (address: string, token: string | null): void => {
  try {
    if (token) window.localStorage.setItem(SESSION_KEY(address), token);
    else window.localStorage.removeItem(SESSION_KEY(address));
  } catch {
    // Storage blocked: the wallet is asked to sign in again next time.
  }
};

/** Tokens kept in memory too, for browsers that block storage. */
const memory = new Map<string, string>();

/** A failure the server named; `explainRevert` turns the code into a sentence. */
class VenueError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VenueError";
    this.code = code;
  }
}

const me = (): string => {
  const address = connectedAddress();
  if (!address) throw new VenueError("no_wallet", "no wallet connected");
  return address;
};

const call = async <T>(path: string, body: unknown, token?: string): Promise<T> => {
  if (!venue.apiUrl) throw new VenueError("not_live", "the venue is not live");
  const response = await fetch(`${venue.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: { code: string; message: string } };
  if (!response.ok || payload.error) {
    throw new VenueError(payload.error?.code ?? `http_${response.status}`, payload.error?.message ?? response.statusText);
  }
  return payload.data as T;
};

// base58 for a signature, without another dependency.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const encodeBase58 = (bytes: Uint8Array): string => {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = "";
  while (value > 0n) {
    out = ALPHABET.charAt(Number(value % 58n)) + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
};

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const signIn = async (address: string): Promise<string> => {
  const { message } = await call<{ message: string }>("/v1/auth/nonce", { address });
  const signature = await signMessage(message);
  const { token } = await call<{ token: string }>("/v1/auth/verify", {
    address,
    message,
    // Base64, not base58: a 64-byte signature in base64 is always 88
    // characters ending in "==", which no server version can mistake for
    // base58 (a base58 signature can also be 88 characters long).
    signature: encodeBase64(signature),
  });
  memory.set(address, token);
  storeToken(address, token);
  return token;
};

/** A signed-in request; signs in first when needed, and once more if the session expired. */
const authed = async <T>(path: string, body: unknown): Promise<T> => {
  const address = me();
  const token = memory.get(address) ?? storedToken(address) ?? (await signIn(address));
  try {
    return await call<T>(path, body, token);
  } catch (error) {
    if (error instanceof VenueError && error.code === "sign_in") {
      memory.delete(address);
      storeToken(address, null);
      return call<T>(path, body, await signIn(address));
    }
    throw error;
  }
};

// ------------------------------------------------------------------ actions

/** Solana has no token approvals: the owner signs each transfer. */
export const approveIfNeeded = async (amount: bigint): Promise<void> => {
  void amount;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * USDC from the wallet into the venue. Resolves once the balance is credited
 * (the transfer is final, usually 15–30 seconds); if that takes longer, the
 * server's own scan credits it a little later all the same.
 */
export const deposit = async (amount: bigint): Promise<void> => {
  const { transaction } = await authed<{ transaction: string }>("/v1/deposit/build", { amount: amount.toString() });
  const bytes = Uint8Array.from(atob(transaction), (char) => char.charCodeAt(0));

  const result = await signAndSend(bytes);
  let signature: string;
  if ("signature" in result) {
    signature = encodeBase58(result.signature);
  } else {
    let binary = "";
    for (const byte of result.signed) binary += String.fromCharCode(byte);
    ({ signature } = await authed<{ signature: string }>("/v1/deposit/submit", { transaction: btoa(binary) }));
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(attempt === 0 ? 4_000 : 3_000);
    const status = await authed<{ status: string }>("/v1/deposit/confirm", { signature }).catch(() => ({ status: "pending" }));
    if (status.status === "done") return;
  }
  throw new VenueError("deposit_pending", "the deposit is on its way and will appear in your balance shortly");
};

/** What happened to a withdrawal request, for the screen to say. */
export interface WithdrawalRequest {
  id: string;
  status: "queued" | "review";
}

export const withdraw = async (amount: bigint): Promise<WithdrawalRequest> =>
  authed<WithdrawalRequest>("/v1/withdraw", { amount: amount.toString() });

/** Moves free balance into the pool, for shares. */
export const addLiquidity = async (amount: bigint): Promise<void> => {
  await authed("/v1/pool/add", { amount: amount.toString() });
};

/** Redeems shares — only the part of the pool no open position has reserved. */
export const removeLiquidity = async (shares: bigint): Promise<void> => {
  await authed("/v1/pool/remove", { shares: shares.toString() });
};

export const openPosition = async (symbol: string, isLong: boolean, margin: bigint, leverage: number): Promise<void> => {
  await authed("/v1/trade/open", { symbol, isLong, margin: margin.toString(), leverage });
};

export const reducePosition = async (symbol: string, notional: bigint): Promise<void> => {
  await authed("/v1/trade/reduce", { symbol, notional: notional.toString() });
};

export const closePosition = async (symbol: string): Promise<void> => {
  await authed("/v1/trade/close", { symbol });
};

export const addMargin = async (symbol: string, amount: bigint): Promise<void> => {
  await authed("/v1/trade/margin", { symbol, amount: amount.toString() });
};

/** Test USDC on devnet comes from Circle's public faucet. */
export const DEVNET_FAUCET_URL = "https://faucet.circle.com";

export const faucet = async (to: string, amount: bigint): Promise<void> => {
  void to;
  void amount;
  throw new Error(`devnet USDC comes from ${DEVNET_FAUCET_URL}`);
};

/** Turns a failure into something a person can act on. */
const REASONS: Record<string, string> = {
  InsufficientBalance: "not enough free balance",
  InsufficientLiquidity: "the pool cannot back that payout cap right now",
  EmptyPool: "the pool is empty",
  LeverageTooHigh: "above this pair's leverage cap",
  MarginTooSmall: "below this pair's minimum margin",
  MarketIsPaused: "this market is paused",
  OpenInterestCap: "this side of the book is full",
  StalePrice: "this pair's price is warming up, try again in a few seconds",
  NoFeed: "this pair has not been priced yet",
  NotLiquidatable: "that position is still above its maintenance margin",
  BadCloseAmount: "that is more than the position holds",
  NoPosition: "nothing open on this pair",
  PositionExists: "you already have a position on this pair",
  ZeroAmount: "enter an amount",
  BelowMinimum: "that is below the minimum amount",
  UnknownMarket: "this market is not listed",
  sign_in: "sign in with your wallet to continue",
  bad_signature: "the wallet signature did not check out, try again",
  slow_down: "too many requests, wait a moment",
  deposit_pending: "the deposit is on its way and will appear in your balance shortly",
  not_live: "the venue is not live yet",
  no_wallet: "connect a wallet first",
};

export const explainRevert = (error: unknown): string => {
  if (error instanceof VenueError) {
    const plain = REASONS[error.code];
    if (plain) return plain;
    if (error.code === "internal") return "something went wrong on our side, try again";
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/user rejected|rejected the request|declined|cancel/i.test(message)) return "you cancelled it";
  if (/insufficient lamports|insufficient funds for fee/i.test(message)) return "not enough SOL in the wallet for the network fee";
  if (/cannot sign messages/i.test(message)) return "this wallet cannot sign in; try Phantom, Solflare or Backpack";

  const detail = message.trim();
  return detail ? `that did not go through: ${detail.slice(0, 160)}` : "that did not go through";
};
