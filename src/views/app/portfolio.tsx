"use client";

import Link from "next/link";
import { useState } from "react";

import { Label } from "@/components/ui/label";
import { TypeIn } from "@/components/ui/type-in";
import { app } from "@/data/app";
import { useVenueAccount } from "@/hooks/use-venue";
import type { Activity } from "@/lib/chain/read";
import { brand } from "@/lib/brand";
import { DEVNET_FAUCET_URL, deposit, explainRevert, withdraw } from "@/lib/chain/engine";
import { money, signed, toAmount } from "@/lib/chain/units";
import { Receipt } from "@/views/app/receipt";
import { venue } from "@/lib/chain/venue";
import { useWallet } from "@/lib/chain/wallet";
import { decimalsFor } from "@/views/home/use-markets";

/**
 * The portfolio block: what you are holding, what it is worth, and the two
 * buttons that move money.
 *
 * It is rendered at zero rather than hidden. Someone opening a venue for the
 * first time should see the shape of the thing they are about to use, and a
 * panel of zeros with a disabled deposit field says "nothing here yet" far
 * more clearly than an empty screen does. Once the venue is configured and a
 * wallet is connected, the same panel fills with real numbers and the same two
 * buttons start working — nothing is swapped for a different component.
 *
 * Used twice: as its own route, and at the foot of every market terminal, so a
 * trader never has to leave the pair to see their balance.
 */
export const Portfolio = ({ compact = false }: { compact?: boolean }) => {
  const [tab, setTab] = useState<string>(app.portfolio.tabs[0]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | "faucet" | null>(
    null,
  );
  const [problem, setProblem] = useState<string | null>(null);

  const address = useWallet((state) => state.address);
  const { snapshot, decimals, reload } = useVenueAccount();
  const positions = snapshot?.positions ?? [];
  const activity = snapshot?.activity ?? [];

  // The two tabs split the same event list: what happened to positions, and
  // what moved in or out of the balance.
  const history = activity.filter(
    (one) => one.kind !== "deposit" && one.kind !== "withdraw",
  );
  const transfers = activity.filter(
    (one) => one.kind === "deposit" || one.kind === "withdraw",
  );
  // A receipt is printed by anything that ended a position, however it ended:
  // a close, a partial close, or a liquidation. Especially a liquidation, which
  // is the one a trader most wants the numbers for.
  const receipts = activity.filter(
    (one) =>
      one.kind === "closed" ||
      one.kind === "reduced" ||
      one.kind === "liquidated",
  );

  const live = venue.live && address !== null;
  const idle = snapshot ? money(snapshot.free) : "0.00";
  // What the faucet fills and a deposit spends. Read from the settlement
  // token, not from the engine — see the note on `app.portfolio.transfers`.
  const inWallet = snapshot ? money(snapshot.wallet) : "0.00";

  const unrealised = positions.reduce((total, one) => total + one.pnl, 0);
  const fundingOwed = positions.reduce(
    (total, one) => total + one.accruedFunding,
    0,
  );
  const atRisk = positions.reduce((total, one) => total + one.margin, 0);

  const run = (
    kind: "deposit" | "withdraw" | "faucet",
    action: () => Promise<void>,
  ): void => {
    void (async () => {
      setBusy(kind);
      setProblem(null);
      try {
        await action();
        setAmount("");
        reload();
      } catch (error) {
        setProblem(explainRevert(error));
      } finally {
        setBusy(null);
      }
    })();
  };

  const counts: Record<string, number> = {
    Positions: positions.length,
    Orders: 0,
    History: history.length,
    Transfers: transfers.length,
    Receipts: receipts.length,
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="label bg-accent px-2 py-1.5 pt-2 text-ink-on-ink"
          >
            {compact ? "03" : "01"}
          </span>
          <Label tone="ink">{app.portfolio.title}</Label>
        </span>

        <h2 className="text-[1.75rem] font-medium leading-[1.1] tracking-tight sm:text-[2.25rem]">
          <TypeIn block text={app.portfolio.heading[0]} delay={120} />
          <TypeIn
            block
            text={app.portfolio.heading[1]}
            delay={120 + app.portfolio.heading[0].length * 17}
            className="text-dim-ink"
          />
        </h2>
      </div>

      <div className="grid gap-px border border-rule-ink bg-rule-ink sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5 bg-surface-ink p-5 lg:col-span-2">
          <Label tone="ink">{app.portfolio.total}</Label>
          <b
            className={`font-mono text-[2.5rem] font-medium leading-none tabular-nums ${
              unrealised - fundingOwed < 0 ? "text-negative" : ""
            }`}
          >
            {signed(unrealised - fundingOwed)}
          </b>
          <span className="label mt-1 text-faint">{app.portfolio.lede}</span>
        </div>

        {(
          [
            [app.portfolio.tiles.unrealised, unrealised],
            [app.portfolio.tiles.realised, -fundingOwed],
            [app.portfolio.tiles.staked, atRisk],
          ] as const
        ).map(([tile, value]) => (
          <div key={tile} className="flex flex-col gap-1.5 bg-surface-ink p-5">
            <Label tone="ink">{tile}</Label>
            <b
              className={`font-mono text-lg font-medium tabular-nums ${
                value < 0 ? "text-negative" : ""
              }`}
            >
              {signed(value)}
            </b>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Label tone="ink">
          {app.portfolio.transfers(brand.chain.settlement, idle, inWallet)}
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            disabled={!live}
            onChange={(event) =>
              setAmount(event.target.value.replace(/[^0-9.]/g, ""))
            }
            aria-label={app.portfolio.transfers(
              brand.chain.settlement,
              idle,
              inWallet,
            )}
            className={`min-w-[10rem] flex-1 border border-rule-ink bg-surface-ink-2 px-4 py-3 font-mono text-sm tabular-nums placeholder:text-faint ${
              live
                ? "text-ink-on-ink outline-none transition-colors duration-[var(--duration-fast)] ease-entrance focus:border-accent"
                : "cursor-not-allowed text-dim-ink"
            }`}
          />

          <button
            type="button"
            disabled={!live || busy !== null || amount === ""}
            onClick={() =>
              run("deposit", () => deposit(toAmount(amount, decimals)))
            }
            className={
              live
                ? "label border border-accent px-4 py-3 text-accent transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-accent hover:text-ink-on-ink disabled:cursor-not-allowed disabled:opacity-50"
                : "label cursor-not-allowed border border-rule-ink px-4 py-3 text-dim-ink"
            }
          >
            {busy === "deposit" ? app.ticket.working : app.portfolio.deposit}
          </button>

          <button
            type="button"
            disabled={!live || busy !== null || amount === ""}
            onClick={() =>
              run("withdraw", () => withdraw(toAmount(amount, decimals)))
            }
            className={
              live
                ? "label border border-rule-ink px-4 py-3 text-ink-on-ink transition-colors duration-[var(--duration-fast)] ease-entrance hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                : "label cursor-not-allowed border border-rule-ink px-4 py-3 text-dim-ink"
            }
          >
            {busy === "withdraw" ? app.ticket.working : app.portfolio.withdraw}
          </button>

          {/*
            Test networks only. The faucet is a function on the mock
            settlement token and exists nowhere else — against a real one the
            call reverts, which is why the button is not rendered rather than
            rendered and disappointing.

            This used to be gated on the chain being *local*, which was true
            while anvil was the only place this ran. On a public testnet it
            left no way to obtain the settlement token at all: deposit was
            available and there was nothing to deposit.
          */}
          {/* Devnet USDC comes from Circle's public faucet, not from the
              program, so on a test network this is a link there. */}
          {live && venue.network.testnet ? (
            <a
              href={DEVNET_FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="label border border-negative px-4 py-3 text-negative transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-negative hover:text-ink-on-ink"
            >
              {app.portfolio.faucet}
            </a>
          ) : null}
        </div>

        {problem ? (
          <p className="font-mono text-xs text-negative">{problem}</p>
        ) : null}
      </div>

      <div className="border border-rule-ink">
        <div className="flex flex-wrap gap-1 border-b border-rule-ink px-2">
          {app.portfolio.tabs.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setTab(entry)}
              aria-pressed={tab === entry}
              className={`label px-3 py-3 transition-colors duration-[var(--duration-fast)] ease-entrance ${
                tab === entry
                  ? "border-b-2 border-accent text-accent"
                  : "border-b-2 border-transparent text-dim-ink hover:text-ink-on-ink"
              }`}
            >
              {entry} {counts[entry] ?? 0}
            </button>
          ))}
        </div>

        {tab === "Positions" && positions.length > 0 ? (
          <PositionTable rows={positions} />
        ) : tab === "History" && history.length > 0 ? (
          <ActivityTable rows={history} />
        ) : tab === "Transfers" && transfers.length > 0 ? (
          <ActivityTable rows={transfers} />
        ) : tab === "Receipts" && receipts.length > 0 ? (
          <div className="flex flex-wrap gap-6 p-5">
            {receipts.map((event) => (
              <Receipt key={event.hash} event={event} />
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 font-mono text-xs text-dim-ink">
            {app.portfolio.empty[tab]}
          </p>
        )}
      </div>

      {live ? null : (
        <p className="label text-faint">{app.portfolio.connect}</p>
      )}
    </section>
  );
};

/** Open positions, as a table. Each row links to the pair it belongs to. */
const PositionTable = ({
  rows,
}: {
  rows: {
    symbol: string;
    isLong: boolean;
    notional: number;
    entryPrice: number;
    mark: number;
    pnl: number;
    liquidationPrice: number;
    liquidatable: boolean;
  }[];
}) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[42rem] border-collapse font-mono text-xs">
      <thead>
        <tr className="border-b border-rule-ink text-left">
          {Object.values(app.portfolio.columns).map((column) => (
            <th key={column} className="px-4 py-3 font-normal text-dim-ink">
              <Label tone="ink">{column}</Label>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const places = decimalsFor(row.mark || 1);

          return (
            <tr
              key={row.symbol}
              className="border-b border-rule-ink/60 last:border-b-0"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/app/market/${row.symbol.toLowerCase()}`}
                  className="text-ink-on-ink transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent"
                >
                  {row.symbol}
                </Link>
              </td>
              <td
                className={`px-4 py-3 ${row.isLong ? "text-accent" : "text-dim-ink"}`}
              >
                {row.isLong ? app.ticket.long : app.ticket.short}
              </td>
              <td className="px-4 py-3 tabular-nums text-ink-on-ink">
                {money(row.notional)}
              </td>
              <td className="px-4 py-3 tabular-nums text-dim-ink">
                {row.entryPrice.toFixed(places)}
              </td>
              <td className="px-4 py-3 tabular-nums text-ink-on-ink">
                {row.mark.toFixed(places)}
              </td>
              <td
                className={`px-4 py-3 tabular-nums ${
                  row.pnl >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {signed(row.pnl)}
              </td>
              <td
                className={`px-4 py-3 tabular-nums ${
                  row.liquidatable ? "text-negative" : "text-dim-ink"
                }`}
              >
                {row.liquidationPrice.toFixed(places)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

/**
 * What this account has done, straight from the contract's events.
 *
 * One table serves both the history and the transfers tab, because the two are
 * the same list filtered differently and a second component would be a second
 * place for the formatting to drift.
 */
const ActivityTable = ({ rows }: { rows: Activity[] }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[44rem] border-collapse font-mono text-xs">
      <thead>
        <tr className="border-b border-rule-ink text-left">
          {Object.values(app.portfolio.activity.columns).map((column) => (
            <th key={column} className="px-4 py-3 font-normal text-dim-ink">
              <Label tone="ink">{column}</Label>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`${row.hash}-${row.kind}-${row.symbol ?? ""}`}
            className="border-b border-rule-ink/60 last:border-b-0"
          >
            <td className="px-4 py-3 text-ink-on-ink">
              {app.portfolio.activity[row.kind]}
            </td>
            <td className="px-4 py-3 text-dim-ink">
              {row.symbol ? (
                <Link
                  href={`/app/market/${row.symbol.toLowerCase()}`}
                  className="transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent"
                >
                  {row.symbol}
                </Link>
              ) : (
                "·"
              )}
            </td>
            <td className="px-4 py-3 tabular-nums text-dim-ink">
              {row.price === undefined
                ? "·"
                : row.price.toFixed(decimalsFor(row.price || 1))}
            </td>
            <td className="px-4 py-3 tabular-nums text-ink-on-ink">
              {money(row.amount)}
            </td>
            <td
              className={`px-4 py-3 tabular-nums ${
                row.pnl === undefined
                  ? "text-dim-ink"
                  : row.pnl >= 0
                    ? "text-positive"
                    : "text-negative"
              }`}
            >
              {row.pnl === undefined ? "·" : signed(row.pnl)}
            </td>
            <td className="px-4 py-3 text-dim-ink">{when(row)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * When it happened, in the plainest form that is true.
 *
 * A block without a timestamp is dated by its number rather than guessed at —
 * a wrong time on a trade record is worse than an honest block height.
 */
const when = (row: Activity): string => {
  if (row.at === undefined) return `#${row.block}`;

  return new Date(row.at * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};
