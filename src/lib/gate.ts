/**
 * The pre-launch password gate.
 *
 * One shared place for the password and the cookie, because three different
 * runtimes need to agree on them: the middleware (edge), the API route (node)
 * and nothing on the client — the browser only ever sees the cookie.
 *
 * **The cookie never holds the password.** It holds a token derived from it, so
 * a glance at devtools does not hand someone the phrase, and rotating the
 * password invalidates every cookie already issued without any extra work.
 *
 * This is a "not ready yet" curtain, not a security boundary: it keeps the site
 * out of search results and out of the hands of anyone who stumbles on the URL.
 * Anything that must actually stay secret belongs behind real auth.
 */

export const GATE_COOKIE = "vp_gate";

/**
 * The code that opens the curtain.
 *
 * The default below is in the source, and the repository is public, so anyone
 * who reads it can walk in. That is the deal this gate makes on purpose: it is
 * a "not ready yet" sign that keeps the site out of search results and off the
 * screen of anyone who stumbles on the URL, not a lock. Nothing behind it is
 * secret, and nothing that must stay secret should ever go behind it.
 *
 * `SITE_PASSWORD` overrides it without a code change, which is how the code is
 * rotated: setting it in the Vercel project invalidates every cookie already
 * issued, so everyone is asked again.
 *
 * To take the curtain down entirely at launch, delete `src/proxy.ts`.
 */
const DEFAULT_PASSWORD = "228322";

export const gatePassword = (): string | null => {
  const value = process.env.SITE_PASSWORD?.trim();
  return value ? value : DEFAULT_PASSWORD;
};

/** Always true while a default exists. Kept so callers read the same way. */
export const gateEnabled = (): boolean => gatePassword() !== null;

/**
 * FNV-1a, 32-bit.
 *
 * Synchronous on purpose: the middleware runs on the edge for every request and
 * `crypto.subtle` is async, which would make the whole matcher await a digest
 * it does not need. This is not password storage — the value never leaves our
 * own cookie and the only thing it must do is differ from the password itself.
 */
const token = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

/**
 * The value a passing cookie must carry.
 *
 * Empty when the gate is off, which no cookie can equal — callers check
 * `gateEnabled()` first, so the comparison is never reached in that state.
 */
export const gateToken = (): string => {
  const password = gatePassword();
  return password === null ? "" : token(`vevoperps:${password}`);
};

/*
 * ---------------------------------------------------------------------------
 * The $VEVO page lock.
 *
 * A second, separate curtain over `/app/vevo` while the token page waits for
 * its contract address and links. Separate cookie, separate token: getting
 * past the site gate must not open this page too, or it would be open to
 * every early-access visitor.
 *
 * `TOKEN_PAGE_PASSWORD` sets its own code; unset, it falls back to the site
 * code. To take the lock down after the launch patch, delete the check in
 * `app/app/vevo/page.tsx` (one `if`), or set `TOKEN_PAGE_LOCK=off`.
 * ---------------------------------------------------------------------------
 */

export const TOKEN_PAGE_COOKIE = "vp_token_page";

export const tokenPageLocked = (): boolean =>
  process.env.TOKEN_PAGE_LOCK?.trim().toLowerCase() !== "off";

export const tokenPagePassword = (): string => {
  const own = process.env.TOKEN_PAGE_PASSWORD?.trim();
  return own ? own : (gatePassword() ?? DEFAULT_PASSWORD);
};

/** The value a passing `TOKEN_PAGE_COOKIE` must carry. */
export const tokenPageToken = (): string =>
  token(`vevoperps:token-page:${tokenPagePassword()}`);
