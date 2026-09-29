/**
 * Step 1 of a deployment: create the config, the marks account and the USDC
 * vault. Run once per cluster, after `anchor deploy`, with the same wallet
 * that deployed: only the program's upgrade authority may initialise it.
 *
 *   PUBLISHER         the keeper's public key — a separate, gas-only wallet
 *   ORACLE_MAX_AGE    seconds a mark stays usable (default 900)
 *   ORACLE_MAX_DEVIATION_BPS  most one post may move a fresh mark (default 500)
 */

import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import { required, setup } from "./common";

const main = async () => {
  const { program, admin, config, marks, vault } = setup();

  const mint = new PublicKey(required("USDC_MINT"));
  const publisher = new PublicKey(required("PUBLISHER"));
  const maxAge = Number(process.env.ORACLE_MAX_AGE ?? 900);
  const maxDeviation = Number(process.env.ORACLE_MAX_DEVIATION_BPS ?? 500);

  if (publisher.equals(admin.publicKey)) {
    throw new Error("PUBLISHER is the admin key. Use a separate keeper wallet: the keeper key lives on a server.");
  }

  const existing = await program.account.config.fetchNullable(config);
  if (existing) {
    console.log(`already initialised: config ${config.toBase58()}`);
    return;
  }

  const signature = await program.methods
    .initialize(publisher, maxAge, maxDeviation)
    .accountsPartial({
      admin: admin.publicKey,
      program: program.programId,
      programData: PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
      )[0],
      config,
      marks,
      mint,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("initialised");
  console.log(`  program    ${program.programId.toBase58()}`);
  console.log(`  config     ${config.toBase58()}`);
  console.log(`  marks      ${marks.toBase58()}`);
  console.log(`  vault      ${vault.toBase58()}`);
  console.log(`  mint       ${mint.toBase58()}`);
  console.log(`  publisher  ${publisher.toBase58()}`);
  console.log(`  tx         ${signature}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
