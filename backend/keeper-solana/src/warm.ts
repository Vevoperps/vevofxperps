import {createServer} from "node:http";

import {config} from "./config.js";
import {markets} from "./shared.js";

/**
 * The door the site knocks on when somebody turns up at a pair.
 *
 * **Why this exists.** A mark is only written for a market that carries risk,
 * because writing all sixty-four around the clock costs more than the venue
 * makes. That leaves one gap: the first visitor to an untouched pair. Their
 * rate is on screen, real and moving, but nothing can fill against it until a
 * mark exists — and nobody is going to wait while the keeper works out on its
 * own that somebody is interested.
 *
 * So the site tells it. Opening a pair's page posts the symbol here, the
 * keeper folds it into the set it keeps fresh, and one round later the market
 * trades. The ticket says "warming up" for those few seconds rather than
 * offering a button that would revert.
 *
 * **Why an endpoint and not a database.** The thing being shared is a handful
 * of symbols with a few minutes' life, and losing them costs one more round of
 * waiting. Standing up Redis to hold that would be more moving parts than the
 * problem has. Railway gives this process a public URL already; the site calls
 * it server side, so the secret never reaches a browser.
 *
 * **It is not an authorisation.** Anybody who got the secret could ask for a
 * pair to be priced, and the worst they could do is make the keeper spend gas
 * on marks nobody trades — bounded by `WARM_MAX` and by the fact that a mark
 * is a public number either way. Nothing here can move a balance, open a
 * position, or change a price.
 */

const symbols = new Set(markets.map((market) => market.symbol));

/** Symbol to the moment its warmth expires. */
const asked = new Map<string, number>();

/**
 * How many pairs may be held warm at once.
 *
 * A bound rather than a budget: it stops a loop somewhere — a crawler, a bug,
 * a bored visitor with a keyboard — from turning "price what people look at"
 * back into "price all sixty-four".
 */
const WARM_MAX = 12;

export const warmSymbols = (): Set<string> => {
  const now = Date.now();
  for (const [symbol, until] of asked) {
    if (until <= now) asked.delete(symbol);
  }
  return new Set(asked.keys());
};

const remember = (symbol: string): void => {
  const until = Date.now() + config.WARM_TTL * 1000;

  // Re-asking refreshes rather than duplicates, so somebody sitting on a page
  // keeps it warm for as long as they are there.
  if (asked.has(symbol)) {
    asked.set(symbol, until);
    return;
  }

  if (asked.size >= WARM_MAX) {
    // Drop whichever expires first. It is the one least recently asked for,
    // and the one whose visitor is most likely gone.
    let oldest: string | null = null;
    let soonest = Infinity;
    for (const [other, when] of asked) {
      if (when < soonest) {
        soonest = when;
        oldest = other;
      }
    }
    if (oldest) asked.delete(oldest);
  }

  asked.set(symbol, until);
  console.log(`[warm] ${symbol} asked for, ${asked.size} held`);
};

/** Reads a small JSON body, and refuses a large one rather than buffering it. */
const body = async (stream: NodeJS.ReadableStream): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of stream) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 2048) throw new Error("body too large");
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
};

export const serveWarm = (): void => {
  if (!config.WARM_SECRET) {
    console.log("  warm       off (no WARM_SECRET)");
    return;
  }

  const secret = config.WARM_SECRET;

  const server = createServer((request, response) => {
    void (async () => {
      const send = (status: number, payload: unknown): void => {
        response.writeHead(status, {"content-type": "application/json"});
        response.end(JSON.stringify(payload));
      };

      // Railway health checks and anything else curious.
      if (request.method === "GET" && request.url === "/health") {
        send(200, {ok: true, warm: [...warmSymbols()]});
        return;
      }

      if (request.method !== "POST" || request.url !== "/warm") {
        send(404, {error: "not found"});
        return;
      }

      if (request.headers["x-warm-secret"] !== secret) {
        send(401, {error: "unauthorised"});
        return;
      }

      try {
        const parsed = body(request);
        const payload = (await parsed) as {symbol?: unknown};
        const symbol = typeof payload.symbol === "string" ? payload.symbol.toUpperCase() : "";

        if (!symbols.has(symbol)) {
          send(400, {error: "unknown symbol"});
          return;
        }

        remember(symbol);
        send(200, {ok: true, warm: [...warmSymbols()]});
      } catch {
        send(400, {error: "bad request"});
      }
    })();
  });

  server.listen(config.PORT, () => {
    console.log(`  warm       listening on ${config.PORT}`);
  });
};
