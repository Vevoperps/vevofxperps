//! The program's accounts.
//!
//! Where the EVM engine kept one contract with mappings, Solana keeps one
//! account per thing, each at an address derived from fixed seeds (a PDA):
//!
//! | Account  | Seeds                               | Holds                                   |
//! |----------|-------------------------------------|-----------------------------------------|
//! | Config   | `config`                            | admin, publisher, pool ledgers, params  |
//! | Marks    | `marks`                             | every market's mark, in one account     |
//! | Market   | `market`, symbol                    | leverage, caps, open interest, funding  |
//! | Trader   | `trader`, owner                     | free balance and LP shares              |
//! | Position | `position`, market, owner           | one isolated position                   |
//! | Vault    | `vault`                             | the USDC itself, owned by Config        |
//!
//! **Why every mark lives in one account.** A Solana transaction is capped at
//! 1232 bytes, and each account it touches costs 32 of them. Marks kept on the
//! markets would let a keeper refresh about twenty pairs per transaction;
//! kept together, one transaction refreshes them all, which is also what keeps
//! cross rates consistent with each other.

use anchor_lang::prelude::*;

/// Slots in the marks account. 64 pairs are listed; the rest is headroom so a
/// new pair never needs a migration.
pub const MAX_MARKETS: usize = 80;

pub const CONFIG_SEED: &[u8] = b"config";
pub const MARKS_SEED: &[u8] = b"marks";
pub const MARKET_SEED: &[u8] = b"market";
pub const TRADER_SEED: &[u8] = b"trader";
pub const POSITION_SEED: &[u8] = b"position";
pub const VAULT_SEED: &[u8] = b"vault";

/// Shares minted for the first unit of liquidity, to price the pool.
pub const INITIAL_SHARES: u128 = 1_000_000_000_000_000_000;
/// How often a market's 24h reference mark may be refreshed.
pub const REFERENCE_WINDOW: i64 = 24 * 60 * 60;

#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Lists markets, sets their parameters, names the publisher.
    pub admin: Pubkey,
    /// Two-step handover: the new admin must accept, so a typo cannot
    /// orphan the program.
    pub pending_admin: Pubkey,
    /// The one key allowed to post marks — the keeper.
    pub publisher: Pubkey,
    /// The settlement token (USDC).
    pub mint: Pubkey,
    pub vault: Pubkey,

    /// USDC backing open positions, owned by LPs in shares.
    pub pool_assets: u64,
    /// The part of `pool_assets` already promised to open positions.
    pub pool_reserved: u64,
    pub pool_shares: u128,

    /// Seconds a mark stays usable.
    pub max_age: u32,
    /// The most one post may move a fresh mark, in bps. Zero disables.
    pub max_deviation_bps: u16,
    pub market_count: u8,

    pub bump: u8,
    pub vault_bump: u8,
    pub marks_bump: u8,
}

impl Config {
    /// Pool liquidity not already promised to an open position.
    pub fn pool_free(&self) -> u64 {
        self.pool_assets.saturating_sub(self.pool_reserved)
    }
}

/// One market's mark. `zero_copy`: laid out as raw bytes and read in place,
/// so the whole marks account is never copied onto the 4 KB program stack.
#[zero_copy]
pub struct MarkSlot {
    /// Local currency per one dollar, 1e18.
    pub price: u128,
    /// Unix seconds. Zero: never posted.
    pub updated_at: i64,
    /// Explicit, so the layout has no implicit padding on any target.
    pub _reserved: [u8; 8],
}

#[account(zero_copy)]
pub struct Marks {
    pub slots: [MarkSlot; MAX_MARKETS],
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    /// ASCII, zero padded: `USDJPY\0\0`.
    pub symbol: [u8; 8],
    /// Slot in `Marks`, fixed at listing.
    pub index: u8,
    pub max_leverage: u16,
    /// Paused markets refuse new positions. Closing always works.
    pub paused: bool,
    pub bump: u8,

    /// The imbalance at which funding reaches its cap, in USDC notional.
    pub skew_scale: u64,
    /// The most notional this market will carry on either side.
    pub max_open_interest: u64,
    /// The smallest margin this market will open a position for.
    pub min_margin: u64,

    pub long_open_interest: u64,
    pub short_open_interest: u64,
    /// Cumulative funding per unit of notional, 1e18, by side.
    pub funding_long: i128,
    pub funding_short: i128,
    pub last_accrual: i64,

    /// The mark one reference window ago, and when it was taken. This is what
    /// the app's 24h column is measured against, without an indexer.
    pub reference_price: u128,
    pub reference_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Trader {
    pub owner: Pubkey,
    /// Free USDC: deposited, withdrawable, not behind a position.
    pub balance: u64,
    /// Pool shares, if this trader also provides liquidity.
    pub shares: u128,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub margin: u64,
    pub notional: u64,
    /// Fixed when the position opens, per the ticket: 10x the opening margin.
    pub payout_cap: u64,
    pub entry_price: u128,
    pub entry_funding: i128,
    pub opened_at: i64,
    pub is_long: bool,
    pub bump: u8,
}
