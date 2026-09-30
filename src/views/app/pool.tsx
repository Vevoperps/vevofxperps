"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { TypeIn } from "@/components/ui/type-in";
import { app } from "@/data/app";
import { useVenueAccount, useVenuePool } from "@/hooks/use-venue";
import { brand } from "@/lib/brand";
import {
  addLiquidity,
  explainRevert,
  removeLiquidity,
} from "@/lib/chain/engine";
import { money, toAmount } from "@/lib/chain/units";
import { venue } from "@/lib/chain/venue";
import { useWallet } from "@/lib/chain/wallet";
import { PreviewBanner } from "@/views/app/app-shell";

/**
 * The pool: the other side of every trade, and how to own part of it.
 *
 * Without this screen the venue cannot work at all. The engine is a
 * peer-to-pool design — a trade fills against liquidity rather than against
 * another trader — so until somebody puts settlement tokens in, `openPosition`
 * reverts on the first reservation and nothing trades.
 *
 * **Reserved is the number that matters.** Every open position has its payout
 * cap reserved out of the pool and a provider cannot withdraw that part until
 * the position closes. That is exactly what makes the cap on the trader's
 * ticket worth something, so it is shown at the same size as the pool's own
 * total rather than hidden in a footnote.
 */

export const AppPool = () => {
  const [provide, setProvide] = useState("");
  const [redeem, setRedeem] = useState("");
  const [busy, setBusy] = useState<"provide" | "redeem" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const address = useWallet((state) => state.address);
  const { snapshot, decimals, reload } = useVenueAccount();
  const { pool } = useVenuePool();

  const live = venue.live && address !== null;
  // Liquidity is provided from the free balance inside the venue.
  const wallet = snapshot ? money(snapshot.free) : "0.00";

  /**
   * What this provider can actually take out right now, in settlement tokens.
   *
   * Their own position, capped by the pool's free part. Both halves matter: a
   * provider who owns everything still cannot withdraw liquidity reserved
   * behind somebody's open position.
   */
  const redeemable = Math.min(pool?.value ?? 0, pool?.free ?? 0);

  const run = (
    kind: "provide" | "redeem",
    action: () => Promise<void>,
  ): void => {
    void (async () => {
      setBusy(kind);
      setProblem(null);
      try {
        await action();
        setProvide("");
        setRedeem("");
        reload();
      } catch (error) {
        setProblem(explainRevert(error));
      } finally {
        setBusy(null);
      }
    })();
  };

  const stats: [string, string][] = [
    [app.pool.stats.size, money(pool?.assets ?? 0)],
    [app.pool.stats.reserved, money(pool?.reserved ?? 0)],
    [app.pool.stats.free, money(pool?.free ?? 0)],
    [
      app.pool.stats.utilisation,
      `${((pool?.utilisation ?? 0) * 100).toFixed(1)}%`,
    ],
  ];

  return (
    <>
      <PreviewBanner />

      <section className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="label bg-accent px-2 py-1.5 pt-2 text-ink-on-ink"
            >
              01
            </span>
            <Label tone="ink">{app.pool.title}</Label>
          </span>

          <h1 className="text-[1.75rem] font-medium leading-[1.1] tracking-tight sm:text-[2.25rem]">
            <TypeIn block text={app.pool.heading[0]} delay={120} />
            <TypeIn
              block
              text={app.pool.heading[1]}
              delay={120 + app.pool.heading[0].length * 17}
              className="text-dim-ink"
            />
          </h1>

          <p className="max-w-[60ch] text-sm leading-relaxed text-dim-ink">
            {app.pool.lede}
          </p>
        </div>

        {/* The pool itself. Reserved sits beside the total because the two
            only mean anything together. */}
        <div className="grid gap-px border border-rule-ink bg-rule-ink sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(([term, value]) => (
            <div
              key={term}
              className="flex flex-col gap-1.5 bg-surface-ink p-5"
            >
              <Label tone="ink">{term}</Label>
              <b className="font-mono text-[1.75rem] font-medium leading-none tabular-nums">
                {value}
              </b>
            </div>
          ))}
        </div>

        <div className="grid gap-px border border-rule-ink bg-rule-ink lg:grid-cols-[1fr_1fr]">
          {/* What this account holds. */}
          <div className="flex flex-col gap-5 bg-surface-ink p-5">
            <Label tone="ink">{app.pool.yours}</Label>

            <dl className="flex flex-col gap-2.5 font-mono text-xs">
              {[
                [app.pool.yourValue, money(pool?.value ?? 0)],
                [
                  app.pool.yourShare,
                  `${((pool?.ownership ?? 0) * 100).toFixed(2)}%`,
                ],
              ].map(([term, value]) => (
                <div
                  key={term}
                  className="flex items-baseline justify-between gap-3 border-b border-dashed border-rule-ink/60 pb-2 last:border-b-0"
                >
                  <dt className="text-dim-ink">{term}</dt>
                  <dd className="tabular-nums text-ink-on-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-col gap-3">
              <Label tone="ink">
                {app.pool.addLabel(brand.chain.settlement, wallet)}
              </Label>
              <Row
                value={provide}
                onChange={setProvide}
                live={live}
                busy={busy !== null}
                action={app.pool.add}
                working={busy === "provide"}
                onSubmit={() =>
                  run("provide", () =>
                    addLiquidity(toAmount(provide, decimals)),
                  )
                }
              />

              <Label tone="ink">{app.pool.removeLabel(money(redeemable))}</Label>
              {/*
                Dead until there is something to redeem. An account holding no
                shares cannot take anything out, and a field that accepts a
                number and then fails is worse than one that never invited it:
                the wallet opens, the node refuses, and the refusal arrives as
                whatever the wallet chose to call it.

                The ceiling is the smaller of what this provider owns and what
                the pool has free: liquidity reserved behind an open position
                cannot come out until that position closes, and offering it
                would be offering something the venue will refuse.
              */}
              <Row
                value={redeem}
                onChange={setRedeem}
                live={live && redeemable > 0}
                busy={busy !== null}
                action={app.pool.remove}
                working={busy === "redeem"}
                onSubmit={() =>
                  run("redeem", () =>
                    removeLiquidity(
                      sharesFor(
                        Number(redeem) || 0,
                        pool?.shares ?? "0",
                        pool?.value ?? 0,
                      ),
                    ),
                  )
                }
                max={
                  redeemable > 0
                    ? () => setRedeem(redeemable.toFixed(decimals))
                    : undefined
                }
              />

              {problem ? (
                <p className="font-mono text-xs text-negative">{problem}</p>
              ) : null}

              {live ? null : (
                <p className="label text-faint">{app.pool.empty}</p>
              )}
            </div>
          </div>

          {/* What a provider is taking on. */}
          <div className="flex flex-col gap-4 bg-surface-ink p-5">
            <Label tone="ink">Risk</Label>
            <dl className="flex flex-col gap-4">
              {app.pool.risk.map((item) => (
                <div key={item.term} className="flex flex-col gap-1">
                  <dt className="text-sm text-ink-on-ink">{item.term}</dt>
                  <dd className="max-w-[46ch] text-xs leading-relaxed text-dim-ink">
                    {item.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </>
  );
};

/**
 * The share count worth `amount` of this provider's own position.
 *
 * **The field says dollars and the engine wants shares.** `removeLiquidity`
 * redeems a share count, and the first provider into an empty pool is minted
 * exactly one share whatever they put in — so a position worth twenty dollars
 * reads as `1`. A field labelled "up to 20.00" that then refuses 20 and
 * accepts 1 is a trap, and the number it wants is not one anybody could guess.
 *
 * So the field takes dollars, like every other field on this screen, and the
 * conversion happens here. `value` is what this provider's shares are worth, so
 * the ratio needs nothing from the pool's totals.
 *
 * Asking for everything sends the share balance itself rather than a computed
 * one: a rounded-down conversion would leave a dust share behind, and "redeem
 * all" that leaves something is the kind of detail people screenshot.
 */
const sharesFor = (amount: number, held: string, value: number): bigint => {
  const shares = BigInt(held);
  if (shares === 0n || value <= 0 || amount <= 0) return 0n;
  if (amount >= value) return shares;

  // Through an integer ratio rather than float maths on a bigint: the fraction
  // is the only part that needs the float, and nine digits of it is more
  // precision than a dollar amount typed into a box can carry.
  const ratio = BigInt(Math.round((amount / value) * 1e9));
  return (shares * ratio) / 1_000_000_000n;
};

/** One amount field and the button that sends it. */
const Row = ({
  value,
  onChange,
  live,
  busy,
  action,
  working,
  onSubmit,
  max,
}: {
  value: string;
  onChange: (next: string) => void;
  live: boolean;
  busy: boolean;
  action: string;
  working: boolean;
  onSubmit: () => void;
  max?: (() => void) | undefined;
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <input
      inputMode="decimal"
      placeholder="0.00"
      value={value}
      disabled={!live}
      onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}
      aria-label={action}
      className={`min-w-[8rem] flex-1 border border-rule-ink bg-surface-ink-2 px-4 py-3 font-mono text-sm tabular-nums placeholder:text-faint ${
        live
          ? "text-ink-on-ink outline-none transition-colors duration-[var(--duration-fast)] ease-entrance focus:border-accent"
          : "cursor-not-allowed text-dim-ink"
      }`}
    />

    {live && max ? (
      <button
        type="button"
        onClick={max}
        className="label border border-rule-ink px-3 py-3 text-dim-ink transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent"
      >
        {app.pool.max}
      </button>
    ) : null}

    <button
      type="button"
      disabled={!live || busy || value === ""}
      onClick={onSubmit}
      className={
        live
          ? "label border border-accent px-4 py-3 text-accent transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-accent hover:text-ink-on-ink disabled:cursor-not-allowed disabled:opacity-50"
          : "label cursor-not-allowed border border-rule-ink px-4 py-3 text-dim-ink"
      }
    >
      {working ? app.ticket.working : action}
    </button>
  </div>
);
