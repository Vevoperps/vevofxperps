"use client";

import Image from "next/image";
import Link from "next/link";

import { Label } from "@/components/ui/label";
import { TypeIn } from "@/components/ui/type-in";
import { PreviewBanner } from "@/views/app/app-shell";
import { HeroVideo } from "@/views/app/hero-video";
import {
  decimalsFor,
  formatChange,
  useMarkets,
} from "@/views/home/use-markets";
import { app } from "@/data/app";
import { PAIRS } from "@/lib/markets";

/**
 * The app's opening screen: choose a market, or read the board.
 *
 * It is one decision, so it gets one screen: a headline, two ways out, and the
 * board underneath sorted by the day's biggest movers — which is the order a
 * trader opening a venue actually wants, rather than alphabetical.
 *
 * The table is the same `/api/markets` subscription the landing page uses, so
 * the two can never disagree about a price. While the feed is quiet it falls
 * back to the configured pair list at zero, because an empty table reads as a
 * broken venue and a listed pair with no print reads as what it is.
 */
export const AppHome = () => {
  const { rows, failed, onchain } = useMarkets();

  const live = (rows ?? []).filter((row) => row.mark > 0);
  const table = live.length
    ? [...live].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
    : PAIRS.map((pair) => ({
        id: pair.symbol,
        symbol: pair.symbol,
        name: pair.name,
        flag: pair.flag,
        mark: 0,
        change24h: 0,
        changeKnown: true,
        fundingRate: 0,
        maxLeverage: pair.maxLeverage,
      }));

  return (
    <>
      <PreviewBanner />

      {/* The film, edge to edge and taller than a screen's worth of copy needs,
          darkened 15% so the headline and both buttons read on every shot.
          The rest of the app is a dark terminal; the one screen before you
          pick a market is the one place the brand gets a picture. */}
      <section className="relative flex min-h-[78svh] items-center overflow-hidden border-b border-rule-ink bg-surface-ink text-ink-on-ink sm:min-h-[86svh]">
        <HeroVideo dim={0.15} />

        <div className="relative mx-auto flex w-full max-w-[64rem] flex-col items-center gap-7 px-5 py-24 text-center [text-shadow:0_2px_28px_rgba(0,0,0,0.45)] sm:px-8 sm:py-32">
          <span className="label flex items-center gap-2 bg-black/35 px-3 py-2.5 text-ink-on-ink [text-shadow:none]">
            <span aria-hidden className="size-2 bg-ink-on-ink" />
            {onchain ? app.home.badgeLive(rows?.length ?? 0) : app.home.badge}
          </span>

          <h1 className="text-[3rem] font-medium leading-[1.02] tracking-tight sm:text-[5rem]">
            <TypeIn block text={app.home.heading} delay={260} />
          </h1>

          <p className="max-w-[46ch] text-base leading-relaxed text-ink-on-ink/85">
            {app.home.lede}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 [text-shadow:none]">
            <Link
              href="/app/pairs"
              className="label flex items-center gap-2.5 rounded-full bg-surface-paper py-3.5 pl-4 pr-5 text-accent transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-surface-paper-2"
            >
              <span
                aria-hidden
                className="size-[18px] rounded-[3px] bg-accent"
              />
              {app.home.primary}
            </Link>
            <Link
              href="/docs"
              className="label rounded-full bg-black/35 px-5 py-3.5 text-ink-on-ink ring-1 ring-ink-on-ink/25 transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-black/50"
            >
              {app.home.secondary}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[90rem] px-5 py-14 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <TypeIn
            text={app.home.ratesTitle}
            className="text-xl font-medium tracking-tight"
          />
          <Label tone="ink">{app.home.ratesHint}</Label>
        </div>

        <div className="mt-6 border border-rule-ink">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule-ink px-5 py-4">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={`size-2 ${live.length ? "bg-accent" : "bg-rule-ink"}`}
              />
              <Label tone="ink" strong>
                {live.length
                  ? app.home.live(live.length)
                  : failed
                    ? app.home.failed
                    : app.home.empty}
              </Label>
            </span>
            <Label tone="ink">{app.home.ratesNote}</Label>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse font-mono text-sm">
              <thead>
                <tr className="border-b border-rule-ink">
                  {[
                    app.home.columns.pair,
                    app.home.columns.currency,
                    app.home.columns.mark,
                    app.home.columns.change,
                    app.home.columns.funding,
                    app.home.columns.leverage,
                  ].map((column, index) => (
                    <th
                      key={column}
                      scope="col"
                      className={`label px-5 py-3 font-normal text-dim-ink ${
                        index > 1 ? "text-right" : "text-left"
                      }`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {table.slice(0, 24).map((row) => (
                  <tr
                    key={row.id}
                    className="group cursor-pointer border-b border-rule-ink/70 transition-colors duration-[var(--duration-fast)] ease-entrance last:border-b-0 hover:bg-surface-ink-2"
                  >
                    <td className="p-0">
                      {/* The link is the cell rather than the row: a `tr`
                          cannot be an anchor, and wrapping every cell in one
                          would make the row six tab stops instead of one. */}
                      <Link
                        href={`/app/market/${row.symbol.toLowerCase()}`}
                        className="flex items-center gap-3 px-5 py-3.5 transition-colors duration-[var(--duration-fast)] ease-entrance group-hover:text-accent"
                      >
                        <Image
                          src={`/flags/${row.flag}.svg`}
                          alt=""
                          width={22}
                          height={15}
                          className="h-[15px] w-[22px] object-cover"
                        />
                        <b className="font-medium">{row.symbol}</b>
                        <span
                          aria-hidden
                          className="ml-auto opacity-0 transition-opacity duration-[var(--duration-fast)] ease-entrance group-hover:opacity-100"
                        >
                          →
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-dim-ink">{row.name}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums">
                      {row.mark ? row.mark.toFixed(decimalsFor(row.mark)) : "·"}
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right tabular-nums ${
                        row.change24h > 0
                          ? "text-accent"
                          : row.change24h < 0
                            ? "text-ink-on-ink"
                            : "text-dim-ink"
                      }`}
                    >
                      {row.mark ? formatChange(row.change24h, row.changeKnown !== false) : "·"}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-dim-ink">
                      {(row.fundingRate * 100).toFixed(4)}%
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums">
                      {row.maxLeverage}x
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
};
