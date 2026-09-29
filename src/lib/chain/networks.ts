/**
 * What to call the cluster the app is pointed at, and where to look things up.
 *
 * Derived from the configured cluster rather than assumed from the brand: a
 * banner naming the wrong network is the app telling a visitor which network
 * their money is on, incorrectly.
 */

export type Cluster = "mainnet" | "devnet" | "localnet";

export interface Network {
  name: string;
  /** True where the tokens are not worth anything. */
  testnet: boolean;
  /** Block explorer origin, no trailing slash. */
  explorer: string | null;
  /** Appended to explorer links: Solscan names the cluster in the query. */
  explorerQuery: string;
  /** The Wallet Standard chain id wallets expect, e.g. `solana:mainnet`. */
  walletChain: `solana:${string}`;
}

const KNOWN: Record<Cluster, Network> = {
  mainnet: {
    name: "Solana",
    testnet: false,
    explorer: "https://solscan.io",
    explorerQuery: "",
    walletChain: "solana:mainnet",
  },
  devnet: {
    name: "Solana Devnet",
    testnet: true,
    explorer: "https://solscan.io",
    explorerQuery: "?cluster=devnet",
    walletChain: "solana:devnet",
  },
  localnet: {
    name: "a local validator",
    testnet: true,
    explorer: null,
    explorerQuery: "",
    walletChain: "solana:localnet",
  },
};

export const isCluster = (value: string | null | undefined): value is Cluster =>
  value === "mainnet" || value === "devnet" || value === "localnet";

export const networkOf = (cluster: Cluster): Network => KNOWN[cluster];

/** A link to a transaction or an account on the configured cluster's explorer. */
export const explorerLink = (network: Network, kind: "tx" | "account", id: string): string | null =>
  network.explorer ? `${network.explorer}/${kind}/${id}${network.explorerQuery}` : null;
