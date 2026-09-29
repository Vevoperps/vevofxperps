"use client";

import { Buffer } from "buffer";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  associatedTokenAddress,
  decodePosition,
  instructions,
  pdas,
} from "./solana/vevo-client";
import { venue } from "./venue";
import { connectedAddress, signAndSend } from "./wallet";

/**
 * Everything the app writes to the chain, and nothing else.
 *
 * Each write is built here, **simulated against the current state first**,
 * and only then handed to the wallet. A transaction that is going to fail
 * fails in the simulation, where the program's own error name is in the logs
 * and `explainRevert` can turn it into a sentence — rather than after the
 * signing dialog has opened and cost a click.
 *
 * The app holds no key and signs nothing on anybody's behalf.
 */

let client: Connection | null = null;

const connection = (): Connection => {
  if (!venue.live || !venue.rpcUrl) throw new Error("the venue is not live");
  client ??= new Connection(venue.rpcUrl, "confirmed");
  return client;
};

const owner = (): PublicKey => {
  const address = connectedAddress();
  if (!address) throw new Error("no wallet connected");
  return new PublicKey(address);
};

const venueIx = () =>
  instructions({ programId: new PublicKey(venue.engine as string), mint: new PublicKey(venue.settlement as string) });

/**
 * Creates the wallet's USDC account if it does not exist yet (the idempotent
 * form, which does nothing when it does). Withdrawals need somewhere to land.
 */
const ensureTokenAccount = (payer: PublicKey): TransactionInstruction => {
  const mint = new PublicKey(venue.settlement as string);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress(mint, payer), isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
};

/** Thrown with the program's logs attached, for `explainRevert` to read. */
class SimulationFailed extends Error {
  constructor(readonly logs: string[], detail: string) {
    super(detail);
    this.name = "SimulationFailed";
  }
}

/**
 * Builds, simulates, signs and confirms one transaction.
 *
 * A small priority fee is attached: a trade that lands a few slots late fills
 * at a later mark, and on a busy network the fee is what keeps it prompt.
 */
const run = async (payload: TransactionInstruction[]): Promise<string> => {
  const payer = owner();
  const rpc = connection();

  const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
      ...payload,
    ],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);

  const simulation = await rpc.simulateTransaction(transaction, { sigVerify: false });
  if (simulation.value.err) {
    throw new SimulationFailed(simulation.value.logs ?? [], JSON.stringify(simulation.value.err));
  }

  const result = await signAndSend(transaction.serialize());

  let signature: string;
  if ("signature" in result) {
    signature = encodeBase58(result.signature);
  } else {
    signature = await rpc.sendRawTransaction(result.signed, { skipPreflight: true });
  }

  const confirmation = await rpc.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  if (confirmation.value.err) throw new Error(`transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  return signature;
};

// A signature comes back from the wallet as bytes; the RPC wants base58.
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

/** Solana has no token approvals: every transfer is signed by its owner. */
export const approveIfNeeded = async (amount: bigint): Promise<void> => {
  void amount;
};

export const deposit = async (amount: bigint): Promise<void> => {
  await run([venueIx().deposit(owner(), amount)]);
};

export const withdraw = async (amount: bigint): Promise<void> => {
  const me = owner();
  await run([ensureTokenAccount(me), venueIx().withdraw(me, amount)]);
};

/** Backs the venue's side of the book, in exchange for shares of the pool. */
export const addLiquidity = async (amount: bigint): Promise<void> => {
  await run([venueIx().addLiquidity(owner(), amount)]);
};

/** Redeems shares — only the part of the pool no open position has reserved. */
export const removeLiquidity = async (shares: bigint): Promise<void> => {
  const me = owner();
  await run([ensureTokenAccount(me), venueIx().removeLiquidity(me, shares)]);
};

export const openPosition = async (symbol: string, isLong: boolean, margin: bigint, leverage: number): Promise<void> => {
  await run([venueIx().openPosition(owner(), symbol, isLong, margin, leverage)]);
};

export const reducePosition = async (symbol: string, notional: bigint): Promise<void> => {
  await run([venueIx().reducePosition(owner(), symbol, notional)]);
};

/** A full close is a reduce by the whole notional, read fresh off the chain. */
export const closePosition = async (symbol: string): Promise<void> => {
  const me = owner();
  const at = pdas(new PublicKey(venue.engine as string));
  const info = await connection().getAccountInfo(at.position(at.market(symbol), me));
  if (!info) throw new SimulationFailed([], "NoPosition");
  const { notional } = decodePosition(info.data);
  await reducePosition(symbol, notional);
};

export const addMargin = async (symbol: string, amount: bigint): Promise<void> => {
  await run([venueIx().addMargin(owner(), symbol, amount)]);
};

/**
 * Test USDC. On devnet it comes from Circle's public faucet, not from us, so
 * the screen links there instead of calling this; it is kept for the EVM-era
 * import and says where to go.
 */
export const DEVNET_FAUCET_URL = "https://faucet.circle.com";

export const faucet = async (to: string, amount: bigint): Promise<void> => {
  void to;
  void amount;
  throw new Error(`devnet USDC comes from ${DEVNET_FAUCET_URL}`);
};

/**
 * Turns a failure into something a person can act on. Anchor prints
 * `Error Code: <Name>` in the logs; the names are the program's own.
 */
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
  ZeroAmount: "enter an amount",
  "already in use": "you already have a position on this pair",
  "insufficient lamports": "not enough SOL in the wallet for the fee",
  AccountNotInitialized: "this wallet has no USDC account yet, or nothing deposited in the venue",
};

export const explainRevert = (error: unknown): string => {
  const logs = error instanceof SimulationFailed ? error.logs : [];
  const message = error instanceof Error ? error.message : String(error);
  const text = `${logs.join(" ")} ${message}`;

  for (const [name, plain] of Object.entries(REASONS)) {
    if (text.includes(name)) return plain;
  }

  if (/user rejected|rejected the request|declined|cancel/i.test(text)) return "you cancelled it";
  if (/0x1\b|insufficient funds/i.test(text)) return "not enough USDC in the wallet";

  const detail = message.trim();
  return detail ? `the transaction did not go through: ${detail.slice(0, 160)}` : "the transaction did not go through";
};
