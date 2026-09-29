/**
 * The handbook, as assertions — the Solana port of `PerpEngine.t.sol`.
 *
 * Every number checked here is one the site prints: the 0.05% fee each way,
 * the 10x payout cap, the pool reserving nine tenths of it, the 9.5% liquidation
 * distance at 10x, the half-of-equity liquidator reward, and the one that
 * matters most — the USDC the vault holds equals every ledger that claims it.
 *
 * Run with `anchor test` from backend/solana.
 */

import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import { TOKEN_PROGRAM_ID, createAccount, createMint, getAccount, mintTo } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

import type { Vevo } from "../target/types/vevo";

const USDC = 1_000_000n;
const WAD = 10n ** 18n;

const usdc = (whole: number | bigint): BN => new BN((BigInt(whole) * USDC).toString());
const wad = (value: bigint): BN => new BN(value.toString());
/** A price like 150.25 as 1e18, from thousandths to stay exact. */
const price = (thousandths: bigint): bigint => (thousandths * WAD) / 1000n;

const symbolBytes = (symbol: string): number[] => {
  const out = new Array<number>(8).fill(0);
  Buffer.from(symbol, "ascii").forEach((byte, i) => (out[i] = byte));
  return out;
};

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Asserts that a call fails — with the named program error when one is given.
 * Failures raised outside the program (an account that already exists) carry
 * no program error name, so those pass `null`.
 */
const rejects = async (call: Promise<unknown>, name: string | null): Promise<void> => {
  try {
    await call;
  } catch (error) {
    if (name) expect(String(error)).to.contain(name);
    return;
  }
  expect.fail(`expected ${name ?? "a failure"}`);
};

describe("vevo", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Vevo as Program<Vevo>;
  const connection = provider.connection;
  const admin = provider.wallet as anchor.Wallet;

  const publisher = Keypair.generate();
  const trader = Keypair.generate();
  const lp = Keypair.generate();
  const liquidator = Keypair.generate();

  const pda = (...seeds: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];

  const config = pda(Buffer.from("config"));
  const marks = pda(Buffer.from("marks"));
  const vault = pda(Buffer.from("vault"));
  const market = (symbol: string) => pda(Buffer.from("market"), Buffer.from(symbolBytes(symbol)));
  const traderAccount = (owner: PublicKey) => pda(Buffer.from("trader"), owner.toBuffer());
  const positionAccount = (marketKey: PublicKey, owner: PublicKey) =>
    pda(Buffer.from("position"), marketKey.toBuffer(), owner.toBuffer());

  /** Where the upgradeable loader keeps this program's upgrade authority. */
  const programData = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
  )[0];

  const JPY = market("USDJPY");
  const EUR = market("USDEUR");

  let mint: PublicKey;
  let traderToken: PublicKey;
  let lpToken: PublicKey;

  const balanceOf = async (owner: PublicKey): Promise<bigint> => {
    const account = await program.account.trader.fetchNullable(traderAccount(owner));
    return account ? BigInt(account.balance.toString()) : 0n;
  };

  const post = (indices: number[], prices: bigint[], signer: Keypair = publisher) =>
    program.methods
      .postMarks(Buffer.from(indices), prices.map(wad))
      .accountsPartial({ publisher: signer.publicKey, config, marks })
      .signers([signer])
      .rpc();

  const open = (owner: Keypair, marketKey: PublicKey, isLong: boolean, margin: BN, leverage: number) =>
    program.methods
      .openPosition(isLong, margin, leverage)
      .accountsPartial({
        owner: owner.publicKey,
        config,
        marks,
        market: marketKey,
        trader: traderAccount(owner.publicKey),
        position: positionAccount(marketKey, owner.publicKey),
      })
      .signers([owner])
      .rpc();

  const reduce = (owner: Keypair, marketKey: PublicKey, notional: BN) =>
    program.methods
      .reducePosition(notional)
      .accountsPartial({
        owner: owner.publicKey,
        config,
        marks,
        market: marketKey,
        trader: traderAccount(owner.publicKey),
        position: positionAccount(marketKey, owner.publicKey),
      })
      .signers([owner])
      .rpc();

  const liquidate = (owner: PublicKey, marketKey: PublicKey) =>
    program.methods
      .liquidate()
      .accountsPartial({
        liquidator: liquidator.publicKey,
        config,
        marks,
        market: marketKey,
        position: positionAccount(marketKey, owner),
        owner,
        liquidatorTrader: traderAccount(liquidator.publicKey),
      })
      .signers([liquidator])
      .rpc();

  /** The solvency invariant: USDC held == free balances + pool + margin at risk. */
  const assertSolvent = async (openMargin: bigint) => {
    const held = (await getAccount(connection, vault)).amount;
    const state = await program.account.config.fetch(config);
    const balances =
      (await balanceOf(trader.publicKey)) + (await balanceOf(lp.publicKey)) + (await balanceOf(liquidator.publicKey));
    expect(held).to.equal(balances + BigInt(state.poolAssets.toString()) + openMargin);
  };

  before(async () => {
    for (const who of [trader, lp, liquidator, publisher]) {
      const signature = await connection.requestAirdrop(who.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(signature, "confirmed");
    }

    // A stand-in for USDC: same decimals, our own mint authority.
    mint = await createMint(connection, admin.payer, admin.publicKey, null, 6);
    traderToken = await createAccount(connection, admin.payer, mint, trader.publicKey);
    lpToken = await createAccount(connection, admin.payer, mint, lp.publicKey);
    await mintTo(connection, admin.payer, mint, traderToken, admin.payer, 1_000n * USDC);
    await mintTo(connection, admin.payer, mint, lpToken, admin.payer, 10_000n * USDC);

    await program.methods
      .initialize(publisher.publicKey, 60, 500)
      .accountsPartial({
        admin: admin.publicKey,
        program: program.programId,
        programData,
        config,
        marks,
        mint,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    for (const symbol of ["USDJPY", "USDEUR"]) {
      await program.methods
        .listMarket(symbolBytes(symbol), 25, usdc(2_000_000), usdc(5_000_000), usdc(10))
        .accountsPartial({ admin: admin.publicKey, config, market: market(symbol) })
        .rpc();
    }
  });

  describe("setup", () => {
    it("cannot be initialised twice, and not by a stranger", async () => {
      await rejects(
        program.methods
          .initialize(trader.publicKey, 60, 500)
          .accountsPartial({
            admin: trader.publicKey,
            program: program.programId,
            programData,
            config,
            marks,
            mint,
            vault,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([trader])
          .rpc(),
        null,
      );
    });
  });

  describe("oracle", () => {
    it("refuses the same market twice in one post", async () => {
      await rejects(post([0, 0], [price(150_000n), price(150_000n)]), "DuplicateMark");
    });

    it("refuses anyone but the publisher", async () => {
      await rejects(post([0], [price(150_000n)], trader), "NotPublisher");
    });

    it("posts marks by slot", async () => {
      await post([0, 1], [price(150_000n), price(900n)]);
      const state = await program.account.marks.fetch(marks);
      expect(state.slots[0].price.toString()).to.equal(price(150_000n).toString());
      expect(state.slots[1].price.toString()).to.equal(price(900n).toString());
    });

    it("refuses a move past the deviation limit", async () => {
      await rejects(post([0], [price(160_000n)]), "DeviationTooLarge");
    });
  });

  describe("balances and the pool", () => {
    it("takes liquidity in shares", async () => {
      await program.methods
        .addLiquidity(usdc(10_000))
        .accountsPartial({
          owner: lp.publicKey,
          config,
          trader: traderAccount(lp.publicKey),
          mint,
          ownerToken: lpToken,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([lp])
        .rpc();

      const state = await program.account.config.fetch(config);
      expect(state.poolAssets.toString()).to.equal(usdc(10_000).toString());
    });

    it("takes a deposit into the free balance", async () => {
      await program.methods
        .deposit(usdc(1_000))
        .accountsPartial({
          owner: trader.publicKey,
          config,
          trader: traderAccount(trader.publicKey),
          mint,
          ownerToken: traderToken,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      expect(await balanceOf(trader.publicKey)).to.equal(1_000n * USDC);
      await assertSolvent(0n);
    });
  });

  describe("a position, open to close", () => {
    it("opens at the mark, charges 0.05%, reserves nine tenths of the cap", async () => {
      await open(trader, JPY, true, usdc(100), 10);

      const position = await program.account.position.fetch(positionAccount(JPY, trader.publicKey));
      expect(position.notional.toString()).to.equal(usdc(1_000).toString());
      expect(position.payoutCap.toString()).to.equal(usdc(1_000).toString());

      // 1,000 - 100 margin - 0.50 fee
      expect(await balanceOf(trader.publicKey)).to.equal(899_500_000n);

      const state = await program.account.config.fetch(config);
      expect(state.poolReserved.toString()).to.equal(usdc(900).toString());
      expect(state.poolAssets.toString()).to.equal("10000500000");

      await assertSolvent(100n * USDC);
    });

    it("refuses a second position on the same market", async () => {
      await rejects(open(trader, JPY, true, usdc(10), 2), null);
    });

    it("closes half: half the margin, half the fee, the move on half", async () => {
      await post([0], [price(156_000n)]); // +4%
      await reduce(trader, JPY, usdc(500));

      // 50 margin + 20 pnl - 0.25 fee
      expect(await balanceOf(trader.publicKey)).to.equal(899_500_000n + 69_750_000n);

      const position = await program.account.position.fetch(positionAccount(JPY, trader.publicKey));
      expect(position.margin.toString()).to.equal(usdc(50).toString());
      await assertSolvent(50n * USDC);
    });

    it("closes the rest and returns the account's rent", async () => {
      await reduce(trader, JPY, usdc(500));
      expect(await balanceOf(trader.publicKey)).to.equal(899_500_000n + 2n * 69_750_000n);
      expect(await program.account.position.fetchNullable(positionAccount(JPY, trader.publicKey))).to.equal(null);

      const state = await program.account.config.fetch(config);
      expect(state.poolReserved.toString()).to.equal("0");
      await assertSolvent(0n);
    });
  });

  describe("liquidation", () => {
    it("is refused above the maintenance margin", async () => {
      await open(trader, JPY, true, usdc(100), 10);
      await post([0], [price(148_200n)]); // -5%
      await rejects(liquidate(trader.publicKey, JPY), "NotLiquidatable");
    });

    it("pays the liquidator half the equity left, 9.5% from entry at 10x", async () => {
      await post([0], [price(141_180n)]); // 156 x 0.905
      const before = await balanceOf(trader.publicKey);

      await liquidate(trader.publicKey, JPY);

      // Equity at the line is exactly the 5 USDC maintenance; half of it.
      expect(await balanceOf(liquidator.publicKey)).to.equal(2_500_000n);
      expect(await balanceOf(trader.publicKey)).to.equal(before);
      expect(await program.account.position.fetchNullable(positionAccount(JPY, trader.publicKey))).to.equal(null);
      await assertSolvent(0n);
    });
  });

  describe("reference, margin and the cap", () => {
    const setDeviation = (bps: number) =>
      program.methods.setOracleParams(60, bps).accountsPartial({ admin: admin.publicKey, config }).rpc();

    it("takes the first 24h reference at once, then waits a window", async () => {
      const snap = () =>
        program.methods.snapshot().accountsPartial({ config, marks, market: JPY }).rpc();
      await snap();
      const first = await program.account.market.fetch(JPY);
      expect(first.referencePrice.toString()).to.equal(price(141_180n).toString());
      await snap();
      const second = await program.account.market.fetch(JPY);
      expect(second.referenceAt.toString()).to.equal(first.referenceAt.toString());
    });

    it("adds margin without raising the cap or the reserve", async () => {
      await open(trader, JPY, true, usdc(20), 5); // 100 notional
      const reservedBefore = (await program.account.config.fetch(config)).poolReserved.toString();

      await program.methods
        .addMargin(usdc(10))
        .accountsPartial({
          owner: trader.publicKey,
          trader: traderAccount(trader.publicKey),
          position: positionAccount(JPY, trader.publicKey),
        })
        .signers([trader])
        .rpc();

      const position = await program.account.position.fetch(positionAccount(JPY, trader.publicKey));
      expect(position.margin.toString()).to.equal(usdc(30).toString());
      expect(position.payoutCap.toString()).to.equal(usdc(200).toString());
      expect((await program.account.config.fetch(config)).poolReserved.toString()).to.equal(reservedBefore);
      await assertSolvent(30n * USDC);
    });

    it("refuses a partial close that leaves a stub under the minimum margin", async () => {
      // 70 of 100 leaves 9 margin, under the market's 10.
      await rejects(reduce(trader, JPY, usdc(70)), "MarginTooSmall");
    });

    it("pays no more than the cap fixed at open, however far the mark runs", async () => {
      await setDeviation(0); // lift the per-post limit for a 4x move
      await post([0], [price(564_720n)]);
      const before = await balanceOf(trader.publicKey);

      await reduce(trader, JPY, usdc(100));

      // 30 margin + 300 pnl - 0.05 fee, capped at 10 x the 20 opened with.
      expect(await balanceOf(trader.publicKey)).to.equal(before + 200n * USDC);
      await assertSolvent(0n);

      await post([0], [price(141_180n)]);
      await setDeviation(500);
    });
  });

  describe("guards", () => {
    it("refuses a stale mark", async () => {
      await program.methods.setOracleParams(1, 500).accountsPartial({ admin: admin.publicKey, config }).rpc();
      await sleep(4_000);
      await rejects(open(trader, EUR, false, usdc(10), 2), "StalePrice");
      await program.methods.setOracleParams(60, 500).accountsPartial({ admin: admin.publicKey, config }).rpc();
    });

    it("refuses new positions on a paused market", async () => {
      await post([1], [price(900n)]);
      await program.methods
        .configureMarket(25, usdc(2_000_000), usdc(5_000_000), usdc(10), true)
        .accountsPartial({ admin: admin.publicKey, config, market: EUR })
        .rpc();
      await rejects(open(trader, EUR, false, usdc(10), 2), "MarketIsPaused");
    });

    it("refuses leverage above the market's cap", async () => {
      await post([0], [price(141_180n)]);
      await rejects(open(trader, JPY, true, usdc(10), 26), "LeverageTooHigh");
    });
  });

  describe("exits", () => {
    it("pays out the free balance", async () => {
      const free = await balanceOf(trader.publicKey);
      await program.methods
        .withdraw(new BN(free.toString()))
        .accountsPartial({
          owner: trader.publicKey,
          config,
          trader: traderAccount(trader.publicKey),
          mint,
          ownerToken: traderToken,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([trader])
        .rpc();

      expect(await balanceOf(trader.publicKey)).to.equal(0n);
      expect((await getAccount(connection, traderToken)).amount).to.equal(free);
    });

    it("redeems LP shares for their part of the pool", async () => {
      const lpState = await program.account.trader.fetch(traderAccount(lp.publicKey));
      await program.methods
        .removeLiquidity(lpState.shares)
        .accountsPartial({
          owner: lp.publicKey,
          config,
          trader: traderAccount(lp.publicKey),
          mint,
          ownerToken: lpToken,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([lp])
        .rpc();

      const state = await program.account.config.fetch(config);
      expect(state.poolShares.toString()).to.equal("0");
      expect(state.poolAssets.toString()).to.equal("0");
      await assertSolvent(0n);
    });
  });
});
