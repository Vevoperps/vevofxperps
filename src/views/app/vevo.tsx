"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { app } from "@/data/app";
import { brand } from "@/lib/brand";
import { explorerLink } from "@/lib/chain/networks";
import { venue } from "@/lib/chain/venue";
import { PreviewBanner } from "@/views/app/app-shell";
import { GridField } from "@/views/home/grid-field";

/**
 * The token screen.
 *
 * **Why it opens with a band rather than a card.** Every other screen in the
 * app is a working instrument: a table, a ticket, a balance. This one has to
 * make an argument, and an argument that opens with a bordered box reads as a
 * settings page. So the ticker is set at display size over the same live grid
 * the landing's hero and footer use, and the facts sit under it as chips.
 *
 * **Nothing here is live, and the screen says so in each place rather than
 * once at the top.** The staking vault is not deployed, so the inputs accept
 * typing and the actions refuse, with the reason beside them. A screen that
 * looked live and reverted on signature would be worse than one that is honest
 * about being early.
 *
 * **Every number is a slot.** Supply, the distribution split and the stake a
 * tier asks for are decisions nobody has made. They read `tba` until they are
 * real, because a plausible figure on a token page is a claim, and a claim that
 * has to be retracted is how a project loses the room. The distribution bar is
 * drawn in that state too: striped, so the shape of the answer is visible
 * without inventing one.
 */

const { vevo } = app;

/** A figure, or the mark that says it does not exist yet. */
const Figure = ({
  value,
  large = false,
}: {
  value: string | null;
  large?: boolean;
}) =>
  value ? (
    <b
      className={`font-mono font-medium tabular-nums ${large ? "text-[2rem] leading-none" : "text-lg"}`}
    >
      {value}
    </b>
  ) : (
    <span
      className={`font-mono text-faint uppercase ${large ? "text-[1.25rem]" : "text-lg"}`}
    >
      {vevo.tba}
    </span>
  );

const Block = ({
  n,
  title,
  children,
  className = "",
}: {
  n: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <section
    className={`flex flex-col gap-6 border border-rule-ink bg-surface-ink p-6 sm:p-8 ${className}`}
  >
    <div className="flex items-center gap-3">
      <span aria-hidden className="label bg-accent px-2 py-1.5 pt-2 text-ink-on-ink">
        {n}
      </span>
      <Label tone="ink" strong>
        {title}
      </Label>
      <span aria-hidden className="h-px flex-1 bg-rule-ink" />
    </div>
    {children}
  </section>
);

/** The soft state every action on this page is in. */
const NotYet = ({ reason }: { reason: string }) => (
  <p className="flex items-center gap-3 border-l-2 border-accent bg-surface-ink-2 px-4 py-3">
    <span aria-hidden className="size-2 shrink-0 bg-accent" />
    <Label tone="ink">{reason}</Label>
  </p>
);

export const AppVevo = () => {
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const address = brand.token.address;
  const ticker = brand.token.ticker;

  const copy = () => {
    if (!address) return;
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <>
      <PreviewBanner />

      {/* The band. Full bleed, live grid, the ticker at display size. */}
      <div className="relative mt-6 flex min-h-[26rem] items-center overflow-hidden border-y border-rule-ink bg-surface-ink-2">
        <GridField className="absolute inset-0 size-full opacity-70" />

        {/*
          `pointer-events-none` on the whole column, restored on the parts that
          are actually interactive. Without it the text swallows the pointer
          and the grid behind it only lights in the gaps between words, which
          is what "not all the squares light up" looks like.
        */}
        <div className="pointer-events-none relative mx-auto flex w-full max-w-[90rem] flex-col gap-8 px-5 py-16 sm:px-8 sm:py-24">
          <h1 className="text-[clamp(3.25rem,13vw,9rem)] leading-[0.85] font-medium tracking-[-0.035em]">
            <span className="text-accent">$</span>
            {ticker}
          </h1>

          <p className="max-w-[56ch] text-sm leading-relaxed text-dim-ink">
            {vevo.lede}
          </p>

          <dl className="pointer-events-auto flex flex-wrap gap-px bg-rule-ink">
            {(
              [
                [vevo.facts.ticker, `$${ticker}`],
                [vevo.facts.chain, venue.network.name],
                [vevo.facts.supply, vevo.facts.supplyValue],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex min-w-[10rem] flex-1 flex-col gap-2 bg-surface-ink-2 px-5 py-4"
              >
                <dt>
                  <Label tone="ink">{label}</Label>
                </dt>
                <dd>
                  <Figure value={value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-px bg-rule-ink px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-px bg-rule-ink lg:grid lg:grid-cols-3">
          {/* Where a fee goes. The argument, drawn. */}
          <Block n="01" title={vevo.flow.title} className="lg:col-span-2">
            <ol className="grid gap-px bg-rule-ink sm:grid-cols-3">
              {vevo.flow.steps.map((step) => (
                <li
                  key={step.n}
                  className="flex flex-col gap-3 bg-surface-ink-2 p-5"
                >
                  <span className="font-mono text-[2rem] leading-none text-accent">
                    {step.n}
                  </span>
                  <Label tone="ink" strong>
                    {step.label}
                  </Label>
                  <p className="text-xs leading-relaxed text-dim-ink">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
            <p className="text-xs text-faint">{vevo.flow.split}</p>
          </Block>

          {/* The contract. */}
          <Block n="02" title={vevo.facts.contract}>
            {address ? (
              <div className="flex flex-col gap-4">
                <code className="break-all border border-rule-ink bg-surface-ink-2 p-4 font-mono text-xs leading-relaxed">
                  {address}
                </code>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copy}
                    className="label border border-rule-ink px-4 py-2.5 text-dim-ink transition-colors duration-[var(--duration-fast)] ease-entrance hover:border-accent hover:text-accent"
                  >
                    {copied ? vevo.facts.copied : vevo.facts.copy}
                  </button>
                  {venue.network.explorer ? (
                    <a
                      href={explorerLink(venue.network, "account", address) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="label border border-rule-ink px-4 py-2.5 text-accent transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-accent hover:text-ink-on-ink"
                    >
                      {vevo.facts.explorer}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col justify-center gap-4">
                <span
                  aria-hidden
                  className="dotfield h-24 w-full border border-rule-ink text-dim-ink"
                />
                <Label tone="ink">{vevo.facts.contractSoon}</Label>
              </div>
            )}
          </Block>
        </div>

        {/* Distribution, as a bar rather than a list of percentages. */}
        <Block n="03" title={vevo.distribution.title}>
          <div
            aria-hidden
            className="flex h-14 w-full overflow-hidden border border-rule-ink"
          >
            {vevo.distribution.rows.map((row, index) => (
              <span
                key={row.label}
                style={{
                  flexGrow: row.share ?? 1,
                  // No split decided, so the bar shows four equal unknowns
                  // rather than a shape somebody could read as the answer.
                  opacity: row.share === null ? 0.25 + index * 0.08 : 1,
                }}
                className={`border-r border-rule-ink last:border-r-0 ${
                  row.share === null ? "dotfield bg-surface-ink-2" : "bg-accent"
                }`}
              />
            ))}
          </div>

          <dl className="grid gap-px bg-rule-ink sm:grid-cols-2 lg:grid-cols-4">
            {vevo.distribution.rows.map((row) => (
              <div
                key={row.label}
                className="flex flex-col gap-2 bg-surface-ink-2 px-5 py-4"
              >
                <dt>
                  <Label tone="ink">{row.label}</Label>
                </dt>
                <dd>
                  <Figure value={row.share === null ? null : `${row.share}%`} />
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-xs text-faint">{vevo.distribution.note}</p>
        </Block>

        {/* Staking. */}
        <Block n="04" title={vevo.staking.title}>
          <p className="max-w-[72ch] text-sm leading-relaxed text-dim-ink">
            {vevo.staking.lede}
          </p>

          <div className="grid gap-px bg-rule-ink sm:grid-cols-3">
            {(
              [
                [vevo.staking.staked, null],
                [vevo.staking.rewards, null],
                [vevo.staking.totalStaked, null],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex flex-col gap-2 bg-surface-ink-2 p-6"
              >
                <Label tone="ink">{label}</Label>
                <Figure value={value} large />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <Label tone="ink">{vevo.staking.stakeLabel}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value.replace(/[^0-9.]/g, ""))
                }
                aria-label={vevo.staking.stakeLabel}
                className="min-w-[12rem] flex-1 border border-rule-ink bg-surface-ink-2 px-4 py-3.5 font-mono text-sm tabular-nums text-ink-on-ink outline-none transition-colors duration-[var(--duration-fast)] ease-entrance placeholder:text-faint focus:border-accent"
              />
              {[vevo.staking.stake, vevo.staking.unstake, vevo.staking.claim].map(
                (action) => (
                  <span
                    key={action}
                    title={vevo.staking.soon}
                    className="label cursor-not-allowed border border-rule-ink px-4 py-3.5 text-faint"
                  >
                    {action}
                  </span>
                ),
              )}
            </div>
          </div>

          <NotYet reason={vevo.staking.soon} />
          <p className="max-w-[72ch] text-xs leading-relaxed text-faint">
            {vevo.staking.why}
          </p>
        </Block>

        {/* The ladder. Each rung wider than the last, so the shape is the point. */}
        <Block n="05" title={vevo.tiers.title}>
          <p className="max-w-[72ch] text-sm leading-relaxed text-dim-ink">
            {vevo.tiers.lede}
          </p>

          <ul className="flex flex-col gap-px bg-rule-ink">
            {vevo.tiers.rows.map((row, index) => (
              <li
                key={row.tier}
                className="relative flex flex-wrap items-center justify-between gap-4 bg-surface-ink-2 px-5 py-5"
              >
                <span
                  aria-hidden
                  style={{ width: `${18 + index * 22}%` }}
                  className="absolute inset-y-0 left-0 bg-accent/10"
                />
                <span className="relative flex items-center gap-4">
                  <span aria-hidden className="size-2 bg-accent" />
                  <Label tone="ink" strong>
                    {row.tier}
                  </Label>
                </span>
                <span className="relative flex items-baseline gap-8">
                  <span className="flex flex-col gap-1">
                    <Label tone="ink">{vevo.tiers.columns.stake}</Label>
                    <Figure value={row.stake} />
                  </span>
                  <span className="flex flex-col gap-1">
                    <Label tone="ink">{vevo.tiers.columns.fee}</Label>
                    <Figure value={row.fee} />
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <NotYet reason={vevo.tiers.soon} />
        </Block>

        {/* The question every holder asks. */}
        <Block n="06" title={vevo.honesty.title}>
          <p className="max-w-[76ch] text-sm leading-relaxed text-dim-ink">
            {vevo.honesty.body}
          </p>
        </Block>
      </div>
    </>
  );
};
