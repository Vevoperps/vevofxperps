/**
 * The ledger against a real Postgres: what the engine tests cannot show —
 * that the database round-trips every number exactly, that a deposit is
 * credited once however often it is confirmed, that withdrawals respect the
 * limits, that a refused operation leaves no trace, and that sign-in accepts
 * only a real wallet signature.
 *
 * Needs DATABASE_URL (CI starts a Postgres service). Skipped without it.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

const DATABASE_URL = process.env.DATABASE_URL;

const USDC = 1_000_000n;
const usdc = (whole: number | bigint): bigint => BigInt(whole) * USDC;
const WAD = 10n ** 18n;

describe("ledger (postgres)", { skip: !DATABASE_URL }, () => {
  // Configure before any module reads the environment.
  process.env.RPC_URL = "http://127.0.0.1:8899";
  process.env.TREASURY_KEY = JSON.stringify(Array.from(Keypair.generate().secretKey));
  process.env.SESSION_SECRET = "s".repeat(40);
  process.env.ADMIN_TOKEN = "a".repeat(40);
  process.env.WITHDRAW_MAX_SINGLE = "100";
  process.env.WITHDRAW_MAX_DAILY = "150";
  process.env.MIN_TRANSFER = "1";

  let db: typeof import("../src/db.js");
  let ops: typeof import("../src/ops.js");
  let markets: typeof import("../src/markets.js");
  let auth: typeof import("../src/auth.js");
  let views: typeof import("../src/views.js");

  const lp = Keypair.generate().publicKey.toBase58();
  const trader = Keypair.generate().publicKey.toBase58();

  before(async () => {
    db = await import("../src/db.js");
    ops = await import("../src/ops.js");
    markets = await import("../src/markets.js");
    auth = await import("../src/auth.js");
    views = await import("../src/views.js");
    await db.pool.query("DROP TABLE IF EXISTS pool, markets, traders, positions, activity, deposits, withdrawals, nonces, kv CASCADE");
    await db.migrate();
    assert.equal(await markets.listMarkets(), 64);
    assert.equal(await markets.listMarkets(), 0, "listing twice adds nothing");
  });

  after(async () => {
    await db.pool.end();
  });

  it("credits a deposit once, however often it is confirmed", async () => {
    assert.equal(await ops.creditDeposit("sigA", lp, usdc(10_000)), true);
    assert.equal(await ops.creditDeposit("sigA", lp, usdc(10_000)), false);
    assert.equal(await ops.creditDeposit("sigB", trader, usdc(1_000)), true);
    const account = await views.accountView(trader).catch(() => null);
    // The wallet read goes to the RPC, which is not running here; the ledger part is what matters.
    void account;
    const row = await db.read((tx) => tx.trader(trader));
    assert.equal(row.balance, usdc(1_000));
  });

  it("moves free balance into the pool for shares", async () => {
    await ops.addLiquidity(lp, usdc(10_000));
    const pool = await db.read((tx) => tx.pool());
    assert.equal(pool.assets, usdc(10_000));
    assert.equal(pool.shares, WAD);
  });

  it("opens and closes through the database with the handbook's numbers", async () => {
    const at = ops.now();
    await ops.postMarks(new Map([["USDJPY", 150n * WAD]]));
    await ops.openPosition(trader, "USDJPY", true, usdc(100), 10);
    assert.equal((await db.read((tx) => tx.trader(trader))).balance, 899_500_000n);
    const pool = await db.read((tx) => tx.pool());
    assert.equal(pool.reserved, usdc(900));
    assert.equal(pool.assets, 10_000_500_000n);

    await ops.postMarks(new Map([["USDJPY", 156n * WAD]])); // +4%
    await ops.reducePosition(trader, "USDJPY", usdc(500));
    assert.equal((await db.read((tx) => tx.trader(trader))).balance, 899_500_000n + 69_750_000n);
    await ops.reducePosition(trader, "USDJPY", "all");
    assert.equal((await db.read((tx) => tx.trader(trader))).balance, 899_500_000n + 2n * 69_750_000n);
    assert.equal(await db.read((tx) => tx.position(trader, "USDJPY")), null);
    assert.ok(ops.now() >= at);
  });

  it("leaves no trace when an operation is refused", async () => {
    const before = await db.read((tx) => tx.trader(trader));
    await assert.rejects(ops.openPosition(trader, "USDJPY", true, usdc(10), 26), /LeverageTooHigh/);
    await assert.rejects(ops.openPosition(trader, "USDGBP", true, usdc(10), 2), /NoFeed/);
    const after = await db.read((tx) => tx.trader(trader));
    assert.deepEqual(after, before);
  });

  it("queues withdrawals inside the limits and holds the rest for review", async () => {
    const small = await ops.requestWithdrawal(trader, usdc(90));
    assert.equal(small.status, "queued");
    const second = await ops.requestWithdrawal(trader, usdc(90)); // 180 > daily 150
    assert.equal(second.status, "review");
    const large = await ops.requestWithdrawal(trader, usdc(101)); // > single 100
    assert.equal(large.status, "review");
    await assert.rejects(ops.requestWithdrawal(trader, usdc(1_000_000)), /InsufficientBalance/);
  });

  it("returns a rejected withdrawal to the balance, once", async () => {
    const { rows } = await db.pool.query("SELECT id, amount FROM withdrawals WHERE status = 'review' ORDER BY id LIMIT 1");
    const id = String(rows[0].id);
    const before = (await db.read((tx) => tx.trader(trader))).balance;
    assert.equal(await ops.rejectWithdrawal(id, "test"), true);
    assert.equal(await ops.rejectWithdrawal(id, "test"), false);
    const after = (await db.read((tx) => tx.trader(trader))).balance;
    assert.equal(after - before, BigInt(rows[0].amount));
  });

  it("keeps the ledger whole: everything owed equals everything that came in", async () => {
    const { rows } = await db.pool.query(
      `SELECT (SELECT SUM(balance) FROM traders) + (SELECT COALESCE(SUM(margin),0) FROM positions)
            + (SELECT assets FROM pool) + (SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE status <> 'rejected') AS owed,
              (SELECT SUM(amount) FROM deposits) AS deposited`,
    );
    assert.equal(BigInt(rows[0].owed), BigInt(rows[0].deposited));
  });

  it("signs in only with the wallet's own signature, and only once per nonce", async () => {
    const wallet = Keypair.generate();
    const who = wallet.publicKey.toBase58();
    const message = await auth.issueNonce(who);
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), wallet.secretKey));

    const stranger = Keypair.generate();
    const forged = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), stranger.secretKey));
    assert.equal(await auth.verifySignIn(who, message, forged), null);

    const token = await auth.verifySignIn(who, message, signature);
    assert.ok(token);
    assert.equal(auth.verifyToken(token as string), who);
    assert.equal(await auth.verifySignIn(who, message, signature), null, "a nonce works once");
    assert.equal(auth.verifyToken(`${token}x`), null);
  });
});
