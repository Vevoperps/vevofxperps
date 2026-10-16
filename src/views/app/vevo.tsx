"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { app } from "@/data/app";
import { brand } from "@/lib/brand";
import { explorerLink } from "@/lib/chain/networks";
import { venue } from "@/lib/chain/venue";
import { LogoMark } from "@/lib/logo";
import { PreviewBanner } from "@/views/app/app-shell";
import { GridField } from "@/views/home/grid-field";

/**
 * The token screen.
 *
 * **It opens like a launch, not a settings page.** The ticker at display size
 * over the live grid, a soft accent glow behind it, the three actions a buyer
 * needs (buy, chart, explorer) and the contract address in one bar beneath.
 * The token card sits beside it on wide screens so the facts are read in the
 * same glance as the name.
 *
 * **Everything a launch fills in is one field in `brand.ts`.** Before launch
 * the address is null: the bar says the contract drops here, and the actions
 * read "at launch" instead of linking anywhere. Set `brand.token.address` (and
 * optionally `brand.links.pumpfun`) and every link on the page goes live; the
 * pump.fun and chart links are derived from the address when no explicit one
 * is given.
 *
 * **Only live facts are stated as live.** The venue numbers are the running
 * product. Holder utilities are listed under "Planned" with that word on them,
 * because a token page that claims a fee share before it exists is a claim
 * somebody screenshots.
 */

const { vevo } = app;

const ACCENT_GLOW =
  "pointer-events-none absolute rounded-full bg-accent blur-[120px]";

/** A section heading in the app's numbered style. */
const Head = ({ n, title, aside }: { n: string; title: string; aside?: ReactNode }) => (
  <div className="flex items-center gap-3">
    <span aria-hidden className="label bg-accent px-2 py-1.5 pt-2 text-ink-on-ink">
      {n}
    </span>
    <Label tone="ink" strong>
      {title}
    </Label>
    <span aria-hidden className="h-px flex-1 bg-rule-ink" />
    {aside}
  </div>
);

/** A link that becomes an inert "at launch" chip while it has nowhere to go. */
const Action = ({
  href,
  primary = false,
  children,
}: {
  href: string | null;
  primary?: boolean;
  children: ReactNode;
}) => {
  const base =
    "label flex h-12 items-center gap-2.5 px-5 transition-colors duration-[var(--duration-fast)] ease-entrance";

  if (!href) {
    return (
      <span
        title={vevo.actions.soon}
        className={`${base} cursor-not-allowed border border-rule-ink text-faint`}
      >
        {children}
        <span>· {vevo.actions.soon}</span>
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        primary
          ? `${base} bg-surface-paper text-accent hover:bg-accent hover:text-ink-on-ink`
          : `${base} border border-rule-ink text-ink-on-ink hover:border-accent hover:text-accent`
      }
    >
      {primary ? <span aria-hidden className="size-2 bg-current" /> : null}
      {children}
      <span aria-hidden>↗</span>
    </a>
  );
};

export const AppVevo = () => {
  const [copied, setCopied] = useState(false);

  const address = brand.token.address;
  const ticker = brand.token.ticker;
  const live = Boolean(address);

  const pumpfun = brand.links.pumpfun ?? (address ? `https://pump.fun/coin/${address}` : null);
  const chart = address ? `https://dexscreener.com/solana/${address}` : null;
  const explorer = address ? explorerLink(venue.network, "account", address) : null;

  const copy = () => {
    if (!address) return;
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <>
      {venue.live ? null : <PreviewBanner />}

      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden border-b border-rule-ink bg-surface-ink-2">
        <GridField className="absolute inset-0 size-full opacity-60" />
        <span aria-hidden className={`${ACCENT_GLOW} -left-32 top-1/3 size-[34rem] opacity-25`} />
        <span aria-hidden className={`${ACCENT_GLOW} -right-40 -top-40 size-[28rem] opacity-15`} />

        <div className="pointer-events-none relative mx-auto grid w-full max-w-[90rem] gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1fr_22rem] lg:items-end">
          <div className="flex flex-col gap-8">
            {/* Status: what stage the token is at, in one line. */}
            <span className="flex flex-wrap items-center gap-3">
              <span className="relative flex size-2.5">
                <span aria-hidden className="absolute inset-0 animate-ping bg-accent opacity-60" />
                <span className="relative size-2.5 bg-accent" />
              </span>
              <Label tone="ink" strong>
                {live ? vevo.hero.status.live : vevo.hero.status.soon}
              </Label>
              <span aria-hidden className="h-px w-10 bg-rule-ink" />
              <Label tone="ink">{vevo.hero.eyebrow}</Label>
            </span>

            <h1 className="text-[clamp(4rem,15vw,11rem)] leading-[0.82] font-medium tracking-[-0.045em]">
              <span className="text-accent">$</span>
              {ticker}
            </h1>

            <div className="flex max-w-[58ch] flex-col gap-3">
              <p className="text-[clamp(1.375rem,2.4vw,2rem)] leading-tight font-medium tracking-tight">
                {vevo.hero.headline}
              </p>
              <p className="text-sm leading-relaxed text-dim-ink">{vevo.hero.lede}</p>
            </div>

            <div className="pointer-events-auto flex flex-wrap gap-2">
              <Action href={pumpfun} primary>
                {vevo.actions.buy}
              </Action>
              <Action href={chart}>{vevo.actions.chart}</Action>
              <Action href={explorer}>{vevo.actions.explorer}</Action>
            </div>

            {/* The contract address: the one string a buyer must get right. */}
            <div className="pointer-events-auto flex max-w-[44rem] flex-col gap-2">
              <Label tone="ink">{vevo.ca.label}</Label>
              <div className="flex items-stretch gap-px bg-rule-ink">
                <span className="flex min-w-0 flex-1 items-center gap-3 bg-surface-ink px-4 py-3.5">
                  <span aria-hidden className={`size-2 shrink-0 ${live ? "bg-accent" : "bg-rule-ink"}`} />
                  {address ? (
                    <code className="truncate font-mono text-sm text-ink-on-ink">{address}</code>
                  ) : (
                    <span className="font-mono text-sm tracking-[0.08em] text-faint">{vevo.ca.soon}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={copy}
                  disabled={!address}
                  className="label bg-surface-ink px-5 text-accent transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-accent hover:text-ink-on-ink disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-surface-ink"
                >
                  {copied ? vevo.ca.copied : vevo.ca.copy}
                </button>
              </div>
              <p className="text-xs leading-relaxed text-faint">{vevo.ca.trust}</p>
            </div>
          </div>

          {/* The token card. */}
          <aside className="pointer-events-auto relative flex flex-col border border-rule-ink bg-surface-ink/80 backdrop-blur-sm">
            <div className="flex items-center gap-4 border-b border-rule-ink p-5">
              <span className="block size-12 shrink-0">
                <LogoMark className="block size-full" />
              </span>
              <span className="flex flex-col gap-1">
                <b className="text-xl leading-none font-medium tracking-tight">${ticker}</b>
                <Label tone="ink">{vevo.card.title}</Label>
              </span>
            </div>
            <dl className="flex flex-col">
              {vevo.card.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-4 border-b border-rule-ink/70 px-5 py-4 last:border-b-0"
                >
                  <dt>
                    <Label tone="ink">{row.label}</Label>
                  </dt>
                  <dd className="text-right font-mono text-sm tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-16 px-5 py-16 sm:px-8 sm:py-20">
        {/* -------------------------------------------------- the venue */}
        <section className="flex flex-col gap-6">
          <Head
            n="01"
            title={vevo.venue.title}
            aside={
              <Link
                href="/app"
                className="label text-accent transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-ink-on-ink"
              >
                {vevo.venue.cta} →
              </Link>
            }
          />
          <p className="max-w-[60ch] text-sm leading-relaxed text-dim-ink">{vevo.venue.lede}</p>
          <dl className="grid grid-cols-2 gap-px border border-rule-ink bg-rule-ink lg:grid-cols-4">
            {vevo.venue.stats.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse justify-end gap-3 bg-surface-ink p-6 sm:p-8">
                <dt>
                  <Label tone="ink">{stat.label}</Label>
                </dt>
                <dd className="font-mono text-[clamp(2.25rem,5vw,3.5rem)] leading-none font-medium tracking-tight text-ink-on-ink">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ------------------------------------- honesty + planned, side by side */}
        <div className="grid gap-16 lg:grid-cols-2 lg:gap-10">
          <section className="flex flex-col gap-6">
            <Head n="02" title={vevo.honesty.title} />
            <div className="relative flex flex-1 flex-col justify-between gap-8 overflow-hidden border border-rule-ink bg-surface-ink p-6 sm:p-8">
              <span aria-hidden className={`${ACCENT_GLOW} -bottom-24 -right-24 size-64 opacity-20`} />
              <p className="relative text-[1.0625rem] leading-relaxed text-ink-on-ink/90">
                {vevo.honesty.body}
              </p>
              <span className="relative flex items-center gap-3">
                <span aria-hidden className="size-2 bg-accent" />
                <Label tone="ink">
                  margin · {brand.chain.settlement} &nbsp;/&nbsp; token · ${ticker}
                </Label>
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <Head n="03" title={vevo.roadmap.title} />
            <ul className="flex flex-col gap-px border border-rule-ink bg-rule-ink">
              {vevo.roadmap.items.map((item, index) => (
                <li key={item.title} className="flex gap-5 bg-surface-ink p-6">
                  <span className="font-mono text-sm text-accent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex flex-1 flex-col gap-2">
                    <span className="flex flex-wrap items-center gap-3">
                      <b className="text-base font-medium">{item.title}</b>
                      <span className="label border border-rule-ink px-2 py-1 text-dim-ink">
                        {vevo.roadmap.tag}
                      </span>
                    </span>
                    <span className="text-sm leading-relaxed text-dim-ink">{item.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-faint">{vevo.roadmap.note}</p>
          </section>
        </div>

        {/* ------------------------------------------------- how to buy */}
        <section className="flex flex-col gap-6">
          <Head n="04" title={vevo.howto.title} />
          <ol className="grid gap-px border border-rule-ink bg-rule-ink sm:grid-cols-2 lg:grid-cols-4">
            {vevo.howto.steps.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-4 bg-surface-ink p-6">
                <span className="font-mono text-[2.5rem] leading-none text-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <b className="text-base font-medium">{step.title}</b>
                <span className="text-sm leading-relaxed text-dim-ink">{step.body}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-col items-start justify-between gap-4 border border-rule-ink bg-surface-ink-2 p-6 sm:flex-row sm:items-center">
            <span className="flex items-center gap-3">
              <span aria-hidden className="size-2 shrink-0 bg-accent" />
              <span className="text-sm text-dim-ink">{vevo.ca.trust}</span>
            </span>
            <Action href={pumpfun} primary>
              {vevo.actions.buy}
            </Action>
          </div>
        </section>
      </div>
    </>
  );
};
