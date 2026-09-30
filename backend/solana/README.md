# vevo on Solana

The venue as one Anchor program, a keeper, and the site's chain layer.

```
backend/
  solana/                 the Anchor program, its tests and the operator scripts
    programs/vevo/src/    lib.rs (instructions), state.rs, engine.rs, math.rs
    tests/vevo.ts         the handbook as assertions
    scripts/              init, list-markets, provide-liquidity
    ci/solana.yml         the GitHub Actions workflow (copy into .github/workflows)
  keeper-solana/          posts FX marks, liquidates, keeps the 24h reference
  shared/
    markets.json          the 64 pairs (one table for everything)
    solana/vevo-client.ts the hand-written program client (keeper + site)
src/lib/chain/            the site's chain layer, on Solana
```

Settlement is USDC (6 decimals). Prices are 1e18. Every number is the same as
the EVM venue: 0.05% fee each way, 0.5% maintenance, 10x payout cap with 9x
reserved from the pool, funding capped at 0.75% per 8h, liquidator takes half
of the equity left.

## 1. Build and test

**On GitHub (no local toolchain).** Copy `backend/solana/ci/solana.yml` to
`.github/workflows/solana.yml`, push, and read the "solana program" run.

**Locally (Windows → WSL2 Ubuntu).**

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
# restart the terminal, then:
avm install 1.2.0 && avm use 1.2.0
cd /mnt/d/dev/fxperps/backend/solana
yarn install
anchor build && anchor keys sync && anchor build        # IDL + TypeScript types
cargo build-sbf --manifest-path programs/vevo/Cargo.toml --sbf-out-dir target/deploy
```

**Always deploy the `.so` from `cargo build-sbf`.** Anchor 1.2's own build emits
an SBPF v3 binary (ELF flags `0x3`) that the current validators reject with
"ELF error: invalid file header"; `cargo build-sbf` emits SBPF v0, which is what
CI deploys and tests (22 passing).

To run the tests locally, do what CI does: start `solana-test-validator`,
`solana program deploy target/deploy/vevo.so --program-id target/deploy/vevo-keypair.json`,
then

```bash
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json \
  NODE_OPTIONS=--no-experimental-strip-types \
  yarn run ts-mocha -p ./tsconfig.json -t 1000000 'tests/**/*.ts'
```

`anchor keys sync` writes the program id into `lib.rs` and `Anchor.toml` from
`target/deploy/vevo-keypair.json`. **Back that keypair up**: it is the program's
address. Never commit it.

## 2. Wallets

| Wallet    | Holds                    | Lives                         |
|-----------|--------------------------|-------------------------------|
| Admin     | SOL for deploy (~3-5)    | your machine only             |
| Keeper    | ~0.1 SOL for fees        | Railway env (`KEEPER_KEY`)    |

```bash
solana-keygen new -o ~/.config/solana/id.json        # admin (deploys, owns)
solana-keygen new -o ~/keeper.json                    # keeper (publisher)
solana-keygen pubkey ~/keeper.json                    # -> PUBLISHER
```

They must be different keys. `scripts/init.ts` refuses otherwise.

## 3. Deploy (devnet first)

```bash
solana config set --url devnet
solana airdrop 5                                   # devnet only
solana program deploy target/deploy/vevo.so --program-id target/deploy/vevo-keypair.json

cp .env.example .env                               # fill RPC_URL, USDC_MINT, PUBLISHER
yarn init-venue                                    # config, marks, vault
yarn list-markets                                  # 64 pairs, safe to re-run
POOL_LIQUIDITY=100 yarn provide-liquidity          # needs USDC in the admin wallet
```

Devnet USDC: <https://faucet.circle.com> (mint
`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`). Mainnet USDC:
`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

Only the wallet that deployed the program can run `init-venue` (it is checked
against the program's upgrade authority).

## 4. Keeper (Railway)

```bash
cd backend/keeper-solana
cp .env.example .env        # RPC_URL, PROGRAM_ID, KEEPER_KEY
npm install && npm run build
node --env-file=.env dist/index.js --once     # one round, to see it work
```

Railway: a new service from this repo, root directory `backend`, config file
`keeper-solana/railway.json`, and the variables from `.env.example`. The old
EVM keeper uses `backend/railway.json`; do not point the new service at it.

## 5. Site (Vercel)

Environment variables:

```
NEXT_PUBLIC_CLUSTER=devnet            # or mainnet
NEXT_PUBLIC_PROGRAM_ID=<program id>
NEXT_PUBLIC_USDC_MINT=<mint>
NEXT_PUBLIC_RPC_URL=<rpc url>         # browser uses it: domain-restricted key
SOLANA_RPC_URL=<keyed rpc>            # optional, server only
KEEPER_URL / WARM_SECRET              # unchanged
```

Remove the old `NEXT_PUBLIC_ENGINE_ADDRESS`, `NEXT_PUBLIC_SETTLEMENT_ADDRESS`,
`NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_DEPLOY_BLOCK`.

## 6. Mainnet

The same steps against mainnet (`solana config set --url <mainnet rpc>`), a paid RPC, mainnet USDC and
real USDC in the pool. Then consider moving the upgrade authority to a
multisig (Squads) or freezing the program.

## Known limits

- The keeper decides the mark (it is the publisher). Stated in the program
  header and on every keeper start.
- A market with open interest needs a fresh mark to close or liquidate; the
  keeper keeps every such market priced.
- Not audited.
