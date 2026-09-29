import {chainTime, connection, explain, ix, loadConfig, loadMarkets, loadMarks, oneAtATime, programId, send, signer} from "./chain.js";
import {decodePosition, discriminatorFilter, positionView} from "./vevo-client.js";

/**
 * Closes positions that have fallen through their maintenance margin.
 *
 * **A race we are allowed to lose.** `liquidate` is permissionless and pays
 * its caller half the equity left, so anybody may run this. Ours going down
 * means somebody else collects the fee, not that the venue stops.
 *
 * **Stateless.** Every round reads the open positions straight from the
 * program (one `getProgramAccounts` call filtered to position accounts),
 * prices each one off chain with the same arithmetic the program uses, and
 * only sends — after a simulation — for the ones below maintenance. There is
 * no event scan to fall behind and no local book to drift from the chain.
 */

export const sweep = async (): Promise<void> => {
  const rows = await connection.getProgramAccounts(programId, {filters: [discriminatorFilter("position")]});
  if (rows.length === 0) return;

  const [venue, marks, markets, now] = await Promise.all([loadConfig(), loadMarks(), loadMarkets(), chainTime()]);
  const byAddress = new Map([...markets.values()].map((listed) => [listed.address.toBase58(), listed]));

  let checked = 0;
  let taken = 0;

  for (const row of rows) {
    const position = decodePosition(row.account.data);
    const listed = byAddress.get(position.market.toBase58());
    if (!listed) continue;

    const slot = marks[listed.account.index];
    // An unpriced or stale market cannot be liquidated; the price loop keeps
    // every market with open interest fresh, so this clears within a round.
    if (!slot || slot.updatedAt === 0 || now > slot.updatedAt + venue.maxAge) continue;

    checked += 1;
    const view = positionView(position, listed.account, slot.price, now);
    if (!view.liquidatable) continue;

    try {
      const signature = await oneAtATime(() =>
        send([ix.liquidate(signer.publicKey, listed.address, position.owner)], {simulateFirst: true}),
      );
      taken += 1;
      console.log(
        `[liquidator] ${listed.account.symbol} ${position.owner.toBase58()} equity ${view.equity} <= ${view.maintenance}, tx ${signature}`,
      );
    } catch (error) {
      console.warn(`[liquidator] ${listed.account.symbol} ${position.owner.toBase58()}: ${explain(error)}`);
    }
  }

  if (taken > 0) console.log(`[liquidator] ${taken} liquidated of ${checked} checked`);
};
