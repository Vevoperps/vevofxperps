/**
 * Every word the app says, in one file, the way `content.ts` holds the
 * landing page's.
 *
 * The preview banner is not decoration. Nothing that moves money is on yet and
 * the marks are generated rather than fetched, and a venue that does not say so
 * on every screen is lying by omission — so the line lives here, once, and
 * every screen prints it.
 */

import { brand } from "@/lib/brand";

export const app = {
  chip: "FX perps",
  /**
   * Printed across the top of every app screen.
   *
   * Two states, and the app is honest about which one it is in. `preview` is
   * the default: generated marks and every money button off. `live` is what
   * shows once an engine address is configured — and on a development chain it
   * says that too, because a demo that looks like the real thing is how
   * somebody ends up thinking their test balance is money.
   */
  banner:
    "this is a read-only preview. prices are simulated until the feed is connected, and deposits, orders and withdrawals are off.",
  bannerLive: (chain: string) =>
    `live. deposits and withdrawals in usdc on ${chain.toLowerCase()}; every price, balance and position on this screen is the venue's own, live.`,
  bannerLocal:
    "connected to a local validator. the usdc here is a test mint and is worth nothing.",
  /**
   * A public testnet is the awkward middle: every screen is real, every
   * transaction is real, and none of the money is. Saying "live" and stopping
   * there would be true and misleading at once.
   */
  bannerTestnet: (chain: string) =>
    `live on ${chain.toLowerCase()}, a test network. every price, balance and position is real on the venue, and the usdc is devnet usdc from circle's faucet, worth nothing.`,
  /**
   * `ready: false` prints the item and refuses to link it. A nav that leads to
   * a 404 is worse than one that says a screen is still being built.
   */
  nav: [
    { href: "/app", label: "Home", ready: true },
    { href: "/app/pairs", label: "All pairs", ready: true },
    { href: "/app/pool", label: "Pool", ready: true },
    { href: "/app/portfolio", label: "Portfolio", ready: true },
    { href: "/app/vevo", label: `$${brand.token.ticker}`, ready: true },
  ],

  wallet: {
    connect: "Connect wallet",
    /** Shown above the list when at least one wallet announced itself. */
    pick: "Choose a wallet",
    none: "No wallet detected in this browser",
    ready: "Connect",
    waiting: "Waiting…",
    install: "Install",
    refused: "the wallet refused the connection. nothing was signed.",
    disconnect: "Disconnect",
    /** The menu under the connected chip. */
    connectedAs: "Connected",
    copy: "Copy address",
    copied: "Copied",
    accounts: "Accounts shared by the wallet",
    change: "Change wallet",
    switchHint:
      "phantom and solflare connect the account selected inside the wallet. to trade from another one, switch it there: the venue follows. or change wallet to pick a different app.",
    wrongChain: (chain: string) => `Switch to ${chain}`,
    chainRefused: (chain: string) =>
      `the wallet would not switch to ${chain.toLowerCase()}. add it manually and try again.`,
    note: (chain: string) =>
      `connecting only proves the address is yours. nothing moves on ${chain.toLowerCase()} in this preview: deposits are off.`,
    noteLive: (chain: string) =>
      `connecting only proves the address is yours. nothing moves on ${chain.toLowerCase()} until you sign a deposit, and withdrawals only ever go back to this wallet.`,
    /**
     * The wallets worth naming when none is installed.
     *
     * `rdns` is matched against what a wallet announces, so an installed one is
     * never listed twice — an installed wallet shows the icon it ships itself,
     * and these files are only for the ones that are not here to speak for
     * themselves. Each is that wallet's own mark, used to identify it in a
     * picker, which is what a brand mark is for.
     */
    known: [
      {
        rdns: "phantom",
        name: "Phantom",
        icon: "/assets/wallets/phantom.webp" as string | null,
        install: "https://phantom.com/download",
      },
      {
        rdns: "solflare",
        name: "Solflare",
        icon: null as string | null,
        install: "https://solflare.com/download",
      },
      {
        rdns: "backpack",
        name: "Backpack",
        icon: null as string | null,
        install: "https://backpack.app/download",
      },
    ],
  },

  home: {
    badge: "Read-only preview · 64 pairs",
    /** Once the marks are the engine's own. */
    badgeLive: (count: number) => `Live · ${count} pairs`,
    heading: "Pick a currency",
    lede: `every pair is quoted against the us dollar and trades 24/7 from one ${brand.chain.settlement} balance. choose one to open the terminal.`,
    primary: "All pairs",
    secondary: "How to start",
    ratesTitle: "Live rates",
    ratesHint: "click a pair to trade",
    ratesNote: "sorted by 24h move · refreshes every 15s",
    live: (count: number) => `${count} pairs live`,
    columns: {
      pair: "Pair",
      currency: "Currency",
      mark: "Mark",
      change: "24h",
      funding: "Funding",
      leverage: "Max lev",
    },
    empty: "loading rates",
    failed: "feed paused, showing the last known list",
  },

  pairs: {
    title: "All pairs",
    heading: "Every currency, one balance",
    lede: "64 pairs across five regions, each against the dollar. the cap beside a country is its leverage limit.",
    count: (n: number) => `${n} pairs`,
  },

  market: {
    /** The line under the pair name, per side. */
    kind: "FX / 24/7 / perpetual",
    describe: (symbol: string, currency: string) =>
      `long ${symbol.toLowerCase()} profits when the us dollar rises against the ${currency}. trades 24/7.`,
    back: "All pairs",
    stats: {
      last: "Last",
      change: "24h",
      funding: "Funding 8h",
      interest: "Open interest",
      session: "Session",
    },
    session: "24/7, feed paused",
    /** Once the marks come off the chain, the session really is just 24/7. */
    sessionLive: "24/7",
    /** The chip beside the pair name: what this market is doing right now. */
    state: {
      preview: "Preview",
      live: "Live",
      /**
       * Quoted, not yet fillable.
       *
       * The rate on screen is real and moving; what is missing is a mark on
       * chain, which the keeper writes for a market as soon as somebody turns
       * up at it. It is a round of the price loop, not an outage, and the
       * ticket beside it says so in its own words rather than leaving a dead
       * button to explain itself.
       */
      warming: "Warming up",
      paused: "Paused",
      closed: "No price",
    } as Record<string, string>,
    chartNote: "local currency per usd",
    marketsTitle: ["The currency,", "one balance"],
    marketsLede: `every fx pair trades 24/7 from your one ${brand.chain.settlement} balance.`,
    columns: {
      market: "Market",
      status: "Status",
      mark: "Mark",
      change: "24h",
      funding: "Funding 8h",
      longs: "Long OI",
      shorts: "Short OI",
      session: "Session",
      leverage: "Max lev",
    },
    notFound: "That pair is not listed.",
  },

  ticket: {
    long: "Long",
    short: "Short",
    marginLabel: (asset: string, idle: string) =>
      `Margin, ${asset} · idle ${idle}`,
    leverage: "Leverage",
    entry: "entry",
    entryValue: "next live print",
    notional: "notional",
    liquidation: "liquidation",
    fee: "fee 0.05%",
    payout: "max payout",
    payoutValue: (amount: string) => `up to ${amount}`,
    note: "profit is capped at max payout, fixed when your position opens.",
    capNote: (leverage: number) =>
      `capped at ${leverage}x. this pair moves far enough that a higher cap would liquidate on an ordinary day.`,
    action: "Deposits not live yet",
    /**
     * The pair is quoted but has no mark on chain yet.
     *
     * Not an error and not an outage: the keeper prices a market once it knows
     * somebody is at it, and the page has just told it. A round of the price
     * loop, then this button becomes the real one on its own.
     */
    warming: "Preparing this market",

    /** The live states, in the order a first trade meets them. */
    connect: "Connect a wallet",
    switchChain: (chain: string) => `Switch to ${chain}`,
    fund: "Deposit first",
    open: (side: "long" | "short") =>
      side === "long" ? "Open long" : "Open short",
    working: "Confirm in your wallet…",
    close: "Close position",
    closing: "Closing…",
    openPosition: "Open position",
    unpriced: "no price for this pair yet",

    /** Managing a position that is already open. */
    manage: {
      marginLabel: (asset: string, idle: string) =>
        `Add margin, ${asset} · idle ${idle}`,
      add: "Add",
      reduceLabel: (notional: string) => `Close part, notional of ${notional}`,
      reduce: "Close",
      half: "Half",
      note: "adding margin moves the liquidation price and nothing else. the payout cap was fixed when the position opened.",
    },
    yours: {
      side: "side",
      size: "notional",
      entry: "entry",
      mark: "mark",
      pnl: "unrealised",
      funding: "funding",
      liquidation: "liquidation",
    },
  },

  pool: {
    title: "Pool",
    heading: ["Back the book,", "own a share of it"],
    lede: `the venue is the counterparty to every trade, and this is what it trades with. providers put ${brand.chain.settlement} in and take shares out; the shares are worth whatever the pool is worth when they are redeemed.`,
    stats: {
      size: "Pool size",
      reserved: "Reserved",
      free: "Free to withdraw",
      utilisation: "Utilisation",
    },
    yours: "Your position",
    yourValue: "Value",
    yourShare: "Share of pool",
    shares: "Shares",
    add: "Provide",
    remove: "Redeem",
    /** Liquidity comes from the free balance: deposit first, then provide. */
    addLabel: (asset: string, free: string) =>
      `Provide ${asset} · free balance ${free}`,
    removeLabel: (value: string) => `Redeem, up to ${value}`,
    max: "Max",
    /**
     * What a provider is actually taking on. Plain, because somebody about to
     * be the counterparty to sixty-four currency pairs should read it once and
     * understand it.
     */
    risk: [
      {
        term: "You are the other side",
        body: "the pool wins when traders lose and loses when they win. fees and the funding the book's skew pays go to it either way.",
      },
      {
        term: "Reserved is not yours to withdraw",
        body: "every open position has its payout cap reserved out of the pool. that part is locked until the position closes, which is what makes the cap worth anything.",
      },
      {
        term: "No lock, no schedule",
        body: "redeem any time, up to what is free. there is no epoch, no queue and no notice period.",
      },
    ],
    empty: "Connect a wallet to provide liquidity.",
  },

  portfolio: {
    title: "Portfolio",
    heading: ["One balance,", "every market"],
    lede: "fx perps, net of fees and funding.",
    total: `Total PNL, ${brand.chain.settlement}`,
    tiles: {
      unrealised: "Unrealised",
      realised: "Realised",
      staked: "In open stakes",
      idle: "Idle, withdrawable",
    },
    /**
     * Both balances, because they are two different places.
     *
     * The wallet balance is what the faucet fills and what a deposit spends;
     * the idle balance is what the venue holds and what a trade draws on.
     * Showing only the second made the faucet look like it had done nothing:
     * tokens arrived, and every number on the page stayed at zero.
     */
    transfers: (asset: string, idle: string, wallet: string) =>
      `${asset} transfers. Idle balance ${idle}, withdrawable · ${wallet} in wallet, depositable`,
    deposit: "Deposit",
    withdraw: "Withdraw",
    /** After a withdrawal request: sent automatically, or held for a manual check. */
    withdrawQueued: "withdrawal on its way. it lands in your wallet within a minute.",
    withdrawReview:
      "withdrawal received. larger amounts get a manual check before they are sent, usually within a few hours.",
    /** Test networks only: a link to Circle's devnet USDC faucet. */
    faucet: "Get devnet USDC",
    columns: {
      pair: "Pair",
      side: "Side",
      notional: "Notional",
      entry: "Entry",
      mark: "Mark",
      pnl: "Unrealised",
      liquidation: "Liquidation",
    },
    tabs: ["Positions", "Orders", "History", "Transfers", "Receipts"],
    /** How each recorded event reads in the list. */
    activity: {
      closed: "Closed",
      reduced: "Closed part",
      liquidated: "Liquidated",
      deposit: "Deposit",
      withdraw: "Withdrawal",
      columns: {
        event: "Event",
        pair: "Pair",
        price: "Price",
        amount: "Amount",
        pnl: "Result",
        when: "When",
      },
    },
    empty: {
      Positions: "0 open positions.",
      Orders:
        "0 resting orders. this venue fills at the mark, so orders do not rest.",
      History: "0 closed positions.",
      Transfers: "0 deposits or withdrawals.",
      Receipts: "no receipts yet. close a position and one prints here.",
    } as Record<string, string>,
    connect: "Connect a wallet to see your portfolio.",
  },

  /**
   * The token screen.
   *
   * **Everything numeric here is a slot, not a claim.** Supply, distribution
   * and the stake a tier asks for are decisions that have not been made, and a
   * page that prints a plausible number for one of them is publishing a fact
   * about a token nobody has minted. So each is `null` until it is real, and
   * the screen prints `tba` in its place rather than a figure that would have
   * to be taken back.
   *
   * The mechanics below are settled and are stated plainly: fees flow to
   * stakers, and settlement stays in the dollar stablecoin.
   */
  vevo: {
    title: `$${brand.token.ticker}`,

    hero: {
      eyebrow: "The token of the venue",
      headline: "One venue. One token.",
      lede: `vevo is already live: 64 currencies against the dollar, up to 25x, open 24/7, one ${brand.chain.settlement} balance on ${brand.chain.name}. $${brand.token.ticker} is the token behind it.`,
      status: { soon: "Launching on pump.fun", live: "Live on pump.fun" },
    },

    ca: {
      label: "Contract address",
      soon: "drops here at launch",
      copy: "Copy",
      copied: "Copied",
      trust: `Only trust the address on this page and on @Vevofxperps. Anything else in the replies is not $${brand.token.ticker}.`,
    },

    actions: {
      buy: "Buy on pump.fun",
      chart: "Chart",
      explorer: "Solscan",
      soon: "at launch",
    },

    /** The token card. Pump.fun mints a fixed one billion supply. */
    card: {
      title: "Token",
      rows: [
        { label: "Ticker", value: `$${brand.token.ticker}` },
        { label: "Chain", value: brand.chain.name },
        { label: "Supply", value: "1,000,000,000" },
        { label: "Launch", value: "Fair launch, pump.fun" },
      ],
    },

    /** What the token sits on top of: facts that are live today. */
    venue: {
      title: "Already running",
      lede: "the token launches into a venue that works, not a roadmap.",
      stats: [
        { value: "64", label: "currencies against the dollar" },
        { value: "25x", label: "max leverage on the majors" },
        { value: "24/7", label: "open, weekends included" },
        { value: "0.05%", label: "fee per side, every fee to the pool" },
      ],
      cta: "Open the app",
    },

    honesty: {
      title: `Why margin is not $${brand.token.ticker}`,
      body: `a position is a bet on a currency, not on us. if margin were held in ${brand.token.ticker}, a trader could read the yen correctly and still be liquidated because the token moved against them overnight. so collateral and payouts stay in ${brand.chain.settlement}, and ${brand.token.ticker} is built to earn from the venue instead of standing inside it.`,
    },

    /**
     * Planned, and said to be planned. None of these is live: each one ships
     * with its own announcement and is moved out of this list the day it is.
     */
    roadmap: {
      title: "Planned for holders",
      tag: "Planned",
      note: "each one ships with its own announcement, and moves to live on this page the day it does.",
      items: [
        {
          title: "Holder fee tiers",
          body: `hold more $${brand.token.ticker}, pay less per trade. read from the wallet you sign in with, no staking, no lock.`,
        },
        {
          title: "Fee share",
          body: `a share of what the venue earns, routed to $${brand.token.ticker} holders.`,
        },
        {
          title: "Trading cups",
          body: `leaderboards and ${brand.chain.settlement} prizes for the traders who call the dollar best.`,
        },
      ],
    },

    howto: {
      title: "How to buy",
      steps: [
        { title: "Get SOL", body: "in a Solana wallet: Phantom, Solflare or Backpack." },
        { title: "Open pump.fun", body: `from the button on this page, nowhere else.` },
        { title: "Check the address", body: "it must match the contract address above, character for character." },
        { title: "Buy, then trade", body: `hold $${brand.token.ticker} and trade the venue at vevoperps.com/app.` },
      ],
    },
  },

  /**
   * The slip a closed position prints.
   *
   * Short, upper case, and shaped like a till roll: the landing sells the
   * venue on the idea that a fill prints its own ticket, and the app has to
   * actually print one or the promise was decoration.
   */
  receipt: {
    header: "vevo perpetual futures",
    printed: "Receipt printed",
    dismiss: "Done",
    pair: "PAIR",
    margin: "MARGIN",
    exit: "EXIT",
    result: "RESULT",
    fee: "FEE",
    funding: "FUNDING",
    payout: "Payout",
    filled: "closed at the mark. no order book, no queue.",
    settled: (asset: string) => `settled in ${asset.toLowerCase()}.`,
    verify: "Verify",
    unknown: "unknown pair",
    /** The Receipts tab, when nothing has closed yet. */
    empty: "no receipts yet. close a position and one prints here.",
  },
} as const;
