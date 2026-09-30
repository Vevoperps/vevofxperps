import { config } from "./config.js";
import { migrate } from "./db.js";
import { startHttp } from "./http.js";
import { listMarkets } from "./markets.js";
import { ensureTreasuryAccount, treasury, treasuryToken } from "./solana.js";
import { startWorkers } from "./workers.js";

/**
 * The vevo server: ledger, prices, liquidations, deposits and withdrawals,
 * and the API the site talks to — one process.
 */

const main = async (): Promise<void> => {
  console.log(`[vevo] ${config.CLUSTER}, treasury ${treasury.publicKey.toBase58()} (USDC ${treasuryToken.toBase58()})`);
  console.log(
    `[vevo] withdrawals: automatic up to ${Number(config.WITHDRAW_MAX_SINGLE) / 1e6} USDC each, ${
      Number(config.WITHDRAW_MAX_DAILY) / 1e6
    } USDC per 24h; above that they wait for review`,
  );

  await migrate();
  const added = await listMarkets();
  if (added > 0) console.log(`[vevo] listed ${added} markets`);

  await ensureTreasuryAccount().catch((error: unknown) => {
    // Without SOL for the fee this fails; deposits then fail too, so say so loudly.
    console.error("[vevo] could not create the treasury USDC account — fund the treasury with a little SOL:", error);
  });

  startHttp();
  startWorkers();
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
