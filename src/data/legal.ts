/**
 * The two legal pages, in one file.
 *
 * They are written to be read rather than to be survived: short sections,
 * plain sentences, and the awkward parts said out loud instead of buried in a
 * subclause. A venue that cannot describe its own risks in a paragraph has no
 * business asking anyone to accept them.
 *
 * They share the handbooks' `Block` shape, so the same three kinds of paragraph
 * render here and there and there is one renderer to keep right.
 *
 * Two things are deliberately not invented here: the operating entity and the
 * governing law. Both are named before launch — see `entity` below.
 */

import type { Block } from "@/data/books";
import { brand } from "@/lib/brand";

export interface LegalSection {
  id: string;
  title: string;
  blocks: Block[];
}

export interface LegalPage {
  path: string;
  /** Printed in the rail and the browser tab. */
  name: string;
  title: string;
  lede: string;
  /** The date the wording last changed. */
  updated: string;
  back: string;
  contents: string;
  sections: LegalSection[];
}

const UPDATED = "20 September 2026";
const CHAIN = brand.chain.name;
const SETTLEMENT = brand.chain.settlement;

/** How to reach a human about either page. */
const contactLine = brand.contact.email
  ? `Write to ${brand.contact.email}.`
  : "Until the support address is published, the account linked in the footer is the way to reach us.";

export const terms: LegalPage = {
  path: "/terms",
  name: "Terms of service",
  title: "Terms of service",
  lede: `the rules you are agreeing to by using ${brand.name}, written so that reading them is realistic.`,
  updated: UPDATED,
  back: "Back to site",
  contents: "On this page",

  sections: [
    {
      id: "summary",
      title: "The short version",
      blocks: [
        {
          kind: "text",
          body: `${brand.name} is a venue for perpetual futures on currency rates. You connect a wallet, post margin in ${SETTLEMENT}, and open positions that settle on ${CHAIN}. We never hold your keys and we cannot move your funds.`,
        },
        {
          kind: "list",
          items: [
            {
              term: "You are in control",
              body: "your wallet signs everything. There is no account we can freeze and no balance we can withdraw on your behalf.",
            },
            {
              term: "You can lose your margin",
              body: "leverage cuts both ways and a position can be liquidated in full. Never post margin you need.",
            },
            {
              term: "Nothing here is advice",
              body: "no part of this site is a recommendation to take any position.",
            },
          ],
        },
        {
          kind: "note",
          body: "This summary is here to be useful, not to replace the sections below. Where the two differ, the sections below are the terms.",
        },
      ],
    },
    {
      id: "acceptance",
      title: "Accepting these terms",
      blocks: [
        {
          kind: "text",
          body: `Using ${brand.name}, which includes connecting a wallet, opening a position or simply browsing the interface, means you accept these terms. If you do not, the remedy is simple: do not use it.`,
        },
        {
          kind: "text",
          body: "If you are accepting on behalf of a company, you are confirming that you are allowed to bind it, and these terms then apply to that company.",
        },
      ],
    },
    {
      id: "eligibility",
      title: "Who may use it",
      blocks: [
        {
          kind: "text",
          body: "You must be of legal age where you live and legally permitted to trade leveraged derivatives there. Some jurisdictions restrict or prohibit them, and that is your responsibility to know before you connect.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Sanctions",
              body: "the venue may not be used by anyone subject to applicable sanctions, or from a jurisdiction subject to them.",
            },
            {
              term: "Restricted access",
              body: "access can be blocked from a jurisdiction where offering this service is not permitted.",
            },
            {
              term: "One person, one responsibility",
              body: "whoever controls the wallet is the user, and is responsible for everything signed with it.",
            },
          ],
        },
      ],
    },
    {
      id: "what-it-is",
      title: "What the service is, and is not",
      blocks: [
        {
          kind: "text",
          body: "The service is an interface to a set of smart contracts and a price feed. It quotes a mark, accepts a signed order, holds margin, applies funding, and settles positions.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Not a bank",
              body: "balances are not deposits, they are not insured, and they earn nothing while idle.",
            },
            {
              term: "Not a broker",
              body: "there is no order routing and no best-execution duty. Orders fill at the venue's own mark.",
            },
            {
              term: "Not a custodian",
              body: `margin sits in a program on ${CHAIN} and moves on your signature.`,
            },
            {
              term: "Not an exchange of currency",
              body: "you never receive the underlying currency. A position is a settled contract on its rate.",
            },
          ],
        },
      ],
    },
    {
      id: "no-advice",
      title: "Nothing here is advice",
      blocks: [
        {
          kind: "text",
          body: "The documentation, the trading guide, the rates, the worked examples and every number on this site are information. None of them is financial, investment, legal or tax advice, and none of them is a recommendation to take a position.",
        },
        {
          kind: "text",
          body: "Worked examples use figures chosen to be clear, not figures anyone achieved. Past behaviour of a currency says nothing about what it does next.",
        },
      ],
    },
    {
      id: "risk",
      title: "The risks, stated plainly",
      blocks: [
        {
          kind: "text",
          body: "Leveraged trading on currencies is high risk. It is entirely possible to lose the whole of your margin, quickly, on a move that looks small on a chart.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Liquidation",
              body: "a position closes itself when its equity reaches the maintenance margin. At the highest leverage caps that is a few percent of movement.",
            },
            {
              term: "Funding",
              body: "holding a position costs, or pays, continuously. On a crowded side it is a real and compounding cost.",
            },
            {
              term: "Gaps",
              body: "a currency can move in a single step, through a liquidation price, on news or a policy decision.",
            },
            {
              term: "Technology",
              body: "smart contracts, price feeds, chains and interfaces can fail. Code that has been reviewed is still code.",
            },
          ],
        },
        {
          kind: "note",
          body: "Your loss is bounded by the margin you posted. There is no negative balance, no margin call and nothing to pay after a position is gone.",
        },
      ],
    },
    {
      id: "wallet",
      title: "Your wallet and your keys",
      blocks: [
        {
          kind: "text",
          body: "You are responsible for the wallet you connect, the device it runs on, and every signature it makes. A signature is an instruction, and instructions are final.",
        },
        {
          kind: "list",
          items: [
            {
              term: "We cannot reverse a transaction",
              body: "neither can anyone else. There is no chargeback on a chain.",
            },
            {
              term: "We cannot recover a key",
              body: "a lost seed phrase is a lost balance, permanently.",
            },
            {
              term: "We will never ask for one",
              body: "nobody from the venue will ever ask for a seed phrase, a private key or remote access. Anyone who does is not us.",
            },
          ],
        },
      ],
    },
    {
      id: "costs",
      title: "Fees, funding and settlement",
      blocks: [
        {
          kind: "text",
          body: "The fee is 0.05% of notional to open and the same to close. Funding flows between the two sides of the market and is capped at ±0.75% per eight hours. Both are printed on the ticket before you sign.",
        },
        {
          kind: "text",
          body: "Fees and the funding mechanism can change. Where they do, the change is published before it takes effect and applies to positions opened after it, not retroactively to open ones.",
        },
      ],
    },
    {
      id: "availability",
      title: "Availability, pauses and changes",
      blocks: [
        {
          kind: "text",
          body: "The venue aims to be open every hour of every day. It is not guaranteed to be. Maintenance, chain congestion, an upstream feed failure or an incident can interrupt access without notice.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Paused pairs",
              body: "when a feed cannot be trusted, the pair is paused. Open positions are held and new orders queue until a live price returns.",
            },
            {
              term: "Withdrawal of a pair",
              body: "a pair can be delisted. Where that happens, open positions are given notice and a window to close.",
            },
            {
              term: "Leverage caps",
              body: "caps can be lowered on a pair whose behaviour changes. An open position keeps the cap it was opened under.",
            },
          ],
        },
      ],
    },
    {
      id: "conduct",
      title: "What you may not do",
      blocks: [
        {
          kind: "list",
          items: [
            {
              term: "Manipulate the mark",
              body: "or attempt to, including by interfering with an upstream price source.",
            },
            {
              term: "Exploit a fault",
              body: "knowingly trading against a bug, a stale price or a broken contract rather than reporting it.",
            },
            {
              term: "Attack the service",
              body: "denial of service, scraping that degrades it, or probing beyond good-faith security research.",
            },
            {
              term: "Break the law with it",
              body: "money laundering, sanctions evasion, or trading on behalf of someone barred from doing so.",
            },
          ],
        },
        {
          kind: "text",
          body: "Good-faith security research is welcome and is not a breach of these terms. Report what you find before you use it.",
        },
      ],
    },
    {
      id: "ip",
      title: "The site itself",
      blocks: [
        {
          kind: "text",
          body: `The name, the wordmark, the interface, the copy and the documentation are ${brand.name}'s. You may read, quote and link to them; you may not present them as your own or use the name in a way that suggests we endorse something we do not.`,
        },
      ],
    },
    {
      id: "liability",
      title: "Liability",
      blocks: [
        {
          kind: "text",
          body: "The service is provided as it is. To the extent the law allows, we are not liable for trading losses, for funds lost through a compromised wallet, for a chain or feed failing, or for the venue being unavailable when you wanted it.",
        },
        {
          kind: "text",
          body: "Nothing in these terms limits liability for fraud or for anything else that cannot lawfully be limited.",
        },
      ],
    },
    {
      id: "changes",
      title: "Changes to these terms",
      blocks: [
        {
          kind: "text",
          body: `These terms can change. The date at the top of this page is the date of the current wording, and the current wording is the one that applies from the moment it is published here. Today that date is ${UPDATED}.`,
        },
        {
          kind: "text",
          body: "A change that materially affects open positions is announced before it takes effect rather than published quietly.",
        },
      ],
    },
    {
      id: "entity",
      title: "Entity and governing law",
      blocks: [
        {
          kind: "text",
          body: `${brand.name} is pre-launch. The operating entity and the law these terms are governed by are named on this page before the venue opens to the public, and this section is replaced with them at that point.`,
        },
        {
          kind: "note",
          body: contactLine,
        },
      ],
    },
  ],
};

export const privacy: LegalPage = {
  path: "/privacy",
  name: "Privacy policy",
  title: "Privacy policy",
  lede: "what this site knows about you, which is less than most, and what happens to it.",
  updated: UPDATED,
  back: "Back to site",
  contents: "On this page",

  sections: [
    {
      id: "summary",
      title: "The short version",
      blocks: [
        {
          kind: "list",
          items: [
            {
              term: "No account",
              body: "there is nothing to sign up for, so there is no name, password or document to hold.",
            },
            {
              term: "No identity check",
              body: "we do not ask who you are and we do not collect identity documents.",
            },
            {
              term: "A wallet address is public",
              body: "connecting one tells us the address. So does the chain, to anyone who looks.",
            },
            {
              term: "Analytics are optional",
              body: "the cookie banner is a real choice, and rejecting it turns them off rather than hiding them.",
            },
          ],
        },
      ],
    },
    {
      id: "collect",
      title: "What is collected",
      blocks: [
        {
          kind: "list",
          items: [
            {
              term: "Wallet address",
              body: "when you connect one, and the positions signed from it. This is the whole of the account.",
            },
            {
              term: "Technical logs",
              body: "IP address, browser and the requests made, kept briefly to keep the service up and to spot abuse.",
            },
            {
              term: "Usage analytics",
              body: "which pages were opened and which features used, only if analytics cookies were accepted.",
            },
            {
              term: "What you send us",
              body: "if you write to us, we have what you wrote and whatever address you wrote from.",
            },
          ],
        },
        {
          kind: "note",
          body: "No name, no date of birth, no identity document, no card and no bank detail is collected, because none of them is needed to run the venue.",
        },
      ],
    },
    {
      id: "onchain",
      title: "What the chain already knows",
      blocks: [
        {
          kind: "text",
          body: `Every deposit, withdrawal and settlement is a transaction on ${CHAIN}. It is public, permanent and outside anyone's control, including ours. Anyone who knows your address can read your history.`,
        },
        {
          kind: "text",
          body: "This is a property of using a public chain, not a choice made here. If that matters to you, treat the address you connect as the privacy decision it is.",
        },
      ],
    },
    {
      id: "why",
      title: "Why it is collected",
      blocks: [
        {
          kind: "list",
          items: [
            { term: "To run the venue", body: "you cannot hold a position without an address to hold it." },
            { term: "To keep it up", body: "logs are how an outage is diagnosed and abuse is stopped." },
            { term: "To make it better", body: "analytics show which pages help and which fall flat." },
            { term: "To meet the law", body: "where a legal obligation applies, it is met." },
          ],
        },
      ],
    },
    {
      id: "cookies",
      title: "Cookies",
      blocks: [
        {
          kind: "list",
          items: [
            {
              term: "Strictly necessary",
              body: "keep the site working: your session, your cookie choice itself, basic security. These cannot be turned off.",
            },
            {
              term: "Analytics",
              body: "anonymised usage statistics. Off until accepted.",
            },
            {
              term: "Marketing",
              body: "measuring whether an announcement reached anyone. Off until accepted.",
            },
          ],
        },
        {
          kind: "text",
          body: "The banner's choice is stored in your browser and can be changed at any time from the same banner. Rejecting is not a worse version of the site, it is the same site with less counting.",
        },
      ],
    },
    {
      id: "sharing",
      title: "Who else sees it",
      blocks: [
        {
          kind: "text",
          body: "Nothing is sold, and nothing is shared for anyone else's advertising. A small number of providers see what they need to do their job.",
        },
        {
          kind: "list",
          items: [
            { term: "Hosting and delivery", body: "serve the pages and see the requests that fetch them." },
            { term: "Chain infrastructure", body: "RPC providers relay transactions and see the addresses in them." },
            { term: "Price sources", body: "supply rates. They receive no information about you." },
            { term: "Analytics", body: "only where analytics cookies were accepted." },
          ],
        },
      ],
    },
    {
      id: "retention",
      title: "How long it is kept",
      blocks: [
        {
          kind: "list",
          items: [
            { term: "Technical logs", body: "weeks, not years, unless one is part of an open incident." },
            { term: "Analytics", body: "aggregated, and not tied back to an address." },
            { term: "Correspondence", body: "as long as the conversation is useful." },
            { term: "On-chain records", body: "permanent, and beyond anyone's reach to delete." },
          ],
        },
      ],
    },
    {
      id: "rights",
      title: "Your choices",
      blocks: [
        {
          kind: "list",
          items: [
            {
              term: "Disconnect",
              body: "disconnecting the wallet ends the session. Nothing is left behind to close.",
            },
            {
              term: "Change the cookie choice",
              body: "at any moment, from the banner.",
            },
            {
              term: "Ask what is held",
              body: "depending on where you live you may have a right to a copy, a correction or a deletion of what is held about you.",
            },
          ],
        },
        {
          kind: "note",
          body: "A request to delete cannot reach the chain. What can be deleted is what sits on our side, and that is what a request covers.",
        },
      ],
    },
    {
      id: "children",
      title: "Children",
      blocks: [
        {
          kind: "text",
          body: "The venue is not for anyone under the legal age to trade derivatives where they live, and is not directed at children. Nothing here is knowingly collected from one.",
        },
      ],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      blocks: [
        {
          kind: "text",
          body: `This policy can change. The date at the top is the date of the current wording, and today it is ${UPDATED}. A change that widens what is collected is announced rather than published quietly.`,
        },
      ],
    },
    {
      id: "contact",
      title: "Contact",
      blocks: [
        {
          kind: "note",
          body: contactLine,
        },
      ],
    },
  ],
};

export const legalPages = [terms, privacy];
