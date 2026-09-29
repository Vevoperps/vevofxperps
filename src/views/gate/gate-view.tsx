"use client";

/**
 * The pre-launch gate.
 *
 * A frozen frame of the entry wave with one plate on it. What the plate leads
 * with is the early-access form, because that is what a visitor who found the
 * URL early should meet: an invitation, not a locked door. The access code is
 * a link under it, which is where a code belongs when almost nobody has one.
 *
 * **The email goes nowhere, and the wording is built around that.** Nothing is
 * stored and nothing is sent, so the confirmation thanks the visitor and says
 * the site opens soon. It does not say they are on a list or that anything
 * will arrive, because neither would be true, and a project caught promising
 * an email it never sends has spent its first impression badly.
 *
 * On a correct code the page is reloaded rather than client-navigated: the
 * cookie was just issued, and only a fresh request goes through the proxy
 * again and gets the real page instead of this rewrite.
 */

import { useState, type FormEvent } from "react";

import { SocialMark } from "@/components/ui/social-mark";
import { apiFetch } from "@/lib/api-client";
import { brand } from "@/lib/brand";

import { PixelField } from "./pixel-field";

/**
 * The X account, as the gate names it. The gate is the one page every early
 * visitor sees, and the account is the only place the opening will be
 * announced, so it is offered here rather than behind the code.
 */
const X_URL = brand.links.x;
const X_HANDLE = X_URL ? `@${X_URL.replace(/\/+$/, "").split("/").pop()}` : null;

/** Enough to catch a typo, not enough to argue with a valid address. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Mode = "email" | "code" | "thanks";

export const GateView = () => {
  const [mode, setMode] = useState<Mode>("email");

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submitEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const value = email.trim();
    if (!LOOKS_LIKE_EMAIL.test(value)) {
      setEmailError("Enter a valid email address");
      return;
    }

    setEmailError(null);
    setMode("thanks");
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !code.trim()) return;

    setPending(true);
    setCodeError(null);

    try {
      await apiFetch("/api/gate", {
        method: "POST",
        body: JSON.stringify({ password: code }),
      });
      // Full reload, not `router.push`. See the note at the top of the file.
      window.location.reload();
    } catch {
      setCodeError("Invalid access code");
      setCode("");
      setPending(false);
    }
  };

  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      <PixelField />

      <div className="relative w-[min(26rem,calc(100vw-2.5rem))] border border-rule-paper bg-surface-paper">
        <header className="flex items-center justify-between border-b border-rule-paper px-5 py-3">
          <span className="text-[1.0625rem] font-medium tracking-tight">
            {brand.name}
          </span>
          <span className="label text-accent">{brand.version}</span>
        </header>

        {mode === "thanks" ? (
          <div className="flex flex-col gap-3 px-5 py-8">
            <span className="flex items-center gap-2">
              <span aria-hidden className="size-1.5 bg-accent" />
              <span className="label text-accent">You are early</span>
            </span>
            <p className="text-sm leading-relaxed text-dim-paper">
              Thanks. {brand.name} opens to the public soon.
              {X_URL && X_HANDLE ? (
                <>
                  {" "}
                  The date goes out first on{" "}
                  <a
                    href={X_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {X_HANDLE}
                  </a>
                  .
                </>
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => setMode("code")}
              className="label mt-2 self-start text-dim-paper underline-offset-4 transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent hover:underline"
            >
              Have an access code?
            </button>
          </div>
        ) : mode === "email" ? (
          <form onSubmit={submitEmail} className="px-5 py-6">
            <span className="label block text-accent">Early access</span>
            <p className="mt-2 text-sm leading-relaxed text-dim-paper">
              64 currencies against the dollar, settled onchain. Leave your
              email to hear when it opens.
            </p>

            <label htmlFor="gate-email" className="label mt-5 block text-dim-paper">
              Email
            </label>
            <input
              id="gate-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (emailError) setEmailError(null);
              }}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "gate-email-error" : undefined}
              className="mt-3 h-11 w-full border border-rule-paper bg-surface-paper-2 px-3 font-mono text-[0.9375rem] text-foreground outline-none transition-colors duration-[var(--duration-fast)] ease-entrance placeholder:text-faint focus:border-accent"
            />

            {/* Reserved line, so a wrong address does not make the plate grow
                a row taller and shift the whole centred layout. */}
            <p
              id="gate-email-error"
              role="status"
              className="label mt-3 h-3 text-accent"
            >
              {emailError}
            </p>

            <button
              type="submit"
              className="label mt-5 flex h-11 w-full items-center justify-center gap-2 bg-surface-ink text-ink-on-ink transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-90"
            >
              <span aria-hidden className="size-1.5 bg-accent" />
              Request early access
            </button>

            <button
              type="button"
              onClick={() => setMode("code")}
              className="label mt-4 w-full text-center text-dim-paper underline-offset-4 transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent hover:underline"
            >
              Have an access code?
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="px-5 py-6">
            <span className="label block text-dim-paper">Access code</span>

            <input
              id="gate-code"
              name="code"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                if (codeError) setCodeError(null);
              }}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? "gate-code-error" : undefined}
              className="mt-3 h-11 w-full border border-rule-paper bg-surface-paper-2 px-3 font-mono text-[0.9375rem] tracking-[0.3em] text-foreground outline-none transition-colors duration-[var(--duration-fast)] ease-entrance focus:border-accent"
            />

            <p
              id="gate-code-error"
              role="status"
              className="label mt-3 h-3 text-accent"
            >
              {codeError}
            </p>

            <button
              type="submit"
              disabled={pending}
              className="label mt-5 flex h-11 w-full items-center justify-center gap-2 bg-surface-ink text-ink-on-ink transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-90 disabled:opacity-50"
            >
              <span aria-hidden className="size-1.5 bg-accent" />
              {pending ? "Checking" : "Enter"}
            </button>

            <button
              type="button"
              onClick={() => setMode("email")}
              className="label mt-4 w-full text-center text-dim-paper underline-offset-4 transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent hover:underline"
            >
              Back to early access
            </button>
          </form>
        )}

        <footer className="flex items-center justify-between border-t border-rule-paper px-5 py-3">
          <span className="label text-dim-paper">Launching soon</span>
          {X_URL && X_HANDLE ? (
            <a
              href={X_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${brand.name} on X`}
              className="label flex items-center gap-2 text-dim-paper transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent"
            >
              <SocialMark kind="x" />
              {X_HANDLE}
            </a>
          ) : null}
        </footer>
      </div>
    </main>
  );
};
