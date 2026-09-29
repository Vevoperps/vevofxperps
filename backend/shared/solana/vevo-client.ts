/**
 * A dependency-light client for the vevo Solana program.
 *
 * Hand-written against `backend/solana/programs/vevo` rather than generated
 * from the IDL, so the keeper and the site can build without the Anchor
 * toolchain and without a `target/` directory. It covers exactly what they
 * need: the PDAs, decoding every account, encoding every user instruction,
 * decoding events from transaction logs, and the ticket arithmetic.
 *
 * **Two copies, one source.** This file lives in `backend/shared/solana/` for
 * the keeper and is copied verbatim to `src/lib/chain/solana/vevo-client.ts`
 * for the site (Vercel never uploads `backend/`). Edit here, then copy.
 *
 * **Keep in step with the program.** Account layouts are Borsh in field
 * order, except `Marks`, which is zero-copy (`repr(C)`, 32-byte slots).
 * Discriminators are Anchor's: the first 8 bytes of
 * sha256("global:<ix>") / sha256("account:<Account>") / sha256("event:<Event>").
 * The Anchor test suite exercises the program through the generated IDL; if a
 * layout here drifts, the keeper's start-up check (`decodeConfig`) fails loudly.
 *
 * Amounts are USDC base units (6 decimals) as `bigint`; prices and funding
 * indices are 1e18 fixed point as `bigint`.
 */

import { Buffer } from "buffer";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

// ------------------------------------------------------------------ constants

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export const WAD = 10n ** 18n;
export const BPS = 10_000n;
export const FEE_BPS = 5n;
export const MAINTENANCE_BPS = 50n;
export const PAYOUT_CAP = 10n;
export const LIQUIDATOR_SHARE_BPS = 5_000n;
export const MAX_FUNDING_RATE = 7_500_000_000_000_000n;
export const FUNDING_WINDOW = 8n * 60n * 60n;
export const REFERENCE_WINDOW = 24 * 60 * 60;
export const MAX_MARKETS = 80;

const IX = {
  postMarks: [25, 137, 136, 94, 0, 245, 122, 20],
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
  addLiquidity: [181, 157, 89, 67, 143, 182, 52, 72],
  removeLiquidity: [80, 85, 209, 72, 24, 206, 177, 108],
  openPosition: [135, 128, 47, 77, 15, 152, 240, 49],
  addMargin: [211, 238, 238, 90, 223, 228, 228, 76],
  reducePosition: [96, 202, 33, 80, 24, 197, 33, 77],
  liquidate: [223, 179, 226, 125, 48, 46, 39, 74],
  poke: [46, 24, 16, 107, 212, 9, 17, 5],
  snapshot: [144, 236, 6, 133, 233, 160, 21, 94],
} as const;

export const ACCOUNT = {
  config: [155, 12, 170, 224, 30, 250, 204, 130],
  marks: [187, 99, 57, 45, 194, 70, 123, 14],
  market: [219, 190, 213, 55, 0, 227, 198, 154],
  trader: [74, 133, 32, 105, 47, 50, 5, 238],
  position: [170, 188, 143, 228, 122, 64, 247, 208],
} as const;

const EVENT = {
  Deposited: [111, 141, 26, 45, 161, 35, 100, 57],
  Withdrawn: [20, 89, 223, 198, 194, 124, 219, 13],
  LiquidityAdded: [154, 26, 221, 108, 238, 64, 217, 161],
  LiquidityRemoved: [225, 105, 216, 39, 124, 116, 169, 189],
  PositionOpened: [237, 175, 243, 230, 147, 117, 101, 121],
  MarginAdded: [121, 187, 28, 95, 195, 171, 37, 8],
  PositionClosed: [157, 163, 227, 228, 13, 97, 138, 121],
  PositionReduced: [251, 198, 158, 1, 128, 208, 153, 2],
  PositionLiquidated: [40, 107, 90, 214, 96, 30, 61, 128],
  ReferenceTaken: [31, 11, 159, 129, 117, 82, 41, 51],
} as const;

/** Base58 of an account discriminator, for `getProgramAccounts` memcmp filters. */
export const discriminatorFilter = (name: keyof typeof ACCOUNT) => ({
  memcmp: { offset: 0, bytes: bs58(ACCOUNT[name]) },
});

// A tiny base58 encoder, so the filter above needs no extra dependency.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58(bytes: readonly number[]): string {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = "";
  while (value > 0n) {
    out = ALPHABET.charAt(Number(value % 58n)) + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out;
}

// ----------------------------------------------------------------------- PDAs

export const symbolBytes = (symbol: string): Buffer => {
  const out = Buffer.alloc(8);
  out.write(symbol, "ascii");
  return out;
};

export const pdas = (programId: PublicKey) => {
  const find = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, programId)[0];
  return {
    config: find(Buffer.from("config")),
    marks: find(Buffer.from("marks")),
    vault: find(Buffer.from("vault")),
    market: (symbol: string) => find(Buffer.from("market"), symbolBytes(symbol)),
    trader: (owner: PublicKey) => find(Buffer.from("trader"), owner.toBuffer()),
    position: (market: PublicKey, owner: PublicKey) =>
      find(Buffer.from("position"), market.toBuffer(), owner.toBuffer()),
  };
};

export const associatedTokenAddress = (mint: PublicKey, owner: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];

// ------------------------------------------------------------------- decoding

class Reader {
  private offset: number;
  private readonly view: DataView;

  constructor(private readonly data: Uint8Array, start = 8) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.offset = start;
  }

  skip(bytes: number): void {
    this.offset += bytes;
  }
  u8(): number {
    return this.view.getUint8(this.offset++);
  }
  bool(): boolean {
    return this.u8() !== 0;
  }
  u16(): number {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }
  u64(): bigint {
    const v = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return v;
  }
  i64(): bigint {
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return v;
  }
  u128(): bigint {
    const lo = this.u64();
    const hi = this.u64();
    return (hi << 64n) | lo;
  }
  i128(): bigint {
    const lo = this.u64();
    const hi = this.i64();
    return (hi << 64n) | lo;
  }
  bytes(length: number): Uint8Array {
    const out = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }
  pubkey(): PublicKey {
    return new PublicKey(this.bytes(32));
  }
}

const hasDiscriminator = (data: Uint8Array, expected: readonly number[]): boolean =>
  data.length >= 8 && expected.every((byte, i) => data[i] === byte);

const check = (data: Uint8Array, name: keyof typeof ACCOUNT): void => {
  if (!hasDiscriminator(data, ACCOUNT[name])) {
    throw new Error(`not a vevo ${name} account (layout drift, or the wrong address)`);
  }
};

export interface ConfigAccount {
  admin: PublicKey;
  pendingAdmin: PublicKey;
  publisher: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  poolAssets: bigint;
  poolReserved: bigint;
  poolShares: bigint;
  maxAge: number;
  maxDeviationBps: number;
  marketCount: number;
}

export const decodeConfig = (data: Uint8Array): ConfigAccount => {
  check(data, "config");
  const r = new Reader(data);
  return {
    admin: r.pubkey(),
    pendingAdmin: r.pubkey(),
    publisher: r.pubkey(),
    mint: r.pubkey(),
    vault: r.pubkey(),
    poolAssets: r.u64(),
    poolReserved: r.u64(),
    poolShares: r.u128(),
    maxAge: r.u32(),
    maxDeviationBps: r.u16(),
    marketCount: r.u8(),
  };
};

export interface MarkSlot {
  price: bigint;
  updatedAt: number;
}

/** Zero-copy: 32-byte slots after the discriminator. */
export const decodeMarks = (data: Uint8Array): MarkSlot[] => {
  check(data, "marks");
  const r = new Reader(data);
  const slots: MarkSlot[] = [];
  for (let i = 0; i < MAX_MARKETS; i += 1) {
    const price = r.u128();
    const updatedAt = Number(r.i64());
    r.skip(8);
    slots.push({ price, updatedAt });
  }
  return slots;
};

export interface MarketAccount {
  symbol: string;
  index: number;
  maxLeverage: number;
  paused: boolean;
  skewScale: bigint;
  maxOpenInterest: bigint;
  minMargin: bigint;
  longOpenInterest: bigint;
  shortOpenInterest: bigint;
  fundingLong: bigint;
  fundingShort: bigint;
  lastAccrual: number;
  referencePrice: bigint;
  referenceAt: number;
}

export const decodeMarket = (data: Uint8Array): MarketAccount => {
  check(data, "market");
  const r = new Reader(data);
  const symbol = Buffer.from(r.bytes(8)).toString("ascii").replace(/\0+$/, "");
  const index = r.u8();
  const maxLeverage = r.u16();
  const paused = r.bool();
  r.skip(1); // bump
  return {
    symbol,
    index,
    maxLeverage,
    paused,
    skewScale: r.u64(),
    maxOpenInterest: r.u64(),
    minMargin: r.u64(),
    longOpenInterest: r.u64(),
    shortOpenInterest: r.u64(),
    fundingLong: r.i128(),
    fundingShort: r.i128(),
    lastAccrual: Number(r.i64()),
    referencePrice: r.u128(),
    referenceAt: Number(r.i64()),
  };
};

export interface TraderAccount {
  owner: PublicKey;
  balance: bigint;
  shares: bigint;
}

export const decodeTrader = (data: Uint8Array): TraderAccount => {
  check(data, "trader");
  const r = new Reader(data);
  return { owner: r.pubkey(), balance: r.u64(), shares: r.u128() };
};

export interface PositionAccount {
  owner: PublicKey;
  market: PublicKey;
  margin: bigint;
  notional: bigint;
  payoutCap: bigint;
  entryPrice: bigint;
  entryFunding: bigint;
  openedAt: number;
  isLong: boolean;
}

export const decodePosition = (data: Uint8Array): PositionAccount => {
  check(data, "position");
  const r = new Reader(data);
  return {
    owner: r.pubkey(),
    market: r.pubkey(),
    margin: r.u64(),
    notional: r.u64(),
    payoutCap: r.u64(),
    entryPrice: r.u128(),
    entryFunding: r.i128(),
    openedAt: Number(r.i64()),
    isLong: r.bool(),
  };
};

// ------------------------------------------------------------------- encoding

class Writer {
  private readonly parts: Buffer[] = [];
  constructor(discriminator: readonly number[]) {
    this.parts.push(Buffer.from(discriminator));
  }
  u8(v: number): this {
    this.parts.push(Buffer.from([v]));
    return this;
  }
  bool(v: boolean): this {
    return this.u8(v ? 1 : 0);
  }
  u16(v: number): this {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v);
    this.parts.push(b);
    return this;
  }
  u32(v: number): this {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v);
    this.parts.push(b);
    return this;
  }
  u64(v: bigint): this {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(v);
    this.parts.push(b);
    return this;
  }
  u128(v: bigint): this {
    const b = Buffer.alloc(16);
    b.writeBigUInt64LE(v & ((1n << 64n) - 1n), 0);
    b.writeBigUInt64LE(v >> 64n, 8);
    this.parts.push(b);
    return this;
  }
  bytes(v: Uint8Array): this {
    this.u32(v.length);
    this.parts.push(Buffer.from(v));
    return this;
  }
  done(): Buffer {
    return Buffer.concat(this.parts);
  }
}

const meta = (pubkey: PublicKey, isSigner: boolean, isWritable: boolean) => ({ pubkey, isSigner, isWritable });

export interface Venue {
  programId: PublicKey;
  mint: PublicKey;
}

export const instructions = (venue: Venue) => {
  const { programId, mint } = venue;
  const at = pdas(programId);
  const ix = (keys: ReturnType<typeof meta>[], data: Buffer) =>
    new TransactionInstruction({ programId, keys, data });

  const tokenIx = (name: "deposit" | "withdraw" | "addLiquidity" | "removeLiquidity", owner: PublicKey, data: Buffer) => {
    const opensTrader = name === "deposit" || name === "addLiquidity";
    const writesConfig = name === "addLiquidity" || name === "removeLiquidity";
    const keys = [
      meta(owner, true, opensTrader),
      meta(at.config, false, writesConfig),
      meta(at.trader(owner), false, true),
      meta(mint, false, false),
      meta(associatedTokenAddress(mint, owner), false, true),
      meta(at.vault, false, true),
      meta(TOKEN_PROGRAM_ID, false, false),
    ];
    if (opensTrader) keys.push(meta(SystemProgram.programId, false, false));
    return ix(keys, data);
  };

  return {
    postMarks: (publisher: PublicKey, indices: number[], prices: bigint[]) => {
      const w = new Writer(IX.postMarks).bytes(Uint8Array.from(indices)).u32(prices.length);
      for (const p of prices) w.u128(p);
      return ix([meta(publisher, true, false), meta(at.config, false, false), meta(at.marks, false, true)], w.done());
    },

    deposit: (owner: PublicKey, amount: bigint) => tokenIx("deposit", owner, new Writer(IX.deposit).u64(amount).done()),
    withdraw: (owner: PublicKey, amount: bigint) =>
      tokenIx("withdraw", owner, new Writer(IX.withdraw).u64(amount).done()),
    addLiquidity: (owner: PublicKey, amount: bigint) =>
      tokenIx("addLiquidity", owner, new Writer(IX.addLiquidity).u64(amount).done()),
    removeLiquidity: (owner: PublicKey, shares: bigint) =>
      tokenIx("removeLiquidity", owner, new Writer(IX.removeLiquidity).u128(shares).done()),

    openPosition: (owner: PublicKey, symbol: string, isLong: boolean, margin: bigint, leverage: number) => {
      const market = at.market(symbol);
      return ix(
        [
          meta(owner, true, true),
          meta(at.config, false, true),
          meta(at.marks, false, false),
          meta(market, false, true),
          meta(at.trader(owner), false, true),
          meta(at.position(market, owner), false, true),
          meta(SystemProgram.programId, false, false),
        ],
        new Writer(IX.openPosition).bool(isLong).u64(margin).u16(leverage).done(),
      );
    },

    addMargin: (owner: PublicKey, symbol: string, amount: bigint) =>
      ix(
        [
          meta(owner, true, false),
          meta(at.trader(owner), false, true),
          meta(at.position(at.market(symbol), owner), false, true),
        ],
        new Writer(IX.addMargin).u64(amount).done(),
      ),

    reducePosition: (owner: PublicKey, symbol: string, notional: bigint) => {
      const market = at.market(symbol);
      return ix(
        [
          meta(owner, true, true),
          meta(at.config, false, true),
          meta(at.marks, false, false),
          meta(market, false, true),
          meta(at.trader(owner), false, true),
          meta(at.position(market, owner), false, true),
        ],
        new Writer(IX.reducePosition).u64(notional).done(),
      );
    },

    liquidate: (liquidator: PublicKey, market: PublicKey, owner: PublicKey) =>
      ix(
        [
          meta(liquidator, true, true),
          meta(at.config, false, true),
          meta(at.marks, false, false),
          meta(market, false, true),
          meta(at.position(market, owner), false, true),
          meta(owner, false, true),
          meta(at.trader(liquidator), false, true),
          meta(SystemProgram.programId, false, false),
        ],
        new Writer(IX.liquidate).done(),
      ),

    snapshot: (market: PublicKey) =>
      ix(
        [meta(at.config, false, false), meta(at.marks, false, false), meta(market, false, true)],
        new Writer(IX.snapshot).done(),
      ),

    poke: (market: PublicKey) => ix([meta(market, false, true)], new Writer(IX.poke).done()),
  };
};

// --------------------------------------------------------------------- events

export type VevoEvent =
  | { name: "Deposited"; owner: PublicKey; amount: bigint }
  | { name: "Withdrawn"; owner: PublicKey; amount: bigint }
  | { name: "LiquidityAdded"; provider: PublicKey; amount: bigint; shares: bigint }
  | { name: "LiquidityRemoved"; provider: PublicKey; shares: bigint; amount: bigint }
  | {
      name: "PositionOpened";
      owner: PublicKey;
      market: PublicKey;
      isLong: boolean;
      margin: bigint;
      notional: bigint;
      entryPrice: bigint;
      fee: bigint;
    }
  | { name: "MarginAdded"; owner: PublicKey; market: PublicKey; amount: bigint; margin: bigint }
  | {
      name: "PositionClosed";
      owner: PublicKey;
      market: PublicKey;
      exitPrice: bigint;
      payout: bigint;
      pnl: bigint;
      funding: bigint;
      fee: bigint;
    }
  | {
      name: "PositionReduced";
      owner: PublicKey;
      market: PublicKey;
      exitPrice: bigint;
      closedNotional: bigint;
      payout: bigint;
      pnl: bigint;
      funding: bigint;
      fee: bigint;
    }
  | {
      name: "PositionLiquidated";
      owner: PublicKey;
      market: PublicKey;
      liquidator: PublicKey;
      exitPrice: bigint;
      reward: bigint;
    }
  | { name: "ReferenceTaken"; market: PublicKey; price: bigint; at: number };

/**
 * Anchor writes each `emit!` as a `Program data: <base64>` log line.
 *
 * Event discriminators carry no program name, so only lines logged while
 * *this* program is executing are read — another Anchor program in the same
 * transaction could emit an event with the same name.
 */
export const decodeEvents = (logs: readonly string[], programId: PublicKey): VevoEvent[] => {
  const out: VevoEvent[] = [];
  const id = programId.toBase58();
  const stack: string[] = [];
  for (const line of logs) {
    const invoke = /^Program (\S+) invoke \[\d+\]$/.exec(line);
    if (invoke?.[1]) {
      stack.push(invoke[1]);
      continue;
    }
    if (/^Program \S+ (success|failed)/.test(line)) {
      stack.pop();
      continue;
    }
    if (stack[stack.length - 1] !== id) continue;

    const match = /^Program data: (.+)$/.exec(line);
    if (!match?.[1]) continue;
    const data = Uint8Array.from(Buffer.from(match[1], "base64"));
    const r = new Reader(data);
    const is = (name: keyof typeof EVENT) => hasDiscriminator(data, EVENT[name]);

    if (is("Deposited")) out.push({ name: "Deposited", owner: r.pubkey(), amount: r.u64() });
    else if (is("Withdrawn")) out.push({ name: "Withdrawn", owner: r.pubkey(), amount: r.u64() });
    else if (is("LiquidityAdded"))
      out.push({ name: "LiquidityAdded", provider: r.pubkey(), amount: r.u64(), shares: r.u128() });
    else if (is("LiquidityRemoved"))
      out.push({ name: "LiquidityRemoved", provider: r.pubkey(), shares: r.u128(), amount: r.u64() });
    else if (is("PositionOpened"))
      out.push({
        name: "PositionOpened",
        owner: r.pubkey(),
        market: r.pubkey(),
        isLong: r.bool(),
        margin: r.u64(),
        notional: r.u64(),
        entryPrice: r.u128(),
        fee: r.u64(),
      });
    else if (is("MarginAdded"))
      out.push({ name: "MarginAdded", owner: r.pubkey(), market: r.pubkey(), amount: r.u64(), margin: r.u64() });
    else if (is("PositionClosed"))
      out.push({
        name: "PositionClosed",
        owner: r.pubkey(),
        market: r.pubkey(),
        exitPrice: r.u128(),
        payout: r.u64(),
        pnl: r.i128(),
        funding: r.i128(),
        fee: r.u64(),
      });
    else if (is("PositionReduced"))
      out.push({
        name: "PositionReduced",
        owner: r.pubkey(),
        market: r.pubkey(),
        exitPrice: r.u128(),
        closedNotional: r.u64(),
        payout: r.u64(),
        pnl: r.i128(),
        funding: r.i128(),
        fee: r.u64(),
      });
    else if (is("PositionLiquidated"))
      out.push({
        name: "PositionLiquidated",
        owner: r.pubkey(),
        market: r.pubkey(),
        liquidator: r.pubkey(),
        exitPrice: r.u128(),
        reward: r.u64(),
      });
    else if (is("ReferenceTaken"))
      out.push({ name: "ReferenceTaken", market: r.pubkey(), price: r.u128(), at: Number(r.i64()) });
  }
  return out;
};

// ------------------------------------------------------------------------ math
//
// The ticket's arithmetic, identical to programs/vevo/src/math.rs. BigInt
// division truncates toward zero, as Rust's integer division does.

export const fee = (notional: bigint): bigint => (notional * FEE_BPS) / BPS;
export const maintenance = (notional: bigint): bigint => (notional * MAINTENANCE_BPS) / BPS;

export const pnl = (notional: bigint, entry: bigint, mark: bigint, isLong: boolean): bigint => {
  if (entry === 0n) return 0n;
  const gross = (notional * (mark - entry)) / entry;
  return isLong ? gross : -gross;
};

export const equity = (margin: bigint, positionPnl: bigint, funding: bigint): bigint => margin + positionPnl - funding;

export const accruedFunding = (notional: bigint, indexNow: bigint, indexAtEntry: bigint): bigint =>
  (notional * (indexNow - indexAtEntry)) / WAD;

export const payout = (margin: bigint, positionPnl: bigint, funding: bigint, exitFee: bigint, cap: bigint): bigint => {
  const net = margin + positionPnl - funding - exitFee;
  if (net <= 0n) return 0n;
  return net > cap ? cap : net;
};

const skew = (longOi: bigint, shortOi: bigint, skewScale: bigint) => {
  const longsPay = longOi > shortOi;
  const gap = longsPay ? longOi - shortOi : shortOi - longOi;
  const ratio = (gap * WAD) / skewScale;
  return { longsPay, ratio: ratio > WAD ? WAD : ratio };
};

/** Signed rate per 8h, 1e18. Positive: longs pay. */
export const fundingRate = (longOi: bigint, shortOi: bigint, skewScale: bigint): bigint => {
  if (skewScale === 0n || longOi === 0n || shortOi === 0n) return 0n;
  const { longsPay, ratio } = skew(longOi, shortOi, skewScale);
  const m = (ratio * MAX_FUNDING_RATE) / WAD;
  return longsPay ? m : -m;
};

/** The funding indices as they will be after accruing to `now` (unix seconds). */
export const projectedFunding = (market: MarketAccount, now: number): { long: bigint; short: bigint } => {
  const elapsed = BigInt(Math.max(0, now - market.lastAccrual));
  const { longOpenInterest: l, shortOpenInterest: s, skewScale } = market;
  if (elapsed === 0n || skewScale === 0n || l === 0n || s === 0n) {
    return { long: market.fundingLong, short: market.fundingShort };
  }
  const { longsPay, ratio } = skew(l, s, skewScale);
  const magnitude = (((ratio * MAX_FUNDING_RATE) / WAD) * elapsed) / FUNDING_WINDOW;
  const m = longsPay ? magnitude : -magnitude;
  return { long: market.fundingLong + m, short: market.fundingShort - m };
};

/**
 * The mark at which equity falls to maintenance. Solving
 * `margin + notional (P - E)/E s - funding = maintenance` for P.
 */
export const liquidationPrice = (
  margin: bigint,
  notional: bigint,
  entry: bigint,
  funding: bigint,
  isLong: boolean,
): bigint => {
  if (notional === 0n || entry === 0n) return 0n;
  const shortfall = maintenance(notional) + funding - margin;
  const ratio = (shortfall * WAD) / notional;
  const delta = isLong ? ratio : -ratio;
  const price = (entry * (WAD + delta)) / WAD;
  return price > 0n ? price : 0n;
};

/** Everything a screen needs about one position, priced at `mark` and `now`. */
export const positionView = (position: PositionAccount, market: MarketAccount, mark: bigint, now: number) => {
  const index = projectedFunding(market, now);
  const funding = accruedFunding(position.notional, position.isLong ? index.long : index.short, position.entryFunding);
  const result = pnl(position.notional, position.entryPrice, mark, position.isLong);
  const value = equity(position.margin, result, funding);
  const floor = maintenance(position.notional);
  return {
    pnl: result,
    funding,
    equity: value,
    maintenance: floor,
    liquidationPrice: liquidationPrice(position.margin, position.notional, position.entryPrice, funding, position.isLong),
    liquidatable: value <= floor,
  };
};
