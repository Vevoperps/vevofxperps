"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { HoverType } from "@/components/ui/hover-type";
import { SocialMark } from "@/components/ui/social-mark";
import { Label } from "@/components/ui/label";
import { WalletConnect } from "@/views/app/wallet-connect";
import { app } from "@/data/app";
import { brand } from "@/lib/brand";
import { venue } from "@/lib/chain/venue";

/**
 * The frame every app screen sits in: one bar, one warning, then the screen.
 *
 * The bar is sticky and the banner is not. That is deliberate — the navigation
 * has to be reachable from anywhere in a long table, but a warning that follows
 * you down the page stops being read by the third screen. It is printed at the
 * top of each route instead, where it is the first thing under the fold.
 *
 * Connect is present and disabled rather than absent. A trading venue with no
 * connect button reads as broken; one that says what it is waiting for reads as
 * honest.
 */
export const AppShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-surface-ink text-ink-on-ink">
      <header className="sticky top-0 z-40 border-b border-rule-ink bg-surface-ink/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[90rem] items-center justify-between gap-6 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-[1.25rem] font-medium tracking-tight transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent"
            >
              {brand.name}
            </Link>
            <span className="label bg-accent px-2 py-1.5 pt-2 text-ink-on-ink">
              {app.chip}
            </span>
          </div>

          <nav className="hidden items-center gap-1 sm:flex">
            {app.nav.map((item) => {
              const active =
                item.href === "/app"
                  ? pathname === "/app"
                  : pathname.startsWith(item.href);

              if (!item.ready) {
                return (
                  <span
                    key={item.href}
                    title="soon"
                    className="label cursor-not-allowed border border-rule-ink px-3 py-2.5 text-faint"
                  >
                    {item.label}
                  </span>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`label border px-3 py-2.5 transition-colors duration-[var(--duration-fast)] ease-entrance ${
                    active
                      ? "border-accent bg-accent text-ink-on-ink"
                      : "border-rule-ink text-dim-ink hover:border-accent hover:text-accent"
                  }`}
                >
                  <HoverType text={item.label} />
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {brand.links.x ? (
              <a
                href={brand.links.x}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X"
                className="label flex size-9 items-center justify-center border border-rule-ink text-dim-ink transition-colors duration-[var(--duration-fast)] ease-entrance hover:border-accent hover:text-accent"
              >
                <SocialMark kind="x" />
              </a>
            ) : (
              <span
                aria-label="X, soon"
                title="soon"
                className="label flex size-9 items-center justify-center border border-rule-ink text-faint"
              >
                <SocialMark kind="x" />
              </span>
            )}
            <WalletConnect />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
};

/** The preview warning, printed at the top of each screen. */
/**
 * The line at the top of every app screen saying what this actually is.
 *
 * Three states, and it is never silent. Without an engine address it is the
 * preview and says the numbers are generated. With one it says the screen is
 * read from the venue. On a development chain it says that instead, in the
 * warning colour, because a demo that looks like the real thing is how
 * somebody comes to believe their test balance is money.
 */
export const PreviewBanner = () => {
  const local = venue.live && venue.isLocal;
  const testnet = venue.live && !venue.isLocal && venue.network.testnet;

  const text = !venue.live
    ? app.banner
    : local
      ? app.bannerLocal
      : testnet
        ? app.bannerTestnet(venue.network.name)
        : app.bannerLive(venue.network.name);

  return (
    <div className="mx-auto w-full max-w-[90rem] px-5 pt-6 sm:px-8">
      <p
        className={`border-l-2 bg-surface-ink-2 px-4 py-3 ${
          local ? "border-negative" : "border-accent"
        }`}
      >
        <Label tone="ink">{text}</Label>
      </p>
    </div>
  );
};
