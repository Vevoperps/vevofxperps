/**
 * The brand layer — the one file to change when the name lands.
 *
 * Every string a rebrand touches lives here: the name, the ticker, the chain,
 * the contract, the links. Nothing else in the app hardcodes any of them, so
 * swapping the brand is this file plus the two colour tokens in `globals.css`.
 *
 * The wordmark is set in the site's own face (Geist) with the site's own blue
 * token — it is not, and must not become, a copy of any existing company's
 * logotype. If the name ever collides with one, that is a naming decision; the
 * artwork stays ours.
 */
export const brand = {
  /** Wordmark, lowercase everywhere the reference uses lowercase. */
  name: "vevo",
  /** Shown in the version chip beside the wordmark. */
  version: "V1.0-BETA",
  /** One line, used in metadata and the footer. */
  tagline:
    "perpetual futures on the world's currencies against the dollar. open 24/7, one USDC balance, withdraw to your wallet anytime.",

  token: {
    /** Trading ticker, printed with the `$`. */
    ticker: "VEVO",
    /** Contract address, or null while it does not exist yet. */
    address: null as string | null,
  },

  chain: {
    name: "Solana",
    /** Kept numeric for the screens; 101 is how the app names Solana mainnet. */
    id: 101,
    /** The settlement asset every balance is denominated in. */
    settlement: "USDC",
  },

  links: {
    /** Where "launch app" goes. Null renders the button as a coming-soon state. */
    app: "/app" as string | null,
    /** Full profile URL. The @handle for meta tags is derived from it in `site.ts`. */
    x: "https://x.com/Vevofxperps" as string | null,
    telegram: null as string | null,
    discord: null as string | null,
    /**
     * The public repository. Deliberately null: nothing on the site links to
     * it. Set it again only if the repository is ever worth reading as part of
     * the pitch.
     */
    docs: null as string | null,
  },

  /**
   * Where a legal or privacy question goes. Null until the address exists —
   * the legal pages then point at the social account instead of printing a
   * mailbox nobody reads.
   */
  contact: { email: null as string | null },

  /** Canonical origin. Used for metadata and the sitemap. */
  url: "https://vevoperps.com",
} as const;

export type Brand = typeof brand;
