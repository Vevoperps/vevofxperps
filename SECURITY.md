# Security

## Status

The code in this repository has not been audited.

The venue runs on Solana mainnet and holds real funds. Anyone reading this
should weigh that plainly: the code is young, the pool is small, and no third
party has reviewed it.

## Reporting a vulnerability

Do not open a public issue for anything that could be used to take funds.

Report it through the contact form at
[vevoperps.com](https://vevoperps.com), or by direct message on X. Include
enough to reproduce it: the requests or transactions involved, and what an
attacker ends up holding.

You will get an answer. If the report is real, the affected markets are paused
while it is fixed, and you are credited unless you ask not to be.

## How funds are held

**Custody.** Deposited USDC sits in the venue's treasury wallet on Solana.
Balances, positions and the pool are kept in the venue's ledger. This is a
custodial design: users trust the operators with their deposited balance.

**Withdrawals.** A withdrawal goes only to the wallet that signed in, and a
session is opened only by that wallet's own signature over a one-time nonce.
Withdrawals inside fixed limits (per request and per 24 hours) are sent
automatically; anything above them waits for a manual check. The limits bound
what a compromised server could send without anyone noticing.

**Deposits.** Only USDC transfers into the treasury's own USDC account, signed
by an ordinary wallet, are credited, each once. Transfers paid out by a program
(a swap landing in the treasury, say) are not credited to anyone.

## What the design already bounds

**The mark is the venue's.** Prices come from conventional FX rates posted by
the venue itself, bounded by a staleness window and a per-update deviation cap.
It is a trusted role and should be read as one.

**The payout is capped.** Every position can return at most ten times its
margin, fixed when it opens, and that amount is reserved out of the pool before
the position exists. The venue's loss on any single position is known in
advance and set aside, so no run of winning trades can take more than was
reserved for it.
