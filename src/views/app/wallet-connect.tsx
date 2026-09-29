"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { app } from "@/data/app";
import { brand } from "@/lib/brand";
import { venue } from "@/lib/chain/venue";
import { discoverWallets, useWallet } from "@/lib/chain/wallet";

/**
 * Connect a wallet.
 *
 * **It discovers wallets rather than listing them.** EIP-6963 has every
 * installed wallet announce itself with its own name and its own icon, so the
 * sheet shows what is actually on this machine instead of a hardcoded row of
 * four logos, three of which are not installed. It also means the icons are
 * the wallets' own, shipped by them for this purpose, rather than artwork
 * copied off a website.
 *
 * A browser with no wallet at all still gets a useful sheet: the four wallets
 * worth naming are listed with their own marks and a link to install, which is
 * the honest version of a button that would otherwise do nothing.
 *
 * The connection itself lives in the wallet store, not here, because the order
 * ticket and the portfolio need it too. This component is a view of that store
 * and the chip that reports it.
 */

/** Shortens an address the way every wallet does. */
const short = (address: string): string =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

export const WalletConnect = () => {
  const wallets = useWallet((state) => state.wallets);
  const address = useWallet((state) => state.address);
  const chainId = useWallet((state) => state.chainId);
  const connecting = useWallet((state) => state.connecting);
  const error = useWallet((state) => state.error);
  const connect = useWallet((state) => state.connect);
  const disconnect = useWallet((state) => state.disconnect);
  const ensureChain = useWallet((state) => state.ensureChain);

  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => discoverWallets(), []);

  // Escape closes, and a click outside does too: this is a menu, not a dialog
  // to be dismissed with a button.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    const onDown = (event: MouseEvent): void => {
      if (!sheetRef.current?.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  useEffect(() => {
    if (address) setOpen(false);
  }, [address]);

  if (address) {
    // A connected wallet sitting on the wrong chain is the single commonest
    // way a first trade fails, so it is said here and fixed in one click
    // rather than discovered inside a revert.
    const wrongChain = venue.live && chainId !== venue.chainId;

    if (wrongChain) {
      return (
        <button
          type="button"
          onClick={() => void ensureChain()}
          className="label flex items-center gap-2 border border-negative px-3 py-2.5 text-negative transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-negative hover:text-ink-on-ink"
        >
          <span aria-hidden className="size-2 bg-negative" />
          {app.wallet.wrongChain(venue.network.name)}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={disconnect}
        title={app.wallet.disconnect}
        className="label flex items-center gap-2 border border-accent px-3 py-2.5 text-accent transition-colors duration-[var(--duration-fast)] ease-entrance hover:border-negative hover:text-negative"
      >
        <span aria-hidden className="size-2 bg-accent" />
        {short(address)}
      </button>
    );
  }

  return (
    <div className="relative" ref={sheetRef}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="label border border-rule-ink bg-surface-ink-2 px-4 py-2.5 text-ink-on-ink transition-colors duration-[var(--duration-fast)] ease-entrance hover:border-accent hover:text-accent"
      >
        {app.wallet.connect}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[19rem] border border-rule-ink bg-surface-ink shadow-[0_1.5rem_3rem_-1rem_var(--shadow-paper)]"
        >
          <p className="label border-b border-rule-ink px-4 py-3 text-dim-ink">
            {wallets.length ? app.wallet.pick : app.wallet.none}
          </p>

          <ul className="flex flex-col">
            {wallets.map((wallet) => (
              <li key={wallet.info.uuid}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={connecting !== null}
                  onClick={() => void connect(wallet)}
                  className="flex w-full items-center gap-3 border-b border-rule-ink/70 px-4 py-3.5 text-left transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-surface-ink-2 disabled:opacity-50"
                >
                  {/* The wallet's own icon, as it announced it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={wallet.info.icon}
                    alt=""
                    width={24}
                    height={24}
                    className="size-6 shrink-0"
                  />
                  <span className="flex-1 text-sm">{wallet.info.name}</span>
                  <span className="label text-dim-ink">
                    {connecting === wallet.info.uuid
                      ? app.wallet.waiting
                      : app.wallet.ready}
                  </span>
                </button>
              </li>
            ))}

            {app.wallet.known
              .filter(
                (known) =>
                  !wallets.some((wallet) =>
                    wallet.info.rdns?.includes(known.rdns),
                  ),
              )
              .map((known) => (
                <li key={known.rdns}>
                  <a
                    href={known.install}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 border-b border-rule-ink/70 px-4 py-3.5 transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-surface-ink-2"
                  >
                    {known.icon ? (
                      <Image
                        src={known.icon}
                        alt=""
                        width={24}
                        height={24}
                        className="size-6 shrink-0"
                      />
                    ) : (
                      // No mark shipped for this one: its initial, boxed.
                      <span
                        aria-hidden
                        className="label flex size-6 shrink-0 items-center justify-center border border-rule-ink text-dim-ink"
                      >
                        {known.name.charAt(0)}
                      </span>
                    )}
                    <span className="flex-1 text-sm text-dim-ink">
                      {known.name}
                    </span>
                    <span className="label text-faint">
                      {app.wallet.install}
                    </span>
                  </a>
                </li>
              ))}
          </ul>

          <p className="px-4 py-3 text-xs leading-relaxed text-dim-ink">
            {error === "refused"
              ? app.wallet.refused
              : error === "chain"
                ? app.wallet.chainRefused(venue.network.name)
                : venue.live
                  ? app.wallet.noteLive(venue.network.name)
                  : app.wallet.note(venue.network.name)}
          </p>
        </div>
      ) : null}
    </div>
  );
};
