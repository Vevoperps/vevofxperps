/**
 * Step 3: put USDC into the pool. Until the pool holds liquidity every
 * `open_position` fails on its reservation, so nothing trades.
 *
 * Spends real USDC from the admin wallet's token account on mainnet.
 *
 *   POOL_LIQUIDITY   whole dollars to add
 */

import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import { dollars, required, setup } from "./common";

const main = async () => {
  const { program, admin, config, vault, trader } = setup();
  const mint = new PublicKey(required("USDC_MINT"));
  const amount = Number(required("POOL_LIQUIDITY"));

  const ownerToken = getAssociatedTokenAddressSync(mint, admin.publicKey);

  const signature = await program.methods
    .addLiquidity(dollars(amount))
    .accountsPartial({
      owner: admin.publicKey,
      config,
      trader: trader(admin.publicKey),
      mint,
      ownerToken,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  const state = await program.account.config.fetch(config);
  console.log(`added ${amount} USDC; pool now ${state.poolAssets.toString()} base units (tx ${signature})`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
