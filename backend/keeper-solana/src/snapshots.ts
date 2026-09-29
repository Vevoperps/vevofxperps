import {chainTime, explain, ix, loadConfig, loadMarkets, loadMarks, oneAtATime, send} from "./chain.js";
import {REFERENCE_WINDOW} from "./vevo-client.js";

/**
 * Refreshes each market's 24h reference mark, so the app can print a real
 * 24h change without an indexer.
 *
 * Only markets whose window is up *and* whose mark is fresh are sent — the
 * program refuses a reference taken from a stale mark, and a no-op snapshot
 * would only spend a fee. Up to eight go in one transaction.
 */

const BATCH = 8;

export const takeSnapshots = async (): Promise<void> => {
  const [venue, marks, markets, now] = await Promise.all([loadConfig(), loadMarks(), loadMarkets(), chainTime()]);

  const due = [...markets.values()].filter(({account}) => {
    const windowUp = account.referenceAt === 0 || now >= account.referenceAt + REFERENCE_WINDOW;
    const slot = marks[account.index];
    const fresh = !!slot && slot.updatedAt !== 0 && now <= slot.updatedAt + venue.maxAge;
    return windowUp && fresh;
  });

  if (due.length === 0) return;

  for (let i = 0; i < due.length; i += BATCH) {
    const slice = due.slice(i, i + BATCH);
    try {
      const signature = await oneAtATime(() =>
        send(slice.map(({address}) => ix.snapshot(address)), {units: 300_000, simulateFirst: true}),
      );
      console.log(`[ref] ${slice.map(({account}) => account.symbol).join(" ")} referenced, tx ${signature}`);
    } catch {
      // One mark went stale between the check and the send, and it takes the
      // whole batch down with it. Retry one at a time so the rest still land.
      for (const one of slice) {
        try {
          await oneAtATime(() => send([ix.snapshot(one.address)], {units: 100_000, simulateFirst: true}));
        } catch (error) {
          console.warn(`[ref] ${one.account.symbol}: ${explain(error)}`);
        }
      }
    }
  }
};
