import { NextResponse, type NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";


import { ApiError, handle } from "@/lib/api";
import {
  readAccount,
  readActivity,
  readChainPositions,
  type Activity,
  type ChainPosition,
} from "@/lib/chain/read";
import { venue } from "@/lib/chain/venue";
import { PAIRS } from "@/lib/markets";

/**
 * One account, in one round trip: balance and every open position.
 *
 * The portfolio and the order ticket both need this and both poll it, so it is
 * one endpoint rather than two — and one `positionsView` call against the
 * chain rather than sixty-four, which is why that batch view exists.
 *
 * It reads. It cannot move anything, it takes no signature, and an address is
 * public information, so there is nothing here to authorise: the answer for a
 * given address is the same one the chain would give anybody who asked.
 */
export const dynamic = "force-dynamic";

/** A real 32-byte public key, not merely a base58-looking string. */
const isSolanaAddress = (value: string): boolean => {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
};

const query = z.object({
  address: z.string().refine(isSolanaAddress, "expected a Solana address"),
});

export interface AccountSnapshot {
  free: number;
  wallet: number;
  /** Whether the engine may already pull settlement tokens for this account. */
  approved: boolean;
  positions: ChainPosition[];
  /** What this account has done, newest first, from the venue's ledger. */
  activity: Activity[];
}

export const GET = handle(async (request: NextRequest) => {
  if (!venue.live) {
    throw new ApiError(503, "venue_not_live", "The venue has no address yet.");
  }

  const { address } = query.parse({
    address: request.nextUrl.searchParams.get("address") ?? "",
  });

  const symbols = PAIRS.map((pair) => pair.symbol);

  // The activity read is deliberately outside the guard below: a node that
  // refuses a wide `eth_getLogs` range is common and must not take the
  // balances down with it.
  const history = readActivity(address, symbols).catch((): Activity[] => []);

  const [account, positions] = await Promise.all([
    readAccount(address),
    readChainPositions(address, symbols),
  ]).catch(() => {
    // A node that is refusing connections is not a bug in the request, and a
    // 500 here would read to the client as "your portfolio is broken".
    throw new ApiError(
      503,
      "chain_unreachable",
      "The chain is not answering right now.",
    );
  });

  const snapshot: AccountSnapshot = {
    free: account.free,
    wallet: account.wallet,
    approved: account.allowance > 0n,
    positions,
    activity: await history,
  };

  return NextResponse.json(
    { data: snapshot },
    { headers: { "cache-control": "no-store" } },
  );
});
