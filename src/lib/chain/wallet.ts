"use client";

import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { create } from "zustand";

import { venue } from "./venue";

/**
 * The wallet connection, in one store the whole app reads.
 *
 * **Wallets are discovered, not listed.** Solana wallets register themselves
 * through the Wallet Standard — Phantom, Solflare, Backpack and the rest each
 * announce a name and an icon — so the picker shows what is actually installed
 * on this machine. It is the Solana counterpart of the EIP-6963 discovery the
 * EVM version used, and the store keeps the same shape so the screens did not
 * have to change.
 *
 * **There is no chain to switch.** A Solana wallet signs for whichever cluster
 * the transaction is sent to; the cluster is named in each signing request.
 * `ensureChain` survives only so the screens written for the EVM venue keep
 * compiling, and it always answers yes.
 */

export interface ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  /** No reverse-DNS on Solana; the lowercased name stands in for matching. */
  rdns: string;
}

export interface Announced {
  info: ProviderInfo;
  provider: Wallet;
}

interface WalletState {
  wallets: Announced[];
  address: string | null;
  /** Every account the wallet shared with the site; usually just one. */
  accounts: string[];
  chainId: number | null;
  connecting: string | null;
  error: string | null;

  connect: (wallet: Announced) => Promise<void>;
  disconnect: () => void;
  /** Switches between the accounts the wallet shared, without a prompt. */
  selectAccount: (address: string) => void;
  ensureChain: () => Promise<boolean>;
  setError: (message: string | null) => void;
}

// ------------------------------------------------------ the standard, typed
//
// Only the handful of features used here, typed locally so the app does not
// depend on each wallet's feature packages.

interface ConnectFeature {
  connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>;
}
interface DisconnectFeature {
  disconnect: () => Promise<void>;
}
interface EventsFeature {
  on: (event: "change", listener: (properties: { accounts?: readonly WalletAccount[] }) => void) => () => void;
}
interface SignAndSendFeature {
  signAndSendTransaction: (
    ...inputs: { account: WalletAccount; transaction: Uint8Array; chain: string }[]
  ) => Promise<readonly { signature: Uint8Array }[]>;
}
interface SignFeature {
  signTransaction: (
    ...inputs: { account: WalletAccount; transaction: Uint8Array; chain?: string }[]
  ) => Promise<readonly { signedTransaction: Uint8Array }[]>;
}

const feature = <T>(wallet: Wallet, name: string): T | null =>
  ((wallet.features as Record<string, unknown>)[name] as T | undefined) ?? null;

/**
 * Solana-native wallets only. Multichain EVM wallets (MetaMask, Rabby,
 * Coinbase, OKX...) now also register for Solana, but the venue is a Solana
 * venue and the picker lists the wallets its traders actually use. Matched
 * against the name each wallet announces.
 */
const SOLANA_NATIVE = ["phantom", "solflare", "backpack", "jupiter", "glow", "magic eden"];

const isSolanaNative = (wallet: Wallet): boolean => {
  const name = wallet.name.toLowerCase();
  return SOLANA_NATIVE.some((known) => name.includes(known));
};

const isSolanaWallet = (wallet: Wallet): boolean =>
  isSolanaNative(wallet) &&
  wallet.chains.some((chain) => chain.startsWith("solana:")) &&
  feature(wallet, "standard:connect") !== null &&
  (feature(wallet, "solana:signAndSendTransaction") !== null || feature(wallet, "solana:signTransaction") !== null);

const announce = (wallet: Wallet): Announced => ({
  info: { uuid: wallet.name, name: wallet.name, icon: wallet.icon, rdns: wallet.name.toLowerCase() },
  provider: wallet,
});

// ---------------------------------------------------------------- the store

/** The connected wallet and account. Live objects, deliberately not state. */
let connected: { wallet: Wallet; account: WalletAccount; accounts: readonly WalletAccount[] } | null = null;
let unsubscribe: (() => void) | null = null;

const REMEMBERED = "vevo:wallet";

const remember = (name: string | null): void => {
  try {
    if (name) window.localStorage.setItem(REMEMBERED, name);
    else window.localStorage.removeItem(REMEMBERED);
  } catch {
    // Storage blocked: reconnecting will need a click.
  }
};

const remembered = (): string | null => {
  try {
    return window.localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
};

type Setter = (partial: Partial<WalletState>) => void;

const attach = (
  wallet: Wallet,
  account: WalletAccount,
  accounts: readonly WalletAccount[],
  set: Setter,
): void => {
  detach();
  connected = { wallet, account, accounts };

  // Switching accounts inside the wallet (Phantom's account list, say)
  // arrives here, and the venue follows it without a reconnect.
  const events = feature<EventsFeature>(wallet, "standard:events");
  unsubscribe =
    events?.on("change", ({ accounts: shared }) => {
      if (!shared) return;
      const next = shared[0];
      if (!next) {
        detach();
        set({ address: null, chainId: null, accounts: [] });
        return;
      }
      if (connected) {
        connected.accounts = shared;
        connected.account = next;
      }
      set({ address: next.address, accounts: shared.map((each) => each.address) });
    }) ?? null;

  set({
    address: account.address,
    accounts: accounts.map((each) => each.address),
    chainId: venue.chainId,
  });
};

const detach = (): void => {
  unsubscribe?.();
  unsubscribe = null;
  connected = null;
};

export const useWallet = create<WalletState>((set) => ({
  wallets: [],
  address: null,
  accounts: [],
  chainId: null,
  connecting: null,
  error: null,

  setError: (message) => set({ error: message }),

  connect: async (announced) => {
    set({ connecting: announced.info.uuid, error: null });
    try {
      const connect = feature<ConnectFeature>(announced.provider, "standard:connect");
      const { accounts } = (await connect?.connect()) ?? { accounts: [] };
      const account = accounts[0];
      if (!account) {
        set({ connecting: null });
        return;
      }

      attach(announced.provider, account, accounts, set);
      remember(announced.info.name);
      set({ connecting: null });
    } catch {
      set({ connecting: null, error: "refused" });
    }
  },

  disconnect: () => {
    const wallet = connected?.wallet;
    detach();
    remember(null);
    set({ address: null, accounts: [], chainId: null, error: null });
    if (wallet) {
      void feature<DisconnectFeature>(wallet, "standard:disconnect")
        ?.disconnect()
        .catch(() => undefined);
    }
  },

  selectAccount: (address) => {
    const next = connected?.accounts.find((each) => each.address === address);
    if (!connected || !next) return;
    connected.account = next;
    set({ address: next.address });
  },

  ensureChain: async () => true,
}));

/**
 * Starts Wallet Standard discovery, and silently reconnects the wallet used
 * last time — `connect({ silent: true })` never opens a prompt. Returns its
 * own teardown.
 */
export const discoverWallets = (): (() => void) => {
  const { get, on } = getWallets();
  const wanted = remembered();

  const refresh = (): void => {
    const solana = get().filter(isSolanaWallet);
    useWallet.setState({ wallets: solana.map(announce) });

    if (connected || !wanted) return;
    const match = solana.find((wallet) => wallet.name === wanted);
    if (!match) return;

    void (async () => {
      try {
        const connect = feature<ConnectFeature>(match, "standard:connect");
        const result = await connect?.connect({ silent: true });
        const account = result?.accounts[0];
        if (account && !connected) {
          attach(match, account, result?.accounts ?? [account], (partial) => useWallet.setState(partial));
        }
      } catch {
        // Not previously approved: the visitor will click.
      }
    })();
  };

  refresh();
  const offRegister = on("register", refresh);
  const offUnregister = on("unregister", refresh);

  return () => {
    offRegister();
    offUnregister();
  };
};

/** The connected account's address, or null. */
export const connectedAddress = (): string | null => connected?.account.address ?? null;

/**
 * Has the connected wallet sign a serialised transaction and put it on chain.
 *
 * Prefers the wallet's own sign-and-send, which is what Phantom recommends
 * and what keeps its simulation warnings accurate; falls back to sign-only,
 * returning the signed bytes for the caller to broadcast.
 */
export const signAndSend = async (
  transaction: Uint8Array,
): Promise<{ signature: Uint8Array } | { signed: Uint8Array }> => {
  if (!connected) throw new Error("no wallet connected");
  const { wallet, account } = connected;
  const chain = venue.network.walletChain;

  const sendFeature = feature<SignAndSendFeature>(wallet, "solana:signAndSendTransaction");
  if (sendFeature) {
    const [result] = await sendFeature.signAndSendTransaction({ account, transaction, chain });
    if (!result) throw new Error("the wallet returned no signature");
    return { signature: result.signature };
  }

  const signFeature = feature<SignFeature>(wallet, "solana:signTransaction");
  if (!signFeature) throw new Error("this wallet cannot sign Solana transactions");
  const [result] = await signFeature.signTransaction({ account, transaction, chain });
  if (!result) throw new Error("the wallet returned no signed transaction");
  return { signed: result.signedTransaction };
};

interface SignMessageFeature {
  signMessage: (
    ...inputs: { account: WalletAccount; message: Uint8Array }[]
  ) => Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array }[]>;
}

/**
 * Has the connected wallet sign a plain message — the sign-in. A message
 * signature is not a transaction: it moves nothing and costs nothing.
 */
export const signMessage = async (message: string): Promise<Uint8Array> => {
  if (!connected) throw new Error("no wallet connected");
  const { wallet, account } = connected;
  const signer = feature<SignMessageFeature>(wallet, "solana:signMessage");
  if (!signer) throw new Error("this wallet cannot sign messages");
  const [result] = await signer.signMessage({ account, message: new TextEncoder().encode(message) });
  if (!result) throw new Error("the wallet returned no signature");
  return result.signature;
};
