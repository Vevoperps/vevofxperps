/**
 * The two handbooks, in one file.
 *
 * `documentation` is what everybody needs before their first position;
 * `tradingGuide` is for whoever wants the mechanics underneath. Same shape, so
 * one view renders both and the landing page's preview cards can draw a real
 * page out of either rather than a grey mock-up.
 *
 * Every number in here is one of the product's own and appears in exactly one
 * place elsewhere: the fee, the funding cap, the payout cap, the maintenance
 * margin and the leverage tiers. If one of them changes, it changes here and in
 * `data/content.ts`, and nowhere else.
 */

import { brand } from "@/lib/brand";

export interface Block {
  kind: "text" | "list" | "note" | "figures";
  body?: string;
  items?: { term: string; body: string }[];
  /** `figures` only: a small table of numbers the chapter turns on. */
  figures?: { value: string; caption: string }[];
}

export interface Chapter {
  id: string;
  eyebrow: string;
  title: string;
  blocks: Block[];
}

export interface Book {
  /** Slug under `/docs`. The documentation itself is the index. */
  path: string;
  name: string;
  title: string;
  lede: string;
  back: string;
  nav: { group: string; links: { id: string; label: string }[] }[];
  chapters: Chapter[];
}

const SETTLEMENT = brand.chain.settlement;
const CHAIN = brand.chain.name;

export const documentation: Book = {
  path: "/docs",
  name: "Documentation",
  title: "Getting started",
  lede: "everything between connecting a wallet and closing your first position, written out in order.",
  back: "Back to site",

  nav: [
    {
      group: "Start here",
      links: [
        { id: "intro", label: "Introduction" },
        { id: "perp", label: "What a perp is" },
        { id: "wallet", label: "Wallet & chain" },
        { id: "deposit", label: "Deposit & withdraw" },
        { id: "first-trade", label: "Your first position" },
      ],
    },
    {
      group: "Core concepts",
      links: [
        { id: "pairs", label: "Pairs & quoting" },
        { id: "direction", label: "Long & short" },
        { id: "margin", label: "Margin & leverage" },
        { id: "notional", label: "Notional" },
        { id: "ticket", label: "Reading the ticket" },
      ],
    },
    {
      group: "Running a position",
      links: [
        { id: "open", label: "Opening" },
        { id: "monitor", label: "Watching it" },
        { id: "topup", label: "Adding margin" },
        { id: "close", label: "Closing" },
      ],
    },
    {
      group: "Risk",
      links: [
        { id: "liquidation", label: "Liquidation" },
        { id: "payout", label: "Max payout" },
        { id: "feed", label: "When the feed pauses" },
        { id: "mistakes", label: "Common mistakes" },
      ],
    },
    {
      group: "Costs",
      links: [
        { id: "fees", label: "What a trade costs" },
        { id: "funding", label: "Funding, in short" },
      ],
    },
    {
      group: "Reference",
      links: [
        { id: "limits", label: "Leverage caps" },
        { id: "custody", label: "Custody & security" },
        { id: "trouble", label: "If something breaks" },
        { id: "glossary", label: "Glossary" },
      ],
    },
  ],

  chapters: [
    {
      id: "intro",
      eyebrow: "Start here",
      title: `Get started with ${brand.name}`,
      blocks: [
        {
          kind: "text",
          body: `${brand.name} is a perpetual futures venue for currencies. 64 of them, each quoted against the dollar, open every hour of every day, funded and paid out in ${SETTLEMENT} on ${CHAIN}.`,
        },
        {
          kind: "text",
          body: "You never hold the currency itself. You take a position on where its rate against the dollar is going, put up margin, and close whenever you like. There is no bank account, no broker onboarding and no minimum.",
        },
        {
          kind: "figures",
          figures: [
            { value: "64", caption: "currencies" },
            { value: "25x", caption: "top leverage" },
            { value: "24/7", caption: "always open" },
            { value: "0.05%", caption: "fee each way" },
          ],
        },
        {
          kind: "text",
          body: "Currency markets are the largest markets there are and the hardest for a private trader to reach. A retail FX account means a broker, a credit check and a set of hours that close on Friday evening. This is the same exposure, reached with a wallet, on a market that does not close.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Who it is for",
              body: "anyone with a view on a currency: the yen after a policy meeting, the naira through a devaluation, the euro against a rate cut.",
            },
            {
              term: "What you need",
              body: `a wallet, some ${SETTLEMENT}, and ten minutes to read the four chapters that matter.`,
            },
            {
              term: "What it is not",
              body: "a savings product, a yield product, or a place to leave money doing nothing. Every position has a cost of carry.",
            },
          ],
        },
        {
          kind: "note",
          body: "If you read nothing else, read the pair chapter, the margin chapter and the liquidation chapter. Between them they cover everything that decides whether a position survives.",
        },
      ],
    },
    {
      id: "perp",
      eyebrow: "Start here",
      title: "What a perpetual actually is",
      blocks: [
        {
          kind: "text",
          body: "A future is an agreement about a price at a date. A perpetual future strips out the date: it tracks the underlying rate and never expires, so a position lives until you close it or it is liquidated.",
        },
        {
          kind: "text",
          body: "That leaves one problem to solve. Without an expiry to pull the contract back to the real rate, something has to keep the two together. That something is funding, a small continuous payment between the long side and the short side of the market.",
        },
        {
          kind: "list",
          items: [
            {
              term: "No expiry",
              body: "nothing to roll, nothing to settle on a calendar date, no contract month to pick.",
            },
            {
              term: "No delivery",
              body:
                "you never receive yen. The position is settled in " +
                SETTLEMENT +
                " against the rate.",
            },
            {
              term: "No order book",
              body: "the venue is the counterparty, so orders fill at the live mark rather than against another trader's resting bid.",
            },
          ],
        },
        {
          kind: "text",
          body: "The practical consequence: opening is instant, closing is instant, and the only thing standing between you and the rate is the fee and the funding. Both are printed before you sign.",
        },
      ],
    },
    {
      id: "wallet",
      eyebrow: "Start here",
      title: "Wallet and chain",
      blocks: [
        {
          kind: "text",
          body: `Any Solana wallet works: Phantom, Solflare, Backpack. ${CHAIN} is what the wallet already speaks, so there is no network to add and no RPC to paste.`,
        },
        {
          kind: "list",
          items: [
            {
              term: "Connect",
              body: "no deposit yet. It shows the venue which address is yours and nothing more.",
            },
            {
              term: "Sign in once",
              body: "the first action asks the wallet to sign a message with a one-time nonce. That opens a session; after it, orders fill with one click and no wallet prompt.",
            },
            {
              term: "No account",
              body: "there is no email, no password and no form. The wallet is the account.",
            },
            {
              term: "Switch address",
              body: "changing the active address in the wallet changes the account. Positions belong to the address that opened them.",
            },
          ],
        },
        {
          kind: "text",
          body: "The sign-in signature is not a transaction. It costs no fee, moves nothing, and can be refused at any point without leaving a trace on chain.",
        },
        {
          kind: "note",
          body: "Solana has no token allowances to grant. Every deposit is a transfer you sign yourself, and nothing can draw on your wallet afterwards.",
        },
      ],
    },
    {
      id: "deposit",
      eyebrow: "Start here",
      title: "Deposit and withdraw",
      blocks: [
        {
          kind: "text",
          body: `Margin is held in ${SETTLEMENT}. A deposit is a plain transfer from your wallet to the venue on ${CHAIN}, credited once the transaction is final, usually within half a minute. A withdrawal sends your idle balance back to the address that signed in, and nowhere else.`,
        },
        {
          kind: "list",
          items: [
            {
              term: "Free balance",
              body: "everything not behind an open position. It can be withdrawn at any moment.",
            },
            {
              term: "Locked balance",
              body: "the margin behind open positions, plus any funding that has accrued against you.",
            },
            {
              term: "Settlement",
              body: "closing a position returns its margin and result to the free balance immediately, not at the end of a day.",
            },
          ],
        },
        {
          kind: "note",
          body: "Only margin behind open positions is locked. Everything else can be withdrawn whenever you ask, with no venue fee.",
        },
        {
          kind: "text",
          body: `A withdrawal is an ordinary ${SETTLEMENT} transfer on ${CHAIN}, and the venue pays its network fee. Most go out automatically within a minute; larger amounts are checked by hand before they are sent, usually within a few hours. The minimum is 1 ${SETTLEMENT}.`,
        },
      ],
    },
    {
      id: "first-trade",
      eyebrow: "Start here",
      title: "Your first position, step by step",
      blocks: [
        {
          kind: "text",
          body: "Start small enough that the outcome does not matter. The point of the first position is to see the machinery work end to end, not to make money.",
        },
        {
          kind: "list",
          items: [
            {
              term: "1. Pick a pair you have a view on",
              body: "a major is the gentler place to start: it moves less per day, so the first position is less likely to teach its lesson quickly.",
            },
            {
              term: "2. Choose a side",
              body: "long if you think the pair rises, short if you think it falls. The pair, not the currency: see the next chapter.",
            },
            {
              term: "3. Set margin and leverage",
              body: "low leverage for a first trade. Two or three times is enough to feel how the number moves.",
            },
            {
              term: "4. Read the liquidation price",
              body: "it is printed before you sign. Ask yourself whether the pair could reach it in an afternoon.",
            },
            {
              term: "5. Confirm",
              body: "one click. The fill is the current live mark and the ticket prints with it.",
            },
          ],
        },
        {
          kind: "text",
          body: "Then watch it for a while before doing anything else. A position is the only way to learn how a pair behaves, and the cheapest version of that lesson is a small one.",
        },
        {
          kind: "note",
          body: "Closing costs the same 0.05% as opening. Opening and closing a position twice in an afternoon costs four fees, which on a small position is most of what it can make.",
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
          body: "That makes direction easy to get backwards, so it is worth saying plainly: if you think a currency will strengthen against the dollar, its pair falls, and you go short.",
        },
        {
          kind: "figures",
          figures: [
            { value: "147.38", caption: "yen per dollar" },
            { value: "0.9182", caption: "euro per dollar" },
            { value: "87.21", caption: "rupee per dollar" },
            { value: "1,543", caption: "naira per dollar" },
          ],
        },
        {
          kind: "note",
          body: "Yen strengthening from 150 to 145 per dollar is USDJPY going down. Short is the trade.",
        },
        {
          kind: "text",
          body: "Some of these look unfamiliar because the market usually quotes them the other way round. EURUSD on a broker's screen is dollars per euro; here the euro is quoted like every other currency, as euro per dollar, so that all 64 pairs read the same way and one habit works across the whole venue.",
        },
      ],
    },
    {
      id: "direction",
      eyebrow: "Core concepts",
      title: "Long, short, and which is which",
      blocks: [
        {
          kind: "text",
          body: "Long means you profit when the pair's number goes up. Short means you profit when it goes down. Because every pair is local currency per dollar, the number going up means the dollar is buying more of that currency.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Long the pair",
              body: "a bet on the dollar against that currency. USDTRY long profits if the lira weakens.",
            },
            {
              term: "Short the pair",
              body: "a bet on that currency against the dollar. USDJPY short profits if the yen strengthens.",
            },
            {
              term: "The habit",
              body: "say the trade out loud as the dollar: long is dollar up, short is dollar down. It is right every time.",
            },
          ],
        },
        {
          kind: "text",
          body: "One consequence worth holding on to: a currency that is depreciating steadily, as several frontier currencies have been for years, is a pair that trends upward. Long is the direction that has historically paid there, and it is also the side that usually pays funding for the privilege.",
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
          body: `Margin is what you put up. Leverage is how much position that margin controls. 250 ${SETTLEMENT} at 10x is a 2,500 ${SETTLEMENT} position, and a 1% move against it costs 25, a tenth of your margin.`,
        },
        {
          kind: "figures",
          figures: [
            { value: "250", caption: "margin" },
            { value: "10x", caption: "leverage" },
            { value: "2,500", caption: "notional" },
            { value: "9.5%", caption: "to liquidation" },
          ],
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
            {
              term: "Leverage is not a target",
              body: "the cap is what the pair can bear, not what a position should use.",
            },
            {
              term: "It cuts both ways",
              body: "10x turns a 1% move into 10% of your margin, in whichever direction the market goes.",
            },
          ],
        },
        {
          kind: "text",
          body: "The useful way to think about leverage is as a distance, not a multiple. At 10x, liquidation sits 9.5% away. At 25x it sits 3.5% away. The question is never how much leverage you want, it is how far the pair needs to move before the position is gone.",
        },
      ],
    },
    {
      id: "notional",
      eyebrow: "Core concepts",
      title: "Notional, or what the move applies to",
      blocks: [
        {
          kind: "text",
          body: "Notional is margin multiplied by leverage, and it is the number the percentage move is applied to. It is not money you owe and not money you have; it is the size of the exposure your margin is holding open.",
        },
        {
          kind: "list",
          items: [
            { term: "Margin", body: "what you can lose." },
            { term: "Notional", body: "what the market moves against." },
            { term: "Fees", body: "charged on notional, not on margin." },
            { term: "Funding", body: "accrued on notional, not on margin." },
          ],
        },
        {
          kind: "note",
          body: `This is where leverage quietly costs money: 250 ${SETTLEMENT} at 25x carries the same fee as 6,250 ${SETTLEMENT} unlevered, because the fee follows the exposure.`,
        },
      ],
    },
    {
      id: "ticket",
      eyebrow: "Core concepts",
      title: "Reading the ticket",
      blocks: [
        {
          kind: "text",
          body: "Everything that decides whether a trade is worth taking is printed before you sign: entry, notional, liquidation price, fee and the capped payout. None of it is estimated after the fact.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Entry",
              body: "the next live print, not a price from a second ago.",
            },
            {
              term: "Notional",
              body: "margin multiplied by leverage. What the move is applied to.",
            },
            {
              term: "Liquidation",
              body: "the rate at which the position closes itself.",
            },
            {
              term: "Max payout",
              body: "the most the position can return, fixed at open.",
            },
            {
              term: "Fee",
              body: "0.05% of notional, charged now, and the same again on close.",
            },
            {
              term: "Funding",
              body: "the rate running at the moment you sign, and which side is paying it.",
            },
          ],
        },
        {
          kind: "text",
          body: "Read the liquidation price first and the payout second. The first tells you what has to happen for the position to die; the second tells you the most it can be worth if it lives.",
        },
        {
          kind: "note",
          body: "Nothing on the ticket is revised afterwards. The entry you signed is the entry you got, and the liquidation printed is the one the engine will use.",
        },
      ],
    },
    {
      id: "open",
      eyebrow: "Running a position",
      title: "Opening",
      blocks: [
        {
          kind: "text",
          body: "There is one order type and it fills at the mark. No limit ladder, no queue position, no partial fill to chase: you sign and the position exists at the next live print.",
        },
        {
          kind: "text",
          body: "That is a deliberate trade. A limit order lets you wait for a better price; it also lets you sit unfilled through the move you were waiting for. Filling at the mark means the only thing between the decision and the position is your own signature.",
        },
        {
          kind: "note",
          body: "If a pair is paused or its price is stale, the order is refused rather than filled at the last price the venue saw. Try again at the next live print. See the feed chapter.",
        },
      ],
    },
    {
      id: "monitor",
      eyebrow: "Running a position",
      title: "Watching a position",
      blocks: [
        {
          kind: "text",
          body: "An open position shows four live numbers: the mark, your unrealised result, the funding accrued so far, and how far the mark is from the liquidation price.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Unrealised PNL",
              body: "what the position is worth right now, before the closing fee.",
            },
            {
              term: "Accrued funding",
              body: "runs by the second and is settled when you close, not hourly.",
            },
            {
              term: "Distance to liquidation",
              body: "the only number that decides whether the position survives the next hour.",
            },
            {
              term: "Equity",
              body: "margin plus unrealised result minus accrued funding. This is what the engine compares against the maintenance margin.",
            },
          ],
        },
        {
          kind: "text",
          body: "The distance to liquidation moves for two reasons: the mark moving against you, and funding eating equity while you wait. On a crowded side and a quiet market, the second one alone can walk a position into trouble over several days.",
        },
      ],
    },
    {
      id: "topup",
      eyebrow: "Running a position",
      title: "Adding margin",
      blocks: [
        {
          kind: "text",
          body: "Margin can be added to an open position at any time. It does not change the entry, the side or the notional; it lowers the leverage and pushes the liquidation price further away.",
        },
        {
          kind: "figures",
          figures: [
            { value: "10x", caption: "before" },
            { value: "9.5%", caption: "to liquidation" },
            { value: "5x", caption: "after doubling margin" },
            { value: "19.5%", caption: "to liquidation" },
          ],
        },
        {
          kind: "note",
          body: "Adding margin buys room, not a better position. If the reason for the trade has stopped being true, more margin only buys a larger loss the same distance away.",
        },
      ],
    },
    {
      id: "close",
      eyebrow: "Running a position",
      title: "Closing",
      blocks: [
        {
          kind: "text",
          body: "Closing fills at the mark the same way opening does. The margin, the result and any accrued funding settle into your free balance immediately, and the position is gone.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Full close",
              body: "the whole position, one signature, settled at the next print.",
            },
            {
              term: "Partial close",
              body: "close part of the notional and leave the rest running with the same entry and a lower liquidation risk.",
            },
            {
              term: "Fee",
              body: "0.05% of the notional being closed, so a partial close pays a partial fee.",
            },
          ],
        },
        {
          kind: "text",
          body: "A partial close is the most useful tool on the venue and the least used. Taking half off at a target leaves the remainder running on a position whose margin has already come back, which is a materially different risk from the one you opened with.",
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
          body: "A position is liquidated when its equity falls to the maintenance margin, which is 0.5% of notional. The price at which that happens is printed on the ticket before you sign, and it does not move unless you add margin or funding accrues against you.",
        },
        {
          kind: "figures",
          figures: [
            { value: "0.5%", caption: "maintenance margin" },
            { value: "3.5%", caption: "distance at 25x" },
            { value: "9.5%", caption: "distance at 10x" },
            { value: "19.5%", caption: "distance at 5x" },
          ],
        },
        {
          kind: "note",
          body: "You can never lose more than the margin you put in. There is no negative balance and nothing to top up after the fact.",
        },
        {
          kind: "text",
          body: "The maintenance margin is what is left when a position closes itself, and it is what pays for closing it. It is small on purpose: the venue has no interest in liquidating early, because a liquidated position is a customer who has stopped trading.",
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
          body: "Every position's payout is capped at 10x its margin, fixed when you open and reserved for you until you close. That cap is what makes the number on the screen the number you can actually withdraw.",
        },
        {
          kind: "text",
          body: "It exists because the venue takes the other side of every trade. A cap on the largest single payout is what lets every position be backed rather than merely promised, and it is set high enough that almost nothing reaches it.",
        },
        {
          kind: "note",
          body: "A position at 25x reaches its cap on a 40% move in the pair. On a major that has not happened in a generation; on a frontier currency in a devaluation it can happen in a week, which is why those pairs carry the lowest leverage caps.",
        },
      ],
    },
    {
      id: "feed",
      eyebrow: "Risk",
      title: "When the feed pauses",
      blocks: [
        {
          kind: "text",
          body: "A currency feed can stall. When one does, the pair stops accepting orders: open positions are held, and nothing fills at a stale price until the next live print.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Open positions",
              body: "are held at the last good mark. Nothing is liquidated on a price the venue cannot verify.",
            },
            {
              term: "New orders",
              body: "are refused until the first live print after the pause ends.",
            },
            {
              term: "Closes",
              body: "wait for the same print. A pause is the one moment you cannot leave instantly.",
            },
          ],
        },
        {
          kind: "note",
          body: "No order ever fills at a price the venue knows to be old. A pause is visible on the pair, not hidden behind a spinner.",
        },
      ],
    },
    {
      id: "mistakes",
      eyebrow: "Risk",
      title: "Five ways people lose money here",
      blocks: [
        {
          kind: "text",
          body: "Not one of these is exotic. They are the five things that account for most of the losses that were avoidable.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Taking the cap as a suggestion",
              body: "25x is what the pair can bear, not what the position should use. Most blown positions were opened at the cap.",
            },
            {
              term: "Getting the direction backwards",
              body: "the pair is local currency per dollar. A strengthening currency is a falling pair.",
            },
            {
              term: "Ignoring funding on a crowded side",
              body: "at the cap, funding alone costs 2.25% of notional a day. Held for a week on a flat market, that is the position.",
            },
            {
              term: "Trading through a scheduled event",
              body: "a central bank decision can move a major a full percent in a second. At 25x that is a third of the distance to liquidation.",
            },
            {
              term: "Churning a small position",
              body: "0.05% each way is cheap once and expensive eight times. Fees do not care whether the trade was right.",
            },
          ],
        },
      ],
    },
    {
      id: "fees",
      eyebrow: "Costs",
      title: "What a trade costs",
      blocks: [
        {
          kind: "list",
          items: [
            { term: "Open", body: "0.05% of notional." },
            { term: "Close", body: "0.05% of notional." },
            { term: "Funding", body: "skew based, capped at ±0.75% per 8h." },
            {
              term: "Deposit and withdraw",
              body: "no venue fee, only the network fee.",
            },
          ],
        },
        {
          kind: "text",
          body: "There is no spread markup. The entry is the live mark, and the fee is the fee.",
        },
        {
          kind: "figures",
          figures: [
            { value: "0.10%", caption: "round trip" },
            { value: "2.50", caption: `on 2,500 ${SETTLEMENT}` },
            { value: "0", caption: "spread" },
            { value: "0", caption: "inactivity fee" },
          ],
        },
        {
          kind: "note",
          body: "The round trip is 0.10% of notional, which at 10x is 1% of margin. That is the hurdle every position has to clear before it is worth anything.",
        },
      ],
    },
    {
      id: "funding",
      eyebrow: "Costs",
      title: "Funding, in short",
      blocks: [
        {
          kind: "text",
          body: "Funding is the payment that keeps a contract with no expiry tied to the real rate. It flows between traders, not to the venue, and its direction is decided by which side of the market is crowded.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Crowded side pays",
              body: "if far more margin is long than short, longs pay shorts.",
            },
            {
              term: "It accrues by the second",
              body: "and settles when you close, so it is never a lump sum you did not see coming.",
            },
            {
              term: "It is capped",
              body: "at ±0.75% per 8h, however far the book skews.",
            },
          ],
        },
        {
          kind: "text",
          body: "For a position held for an hour it rounds to nothing. For one held for a fortnight on the crowded side of a frontier pair it is the largest cost you will pay. The trading guide works through the arithmetic.",
        },
      ],
    },
    {
      id: "limits",
      eyebrow: "Reference",
      title: "Leverage caps, by tier",
      blocks: [
        {
          kind: "text",
          body: "The cap on a pair is set from how that pair actually behaves, not from how much demand there is for leverage on it. A currency that can gap four percent overnight cannot carry the same multiple as one that moves a third of a percent in a day.",
        },
        {
          kind: "list",
          items: [
            {
              term: "25x",
              body: "deep majors: the euro, yen, sterling, the Swiss franc, the Canadian and Australian dollars.",
            },
            {
              term: "20x",
              body: "smaller developed currencies: the Nordics, the Hong Kong and Singapore dollars, the New Zealand dollar.",
            },
            {
              term: "12x to 15x",
              body: "large emerging currencies: the rupee, won, yuan, zloty, Taiwan dollar, baht, ringgit.",
            },
            {
              term: "8x to 10x",
              body: "wider emerging currencies: the rupiah, peso, rand, real and their neighbours.",
            },
            {
              term: "4x to 6x",
              body: "frontier currencies with managed or stepwise rates, where a single adjustment can be several percent.",
            },
          ],
        },
        {
          kind: "note",
          body: "The cap for a pair is shown on its market page and on the ticket. Caps can be lowered on a pair whose behaviour changes; an open position keeps the cap it was opened under.",
        },
      ],
    },
    {
      id: "custody",
      eyebrow: "Reference",
      title: "Custody and security",
      blocks: [
        {
          kind: "text",
          body: `Deposited ${SETTLEMENT} is held by the venue in its wallet on ${CHAIN}, and your balance, positions and history are kept in the venue's ledger. Everything that changes your balance needs a session opened by your wallet's own signature.`,
        },
        {
          kind: "list",
          items: [
            {
              term: "Withdrawals",
              body: "free balance goes only to the address that signed in. Larger amounts are checked by hand before they are sent.",
            },
            {
              term: "Sign-in",
              body: "signed with a one-time nonce. A captured signature cannot be reused.",
            },
            {
              term: "No standing approval",
              body: "nothing has permission to pull from your wallet between deposits.",
            },
          ],
        },
        {
          kind: "note",
          body: `Nobody from ${brand.name} will ever ask for a seed phrase, a private key or a screen share. There is nothing we could do with them that you cannot do yourself, and anyone asking is not us.`,
        },
      ],
    },
    {
      id: "trouble",
      eyebrow: "Reference",
      title: "If something breaks",
      blocks: [
        {
          kind: "list",
          items: [
            {
              term: "The wallet will not connect",
              body:
                "check the active network is " +
                CHAIN +
                ". Most connect failures are a wallet sitting on another chain.",
            },
            {
              term: "A deposit has not landed",
              body: `it is credited once the transaction is final, usually within half a minute. Check the hash on the ${CHAIN} explorer, then reload.`,
            },
            {
              term: "An order will not fill",
              body: "the pair is probably paused or its price is refreshing. Try again in a moment; the ticket says which.",
            },
            {
              term: "The numbers look stale",
              body: "reload. The page holds the last good mark rather than showing a blank, which can read as a frozen price.",
            },
          ],
        },
        {
          kind: "text",
          body: "Every deposit and withdrawal is a transaction with a hash on the chain, and the explorer is the record of last resort for money in and out. Trades are recorded in the venue's ledger and shown in your history.",
        },
      ],
    },
    {
      id: "glossary",
      eyebrow: "Reference",
      title: "Glossary",
      blocks: [
        {
          kind: "list",
          items: [
            {
              term: "Mark",
              body: "the live rate every position is valued and filled at.",
            },
            {
              term: "Notional",
              body: "margin multiplied by leverage; what the move applies to.",
            },
            {
              term: "Margin",
              body: "what you put up and the most you can lose.",
            },
            {
              term: "Equity",
              body: "margin plus unrealised result minus accrued funding.",
            },
            {
              term: "Maintenance margin",
              body: "0.5% of notional; the floor equity is measured against.",
            },
            {
              term: "Liquidation price",
              body: "the mark at which equity reaches that floor.",
            },
            {
              term: "Funding",
              body: "the continuous payment between the two sides of the market.",
            },
            {
              term: "Skew",
              body: "how far long open interest and short open interest have drifted apart.",
            },
            {
              term: "Max payout",
              body: "10x margin; the most a single position can return.",
            },
            {
              term: "Open interest",
              body: "the total notional currently open on a pair.",
            },
          ],
        },
      ],
    },
  ],
};

export const tradingGuide: Book = {
  path: "/docs/trading",
  name: "Trading guide",
  title: "The mechanics",
  lede: "funding, skew, caps and the arithmetic behind a position that is still open at 3am.",
  back: "Back to site",

  nav: [
    {
      group: "Pricing",
      links: [
        { id: "mark", label: "How the mark is set" },
        { id: "latency", label: "The fill you get" },
        { id: "funding", label: "Funding" },
        { id: "skew", label: "Skew" },
        { id: "cost-stack", label: "The cost stack" },
      ],
    },
    {
      group: "Position maths",
      links: [
        { id: "pnl", label: "Working out PNL" },
        { id: "worked", label: "A worked trade" },
        { id: "worked-loss", label: "One that goes wrong" },
        { id: "partial", label: "Closing part of it" },
        { id: "holding", label: "Holding overnight" },
      ],
    },
    {
      group: "The risk engine",
      links: [
        { id: "maintenance", label: "Maintenance margin" },
        { id: "liq-maths", label: "Where liquidation sits" },
        { id: "gaps", label: "Gaps & events" },
        { id: "payout-cap", label: "The payout cap" },
      ],
    },
    {
      group: "Sizing",
      links: [
        { id: "caps", label: "Why caps differ" },
        { id: "sizing", label: "Sizing a position" },
        { id: "correlation", label: "Correlated positions" },
        { id: "playbook", label: "Three ways to use it" },
      ],
    },
  ],

  chapters: [
    {
      id: "mark",
      eyebrow: "Pricing",
      title: "How the mark is set",
      blocks: [
        {
          kind: "text",
          body: "The mark is the rate every open position is valued at and every new one entered at. It follows the underlying currency rate rather than an internal order book, which is why there is nothing to wait on when you press the button.",
        },
        {
          kind: "note",
          body: "No order book means no queue, no partial fill and no spread to cross. It also means the venue, not another trader, is on the other side.",
        },
        {
          kind: "text",
          body: "A single source would make the mark only as good as that source's worst minute, so the rate is taken from several and the outliers are dropped. A print that disagrees with the rest is not used, and if enough of them disagree the pair is paused rather than marked on a number nobody can corroborate.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Median, not mean",
              body: "one bad feed cannot drag the mark, because a median ignores it entirely.",
            },
            {
              term: "Staleness check",
              body: "a source that stops updating stops counting toward the mark.",
            },
            {
              term: "Pause over guess",
              body: "when there is no rate worth trusting, the pair says so instead of inventing one.",
            },
          ],
        },
      ],
    },
    {
      id: "latency",
      eyebrow: "Pricing",
      title: "The fill you get",
      blocks: [
        {
          kind: "text",
          body: "The price on the screen is the last print. The price you get is the next one. On a quiet major those are the same number to four decimal places; in the second after a rate decision they are not.",
        },
        {
          kind: "text",
          body: "This is the honest version of instant execution. Nothing queues and nothing is rejected for being crossed, but a market moving fast is moving during the round trip too, and the fill lands where the rate actually is rather than where it was when you decided.",
        },
        {
          kind: "note",
          body: "There is no slippage setting because there is nothing to slip against. What there is instead is the difference between two consecutive prints, which on a calm pair is invisible and on an event is the whole story.",
        },
      ],
    },
    {
      id: "funding",
      eyebrow: "Pricing",
      title: "Funding",
      blocks: [
        {
          kind: "text",
          body: "A perpetual has no expiry, so something has to keep it honest against the real rate. That something is funding: a continuous payment between the two sides of the market.",
        },
        {
          kind: "figures",
          figures: [
            { value: "±0.75%", caption: "cap per 8h" },
            { value: "8h", caption: "quoted window" },
            { value: "2.25%", caption: "cap per day" },
            { value: "0", caption: "fee to the venue" },
          ],
        },
        {
          kind: "text",
          body: "It accrues by the second and settles when you close, so it is never a lump sum you did not see coming. The quoted rate is per eight hours because that is the convention the market reads in; the engine does not batch anything into eight-hour blocks.",
        },
        {
          kind: "list",
          items: [
            {
              term: "On notional",
              body: "funding follows exposure, so leverage multiplies it exactly as it multiplies the move.",
            },
            {
              term: "Signed by side",
              body: "the crowded side pays, the thin side is paid. Being paid to hold a position is common and is not free money: you are being paid because you are on the side nobody wants.",
            },
            {
              term: "Capped both ways",
              body: "however extreme the skew, the rate stops at 0.75% per 8h.",
            },
          ],
        },
      ],
    },
    {
      id: "skew",
      eyebrow: "Pricing",
      title: "Skew decides who pays",
      blocks: [
        {
          kind: "text",
          body: "Funding follows open interest. When far more margin is long than short, the longs pay the shorts, and the rate rises the further apart the two sides drift.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Balanced book",
              body: "funding sits near zero and costs neither side much.",
            },
            {
              term: "Crowded side",
              body: "pays, and pays more the more crowded it gets.",
            },
            {
              term: "Thin side",
              body: "is paid to be there, which is what pulls the book back.",
            },
          ],
        },
        {
          kind: "text",
          body: "The mechanism is self-correcting by design. A one-sided book makes the unpopular side profitable to hold, which attracts exactly the positions that flatten it. On the pairs where everyone wants the same trade, and steadily depreciating currencies are the clearest case, the skew is persistent and so is the cost.",
        },
        {
          kind: "note",
          body: "Check the funding rate before opening, not after. It is printed on the ticket, and on a crowded pair it can be the difference between a thesis that pays and one that is right too slowly.",
        },
      ],
    },
    {
      id: "cost-stack",
      eyebrow: "Pricing",
      title: "The whole cost stack",
      blocks: [
        {
          kind: "text",
          body: "Three costs, and only three. Everything else you might be used to paying is absent, which makes the ones that remain worth knowing exactly.",
        },
        {
          kind: "list",
          items: [
            { term: "Entry fee", body: "0.05% of notional, at open." },
            { term: "Exit fee", body: "0.05% of the notional being closed." },
            {
              term: "Funding",
              body: "0% to 0.75% per 8h of notional, signed by side.",
            },
            { term: "Spread", body: "none. The entry is the mark." },
            {
              term: "Custody, inactivity, withdrawal",
              body: "none. The venue pays the network fee on withdrawals.",
            },
          ],
        },
        {
          kind: "figures",
          figures: [
            { value: "0.10%", caption: "round trip" },
            { value: "1.0%", caption: "of margin at 10x" },
            { value: "2.5%", caption: "of margin at 25x" },
            { value: "0", caption: "everything else" },
          ],
        },
        {
          kind: "note",
          body: "At 25x, the round trip alone is 2.5% of margin, and the maintenance floor is 3.5% of the mark away. A high-leverage position starts a meaningful fraction of the way toward its own liquidation.",
        },
      ],
    },
    {
      id: "pnl",
      eyebrow: "Position maths",
      title: "Working out PNL",
      blocks: [
        {
          kind: "text",
          body: "A position's result is the move, applied to the notional, minus the two fees and whatever funding accrued while it was open. Nothing else enters it.",
        },
        {
          kind: "list",
          items: [
            { term: "Notional", body: "margin × leverage." },
            {
              term: "Gross",
              body: "notional × the percentage move, signed by your side.",
            },
            { term: "Costs", body: "0.05% in, 0.05% out, plus funding." },
            { term: "Net", body: "gross minus costs, capped at max payout." },
          ],
        },
        {
          kind: "text",
          body: "The percentage move is measured on the pair, not on the currency: a pair going from 156.80 to 154.45 has moved 1.50%, and which side of that is profit depends only on whether you were long or short.",
        },
      ],
    },
    {
      id: "worked",
      eyebrow: "Position maths",
      title: "A worked trade",
      blocks: [
        {
          kind: "text",
          body: `Short USDJPY with 250 ${SETTLEMENT} at 10x. Notional is 2,500. Entry 156.80, closed at 154.45: the pair fell 1.5%, and short is the right side of that.`,
        },
        {
          kind: "figures",
          figures: [
            { value: "2,500", caption: "notional" },
            { value: "+37.50", caption: "gross" },
            { value: "-2.50", caption: "fees both ways" },
            { value: "+34.80", caption: "net after funding" },
          ],
        },
        {
          kind: "text",
          body: "34.80 on 250 of margin is 13.9% in a day and a half, from a move of one and a half percent in the pair. That ratio is the whole argument for leverage and the whole argument against it at the same time.",
        },
        {
          kind: "note",
          body: "The same move against the position costs the same 37.50, which is 15% of the margin. Leverage is symmetric and it is the only thing in this example that is.",
        },
      ],
    },
    {
      id: "worked-loss",
      eyebrow: "Position maths",
      title: "One that goes wrong",
      blocks: [
        {
          kind: "text",
          body: `Long USDJPY with 250 ${SETTLEMENT} at 25x. Notional is 6,250, entry 147.38, and the liquidation price prints at 142.22, three and a half percent below.`,
        },
        {
          kind: "text",
          body: "The pair falls 2.2% over two days to 144.14. Nothing dramatic has happened: that is an ordinary two-day range on the yen. The position is not liquidated, and it is also not recoverable in any comfortable sense.",
        },
        {
          kind: "figures",
          figures: [
            { value: "-137.50", caption: "gross" },
            { value: "-6.20", caption: "fees both ways" },
            { value: "-3.40", caption: "funding" },
            { value: "102.90", caption: `margin left of 250` },
          ],
        },
        {
          kind: "text",
          body: "Fifty-nine percent of the margin, from a move the pair makes most weeks. The position that made 13.9% on a 1.5% move is the same position that gives back 59% on a 2.2% one, because 25x does not know which direction you wanted.",
        },
        {
          kind: "note",
          body: "This is the chapter to reread before using the cap. It is not a warning about volatility; it is arithmetic that holds on the calmest pair on the venue.",
        },
      ],
    },
    {
      id: "partial",
      eyebrow: "Position maths",
      title: "Closing part of it",
      blocks: [
        {
          kind: "text",
          body: "A partial close cuts the notional and returns the matching share of margin and result, leaving the rest of the position with the same entry and the same liquidation price.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Entry does not move",
              body: "the remainder keeps the price it was opened at.",
            },
            {
              term: "Liquidation does not move",
              body: "margin and notional fall together, so the ratio, and the distance, are unchanged.",
            },
            {
              term: "Fees are pro rata",
              body: "0.05% of the notional closed, not of the original position.",
            },
          ],
        },
        {
          kind: "text",
          body: "The useful pattern: close half at the first target, which returns half the margin and banks the result on it, then let the remainder run. The money at risk is now the market's rather than yours, which is a different position to hold through a drawdown even though the numbers on the screen have barely changed.",
        },
      ],
    },
    {
      id: "holding",
      eyebrow: "Position maths",
      title: "Holding overnight",
      blocks: [
        {
          kind: "text",
          body: "There is no rollover and no session to survive: the market does not close, so a position simply continues. What accumulates is funding, and on a crowded side that is the cost worth planning around.",
        },
        {
          kind: "figures",
          figures: [
            { value: "0.25%", caption: "per 8h, typical skew" },
            { value: "0.75%", caption: "per day" },
            { value: "5.25%", caption: "over a week" },
            { value: "of notional", caption: "not of margin" },
          ],
        },
        {
          kind: "text",
          body: "At 10x, 5.25% of notional over a week is 52.5% of the margin. A thesis that needs a fortnight to play out has to clear a hurdle that has nothing to do with whether it was right, and on the crowded side of a frontier pair that hurdle is often larger than the move being waited for.",
        },
        {
          kind: "note",
          body: "Funding on the thin side runs the other way. Being paid to hold is the compensation for standing where the book is short of positions, and it is the reason a patient position on an unpopular side is sometimes the cheapest one on the venue.",
        },
      ],
    },
    {
      id: "maintenance",
      eyebrow: "The risk engine",
      title: "Maintenance margin",
      blocks: [
        {
          kind: "text",
          body: "Maintenance margin is 0.5% of notional. It is the floor a position's equity is measured against, and the moment equity touches it the position is closed by the engine.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Equity",
              body: "margin plus unrealised result minus accrued funding.",
            },
            {
              term: "Floor",
              body: "0.5% of notional, the same proportion on every pair and every leverage.",
            },
            {
              term: "What it pays for",
              body: "closing the position. It is what is left to work with, not a penalty.",
            },
          ],
        },
        {
          kind: "note",
          body: "Funding counts against equity, which is why a position can be liquidated on a day the mark never reached the printed liquidation price. Days of funding on a crowded side walk the floor up to meet the market.",
        },
      ],
    },
    {
      id: "liq-maths",
      eyebrow: "The risk engine",
      title: "Where the liquidation price comes from",
      blocks: [
        {
          kind: "text",
          body: "One line of arithmetic. The position dies when the adverse move has eaten everything above the floor, which is one over the leverage, less the maintenance margin.",
        },
        {
          kind: "figures",
          figures: [
            { value: "19.5%", caption: "at 5x" },
            { value: "9.5%", caption: "at 10x" },
            { value: "6.16%", caption: "at 15x" },
            { value: "3.5%", caption: "at 25x" },
          ],
        },
        {
          kind: "text",
          body: "For a long, the liquidation price is the entry multiplied by one minus that distance; for a short it is the entry multiplied by one plus it. Both are printed on the ticket, so the arithmetic is here to be checked rather than performed.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Adding margin",
              body: "lowers the effective leverage and pushes the distance out. It is the only thing that moves the price in your favour.",
            },
            {
              term: "Accrued funding",
              body: "eats equity and pulls the effective distance in, without the printed price changing.",
            },
            {
              term: "Fees",
              body: "the entry fee is already out of the margin before the first tick, which is why 25x starts closer to the floor than the arithmetic alone suggests.",
            },
          ],
        },
      ],
    },
    {
      id: "gaps",
      eyebrow: "The risk engine",
      title: "Gaps, weekends and central banks",
      blocks: [
        {
          kind: "text",
          body: "The venue is open every hour of the week. The underlying currency market is not equally liquid in every one of them, and the difference shows up as sharper moves on the same news.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Scheduled events",
              body: "rate decisions, inflation prints and policy meetings. A major can move a full percent in a second, and the date is public weeks ahead.",
            },
            {
              term: "Weekends",
              body: "thin, and news does not respect the calendar. A position carried into Sunday is carried through the thinnest book of the week.",
            },
            {
              term: "Managed currencies",
              body: "move in steps rather than drifts. A devaluation is not a slide, it is a single adjustment of several percent.",
            },
          ],
        },
        {
          kind: "note",
          body: "A gap can pass straight through a liquidation price. The position still cannot lose more than its margin, because the loss stops at zero, but it will not be closed at the printed number if the market never traded there.",
        },
        {
          kind: "text",
          body: "The practical answer is leverage, not timing. A position that survives a three percent gap is a position that was not at 25x when the gap happened, and the calendar of scheduled events is the cheapest research on the venue.",
        },
      ],
    },
    {
      id: "payout-cap",
      eyebrow: "The risk engine",
      title: "Living with the payout cap",
      blocks: [
        {
          kind: "text",
          body: "A position's payout is capped at 10x its margin, fixed at open and reserved until close. It binds when the pair moves by ten divided by the leverage: 40% at 25x, a full 100% at 10x.",
        },
        {
          kind: "figures",
          figures: [
            { value: "40%", caption: "move to cap at 25x" },
            { value: "67%", caption: "at 15x" },
            { value: "100%", caption: "at 10x" },
            { value: "200%", caption: "at 5x" },
          ],
        },
        {
          kind: "text",
          body: "On a major, none of these are reachable in the life of a position. On a frontier currency going through a devaluation they are, which is exactly why those pairs carry single-digit leverage caps: the two limits are set together so that the payout cap almost never becomes the binding one.",
        },
        {
          kind: "note",
          body: "If a position is approaching its cap, closing and reopening resets the cap against the new margin. That is a real decision with a real cost, two fees and a new entry, and it is one the ticket makes visible rather than one you discover afterwards.",
        },
      ],
    },
    {
      id: "caps",
      eyebrow: "Sizing",
      title: "Why caps differ",
      blocks: [
        {
          kind: "text",
          body: "A currency that can move 4% in an afternoon cannot carry the same leverage as one that moves 0.3%. The cap is set from how the pair actually behaves, not from how much demand there is for leverage on it.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Majors",
              body: "deep and slow: the highest caps sit here.",
            },
            { term: "Emerging", body: "mid caps, wider daily ranges." },
            {
              term: "Frontier",
              body: "lowest caps, because a gap can be several percent.",
            },
          ],
        },
        {
          kind: "text",
          body: "The test applied to each pair is simple enough to state: at the cap, an ordinary bad day should not be a liquidation. On a major an ordinary bad day is half a percent and the cap sits at 25x, three and a half percent away. On a managed frontier currency an ordinary bad day can be a step of three percent, which is why the cap there is 4x and the distance 24.5%.",
        },
        {
          kind: "note",
          body: "Reading the cap backwards is the fastest way to understand a pair you have never traded. A 6x cap is the venue telling you what it thinks that currency can do overnight.",
        },
      ],
    },
    {
      id: "sizing",
      eyebrow: "Sizing",
      title: "Sizing a position",
      blocks: [
        {
          kind: "text",
          body: "Work backwards from the liquidation price rather than forwards from the leverage. Decide the move you are willing to be wrong by, then pick the leverage that puts liquidation outside it.",
        },
        {
          kind: "list",
          items: [
            {
              term: "1. Name the move",
              body: "how far can this pair go against me and still leave the reason for the trade intact?",
            },
            {
              term: "2. Double it",
              body: "the market spends a lot of time being wrong before it is right, and funding is accruing throughout.",
            },
            {
              term: "3. Pick leverage from the distance",
              body: "one divided by the move, less the half percent floor. A 10% tolerance is about 10x; a 20% tolerance is 5x.",
            },
            {
              term: "4. Size the margin to the loss",
              body: "the margin is what you lose if you are wrong, so it is the number that has to be survivable, not the notional.",
            },
          ],
        },
        {
          kind: "note",
          body: "At 25x, a 4% move against the position is the whole margin. At 5x the same move costs a fifth of it. The ticket prints that number before you sign; it is the one to read first.",
        },
      ],
    },
    {
      id: "correlation",
      eyebrow: "Sizing",
      title: "Correlated positions",
      blocks: [
        {
          kind: "text",
          body: "Margin is isolated per position, which means one going wrong cannot reach into another. It does not mean two positions are independent, and on this venue they usually are not.",
        },
        {
          kind: "text",
          body: "Every pair here is quoted against the same dollar. Long USDJPY, long USDEUR and long USDCHF is not three trades, it is one dollar trade in three places, and a dollar that falls takes all three at once.",
        },
        {
          kind: "list",
          items: [
            {
              term: "Same-direction majors",
              body: "move together most days. Treat the three of them as a single position when sizing.",
            },
            {
              term: "Regional blocks",
              body: "Asian currencies, Gulf pegs, Nordic currencies: each block tends to move as one on dollar news.",
            },
            {
              term: "The exception",
              body: "an idiosyncratic story, a devaluation, an election, a policy break, is genuinely separate. Those are the positions worth holding alongside a dollar view.",
            },
          ],
        },
        {
          kind: "note",
          body: "The quick test: if one piece of news would move every position you hold in the same direction, you have one position, and it is larger than any of the numbers on the screen suggest.",
        },
      ],
    },
    {
      id: "playbook",
      eyebrow: "Sizing",
      title: "Three ways people use this venue",
      blocks: [
        {
          kind: "text",
          body: "Not recommendations, and none of them is a strategy that works on its own. They are the three shapes of position the venue is built for, and each has a cost that decides whether it makes sense.",
        },
        {
          kind: "list",
          items: [
            {
              term: "The event",
              body: "a position taken around a scheduled decision and closed within hours. Fees dominate, funding is irrelevant, and the risk is the size of the print rather than the direction.",
            },
            {
              term: "The trend",
              body: "a currency in a long slide, held for weeks. Funding dominates and is usually against you, because everyone wants the same side. The move has to beat the carry, not just exist.",
            },
            {
              term: "The hedge",
              body: "someone earning in a currency that keeps weakening, holding the pair long so that the dollar value of their income is stable. Low leverage, held indefinitely, and the funding cost is the price of the insurance.",
            },
          ],
        },
        {
          kind: "text",
          body: "The third one is why a venue like this exists at all. There are places where the local currency loses a fifth of its value in a year and the only hedge available locally is a black market. A wallet and a stablecoin balance are a different answer to the same problem.",
        },
      ],
    },
  ],
};

export const books = [documentation, tradingGuide];
