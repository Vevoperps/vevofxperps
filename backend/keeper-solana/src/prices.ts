import {chainTime, ix, loadConfig, loadMarkets, loadMarks, oneAtATime, send, signer} from "./chain.js";
import {config} from "./config.js";
import {fetchMarks, quoteAge} from "./fx.js";
import {warmSymbols} from "./warm.js";

/**
 * Keeps the chain's marks current — only where they are load bearing.
 *
 * **What gets priced.** A mark on chain matters only for a market somebody is
 * in or about to enter. So the set is: every market carrying open interest (a
 * trader who cannot close is a trader trapped), plus `ALWAYS_FRESH`, plus
 * whatever the site asked for through `/warm` because a visitor is on that
 * pair's page. The rates a visitor merely browses come from the same FX feed,
 * served by the site, and cost nothing.
 *
 * **When a mark is posted.** It moved by more than `MIN_MOVE_BPS`, or it is
 * past half the oracle's staleness window, or it was never posted.
 *
 * **Big moves are walked, not jumped.** The program refuses a fresh mark that
 * moves more than `max_deviation_bps` in one post. A frontier currency that
 * devalues 12% overnight would otherwise be refused forever; instead the mark
 * steps toward the real rate by the limit each round and arrives in a few.
 */

const BPS = 10_000n;

export const pushPrices = async (): Promise<void> => {
  const [rates, venue, marks, markets, now] = await Promise.all([
    fetchMarks(),
    loadConfig(),
    loadMarks(),
    loadMarkets(),
    chainTime(),
  ]);

  if (rates.length === 0) {
    console.warn("[prices] the fx source returned nothing usable — nothing posted");
    return;
  }

  if (quoteAge() > config.MAX_QUOTE_AGE) {
    console.warn(`[prices] the fx quote is ${quoteAge()}s old — refusing to post it as a fresh mark`);
    return;
  }

  const active = new Set<string>([...config.ALWAYS_FRESH, ...warmSymbols()]);
  for (const [symbol, {account}] of markets) {
    if (account.longOpenInterest > 0n || account.shortOpenInterest > 0n) active.add(symbol);
  }

  const threshold = BigInt(config.MIN_MOVE_BPS);
  const limit = BigInt(venue.maxDeviationBps);

  const indices: number[] = [];
  const prices: bigint[] = [];

  for (const rate of rates) {
    if (!active.has(rate.symbol)) continue;
    const listed = markets.get(rate.symbol);
    if (!listed) continue;

    const slot = marks[listed.account.index];
    if (!slot) continue;

    const never = slot.updatedAt === 0 || slot.price === 0n;
    const fresh = !never && now <= slot.updatedAt + venue.maxAge;
    const ageing = !never && now - slot.updatedAt >= venue.maxAge / 2;

    let target = rate.value;

    if (!never) {
      const gap = target > slot.price ? target - slot.price : slot.price - target;
      const moved = (gap * BPS) / slot.price;
      if (moved < threshold && !ageing) continue;

      // Clamp a fresh mark's step to the program's own limit.
      if (fresh && limit > 0n && moved > limit) {
        const step = (slot.price * limit) / BPS;
        target = target > slot.price ? slot.price + step : slot.price - step;
        console.warn(`[prices] ${rate.symbol} moved ${moved} bps; stepping ${limit} bps toward it`);
      }
    }

    indices.push(listed.account.index);
    prices.push(target);
  }

  if (indices.length === 0) {
    console.log(`[prices] nothing to post (${active.size} active, quote ${quoteAge()}s old)`);
    return;
  }

  for (let i = 0; i < indices.length; i += config.POST_CHUNK) {
    const chunkIndices = indices.slice(i, i + config.POST_CHUNK);
    const chunkPrices = prices.slice(i, i + config.POST_CHUNK);
    const signature = await oneAtATime(() =>
      send([ix.postMarks(signer.publicKey, chunkIndices, chunkPrices)], {units: 200_000}),
    );
    console.log(`[prices] ${chunkIndices.length} marks posted, quote ${quoteAge()}s old, tx ${signature}`);
  }

};
