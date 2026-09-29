import {LAMPORTS_PER_SOL} from "@solana/web3.js";

import {at, connection, every, loadConfig, programId, signer} from "./chain.js";
import {config} from "./config.js";
import {sweep} from "./liquidator.js";
import {pushPrices} from "./prices.js";
import {takeSnapshots} from "./snapshots.js";
import {serveWarm} from "./warm.js";

/**
 * The keeper, on Solana.
 *
 * Three loops: post FX marks where they are load bearing, liquidate what has
 * fallen through maintenance, and keep each market's 24h reference fresh.
 *
 * **This keeper sets the mark.** It is the program's named publisher, and the
 * price it posts is the price positions fill and liquidate at. That is said on
 * every start rather than buried in a README.
 *
 * Run:  node --env-file=.env dist/index.js
 *       node --env-file=.env dist/index.js --once
 */

const once = process.argv.includes("--once");

const main = async (): Promise<void> => {
  const venue = await loadConfig();
  const lamports = await connection.getBalance(signer.publicKey);

  console.log("vevo keeper (solana)");
  console.log(`  rpc        ${new URL(config.RPC_URL).host}`);
  console.log(`  program    ${programId.toBase58()}`);
  console.log(`  config     ${at.config.toBase58()}`);
  console.log(`  keeper     ${signer.publicKey.toBase58()}`);
  console.log(`  balance    ${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`  markets    ${venue.marketCount}`);
  console.warn("  !! this keeper SETS the mark: it is the publisher positions fill and liquidate against");

  if (!venue.publisher.equals(signer.publicKey)) {
    throw new Error(
      `KEEPER_KEY is ${signer.publicKey.toBase58()} but the program's publisher is ${venue.publisher.toBase58()}`,
    );
  }
  if (lamports < 0.01 * LAMPORTS_PER_SOL) {
    console.warn("  !! under 0.01 SOL: top the keeper wallet up before it runs dry");
  }

  if (once) {
    await pushPrices();
    await sweep();
    await takeSnapshots();
    return;
  }

  // Not in --once mode: an open HTTP server would keep the process alive.
  serveWarm();

  await Promise.all([
    every(config.PRICE_INTERVAL, "prices", pushPrices),
    every(config.LIQUIDATION_INTERVAL, "liquidator", sweep),
    every(config.SNAPSHOT_INTERVAL, "reference", takeSnapshots),
  ]);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
