import { PublicKey } from "@solana/web3.js";

import { config } from "./config.js";
import { getKv, pool as db, positionFromRow, read, setKv } from "./db.js";
import { positionView } from "./engine.js";
import { markets as table } from "./markets.js";
import { creditDeposit, liquidateOne, now, postMarks } from "./ops.js";
import { broadcast, connection, ensureTreasuryAccount, incomingTransfers, outcome, prepareWithdrawal, treasuryToken } from "./solana.js";

/**
 * The loops that keep the venue running. Each one is independent, logs its
 * own failures and tries again next round; none of them can stop another.
 */

const every = (name: string, seconds: number, task: () => Promise<void>): void => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      console.error(`[${name}]`, error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(() => void tick(), seconds * 1000);
};

// -------------------------------------------------------------------- prices

const WAD_PER_UNIT = 10n ** 9n;

/** A float rate to 1e18 without losing the digits of large rates (USDVND ~26,000). */
const toWad = (rate: number): bigint | null => {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const scaled = Math.round(rate * 1e9);
  return Number.isSafeInteger(scaled) ? BigInt(scaled) * WAD_PER_UNIT : null;
};

let lastQuote = { at: 0, age: 0, count: 0 };
export const quoteStatus = () => lastQuote;

export const pushPrices = async (): Promise<void> => {
  const response = await fetch(`${config.FX_URL}?base=USD`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`fx ${response.status}`);
  const body = (await response.json()) as { timestamp?: number; rates?: Record<string, number> };
  const rates = body.rates ?? {};
  const age = body.timestamp ? Math.max(0, now() - body.timestamp) : 0;

  if (Object.keys(rates).length === 0) throw new Error("fx source returned no rates");
  if (age > config.MAX_QUOTE_AGE) {
    console.warn(`[prices] quote is ${age}s old — not posting it as a fresh mark`);
    return;
  }

  const targets = new Map<string, bigint>();
  for (const market of table) {
    const rate = rates[market.symbol.slice(3)];
    const value = rate === undefined ? null : toWad(rate);
    if (value !== null) targets.set(market.symbol, value);
  }

  const posted = await postMarks(targets);
  // One line on the first round and then every ~5 minutes, so the log shows the feed is alive.
  if (lastQuote.at === 0 || now() - lastLogged >= 300) {
    console.log(`[prices] ${posted} marks posted, quote ${age}s old`);
    lastLogged = now();
  }
  lastQuote = { at: now(), age, count: posted };
};

let lastLogged = 0;

// -------------------------------------------------------------- liquidations

export const sweepLiquidations = async (): Promise<void> => {
  const at = now();
  const { positions, markets } = await read(async (tx) => {
    const [p, m] = await Promise.all([tx.query("SELECT * FROM positions"), tx.markets()]);
    return { positions: p.rows, markets: new Map(m.map((row) => [row.symbol, row])) };
  });

  for (const row of positions) {
    const position = positionFromRow(row as Record<string, unknown>);
    const market = markets.get(position.symbol);
    if (!market || market.mark.updatedAt === 0 || at > market.mark.updatedAt + config.MARK_MAX_AGE) continue;
    if (!positionView(position, market, market.mark.price, at).liquidatable) continue;
    try {
      if (await liquidateOne(position.address, position.symbol)) {
        console.log(`[liquidator] ${position.address} ${position.symbol} liquidated`);
      }
    } catch (error) {
      // Refused under the lock (the mark moved back, say): nothing to do.
      console.warn(`[liquidator] ${position.symbol}:`, error instanceof Error ? error.message : error);
    }
  }
};

// ------------------------------------------------------------------ deposits

const CURSOR = "deposit_cursor";

/**
 * Finds every transfer into the treasury, whether or not the site told us
 * about it — a user who sends USDC straight from their wallet is still
 * credited. Oldest first, and the cursor only moves past what was processed.
 */
let treasuryReady = false;

export const scanDeposits = async (): Promise<void> => {
  // Deposits land in the treasury's USDC account; until it exists (the
  // treasury needs a little SOL to create it) keep trying, round after round.
  if (!treasuryReady) {
    await ensureTreasuryAccount();
    treasuryReady = true;
    console.log(`[deposits] treasury USDC account ready: ${treasuryToken.toBase58()}`);
  }
  const until = (await getKv(CURSOR)) ?? undefined;
  const page = await connection.getSignaturesForAddress(treasuryToken, { until, limit: 100 }, "finalized");
  if (page.length === 0) return;

  for (const entry of [...page].reverse()) {
    if (entry.err === null) {
      const transfers = await incomingTransfers(entry.signature);
      if (transfers === null) return; // Not visible yet; resume from the same cursor next round.
      for (const transfer of transfers) {
        if (await creditDeposit(entry.signature, transfer.address, transfer.amount)) {
          console.log(`[deposits] ${transfer.address} +${transfer.amount} (${entry.signature})`);
        }
      }
    }
    await setKv(CURSOR, entry.signature);
  }
};

// --------------------------------------------------------------- withdrawals

const MAX_ATTEMPTS = 5;

/**
 * Sends queued withdrawals one at a time. The signed transaction's signature
 * is stored before it is broadcast, and a row in `sending` is only retried
 * once its blockhash has expired without it landing — so a crash at any
 * point cannot pay the same withdrawal twice.
 */
export const processWithdrawals = async (): Promise<void> => {
  // First settle anything already in flight.
  const { rows: inFlight } = await db.query(
    "SELECT id, signature, last_valid_height, attempts FROM withdrawals WHERE status = 'sending' ORDER BY id",
  );
  for (const row of inFlight as { id: string; signature: string; last_valid_height: string; attempts: number }[]) {
    const state = await outcome(row.signature, Number(row.last_valid_height));
    if (state === "landed") {
      await db.query("UPDATE withdrawals SET status = 'sent', updated_at = now() WHERE id = $1", [row.id]);
      console.log(`[withdrawals] #${row.id} sent (${row.signature})`);
    } else if (state === "expired" || state === "failed") {
      const next = row.attempts >= MAX_ATTEMPTS ? "review" : "queued";
      await db.query(
        "UPDATE withdrawals SET status = $2, signature = NULL, error = $3, updated_at = now() WHERE id = $1",
        [row.id, next, `attempt ${row.attempts} ${state}`],
      );
      console.warn(`[withdrawals] #${row.id} ${state}; ${next}`);
    }
  }

  const { rows } = await db.query("SELECT id, address, amount, attempts FROM withdrawals WHERE status = 'queued' ORDER BY id LIMIT 5");
  for (const row of rows as { id: string; address: string; amount: string; attempts: number }[]) {
    const prepared = await prepareWithdrawal(new PublicKey(row.address), BigInt(row.amount));
    const claimed = await db.query(
      `UPDATE withdrawals SET status = 'sending', signature = $2, last_valid_height = $3, attempts = attempts + 1, updated_at = now()
       WHERE id = $1 AND status = 'queued'`,
      [row.id, prepared.signature, prepared.lastValidBlockHeight],
    );
    if (claimed.rowCount !== 1) continue;
    try {
      await broadcast(prepared.raw);
      console.log(`[withdrawals] #${row.id} broadcast ${prepared.signature}`);
    } catch (error) {
      // Left in `sending`: the status check above decides once the blockhash expires.
      console.warn(`[withdrawals] #${row.id} broadcast failed:`, error instanceof Error ? error.message : error);
    }
  }
};

export const startWorkers = (): void => {
  every("prices", config.PRICE_INTERVAL, pushPrices);
  every("liquidator", config.LIQUIDATION_INTERVAL, sweepLiquidations);
  every("deposits", config.DEPOSIT_SCAN_INTERVAL, scanDeposits);
  every("withdrawals", config.WITHDRAW_INTERVAL, processWithdrawals);
};
