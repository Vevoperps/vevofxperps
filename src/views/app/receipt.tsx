import { Label } from "@/components/ui/label";
import { app } from "@/data/app";
import type { Activity } from "@/lib/chain/read";
import { brand } from "@/lib/brand";
import { money, signed } from "@/lib/chain/units";
import { explorerLink } from "@/lib/chain/networks";
import { venue } from "@/lib/chain/venue";

/**
 * The paper slip a closed position prints.
 *
 * The landing shows this as a photograph; here it is real markup, because the
 * numbers on it are a particular trade's and have to come off the chain rather
 * than out of an image editor.
 *
 * **Every line is from the close event, or derived from it.** The contract
 * emits the exit price, the payout, the result, the fee and the funding. The
 * margin is not emitted, but it is recoverable exactly: the payout is the
 * margin plus the result, less the fee and the funding, so the margin is what
 * is left when those are put back. Nothing here is estimated.
 *
 * The side is not on the slip for the same reason the margin is: it is not in
 * the event. Rather than print a guess next to five exact figures, it is left
 * off, and the pair with its exit price says what happened.
 *
 * The barcode is drawn from the transaction hash, so two slips are only
 * identical when they are the same transaction.
 */

const { receipt } = app;

/** A dotted leader, the way a till roll sets its columns. */
const Line = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline gap-2">
    <span className="whitespace-nowrap">{label}</span>
    <span
      aria-hidden
      className="min-w-4 flex-1 translate-y-[-0.2em] border-b border-dotted border-current opacity-40"
    />
    <span className="whitespace-nowrap tabular-nums">{value}</span>
  </div>
);

const Rule = () => (
  <div aria-hidden className="border-t border-dashed border-current opacity-40" />
);

/** Bars from the hash. Deterministic, so the slip is stable across renders. */
const Barcode = ({ seed }: { seed: string }) => {
  const bars = Array.from({ length: 48 }, (_, index) => {
    const char = seed.charCodeAt((index * 3 + 2) % seed.length) || 48;
    return (char % 3) + 1;
  });

  return (
    <div aria-hidden className="flex h-10 items-stretch gap-[2px]">
      {bars.map((weight, index) => (
        <span
          key={`${index}-${weight}`}
          className="bg-current"
          style={{ width: `${weight}px` }}
        />
      ))}
    </div>
  );
};

export const Receipt = ({ event }: { event: Activity }) => {
  const pnl = event.pnl ?? 0;
  const fee = event.fee ?? 0;
  const funding = event.funding ?? 0;

  // payout = margin + pnl - fee - funding, so the margin is the payout with
  // the three put back.
  const margin = event.amount - pnl + fee + funding;

  const when = event.at
    ? new Date(event.at * 1000).toISOString().slice(0, 16).replace("T", " ")
    : null;

  return (
    <figure className="m-0 flex w-full max-w-[22rem] flex-col gap-4 bg-surface-paper px-6 py-7 font-mono text-[0.8125rem] leading-relaxed text-foreground shadow-[0_1.5rem_3rem_-1.5rem_rgba(0,0,0,0.6)]">
      <figcaption className="text-center text-[0.6875rem] font-semibold tracking-[0.18em] uppercase">
        {receipt.header}
      </figcaption>

      <Rule />

      <p className="text-center text-[2.5rem] leading-none font-medium tracking-tight">
        {brand.name}
      </p>

      <Rule />

      <div className="flex flex-col gap-1.5">
        <Line label={receipt.pair} value={event.symbol ?? receipt.unknown} />
        <Line label={receipt.margin} value={money(margin)} />
        {event.price ? (
          <Line label={receipt.exit} value={event.price.toFixed(4)} />
        ) : null}
        <Line label={receipt.result} value={signed(pnl)} />
        <Line label={receipt.fee} value={money(fee)} />
        {funding !== 0 ? (
          <Line label={receipt.funding} value={signed(-funding)} />
        ) : null}
      </div>

      <Rule />

      <div className="flex items-baseline justify-between gap-3 text-[1.0625rem] font-semibold">
        <span className="tracking-[0.12em] uppercase">{receipt.payout}</span>
        <span className="tabular-nums">{money(event.amount)}</span>
      </div>

      <Rule />

      <div className="flex flex-col gap-0.5 text-[0.6875rem] tracking-[0.08em] uppercase opacity-70">
        <span>{receipt.filled}</span>
        <span>{receipt.settled(brand.chain.settlement)}</span>
        {when ? <span>{when} UTC</span> : null}
      </div>

      <Barcode seed={event.hash} />

      <div className="flex items-baseline justify-between gap-3 text-[0.625rem] tracking-[0.08em] uppercase opacity-70">
        <span>{brand.url.replace(/^https?:\/\//, "")}</span>
        {/* Only money moving in or out is a Solana transaction; trades are
            entries in the venue's ledger and have no explorer page. */}
        {venue.network.explorer && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(event.hash) ? (
          <a
            href={explorerLink(venue.network, "tx", event.hash) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {receipt.verify}
          </a>
        ) : (
          <span>{event.hash.slice(0, 10)}</span>
        )}
      </div>
    </figure>
  );
};

/** The slip that appears the moment a close lands, with a way to dismiss it. */
export const ReceiptCard = ({
  event,
  onDismiss,
}: {
  event: Activity;
  onDismiss: () => void;
}) => (
  <div className="flex flex-col items-center gap-3 border border-rule-ink bg-surface-ink-2/40 p-5">
    <Label tone="ink">{receipt.printed}</Label>
    <Receipt event={event} />
    <button
      type="button"
      onClick={onDismiss}
      className="label border border-rule-ink px-4 py-2.5 text-dim-ink transition-colors duration-[var(--duration-fast)] ease-entrance hover:border-accent hover:text-accent"
    >
      {receipt.dismiss}
    </button>
  </div>
);
