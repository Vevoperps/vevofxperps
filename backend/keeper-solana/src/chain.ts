import bs58 from "bs58";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

import {config} from "./config.js";
import {
  decodeConfig,
  decodeMarket,
  decodeMarks,
  discriminatorFilter,
  instructions,
  pdas,
  type ConfigAccount,
  type MarketAccount,
  type MarkSlot,
} from "./vevo-client.js";

/**
 * One connection, one signer, one set of addresses, shared by every task.
 *
 * The signer is deliberately powerless: `post_marks` and `liquidate` are the
 * only instructions it sends, and neither can move a balance that is not
 * already due to move.
 */

export const connection = new Connection(config.RPC_URL, "confirmed");

const secret = (raw: string): Uint8Array => {
  const value = raw.trim();
  if (value.startsWith("[")) return Uint8Array.from(JSON.parse(value) as number[]);
  return bs58.decode(value);
};

export const signer = Keypair.fromSecretKey(secret(config.KEEPER_KEY));
export const programId = new PublicKey(config.PROGRAM_ID);
export const at = pdas(programId);

export const explain = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const sleep = (seconds: number): Promise<void> => new Promise((done) => setTimeout(done, seconds * 1000));

/** Runs a task forever on an interval; one bad round never stops the loop. */
export const every = async (seconds: number, name: string, task: () => Promise<void>): Promise<never> => {
  for (;;) {
    const started = Date.now();
    try {
      await task();
    } catch (error) {
      console.error(`[${name}] ${explain(error)}`);
    }
    await sleep(Math.max(0, seconds - (Date.now() - started) / 1000));
  }
};

// ------------------------------------------------------------------ reading

export const loadConfig = async (): Promise<ConfigAccount> => {
  const info = await connection.getAccountInfo(at.config);
  if (!info) throw new Error(`no config at ${at.config.toBase58()} — is PROGRAM_ID right, and initialised?`);
  return decodeConfig(info.data);
};

export const loadMarks = async (): Promise<MarkSlot[]> => {
  const info = await connection.getAccountInfo(at.marks);
  if (!info) throw new Error("no marks account");
  return decodeMarks(info.data);
};

export interface ListedMarket {
  address: PublicKey;
  account: MarketAccount;
}

/** Every listed market, by symbol. One RPC call for all of them. */
export const loadMarkets = async (): Promise<Map<string, ListedMarket>> => {
  const rows = await connection.getProgramAccounts(programId, {filters: [discriminatorFilter("market")]});
  const out = new Map<string, ListedMarket>();
  for (const row of rows) {
    const account = decodeMarket(row.account.data);
    out.set(account.symbol, {address: row.pubkey, account});
  }
  return out;
};

/** The chain's own clock, not ours: staleness is judged by the validator. */
export const chainTime = async (): Promise<number> => {
  const slot = await connection.getSlot("confirmed");
  const time = await connection.getBlockTime(slot);
  return time ?? Math.floor(Date.now() / 1000);
};

// ------------------------------------------------------------------ sending

export const ix = instructions({programId, mint: PublicKey.default});

/**
 * Sends instructions as one transaction, with a compute budget and a priority
 * fee, and waits for confirmation.
 *
 * `simulateFirst` runs the transaction without landing it: a liquidation that
 * someone else already took, or one that is no longer below maintenance,
 * fails there and costs nothing.
 */
export const send = async (
  instructions: TransactionInstruction[],
  {simulateFirst = false, units = 400_000}: {simulateFirst?: boolean; units?: number} = {},
): Promise<string> => {
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({units}),
    ComputeBudgetProgram.setComputeUnitPrice({microLamports: config.PRIORITY_FEE}),
    ...instructions,
  );

  const {blockhash, lastValidBlockHeight} = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = signer.publicKey;
  tx.sign(signer);

  if (simulateFirst) {
    const result = await connection.simulateTransaction(tx);
    if (result.value.err) {
      const tail = (result.value.logs ?? []).slice(-3).join(" | ");
      throw new Error(`simulation failed: ${JSON.stringify(result.value.err)} ${tail}`);
    }
  }

  const signature = await connection.sendRawTransaction(tx.serialize(), {skipPreflight: simulateFirst});
  const confirmation = await connection.confirmTransaction({signature, blockhash, lastValidBlockHeight}, "confirmed");
  if (confirmation.value.err) {
    throw new Error(`transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`);
  }
  return signature;
};

/**
 * One transaction at a time from this wallet. Solana has no nonces to collide
 * on, but three loops sending at once make the fee spend and the log order
 * unpredictable; serialising them costs a second at most.
 */
let tail: Promise<unknown> = Promise.resolve();

export const oneAtATime = <T>(job: () => Promise<T>): Promise<T> => {
  const result = tail.then(job, job);
  tail = result.catch(() => undefined);
  return result;
};
