import { PublicKey } from "@solana/web3.js";

import { isCluster, networkOf, type Cluster } from "@/lib/chain/networks";

/**
 * Where the venue lives, and whether it exists yet.
 *
 * The app runs in two states and says which one it is in. With no program
 * configured it is the preview: generated marks, a ticket that prices
 * correctly and refuses to submit, a banner that says so. With one, every
 * screen reads the program and every button works. Nothing in between.
 *
 * The addresses are `NEXT_PUBLIC_` on purpose — a program address is public
 * the moment it is deployed. Nothing secret goes here; the app holds no key
 * and never signs anything itself.
 *
 * The field names (`engine`, `settlement`, `chainId`) are the ones the screens
 * were written against on the EVM deployment; on Solana `engine` is the
 * program id and `settlement` the USDC mint.
 */

const read = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const asKey = (value: string | null): string | null => {
  if (!value) return null;
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
};

const clusterRaw = read(process.env.NEXT_PUBLIC_CLUSTER);
const cluster: Cluster = isCluster(clusterRaw) ? clusterRaw : "mainnet";

const engine = asKey(read(process.env.NEXT_PUBLIC_PROGRAM_ID));
const settlement = asKey(read(process.env.NEXT_PUBLIC_USDC_MINT));
const rpcUrl = read(process.env.NEXT_PUBLIC_RPC_URL);

/** A stable number per cluster, so screens can compare "is the wallet here". */
const CHAIN_IDS: Record<Cluster, number> = { mainnet: 101, devnet: 103, localnet: 0 };

export const venue = {
  /** True only when the program, the mint and an RPC are all configured. */
  live: engine !== null && settlement !== null && rpcUrl !== null,

  /** The program id. */
  engine,
  /** The USDC mint. */
  settlement,
  rpcUrl,
  cluster,
  chainId: CHAIN_IDS[cluster],

  /** Kept for the screens' sake; Solana history is paged by signature. */
  deployBlock: 0,

  network: networkOf(cluster),

  isLocal: cluster === "localnet",
} as const;

export type MarketId = string;
