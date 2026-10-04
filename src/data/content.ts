/**
 * Every word on the page, in one file.
 *
 * The shapes are the reference layout's — a numbered marker, a two-line
 * heading, an optional action, then the section's own body. The substance is
 * the product's: FX perpetuals, settled in USDC.
 *
 * Sections are numbered `[N.01/10]` … `[N.10/10]` and the count is derived, so
 * adding or removing one re-numbers the page by itself.
 */

import { brand } from "@/lib/brand";
import { documentation, tradingGuide } from "@/data/books";
import type { Activity } from "@/lib/chain/read";

export interface SectionHead {
  /** Slug — also the anchor id and the nav target. */
  id: string;
  /** Printed after the `>` in the marker, mono caps. */
  label: string;
  /** Two lines. The reference always breaks its headings in two. */
  heading: [string, string];
  /** Optional action beside the heading. */
  action?: string;
}

/**
 * The header's jump links, in the order the sections appear on the page —
 * see `SECTION_ORDER` below and `views/home/index.tsx`. Keep the three in step:
 * a bar that reads Markets before How it works while the page does the
 * opposite sends the reader down, then back up.
 */
export const nav = [
  { id: "how", label: "How it works" },
  { id: "install", label: "Demo" },
  { id: "markets", label: "Markets" },
  { id: "fees", label: "Fees" },
  { id: "faq", label: "FAQ" },
] as const;

export const hero = {
  badge: `${64} currencies · open 24/7`,
  scrollHint: "Scroll for more",
  /**
   * Three lines, and the middle one is typed.
   *
   * The reference writes its headline as a statement with one bracketed term
   * that a terminal types and retypes — the claim stays put while the word it
   * turns on keeps changing. Ours cycles the currencies, which is the product.
   */
  headline: { lead: "Trade every", tail: "with up to 25x." },
  typed: ["currency", "yen", "euro", "naira", "peso", "rupee", "real"] as const,
  lede: `perpetual futures on 64 currencies from 75 countries against the dollar. up to 25x, one ${brand.chain.settlement} balance on ${brand.chain.name.toLowerCase()}.`,
  primary: "Launch app",
  secondary: "See live rates",
  trust: { label: "64 pairs live", score: "24/7" },
  /** The four words that scroll across the dark panel under the nav. */
  strip: ["FX", "PERPS", "ON EVERY", "CURRENCY"] as const,
};

export const keyValue = {
  head: {
    id: "key-value",
    label: "Key value",
    heading: ["Less waiting.", "More market."],
    action: "Launch app",
  } satisfies SectionHead,
  /**
   * `icon` names a pair of files in `public/assets/icons` — `<icon>-line.png`
   * for a resting card and `<icon>-pixel.png` for the open one.
   */
  items: [
    {
      n: "001",
      icon: "ring",
      title: "Open 24/7",
      body: "currencies never sleep and neither does the venue. trade weekends, holidays and every central bank surprise.",
      kicker: "No closing bell",
    },
    {
      n: "002",
      icon: "layers",
      title: "Every major & frontier currency",
      body: "from the euro and yen to the naira, rupiah, riyal and peso. majors, the gulf, africa and frontier markets in one venue.",
      kicker: "64 pairs, one venue",
    },
    {
      n: "003",
      icon: "star",
      title: "Up to 25x leverage",
      body: "per-pair caps: high on liquid majors, lower on volatile emerging currencies to keep positions payable.",
      kicker: "Caps that fit the pair",
    },
  ],
};

export const performance = {
  head: {
    id: "performance",
    label: "Performance",
    heading: ["Real-time pricing.", "Zero waiting on a desk."],
    action: "Launch app",
  } satisfies SectionHead,
  metrics: [
    { value: "64", caption: "Currencies" },
    { value: "25x", caption: "Max leverage" },
    { value: "0.05%", caption: "Fee each way" },
    { value: "24/7", caption: "Trading hours" },
  ],
  /**
   * The weekend, hour by hour, as one draggable comparison.
   *
   * Left of the handle is the market every other venue leaves you with from
   * Friday's close; right of it is ours. The handle is draggable because the
   * point is not a number — it is how much of the weekend you are being asked
   * to sit out.
   */
  compare: {
    before: `Without ${brand.name}`,
    after: `With ${brand.name}`,
    /** Hours from Friday's 5pm close to Monday's open. */
    bars: 96,
    ticks: [0, 12, 24, 36, 48, 60, 72, 84, 96],
    /** Where the handle rests before anyone touches it, 0–1. */
    split: 0.22,
    caption: "hours from friday close to monday open · drag the handle",
  },
};

export const howItWorks = {
  head: {
    id: "how",
    label: "How it works",
    heading: ["Four steps.", "One click per trade."],
    action: "Launch app",
  } satisfies SectionHead,
  steps: [
    {
      n: "001",
      icon: "layers",
      title: "Connect your wallet",
      body: `phantom, solflare or backpack. nothing to add, no network to switch.`,
    },
    {
      n: "002",
      icon: "zigzag",
      title: `Deposit ${brand.chain.settlement}`,
      body: `a plain ${brand.chain.settlement} transfer on ${brand.chain.name.toLowerCase()}, credited once the transaction is final.`,
    },
    {
      n: "003",
      icon: "rolls",
      title: "Pick a pair and side",
      body: "choose a currency, long or short, margin and leverage. see liquidation and max payout first.",
    },
    {
      n: "004",
      icon: "nodes",
      title: "Close and withdraw",
      body: "close any time. withdraw your idle balance to your wallet whenever you like.",
    },
  ],
};

export const install = {
  head: {
    id: "install",
    label: "Demo",
    heading: ["See it in one minute.", "Then trade it in one."],
    action: "Launch app",
  } satisfies SectionHead,
  /**
   * The demo video.
   *
   * `youtubeId` is the only thing to fill in when the recording exists — the
   * eleven-character id out of the watch URL (`youtu.be/<id>` or
   * `watch?v=<id>`), not the whole link. Until it is set the frame renders as a
   * labelled placeholder rather than an embed of nothing.
   */
  video: {
    youtubeId: "zShDnW0Cpyk" as string | null,
    /**
     * Bump after changing the thumbnail on YouTube. The thumbnail URL is
     * cached for hours by YouTube's CDN and the browser; a new version makes
     * it a new URL, so the fresh frame shows straight away.
     */
    thumbVersion: "2",
    title: "Product demo",
    /** Printed on the frame's title bar. */
    file: `${brand.name} / demo.mp4`,
    /** Shown in place of the video while there is no id. */
    placeholder: "Demo recording lands here",
    duration: "03:24",
    play: "Play",
  },
  note: "a full ticket end to end: connect, deposit, open, close. no cuts.",
};

export const ticket = {
  head: {
    id: "ticket",
    label: "Your ticket",
    heading: ["Every fill prints", "its own ticket."],
    action: "Launch app",
  } satisfies SectionHead,
  lede: "the ticket is the position, not a summary of it.",
  body: `pair, side, leverage, the price you got and the price it liquidates at, on one slip you can read in three seconds. it prints the moment the order fills, and every line on it settles in ${brand.chain.settlement.toLowerCase()}.`,
  /**
   * The slip itself: the same receipt the app prints when a position closes,
   * rendered from a sample close rather than a photograph of one. A 25x long
   * on USDJPY, 1,000 USDC margin, closed about 0.6% higher.
   *
   * `at` is fixed so the server and the browser print the same minute, and
   * `hash` is a ledger reference (not a Solana signature), so the slip shows
   * it as text instead of linking to an explorer page that does not exist.
   */
  sample: {
    kind: "closed",
    symbol: "USDJPY",
    price: 157.46,
    pnl: 150.15,
    fee: 12.58,
    funding: 0.84,
    amount: 1136.73,
    block: 0,
    at: 1790799420,
    hash: "7f3a9c21e84b0d5611ab",
  } satisfies Activity,
  /** Printed under the machine, in mono, while the paper feeds. */
  status: {
    idle: "Standing by",
    printing: "Printing",
    done: "Ticket ready",
  },
  caption: "one slip per fill. keep it or bin it, your history has its own copy.",
};

export const rates = {
  head: {
    id: "markets",
    label: "Live rates",
    heading: ["Rates right now.", "Every pair, every hour."],
    action: "Launch app",
  } satisfies SectionHead,
  note: "sorted by 24h move · refreshes every 15s",
  emptyLabel: "loading rates",
  pausedLabel: "feed paused, orders queue",
  showAll: "Show all pairs",
  cta: "Trade these pairs",
};

export interface Region {
  id: string;
  name: string;
  blurb: string;
  pairs: { country: string; symbol: string; flag: string }[];
}

export const coverage = {
  head: {
    id: "coverage",
    label: "Coverage",
    heading: ["Every region.", "One balance."],
  } satisfies SectionHead,
  lede: "each currency against the us dollar. pick one to open its market.",
  regions: [
    {
      id: "asia",
      name: "Asia & Oceania",
      blurb: "yen, won, yuan, rupee, baht and more",
      pairs: [
        { country: "Japan", symbol: "USDJPY", flag: "jp" },
        { country: "Korea", symbol: "USDKRW", flag: "kr" },
        { country: "China", symbol: "USDCNY", flag: "cn" },
        { country: "Taiwan", symbol: "USDTWD", flag: "tw" },
        { country: "Hong Kong", symbol: "USDHKD", flag: "hk" },
        { country: "Singapore", symbol: "USDSGD", flag: "sg" },
        { country: "India", symbol: "USDINR", flag: "in" },
        { country: "Pakistan", symbol: "USDPKR", flag: "pk" },
        { country: "Bangladesh", symbol: "USDBDT", flag: "bd" },
        { country: "Thailand", symbol: "USDTHB", flag: "th" },
        { country: "Indonesia", symbol: "USDIDR", flag: "id" },
        { country: "Malaysia", symbol: "USDMYR", flag: "my" },
        { country: "Philippines", symbol: "USDPHP", flag: "ph" },
        { country: "Vietnam", symbol: "USDVND", flag: "vn" },
        { country: "Kazakhstan", symbol: "USDKZT", flag: "kz" },
        { country: "Mongolia", symbol: "USDMNT", flag: "mn" },
        { country: "Australia", symbol: "USDAUD", flag: "au" },
        { country: "New Zealand", symbol: "USDNZD", flag: "nz" },
      ],
    },
    {
      id: "europe",
      name: "Europe",
      blurb: "euro, pound, franc, krona and more",
      pairs: [
        { country: "Euro area", symbol: "USDEUR", flag: "eu" },
        { country: "UK", symbol: "USDGBP", flag: "gb" },
        { country: "Switzerland", symbol: "USDCHF", flag: "ch" },
        { country: "Norway", symbol: "USDNOK", flag: "no" },
        { country: "Sweden", symbol: "USDSEK", flag: "se" },
        { country: "Denmark", symbol: "USDDKK", flag: "dk" },
        { country: "Poland", symbol: "USDPLN", flag: "pl" },
        { country: "Czechia", symbol: "USDCZK", flag: "cz" },
        { country: "Hungary", symbol: "USDHUF", flag: "hu" },
        { country: "Romania", symbol: "USDRON", flag: "ro" },
        { country: "Turkey", symbol: "USDTRY", flag: "tr" },
        { country: "Ukraine", symbol: "USDUAH", flag: "ua" },
        { country: "Armenia", symbol: "USDAMD", flag: "am" },
      ],
    },
    {
      id: "americas",
      name: "Americas",
      blurb: "real, peso, sol and the loonie",
      pairs: [
        { country: "Canada", symbol: "USDCAD", flag: "ca" },
        { country: "Mexico", symbol: "USDMXN", flag: "mx" },
        { country: "Brazil", symbol: "USDBRL", flag: "br" },
        { country: "Argentina", symbol: "USDARS", flag: "ar" },
        { country: "Chile", symbol: "USDCLP", flag: "cl" },
        { country: "Colombia", symbol: "USDCOP", flag: "co" },
        { country: "Peru", symbol: "USDPEN", flag: "pe" },
        { country: "Uruguay", symbol: "USDUYU", flag: "uy" },
        { country: "Paraguay", symbol: "USDPYG", flag: "py" },
        { country: "Dominican Republic", symbol: "USDDOP", flag: "do" },
        { country: "Costa Rica", symbol: "USDCRC", flag: "cr" },
        { country: "Jamaica", symbol: "USDJMD", flag: "jm" },
        { country: "Guatemala", symbol: "USDGTQ", flag: "gt" },
      ],
    },
    {
      id: "middle-east",
      name: "Middle East",
      blurb: "riyal, dirham, dinar and shekel",
      pairs: [
        { country: "Saudi Arabia", symbol: "USDSAR", flag: "sa" },
        { country: "United Arab Emirates", symbol: "USDAED", flag: "ae" },
        { country: "Qatar", symbol: "USDQAR", flag: "qa" },
        { country: "Kuwait", symbol: "USDKWD", flag: "kw" },
        { country: "Bahrain", symbol: "USDBHD", flag: "bh" },
        { country: "Oman", symbol: "USDOMR", flag: "om" },
        { country: "Jordan", symbol: "USDJOD", flag: "jo" },
        { country: "Israel", symbol: "USDILS", flag: "il" },
      ],
    },
    {
      id: "africa",
      name: "Africa",
      blurb: "rand, naira, shilling, pound and more",
      pairs: [
        { country: "South Africa", symbol: "USDZAR", flag: "za" },
        { country: "Nigeria", symbol: "USDNGN", flag: "ng" },
        { country: "Egypt", symbol: "USDEGP", flag: "eg" },
        { country: "Kenya", symbol: "USDKES", flag: "ke" },
        { country: "Ghana", symbol: "USDGHS", flag: "gh" },
        { country: "Morocco", symbol: "USDMAD", flag: "ma" },
        { country: "Tunisia", symbol: "USDTND", flag: "tn" },
        { country: "Algeria", symbol: "USDDZD", flag: "dz" },
        { country: "Tanzania", symbol: "USDTZS", flag: "tz" },
        { country: "Uganda", symbol: "USDUGX", flag: "ug" },
        { country: "Zambia", symbol: "USDZMW", flag: "zm" },
        { country: "Mauritius", symbol: "USDMUR", flag: "mu" },
      ],
    },
  ] satisfies Region[],
};

export const pricing = {
  head: {
    id: "fees",
    label: "Pricing",
    heading: ["Simple, transparent fees.", "Nothing marked up."],
  } satisfies SectionHead,
  plans: [
    {
      n: "001",
      name: "Open or close",
      value: "0.05%",
      unit: "of notional",
      includes: [
        "charged on entry",
        "charged again on exit",
        "no spread markup",
      ],
    },
    {
      n: "002",
      name: "Funding",
      value: "±0.75%",
      unit: "max per 8h",
      featured: true,
      includes: [
        "skew based: the crowded side pays",
        "accrues continuously",
        "settled when you close",
      ],
    },
    {
      n: "003",
      name: "Deposit & withdraw",
      value: "0",
      unit: "venue fees",
      includes: [
        "only network fees on deposits",
        "withdraw idle balance any time",
        "cancelled orders fully refunded",
      ],
    },
  ],
};

export const docs = {
  head: {
    id: "docs",
    label: "Documentation",
    heading: ["Everything documented.", "Nothing left to guess."],
    action: "Learn more",
  } satisfies SectionHead,
  lede: "everything you need before your first position.",
  body: "how the venue prices, funds and liquidates a trade, written out plainly, with the numbers, not the marketing.",
  view: "View",
  /**
   * Two books. The first is the one everybody needs; the second is for whoever
   * wants the mechanics. `href` stays null until each is published — the card
   * then renders as a coming-soon state rather than a dead link.
   */
  books: [
    {
      n: "001",
      title: documentation.name,
      tags: ["Setup", "Wallet", "First trade"],
      href: documentation.path as string | null,
      /**
       * The book itself, so the card's thumbnail is the book's own first page
       * rather than a mock of it — edit a sentence in `books.ts` and the
       * landing page follows.
       */
      book: documentation,
    },
    {
      n: "002",
      title: tradingGuide.name,
      tags: ["Funding", "Liquidation", "Leverage caps"],
      href: tradingGuide.path as string | null,
      book: tradingGuide,
    },
  ],
};

export const faq = {
  head: {
    id: "faq",
    label: "FAQs",
    heading: ["Questions,", "answered."],
  } satisfies SectionHead,
  items: [
    {
      n: "001",
      q: "What exactly is an FX perp?",
      a: "a perpetual future on an exchange rate, like usdjpy or usdinr. it tracks the live rate with no expiry, so you can hold a position as long as your margin covers it. you trade price moves without ever holding the currency.",
    },
    {
      n: "002",
      q: "How do I profit if a currency gets stronger?",
      a: "pairs are quoted as local currency per one dollar, e.g. usdjpy = yen per dollar. if you think the yen will strengthen, the pair falls, so you short usdjpy. if you think the dollar will strengthen, you go long.",
    },
    {
      n: "003",
      q: "Is it really open 24/7?",
      a: "yes. fx pairs trade around the clock, including weekends. if the price feed pauses, the pair shows as paused and new orders queue and fill at the next live price, never at a stale one.",
    },
    {
      n: "004",
      q: "Who is on the other side of my trade?",
      a: "the venue itself. there is no order book to wait on, so orders fill instantly at the live rate. exposure limits keep every position payable.",
    },
    {
      n: "005",
      q: "How much can I lose?",
      a: "never more than the margin you put in. a position is liquidated when its equity falls to the maintenance margin.",
    },
    {
      n: "006",
      q: "What do I need to start?",
      a: `a solana wallet such as phantom, solflare or backpack, ${brand.chain.settlement} on ${brand.chain.name.toLowerCase()}, and a little sol for the deposit's network fee.`,
    },
  ],
};

export const cta = {
  eyebrow: "Get started in a minute",
  /** Same three-line shape as the hero: the middle line is typed. */
  heading: { lead: "Every currency,", tail: "Start trading today!" },
  typed: ["unified", "instant", "24/7", "one balance"] as const,
  /** The closing panel's own two lines, set over the candle field. */
  panel: {
    heading: "Start trading on vevo.",
    lede: "perpetual futures on every currency. fast, liquid and always on.",
  },
  action: "Launch app",
  secondary: "Read the docs",
  /** Repeated across the marquee bands above and below the panel. */
  marquee: ["[#FX]", "&", "[#PERPETUALS]"],
};

export const footer = {
  /** The dot and the line beside it: the one status a venue owes its readers. */
  status: "All systems operational",
  tagline: `Build a position on any currency, from one ${brand.chain.settlement} balance.`,

  loop: {
    heading: "Stay in the loop.",
    body: "the launch date, new pairs and changelog notes, straight from the desk.",
    placeholder: "Enter your email",
    action: "Join",
    done: "Joined",
    failed: "Try again",
  },

  /** Three short columns beat one long list: the reference groups by intent. */
  columns: [
    {
      label: "Trade",
      links: [
        { label: "Open the app", href: "/app" },
        { label: "All pairs", href: "/app/pairs" },
        { label: "Live rates", href: "/#markets" },
        { label: "Fees", href: "/#fees" },
      ],
    },
    {
      label: "Learn",
      links: [
        { label: "Documentation", href: "/docs" },
        { label: "Trading guide", href: "/docs/trading" },
        { label: "How it works", href: "/#how" },
        { label: "FAQ", href: "/#faq" },
      ],
    },
    {
      label: "Venue",
      links: [
        { label: "Countries", href: "/#coverage" },
        { label: "Demo", href: "/#install" },
        { label: "Terms of service", href: "/terms" },
        { label: "Privacy policy", href: "/privacy" },
      ],
    },
  ],

  followLabel: "Follow",
  /**
   * Three marks, and no repository. The source stays findable for anyone who
   * goes looking, but a link in the footer invites every visitor to read the
   * commit history, and a commit history is a different document from a
   * product.
   *
   * Telegram and Discord have no accounts behind them yet. They are rendered
   * anyway, dimmed and unclickable, because the row should not change shape on
   * the day the handles are filled in.
   */
  follow: [
    { kind: "x" as const, name: "X", key: "x" as const },
    { kind: "telegram" as const, name: "Telegram", key: "telegram" as const },
    { kind: "discord" as const, name: "Discord", key: "discord" as const },
  ],

  legal: {
    rights: `© ${new Date().getFullYear()}`,
  },
  note: "perpetual futures carry risk. you can lose your margin.",
};

/** Ordered, so the `[N.xx/yy]` markers number themselves. */
export const SECTION_ORDER = [
  keyValue.head,
  performance.head,
  howItWorks.head,
  install.head,
  ticket.head,
  rates.head,
  coverage.head,
  pricing.head,
  docs.head,
  faq.head,
] as const;

export const SECTION_COUNT = SECTION_ORDER.length;

/** 1-based position of a section, for its marker. */
export const sectionIndex = (id: string): number =>
  SECTION_ORDER.findIndex((section) => section.id === id) + 1;
