"use client";

/**
 * The $VEVO page while it is closed for maintenance.
 *
 * The token page is waiting on things that only exist after launch — the
 * contract address, the ticker's links — so until the patch that fills them
 * in, it is closed behind a code. What a visitor sees is the page's own band
 * with a plain statement that it is being worked on, not a login screen: the
 * code field is small and secondary, for the team.
 *
 * The code is checked by `/api/token-page`, never here; a correct one sets a
 * cookie and the page reloads into the real screen.
 */

import { useState, type FormEvent } from "react";

import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { brand } from "@/lib/brand";
import { GridField } from "@/views/home/grid-field";

export const AppVevoLock = () => {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !code.trim()) return;

    setPending(true);
    setError(null);

    try {
      await apiFetch("/api/token-page", {
        method: "POST",
        body: JSON.stringify({ password: code }),
      });
      // A fresh request, so the server sees the new cookie and renders the
      // real page rather than this one.
      window.location.reload();
    } catch {
      setError("Invalid access code");
      setCode("");
      setPending(false);
    }
  };

  return (
    <div className="relative mt-6 flex min-h-[32rem] items-center overflow-hidden border-y border-rule-ink bg-surface-ink-2">
      <GridField className="absolute inset-0 size-full opacity-70" />

      <div className="pointer-events-none relative mx-auto flex w-full max-w-[90rem] flex-col gap-8 px-5 py-16 sm:px-8 sm:py-24">
        <span className="flex items-center gap-3">
          <span aria-hidden className="size-2 bg-accent" />
          <Label tone="ink" strong>
            Maintenance
          </Label>
        </span>

        <h1 className="text-[clamp(3.25rem,13vw,9rem)] leading-[0.85] font-medium tracking-[-0.035em]">
          <span className="text-accent">$</span>
          {brand.token.ticker}
        </h1>

        <div className="flex max-w-[56ch] flex-col gap-3">
          <p className="text-lg leading-snug font-medium">
            This page is under technical maintenance.
          </p>
          <p className="text-sm leading-relaxed text-dim-ink">
            We are wiring in the token&apos;s contract and links. The page
            reopens with the launch patch; trading, the pool and your portfolio
            are unaffected.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="pointer-events-auto mt-2 flex w-full max-w-[26rem] flex-col gap-3"
        >
          <label htmlFor="token-page-code" className="label text-dim-ink">
            Team access
          </label>
          <div className="flex gap-px bg-rule-ink">
            <input
              id="token-page-code"
              name="code"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Access code"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                if (error) setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "token-page-error" : undefined}
              className="h-11 min-w-0 flex-1 bg-surface-ink px-3 font-mono text-[0.9375rem] tracking-[0.3em] text-ink-on-ink outline-none placeholder:tracking-normal placeholder:text-faint focus:bg-surface-ink-2"
            />
            <button
              type="submit"
              disabled={pending}
              className="label flex h-11 items-center gap-2 bg-surface-paper px-5 text-foreground transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-accent hover:text-ink-on-ink disabled:opacity-50"
            >
              <span aria-hidden className="size-1.5 bg-accent" />
              {pending ? "Checking" : "Enter"}
            </button>
          </div>
          <p id="token-page-error" role="status" className="label h-3 text-accent">
            {error}
          </p>
        </form>
      </div>
    </div>
  );
};
