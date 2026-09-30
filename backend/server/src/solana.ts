import bs58 from "bs58";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";

import { config } from "./config.js";

/**
 * Everything the server does on Solana: USDC in, USDC out. No program of our
 * own — deposits are plain SPL transfers into the treasury's token account,
 * withdrawals plain transfers out of it.
 */

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const USDC_DECIMALS = 6;

export const connection = new Connection(config.RPC_URL, "confirmed");
export const mint = new PublicKey(config.USDC_MINT);

const parseSecret = (raw: string): Keypair => {
  const text = raw.trim();
  const bytes = text.startsWith("[") ? Uint8Array.from(JSON.parse(text) as number[]) : bs58.decode(text);
  return Keypair.fromSecretKey(bytes);
};

export const treasury = parseSecret(config.TREASURY_KEY);

export const associatedTokenAddress = (owner: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0];

export const treasuryToken = associatedTokenAddress(treasury.publicKey);

export const isAddress = (value: string): boolean => {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
};

const createAtaIdempotent = (payer: PublicKey, owner: PublicKey): TransactionInstruction =>
  new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress(owner), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });

const transferChecked = (source: PublicKey, destination: PublicKey, owner: PublicKey, amount: bigint): TransactionInstruction => {
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0);
  data.writeBigUInt64LE(amount, 1);
  data.writeUInt8(USDC_DECIMALS, 9);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
};

/** Creates the treasury's USDC account if it does not exist yet. */
export const ensureTreasuryAccount = async (): Promise<void> => {
  const info = await connection.getAccountInfo(treasuryToken);
  if (info) return;
  console.log(`[solana] creating the treasury USDC account ${treasuryToken.toBase58()}`);
  const sent = await sendSigned([createAtaIdempotent(treasury.publicKey, treasury.publicKey)]);
  const result = await connection.confirmTransaction(
    { signature: sent.signature, blockhash: sent.blockhash, lastValidBlockHeight: sent.lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) throw new Error(`treasury account creation failed: ${JSON.stringify(result.value.err)}`);
};

/** USDC held by an owner's associated account, in base units (0 when none). */
export const usdcBalance = async (owner: PublicKey): Promise<bigint> => {
  try {
    const result = await connection.getTokenAccountBalance(associatedTokenAddress(owner), "confirmed");
    return BigInt(result.value.amount);
  } catch {
    return 0n;
  }
};

/**
 * An unsigned deposit for the user's wallet to sign and send: their USDC to
 * the treasury. The user pays the network fee; the server never touches it.
 */
export const buildDeposit = async (owner: PublicKey, amount: bigint): Promise<string> => {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 30_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
      transferChecked(associatedTokenAddress(owner), treasuryToken, owner, amount),
    ],
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
};

export interface IncomingTransfer {
  /** The wallet that authorised the transfer. */
  address: string;
  amount: bigint;
}

/**
 * The USDC a finalized transaction moved into the treasury, per sender.
 * Reads top-level and inner instructions, so a transfer made through another
 * program (a wallet's swap-and-send, say) still counts.
 */
export const incomingTransfers = async (signature: string): Promise<IncomingTransfer[] | null> => {
  const tx = await connection.getParsedTransaction(signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
  if (!tx) return null;
  if (!tx.meta || tx.meta.err) return [];

  const all: (ParsedInstruction | PartiallyDecodedInstruction)[] = [
    ...tx.transaction.message.instructions,
    ...(tx.meta.innerInstructions ?? []).flatMap((inner) => inner.instructions),
  ];

  const byAddress = new Map<string, bigint>();
  const treasuryAccount = treasuryToken.toBase58();

  for (const ix of all) {
    if (!("parsed" in ix) || !ix.programId.equals(TOKEN_PROGRAM_ID)) continue;
    const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> };
    if (parsed.type !== "transfer" && parsed.type !== "transferChecked") continue;
    const info = parsed.info ?? {};
    if (info.destination !== treasuryAccount) continue;
    if (parsed.type === "transferChecked" && info.mint !== mint.toBase58()) continue;

    const sender = (info.authority ?? info.multisigAuthority) as string | undefined;
    if (!sender || sender === treasury.publicKey.toBase58()) continue;

    const raw =
      parsed.type === "transferChecked"
        ? ((info.tokenAmount as { amount?: string } | undefined)?.amount ?? "0")
        : ((info.amount as string | undefined) ?? "0");
    const amount = BigInt(raw);
    if (amount <= 0n) continue;

    byAddress.set(sender, (byAddress.get(sender) ?? 0n) + amount);
  }

  return [...byAddress].map(([address, amount]) => ({ address, amount }));
};

/** Signs with the treasury and sends; returns the signature and its expiry. */
const sendSigned = async (instructions: TransactionInstruction[]) => {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: treasury.publicKey,
    recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }), ...instructions],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([treasury]);
  const signature = bs58.encode(tx.signatures[0] as Uint8Array);
  await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
  return { signature, blockhash, lastValidBlockHeight, raw: tx.serialize() };
};

/**
 * Builds and signs a withdrawal without sending it, so its signature can be
 * stored first: a crash between send and record then cannot pay twice.
 */
export const prepareWithdrawal = async (to: PublicKey, amount: bigint) => {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: treasury.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
      createAtaIdempotent(treasury.publicKey, to),
      transferChecked(treasuryToken, associatedTokenAddress(to), treasury.publicKey, amount),
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([treasury]);
  return { signature: bs58.encode(tx.signatures[0] as Uint8Array), lastValidBlockHeight, raw: tx.serialize() };
};

export const broadcast = async (raw: Uint8Array): Promise<void> => {
  await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 5 });
};

/** "landed", "failed", or "pending" (unknown yet, and the blockhash still valid), or "expired". */
export const outcome = async (signature: string, lastValidBlockHeight: number): Promise<"landed" | "failed" | "pending" | "expired"> => {
  const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
  const status = value[0];
  if (status) {
    if (status.err) return "failed";
    if (status.confirmationStatus === "finalized" || status.confirmationStatus === "confirmed") return "landed";
    return "pending";
  }
  const height = await connection.getBlockHeight("confirmed");
  return height > lastValidBlockHeight ? "expired" : "pending";
};
