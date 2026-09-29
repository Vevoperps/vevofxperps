/**
 * Step 2: list every pair in `backend/shared/markets.json`.
 *
 * Safe to run twice: it reads which markets already exist and sends only the
 * missing ones, in table order — the order is what fixes each market's slot
 * in the marks account, and the keeper and the site both read that slot.
 */

import markets from "../../shared/markets.json";
import { dollars, setup, symbolBytes } from "./common";

interface Row {
  symbol: string;
  maxLeverage: number;
  skewScale: number;
  maxOpenInterest: number;
  minMargin: number;
}

const main = async () => {
  const { program, admin, config, market } = setup();

  let listed = 0;
  let skipped = 0;

  for (const row of markets as Row[]) {
    const address = market(row.symbol);
    if (await program.account.market.fetchNullable(address)) {
      skipped += 1;
      continue;
    }

    await program.methods
      .listMarket(
        symbolBytes(row.symbol),
        row.maxLeverage,
        dollars(row.skewScale),
        dollars(row.maxOpenInterest),
        dollars(row.minMargin),
      )
      .accountsPartial({ admin: admin.publicKey, config, market: address })
      .rpc();

    listed += 1;
    console.log(`listed ${row.symbol}`);
  }

  const state = await program.account.config.fetch(config);
  console.log(`done: ${listed} listed, ${skipped} already there, ${state.marketCount} on chain`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
