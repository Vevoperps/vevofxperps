"use client";

import { useMemo, useState } from "react";

import { Label } from "@/components/ui/label";
import { app } from "@/data/app";
import { usePosition, useVenueAccount } from "@/hooks/use-venue";
import { brand } from "@/lib/brand";
import {
  addMargin,
  closePosition,
  explainRevert,
  openPosition,
  reducePosition,
} from "@/lib/chain/engine";
import { money, signed, toAmount } from "@/lib/chain/units";
import { venue } from "@/lib/chain/venue";
import { useWallet } from "@/lib/chain/wallet";
import { decimalsFor } from "@/views/home/use-markets";
import { ReceiptCard } from "@/views/app/receipt";

/**
 * The order ticket: a side, a margin, a leverage, and the four numbers that
 * decide whether the trade is worth taking.
 *
 * Every figure is computed from the same arithmetic the documentation states,
 * so the page and the handbook can never disagree: notional is margin times
 * leverage, the fee is 0.05% of notional, the liquidation price is the entry
 * moved by one over the leverage less the maintenance margin, and the payout
 * is capped at ten times the margin. The venue computes the same four from
 * the same constants, so the ticket is a preview of the transaction rather
 * than an illustration of one.
 *
 * **The action says exactly what it will do, or exactly why it will not.**
 * Connect, switch chain, deposit, open — the button walks a first trade
 * through each in the order it actually meets them. A venue that renders a
 * live-looking button over a feature that does not exist is teaching its users
 * that its buttons lie.
 *
 * With a position already open on this pair, the ticket becomes that position:
 * its side, its size, what it is worth and how far it is from liquidation,
 * with one button to close it. One pair, one isolated position — the engine
 * enforces it, so the ticket shows it rather than offering a second.
 */

/** Charged on notional, each way. */
const FEE = 0.0005;
/** The floor equity is measured against, as a share of notional. */
const MAINTENANCE = 0.005;
/** The most a position can return, as a multiple of its margin. */
const PAYOUT_CAP = 10;

/**
 * The fee, at a precision that shows it.
 *
 * Two decimals is right for a notional and wrong for a fee: 0.05% of a small
 * position rounds to 0.00, which reads as free rather than as small.
 */
const fee = (value: number): string =>
  value >= 1 ? money(value) : value.toFixed(4);

export const Ticket = ({
  mark,
  maxLeverage,
  symbol,
  warming = false,
}: {
  mark: number;
  maxLeverage: number;
  /** The pair, as the engine names it. Omitted in the preview. */
  symbol?: string;
  /**
   * Quoted, but with no mark on chain yet.
   *
   * The rate beside this ticket is real; what is missing is the number the
   * venue would fill at, which the price loop writes once it knows somebody is
   * here. A button offered in that window would open a wallet and then revert,
   * so the ticket says what is happening instead.
   */
  warming?: boolean;
}) => {
  const [side, setSide] = useState<"long" | "short">("long");
  const [margin, setMargin] = useState("100");
  const [leverage, setLeverage] = useState(Math.min(5, maxLeverage));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [wantsReceipt, setWantsReceipt] = useState(false);

  const address = useWallet((state) => state.address);
  const chainId = useWallet((state) => state.chainId);
  const ensureChain = useWallet((state) => state.ensureChain);

  const { snapshot, decimals, reload } = useVenueAccount();
  const held = usePosition(symbol);

  const figures = useMemo(() => {
    const posted = Math.max(0, Number(margin) || 0);
    const notional = posted * leverage;
    // Liquidation sits where the adverse move has eaten everything above the
    // maintenance floor: one over the leverage, less that floor.
    const distance = Math.max(0, 1 / leverage - MAINTENANCE);
    const liquidation =
      side === "long" ? mark * (1 - distance) : mark * (1 + distance);

    return {
      posted,
      notional,
      liquidation,
      fee: notional * FEE,
      payout: posted * PAYOUT_CAP,
    };
  }, [margin, leverage, side, mark]);

  const decimalPlaces = decimalsFor(mark || 1);
  const idle = snapshot ? money(snapshot.free) : "0.00";

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      await action();
      reload();
    } catch (error) {
      setProblem(explainRevert(error));
    } finally {
      setBusy(false);
    }
  };

  const onOpen = () =>
    void run(async () => {
      if (!symbol) return;
      await openPosition(
        symbol,
        side === "long",
        toAmount(margin, decimals),
        leverage,
      );
    });

  const onClose = () =>
    void run(async () => {
      if (!symbol) return;
      await closePosition(symbol);
      // The slip is asked for here and rendered below once the close event
      // reaches the snapshot. `run` has already called `reload`, so that is a
      // poll away rather than a round trip of its own.
      setWantsReceipt(true);
    });

  // The newest event that ended a position on this pair. Nothing is fabricated
  // while waiting: with no event yet there is no slip.
  const receipt =
    wantsReceipt && symbol
      ? (snapshot?.activity ?? []).find(
          (one) =>
            one.symbol === symbol &&
            (one.kind === "closed" || one.kind === "liquidated"),
        )
      : undefined;

  const onAddMargin = (amount: string) =>
    void run(async () => {
      if (!symbol) return;
      await addMargin(symbol, toAmount(amount, decimals));
    });

  const onReduce = (notional: string) =>
    void run(async () => {
      if (!symbol) return;
      await reducePosition(symbol, toAmount(notional, decimals));
    });

  return (
    <aside className="flex h-full flex-col border border-rule-ink bg-surface-ink-2/40">
      {/* The slip, above the ticket that produced it, until it is dismissed. */}
      {receipt ? (
        <ReceiptCard event={receipt} onDismiss={() => setWantsReceipt(false)} />
      ) : null}

      <div className="grid grid-cols-2 gap-px bg-rule-ink">
        {(["long", "short"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSide(option)}
            aria-pressed={side === option}
            disabled={held !== null}
            className={`label py-3.5 transition-colors duration-[var(--duration-fast)] ease-entrance disabled:opacity-40 ${
              side === option
                ? "bg-accent text-ink-on-ink"
                : "bg-surface-ink text-dim-ink hover:text-ink-on-ink"
            }`}
          >
            {option === "long" ? app.ticket.long : app.ticket.short}
          </button>
        ))}
      </div>

      {held ? (
        <PositionPanel
          held={held}
          decimals={decimalPlaces}
          idle={idle}
          busy={busy}
          problem={problem}
          onClose={onClose}
          onAddMargin={onAddMargin}
          onReduce={onReduce}
        />
      ) : (
        <div className="flex flex-1 flex-col gap-5 p-4">
          <label className="flex flex-col gap-2">
            <Label tone="ink">
              {app.ticket.marginLabel(brand.chain.settlement, idle)}
            </Label>
            <input
              inputMode="decimal"
              value={margin}
              onChange={(event) =>
                setMargin(event.target.value.replace(/[^0-9.]/g, ""))
              }
              className="w-full border-b border-rule-ink bg-transparent pb-2 font-mono text-lg tabular-nums text-ink-on-ink outline-none transition-colors duration-[var(--duration-fast)] ease-entrance focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between">
              <Label tone="ink">{app.ticket.leverage}</Label>
              <span className="label text-accent">{leverage}x</span>
            </span>
            <input
              type="range"
              min={1}
              max={maxLeverage}
              step={1}
              value={leverage}
              onChange={(event) => setLeverage(Number(event.target.value))}
              aria-label={app.ticket.leverage}
              className="h-1 w-full cursor-pointer appearance-none bg-rule-ink accent-accent"
            />
          </label>

          <dl className="flex flex-col gap-2.5 font-mono text-xs">
            {[
              [
                app.ticket.entry,
                venue.live
                  ? mark.toFixed(decimalPlaces)
                  : app.ticket.entryValue,
              ],
              [app.ticket.notional, money(figures.notional)],
              [
                app.ticket.liquidation,
                figures.liquidation.toFixed(decimalPlaces),
              ],
              [app.ticket.fee, fee(figures.fee)],
              [
                app.ticket.payout,
                app.ticket.payoutValue(money(figures.payout)),
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

          <p className="text-xs leading-relaxed text-dim-ink">
            {problem ?? app.ticket.note}
          </p>

          <Action
            busy={busy}
            side={side}
            symbol={symbol}
            address={address}
            chainId={chainId}
            free={snapshot?.free ?? 0}
            posted={figures.posted}
            warming={warming}
            onConnect={() => void ensureChain()}
            onOpen={onOpen}
          />
        </div>
      )}
    </aside>
  );
};

/**
 * One button, walking a first trade through the reasons it cannot happen yet.
 *
 * Each state is a different sentence rather than one disabled button, because
 * "connect a wallet", "you are on the wrong chain" and "you have no balance"
 * are three different problems with three different fixes.
 */
const Action = ({
  busy,
  side,
  symbol,
  address,
  chainId,
  free,
  posted,
  warming,
  onConnect,
  onOpen,
}: {
  busy: boolean;
  side: "long" | "short";
  symbol: string | undefined;
  address: string | null;
  chainId: number | null;
  free: number;
  posted: number;
  warming: boolean;
  onConnect: () => void;
  onOpen: () => void;
}) => {
  const dead =
    "label mt-auto w-full cursor-not-allowed border border-rule-ink bg-surface-ink px-4 py-3.5 text-dim-ink";
  const alive =
    "label mt-auto w-full border border-accent bg-accent px-4 py-3.5 text-ink-on-ink transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-transparent hover:text-accent disabled:cursor-wait disabled:opacity-60";

  if (!venue.live || !symbol) {
    return (
      <button type="button" disabled className={dead}>
        {app.ticket.action}
      </button>
    );
  }

  if (!address) {
    return (
      <button type="button" disabled className={dead}>
        {app.ticket.connect}
      </button>
    );
  }

  if (chainId !== venue.chainId) {
    return (
      <button type="button" onClick={onConnect} className={alive}>
        {/* The chain we are deployed to, not the one the brand is named for. */}
        {app.ticket.switchChain(venue.network.name)}
      </button>
    );
  }

  // Before the balance check: a full balance cannot open a market that has no
  // price, so "deposit first" would be the wrong sentence to read here.
  if (warming) {
    return (
      <button type="button" disabled className={dead}>
        {app.ticket.warming}
      </button>
    );
  }

  if (free < posted || posted <= 0) {
    return (
      <button type="button" disabled className={dead}>
        {app.ticket.fund}
      </button>
    );
  }

  return (
    <button type="button" onClick={onOpen} disabled={busy} className={alive}>
      {busy ? app.ticket.working : app.ticket.open(side)}
    </button>
  );
};

/** The ticket, once there is a position on this pair to look at instead. */
const PositionPanel = ({
  held,
  decimals,
  idle,
  busy,
  problem,
  onClose,
  onAddMargin,
  onReduce,
}: {
  held: {
    isLong: boolean;
    notional: number;
    entryPrice: number;
    mark: number;
    pnl: number;
    accruedFunding: number;
    liquidationPrice: number;
    liquidatable: boolean;
  };
  decimals: number;
  idle: string;
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onAddMargin: (amount: string) => void;
  onReduce: (notional: string) => void;
}) => {
  const [topUp, setTopUp] = useState("");
  const [trim, setTrim] = useState("");

  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <dl className="flex flex-col gap-2.5 font-mono text-xs">
        {[
          [
            app.ticket.yours.side,
            held.isLong ? app.ticket.long : app.ticket.short,
            "text-ink-on-ink",
          ],
          [app.ticket.yours.size, money(held.notional), "text-ink-on-ink"],
          [
            app.ticket.yours.entry,
            held.entryPrice.toFixed(decimals),
            "text-ink-on-ink",
          ],
          [
            app.ticket.yours.mark,
            held.mark.toFixed(decimals),
            "text-ink-on-ink",
          ],
          [
            app.ticket.yours.pnl,
            signed(held.pnl),
            held.pnl >= 0 ? "text-positive" : "text-negative",
          ],
          [
            app.ticket.yours.funding,
            signed(-held.accruedFunding),
            held.accruedFunding <= 0 ? "text-positive" : "text-negative",
          ],
          [
            app.ticket.yours.liquidation,
            held.liquidationPrice.toFixed(decimals),
            held.liquidatable ? "text-negative" : "text-dim-ink",
          ],
        ].map(([term, value, tone]) => (
          <div
            key={term}
            className="flex items-baseline justify-between gap-3 border-b border-dashed border-rule-ink/60 pb-2 last:border-b-0"
          >
            <dt className="text-dim-ink">{term}</dt>
            <dd className={`tabular-nums ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {/* Two things a position needs that closing it does not do: more room
        before liquidation, and a way out of part of it. The venue has
        supported both from the start. */}
      <div className="flex flex-col gap-3">
        <Label tone="ink">
          {app.ticket.manage.marginLabel(brand.chain.settlement, idle)}
        </Label>
        <Manage
          value={topUp}
          onChange={setTopUp}
          busy={busy}
          action={app.ticket.manage.add}
          onSubmit={() => {
            onAddMargin(topUp);
            setTopUp("");
          }}
        />

        <Label tone="ink">
          {app.ticket.manage.reduceLabel(money(held.notional))}
        </Label>
        <Manage
          value={trim}
          onChange={setTrim}
          busy={busy}
          action={app.ticket.manage.reduce}
          shortcut={{
            label: app.ticket.manage.half,
            onPick: () => setTrim((held.notional / 2).toFixed(2)),
          }}
          onSubmit={() => {
            onReduce(trim);
            setTrim("");
          }}
        />
      </div>

      <p className="text-xs leading-relaxed text-dim-ink">
        {problem ?? app.ticket.manage.note}
      </p>

      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="label mt-auto w-full border border-rule-ink px-4 py-3.5 text-ink-on-ink transition-colors duration-[var(--duration-fast)] ease-entrance hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? app.ticket.closing : app.ticket.close}
      </button>
    </div>
  );
};

/** One small amount field, for the two controls a live position needs. */
const Manage = ({
  value,
  onChange,
  busy,
  action,
  onSubmit,
  shortcut,
}: {
  value: string;
  onChange: (next: string) => void;
  busy: boolean;
  action: string;
  onSubmit: () => void;
  shortcut?: { label: string; onPick: () => void };
}) => (
  <div className="flex items-center gap-2">
    <input
      inputMode="decimal"
      placeholder="0.00"
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}
      aria-label={action}
      className="min-w-0 flex-1 border border-rule-ink bg-surface-ink px-3 py-2.5 font-mono text-xs tabular-nums text-ink-on-ink outline-none transition-colors duration-[var(--duration-fast)] ease-entrance placeholder:text-faint focus:border-accent"
    />

    {shortcut ? (
      <button
        type="button"
        onClick={shortcut.onPick}
        className="label border border-rule-ink px-2.5 py-2.5 text-dim-ink transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent"
      >
        {shortcut.label}
      </button>
    ) : null}

    <button
      type="button"
      disabled={busy || value === ""}
      onClick={onSubmit}
      className="label border border-accent px-3 py-2.5 text-accent transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-accent hover:text-ink-on-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {action}
    </button>
  </div>
);
