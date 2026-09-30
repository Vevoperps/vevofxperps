import { isCluster, networkOf, type Cluster } from "@/lib/chain/networks";

/**
 * Where the venue lives, and whether it exists yet.
 *
 * The app runs in two states and says which one it is in. With no server
 * configured it is the preview: generated marks, a ticket that prices
 * correctly and refuses to submit, a banner that says so. With one, every
 * screen reads the venue's ledger and every button works.
 *
 * Balances, positions and the pool are kept by the vevo server
 * (`backend/server`). Money moves on Solana: deposits are USDC transfers from
 * the user's wallet to the venue's treasury, withdrawals USDC transfers back.
 *
 * The field names `engine` and `settlement` are the ones the screens were
 * written against; `engine` is now the server's URL and `settlement` the USDC
 * mint.
 */

const read = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
};

const clusterRaw = read(process.env.NEXT_PUBLIC_CLUSTER);
const cluster: Cluster = isCluster(clusterRaw) ? clusterRaw : "mainnet";

/** The server's public URL, for the browser's signed-in actions. */
const apiUrl = read(process.env.NEXT_PUBLIC_API_URL);

const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const settlement = read(process.env.NEXT_PUBLIC_USDC_MINT) ?? MAINNET_USDC;

/** A stable number per cluster, so screens can compare "is the wallet here". */
const CHAIN_IDS: Record<Cluster, number> = { mainnet: 101, devnet: 103, localnet: 0 };

export const venue = {
  /** True when a server is configured. */
  live: apiUrl !== null,

  /** The server's URL. */
  engine: apiUrl,
  apiUrl,
  /** The USDC mint. */
  settlement,
  cluster,
  chainId: CHAIN_IDS[cluster],

  /** Kept for the screens' sake. */
  deployBlock: 0,

  network: networkOf(cluster),

  isLocal: cluster === "localnet",
} as const;

export type MarketId = string;
