/**
 * The documentation page's contents.
 *
 * One file, the way `content.ts` holds the landing page's: the page component
 * renders this shape and owns no words of its own. Sections carry an `id` so
 * the sidebar can point at them and the browser can deep-link.
 */

import { brand } from "@/lib/brand";

export interface Block {
  /** A paragraph. `accent` prints the first clause in the brand blue. */
  kind: "text" | "list" | "note";
  body?: string;
  items?: { term: string; body: string }[];
}

export interface Chapter {
  id: string;
  /** Printed as the mono eyebrow above the chapter's heading. */
  eyebrow: string;
  title: string;
  blocks: Block[];
}

export const handbook = {
  title: "Getting started",
  back: "Back to site",
  /** The sidebar, grouped and numbered as the reference groups it. */
  nav: [
    {
      group: "Set up",
      links: [
        { id: "intro", label: "Introduction" },
        { id: "wallet", label: "Wallet & chain" },
        { id: "first-trade", label: "First trade" },
      ],
    },
    {
      group: "Core concepts",
      links: [
        { id: "pairs", label: "Pairs & quoting" },
        { id: "margin", label: "Margin & leverage" },
        { id: "funding", label: "Funding" },
      ],
    },
    {
      group: "Risk",
      links: [
        { id: "liquidation", label: "Liquidation" },
        { id: "payout", label: "Max payout" },
      ],
    },
    {
      group: "Reference",
      links: [
        { id: "fees", label: "Fees" },
        { id: "limits", label: "Leverage caps" },
        { id: "glossary", label: "Glossary" },
      ],
    },
  ],

  chapters: [
    {
      id: "intro",
      eyebrow: "First trade",
      title: `Get started with ${brand.name}`,
      blocks: [
        {
          kind: "text",
          body: `${brand.name} is a perpetual futures venue for currencies. 64 of them, each quoted against the dollar, open every hour of every day, settled on ${brand.chain.name} in ${brand.chain.settlement}.`,
        },
        {
          kind: "text",
          body: "You never hold the currency. You take a position on where its rate against the dollar is going, put up margin, and close whenever you like.",
        },
        {
          kind: "text",
          body: "Three things to know before the first ticket: what a pair means, what margin buys you, and what liquidation is. They are the next three chapters, and they take about four minutes.",
        },
      ],
    },
    {
      id: "wallet",
      eyebrow: "Set up",
      title: "Wallet and chain",
      blocks: [
        {
          kind: "text",
          body: `Any Solana wallet works: Phantom, Solflare, Backpack. ${brand.chain.name} is what the wallet already speaks, so there is no network to configure by hand.`,
        },
        {
          kind: "list",
          items: [
            {
              term: "Connect",
              body: "one signature, no deposit yet. It proves the address is yours.",
            },
            {
              term: "Deposit",
              body: `a plain ${brand.chain.settlement} transfer. Credited once the transaction is mined.`,
            },
            {
              term: "Withdraw",
              body: "idle balance leaves whenever you ask. Nothing is locked but the margin behind open positions.",
            },
          ],
        },
      ],
    },
    {
      id: "pairs",
      eyebrow: "Core concepts",
      title: "How a pair is quoted",
      blocks: [
        {
          kind: "text",
          body: "Every pair is written as local currency per one dollar. USDJPY is yen per dollar; USDNGN is naira per dollar. The dollar is always the thing being priced.",
        },
        {
          kind: "text",
          body: "That makes the direction easy to get backwards, so it is worth saying plainly: if you think a currency will strengthen against the dollar, its pair falls, and you go short.",
        },
        {
          kind: "note",
          body: "Yen strengthening from 150 to 145 per dollar is USDJPY going down. Short is the trade.",
        },
      ],
    },
    {
      id: "margin",
      eyebrow: "Core concepts",
      title: "Margin and leverage",
      blocks: [
        {
          kind: "text",
          body: "Margin is what you put up. Leverage is how much position that margin controls. 250 USDC at 10x is a 2,500 USDC position, and a 1% move against it costs 25 USDC, a tenth of your margin.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Caps are per pair",
              body: "high on liquid majors, lower on volatile currencies. The ticket shows the cap before you sign.",
            },
            {
              term: "Margin is isolated",
              body: "each position carries its own. One going wrong cannot reach into another.",
            },
          ],
        },
      ],
    },
    {
      id: "funding",
      eyebrow: "Core concepts",
      title: "Funding",
      blocks: [
        {
          kind: "text",
          body: "Funding is what keeps a perpetual near the real rate. It follows open interest: whichever side is crowded pays the other, continuously, and it is settled when you close.",
        },
        {
          kind: "text",
          body: "The rate is capped at ±0.75% per 8 hours, so it can be a cost worth planning around on a long hold, never a surprise that empties an account.",
        },
      ],
    },
    {
      id: "liquidation",
      eyebrow: "Risk",
      title: "Liquidation",
      blocks: [
        {
          kind: "text",
          body: "A position is liquidated when its equity falls to the maintenance margin. The price at which that happens is printed on the ticket before you sign, and it does not move unless you add margin.",
        },
        {
          kind: "note",
          body: "You can never lose more than the margin you put in. There is no negative balance and nothing to top up after the fact.",
        },
      ],
    },
    {
      id: "payout",
      eyebrow: "Risk",
      title: "Max payout",
      blocks: [
        {
          kind: "text",
          body: "Every position's payout is capped at 10x its margin, fixed when you open and reserved for you until you close. That is what makes the number on the screen the number you can actually withdraw.",
        },
      ],
    },
    {
      id: "fees",
      eyebrow: "Reference",
      title: "What a trade costs",
      blocks: [
        {
          kind: "list",
          items: [
            { term: "Open", body: "0.05% of notional." },
            { term: "Close", body: "0.05% of notional." },
            { term: "Funding", body: "skew based, capped at ±0.75% per 8h." },
            { term: "Deposit and withdraw", body: "no venue fee, only the network fee." },
          ],
        },
        {
          kind: "text",
          body: "There is no spread markup. The entry is the live mark, and the fee is the fee.",
        },
      ],
    },
  ] satisfies Chapter[],
};
