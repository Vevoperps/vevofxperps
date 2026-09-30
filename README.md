<h1>vevo</h1>

Perpetual futures on 64 world currencies, funded and paid out in USDC on Solana.

[Website](https://vevoperps.com) · [Docs](https://vevoperps.com/docs) · [Trading guide](https://vevoperps.com/docs/trading)

## Why vevo

- **Currencies nobody else lists.** The majors, and the naira, the dong, the tenge, the guarani. 64 pairs across 75 countries, every one quoted against the US dollar.
- **One balance, every market.** Deposit USDC once from any Solana wallet. The same balance margins a position on any pair.
- **Up to 25x, with the numbers up front.** Size, fee, liquidation price and the most a position can ever pay are all shown before you confirm.
- **One click per trade.** Sign in once with your wallet (a message, not a transaction). After that, orders fill instantly with no wallet prompt and no network fee.
- **No order book and no queue.** Fills happen at the venue's mark against a pool, so there is no counterparty to wait for.

## How it works

The engine is peer to pool. The pool is the counterparty to every trade, and each open position has its payout cap reserved out of the pool before it opens, so what a trader is promised is set aside rather than hoped for.

```
notional     = margin x leverage
fee          = 0.05% of notional, each way
liquidation  = entry x (1 - (1 / leverage - 0.005))
max payout   = 10 x margin, fixed when the position opens
```

Money moves on Solana; trading happens in the venue's ledger.

- **Deposits** are plain USDC transfers from the user's wallet to the venue's treasury, credited once the transaction is final. A transfer sent straight from a wallet, outside the site, is found and credited the same way.
- **Withdrawals** go only to the wallet that signed in. Amounts inside the automatic limits are sent within a minute; larger ones are checked by hand first.
- **Positions, balances and the pool** are kept by the vevo server in Postgres, with every change made under one lock and in one transaction.
- **Prices** come from conventional FX rates, refreshed for all 64 pairs every 15 seconds. A move larger than the per-update limit is walked in steps rather than jumped, and a stale pair refuses orders instead of filling at an old price.

Funding is charged against the skew between long and short interest, capped at 0.75% per 8 hours.

## Layout

```
src/                the site and the trading app (Next.js, TypeScript)
backend/
  server/           the venue: ledger, prices, liquidations, deposits, withdrawals, API (Node, Postgres)
  shared/           the market table every part reads
  solana/           the same rules as an on-chain Anchor program (not deployed; kept for later)
```

## Build from source

```bash
yarn install
yarn dev
```

Before opening a pull request:

```bash
npx tsc --noEmit
npx eslint src/
yarn build
```

The app is pointed at a venue entirely through the environment:

```
NEXT_PUBLIC_API_URL=https://<your server>
NEXT_PUBLIC_CLUSTER=mainnet
```

With no server configured the app renders as a read only preview and says so on every screen, rather than showing live buttons over a venue that is not there.

## Server

```bash
cd backend/server
npm install
npm test            # the engine's handbook tests; the ledger tests need DATABASE_URL
npm run build
node dist/index.js
```

Copy `.env.example` and fill it in. `TREASURY_KEY` is the hot wallet that receives deposits and signs withdrawals: use a wallet for nothing else, holding a little SOL for fees. `WITHDRAW_MAX_SINGLE` and `WITHDRAW_MAX_DAILY` bound what can leave it without an admin's approval.

On Railway the service builds from `backend/` with `server/Dockerfile` (see `backend/railway.json`), next to a Postgres service.

## Security

The code has not been audited. The venue is young and its pool is small.

Two properties are worth knowing before depositing. Deposited USDC is held by the venue in its treasury wallet until it is withdrawn, so using the venue means trusting its operators with that balance. And every position's payout is capped at ten times its margin, fixed at the moment it opens, which is what bounds the pool's loss and is reserved up front.

Found something? See [SECURITY.md](SECURITY.md).

## License

All rights reserved. See [LICENSE.md](LICENSE.md).
