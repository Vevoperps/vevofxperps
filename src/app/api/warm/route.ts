import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/env";
import { handle } from "@/lib/api";
import { PAIRS } from "@/lib/markets";

/**
 * Asks the keeper to start pricing a pair, because somebody is looking at it.
 *
 * **The gap this closes.** The keeper writes marks only for markets that carry
 * risk, because keeping all sixty-four warm used to cost more gas than the venue
 * makes. A visitor who opens an untouched pair therefore sees a real, moving
 * rate and a market that cannot yet be filled against. This is how they stop
 * being the only one who knows they are there.
 *
 * **The secret stays here.** The browser posts a symbol to this app; this app
 * posts it to the keeper with the shared secret. Nothing about the keeper's
 * address or its secret reaches a bundle.
 *
 * **Failure is quiet on purpose.** Nothing the visitor can see depends on this
 * succeeding: the rate is already on screen, and the market becomes tradeable
 * the moment a mark exists, whoever caused it. So an unreachable keeper, a
 * missing configuration or a rejected symbol all come back as "not warming"
 * rather than an error the page has to render. The ticket's own state is
 * driven by what the chain says, never by this answer.
 */
export const dynamic = "force-dynamic";

const schema = z.object({
  symbol: z.string().min(3).max(12),
});

const SYMBOLS = new Set(PAIRS.map((pair) => pair.symbol));

/** Short: this is a nudge, and a slow one is worth less than no wait at all. */
const TIMEOUT = 2_000;

export const POST = handle(async (req) => {
  const { symbol } = schema.parse(await req.json());
  const wanted = symbol.toUpperCase();

  if (!SYMBOLS.has(wanted)) {
    return NextResponse.json({ data: { warming: false } }, { status: 200 });
  }

  const { KEEPER_URL, WARM_SECRET } = getServerEnv();
  if (!KEEPER_URL || !WARM_SECRET) {
    return NextResponse.json({ data: { warming: false } }, { status: 200 });
  }

  try {
    const response = await fetch(new URL("/warm", KEEPER_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-warm-secret": WARM_SECRET,
      },
      body: JSON.stringify({ symbol: wanted }),
      signal: AbortSignal.timeout(TIMEOUT),
      cache: "no-store",
    });

    return NextResponse.json(
      { data: { warming: response.ok } },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ data: { warming: false } }, { status: 200 });
  }
});
