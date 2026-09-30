/**
 * Site-wide configuration — the single source of truth for SEO.
 *
 * Consumed by the metadata generator, `robots.ts`, `sitemap.ts`, and the
 * JSON-LD structured-data helper.
 *
 * Everything here is *derived* from `brand.ts` rather than restated, so the
 * rebrand stays a one-file change. Only values SEO needs and the brand layer
 * has no opinion about (the theme colour, the search-result description) are
 * written out here.
 */
import { publicEnv } from "@/env";
import { brand } from "@/lib/brand";

/**
 * The X account as an `@handle`, which is what `twitter:site` expects.
 *
 * `brand.links.x` holds the full profile URL because that is what every link
 * on the page needs; a meta tag given the URL instead of the handle is
 * ignored by X when it builds the link card.
 */
const xHandle = brand.links.x
  ? `@${brand.links.x.replace(/\/+$/, "").split("/").pop()}`
  : `@${brand.name}`;

export const siteConfig = {
  /** Capitalised for the tab strip and the share card: a product name is
   * written the way people say it, even where the wordmark is lowercase. */
  name: brand.name.charAt(0).toUpperCase() + brand.name.slice(1),
  description:
    "Perpetual futures on 64 currencies against the dollar. 24/7, up to 25× leverage, one USDC balance on Solana.",
  /**
   * Public origin, no trailing slash. Drives canonical URLs, OG tags, the
   * sitemap, and JSON-LD. `NEXT_PUBLIC_SITE_URL` wins in preview deployments,
   * where the origin is not the canonical domain.
   */
  url: publicEnv.NEXT_PUBLIC_SITE_URL ?? brand.url,
  twitterHandle: xHandle,
  author: brand.name,
  /**
   * Browser theme-color (address bar / PWA). The hero blue, so the chrome
   * blends into the page rather than framing it. Literal because `next/og` and
   * the viewport export both run without a stylesheet — keep in step with
   * `--raw-color-blue-500`.
   */
  themeColor: "#0055ff",
} as const;

/**
 * Brand colours for the generated icon and share image.
 *
 * Duplicated from `globals.css` on purpose: `next/og` rasterises in a Node
 * context with no stylesheet and no CSS custom properties, so the tokens cannot
 * reach it. Keep in step with `--raw-color-blue-500` and `--raw-color-white`.
 */
export const brandMark = {
  background: "#0055ff",
  foreground: "#ffffff",
  /** The wordmark, as the share card sets it. */
  wordmark: `${brand.name}.`,
  /**
   * The icon mark: the wordmark over the product word, both running past the
   * tile's edges.
   *
   * Two lines rather than one because a tab strip gives a mark a square, and a
   * single word in a square wastes half of it. Stacked and full bleed, the
   * shape fills the tile and stays recognisable at 16px, where nobody reads a
   * favicon — they recognise an outline.
   */
  stack: [brand.name, "PERPS"] as const,
  /**
   * Short line for the share card.
   *
   * Not `siteConfig.description` — that is written for search results and runs
   * long enough to overflow a 1200 × 630 card at display size.
   */
  tagline: "FX perps in USDC, 24/7.",
} as const;
