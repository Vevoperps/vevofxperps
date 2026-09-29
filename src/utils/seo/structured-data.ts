/**
 * @fileoverview JSON-LD structured data helpers.
 *
 * Structured data lets search engines understand the site as entities
 * (Organization, WebSite) rather than just text — improving rich results.
 * Render the output inside a `<script type="application/ld+json">` tag.
 */

import { brand } from "@/lib/brand";
import { siteConfig } from "@/lib/site";

/** Every official profile, for `sameAs`. Only accounts that exist. */
const profiles = [brand.links.x, brand.links.telegram, brand.links.discord].filter(
  (url): url is string => typeof url === "string" && url.length > 0,
);

/**
 * Organization + WebSite schema for the site root. Emit once, in the root
 * layout. The two nodes are linked by `@id` so crawlers treat them as related.
 */
export function getSiteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteConfig.url}/#organization`,
        name: siteConfig.name,
        url: siteConfig.url,
        // The generated mark, not a static file — see `app/apple-icon.tsx`.
        logo: `${siteConfig.url}/apple-icon`,
        // Ties the domain to its official accounts for search engines.
        ...(profiles.length > 0 ? { sameAs: profiles } : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${siteConfig.url}/#website`,
        name: siteConfig.name,
        description: siteConfig.description,
        url: siteConfig.url,
        publisher: { "@id": `${siteConfig.url}/#organization` },
      },
    ],
  };
}
