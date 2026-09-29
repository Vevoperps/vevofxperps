//! Events, emitted into the transaction logs.
//!
//! They are the record the app's history and activity tabs are read from,
//! exactly as the EVM version read its logs: the events are the record, and a
//! second copy in a database is a second answer that can disagree.

use anchor_lang::prelude::*;

#[event]
pub struct Deposited {
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Withdrawn {
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct LiquidityAdded {
    pub provider: Pubkey,
    pub amount: u64,
    pub shares: u128,
}

#[event]
pub struct LiquidityRemoved {
    pub provider: Pubkey,
    pub shares: u128,
    pub amount: u64,
}

#[event]
pub struct MarketListed {
    pub market: Pubkey,
    pub symbol: [u8; 8],
    pub index: u8,
}

#[event]
pub struct MarketConfigured {
    pub market: Pubkey,
    pub max_leverage: u16,
    pub skew_scale: u64,
    pub max_open_interest: u64,
    pub min_margin: u64,
    pub paused: bool,
}

#[event]
pub struct MarksPosted {
    pub count: u8,
    pub at: i64,
}

#[event]
pub struct PositionOpened {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub is_long: bool,
    pub margin: u64,
    pub notional: u64,
    pub entry_price: u128,
    pub fee: u64,
}

#[event]
pub struct MarginAdded {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub amount: u64,
    pub margin: u64,
}

/// A whole close. A partial one is `PositionReduced`, so anything watching
/// the book knows the position is smaller, not gone.
#[event]
pub struct PositionClosed {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub exit_price: u128,
    pub payout: u64,
    pub pnl: i128,
    pub funding: i128,
    pub fee: u64,
}

#[event]
pub struct PositionReduced {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub exit_price: u128,
    pub closed_notional: u64,
    pub payout: u64,
    pub pnl: i128,
    pub funding: i128,
    pub fee: u64,
}

#[event]
pub struct PositionLiquidated {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub liquidator: Pubkey,
    pub exit_price: u128,
    pub reward: u64,
}

#[event]
pub struct ReferenceTaken {
    pub market: Pubkey,
    pub price: u128,
    pub at: i64,
}

#[event]
pub struct AdminChanged {
    pub from: Pubkey,
    pub to: Pubkey,
}
