//! The engine's shared steps: reading a mark, bringing funding up to date,
//! pricing a close and releasing what it frees.
//!
//! Full and partial closes, and liquidations, all go through `price_close`
//! and `release`, so there is one path through the arithmetic and one place
//! for it to be wrong — as in the EVM version.

use anchor_lang::prelude::*;

use crate::errors::VevoError;
use crate::math;
use crate::state::{Config, Market, Marks, Position};

/// Turns a math overflow into a program error.
pub fn ok<T>(value: Option<T>) -> Result<T> {
    value.ok_or_else(|| error!(VevoError::MathOverflow))
}

pub fn now() -> Result<i64> {
    Ok(Clock::get()?.unix_timestamp)
}

/// The mark for a market, refused if it was never posted or has gone stale.
///
/// A trade must not fill against a price the keeper stopped maintaining. A
/// table can show a stale market as unpriced; an instruction cannot.
pub fn mark_price(marks: &Marks, index: u8, now: i64, max_age: u32) -> Result<u128> {
    let slot = marks
        .slots
        .get(index as usize)
        .ok_or_else(|| error!(VevoError::UnknownMarket))?;
    require!(slot.updated_at != 0, VevoError::NoFeed);
    require!(
        now <= slot.updated_at.saturating_add(max_age as i64),
        VevoError::StalePrice
    );
    Ok(slot.price)
}

/// Integrates funding from the last accrual to now. Permissionless by nature:
/// whoever touches the market first pays for the arithmetic, and the result
/// is the same whoever it is.
pub fn accrue(market: &mut Market, now: i64) -> Result<()> {
    let elapsed = now.saturating_sub(market.last_accrual);
    if elapsed <= 0 {
        return Ok(());
    }

    let (delta_long, delta_short) = ok(math::funding_accrue(
        market.long_open_interest,
        market.short_open_interest,
        market.skew_scale,
        elapsed as u64,
    ))?;

    market.last_accrual = now;
    market.funding_long = ok(market.funding_long.checked_add(delta_long))?;
    market.funding_short = ok(market.funding_short.checked_add(delta_short))?;
    Ok(())
}

/// The funding index a position is measured against: its own side's.
pub fn side_index(market: &Market, is_long: bool) -> i128 {
    if is_long {
        market.funding_long
    } else {
        market.funding_short
    }
}

/// Every number a close produces, priced at the mark, before anything moves.
pub struct Close {
    pub margin_out: u64,
    pub cap_out: u64,
    pub exit_fee: u64,
    pub pnl: i128,
    pub funding: i128,
    pub amount: u64,
    pub whole: bool,
}

/// Prices closing `closing` of a position's notional at `exit_price`.
///
/// Everything scales with the notional leaving — its share of margin, of the
/// payout cap, of funding, and the exit fee — so a half close pays half a fee.
pub fn price_close(market: &Market, position: &Position, closing: u64, exit_price: u128) -> Result<Close> {
    let whole = closing == position.notional;

    let margin_out = if whole {
        position.margin
    } else {
        ok(math::pro_rata(position.margin, closing, position.notional))?
    };
    let cap_out = if whole {
        position.payout_cap
    } else {
        ok(math::pro_rata(position.payout_cap, closing, position.notional))?
    };

    let exit_fee = ok(math::fee(closing))?;
    let pnl = ok(math::pnl(
        closing,
        position.entry_price,
        exit_price,
        position.is_long,
    ))?;
    let funding = ok(math::accrued_funding(
        closing,
        side_index(market, position.is_long),
        position.entry_funding,
    ))?;
    let amount = ok(math::payout(margin_out, pnl, funding, exit_fee, cap_out))?;

    Ok(Close {
        margin_out,
        cap_out,
        exit_fee,
        pnl,
        funding,
        amount,
        whole,
    })
}

/// The book-keeping every close shares: open interest, reserve, pool.
///
/// The margin was never in `pool_assets`, so the pool's result on the slice
/// is exactly `margin_out - paid`: it keeps what the position gave up and
/// funds what it won.
pub fn release(
    config: &mut Config,
    market: &mut Market,
    is_long: bool,
    closing: u64,
    margin_out: u64,
    cap_out: u64,
    paid: u64,
) -> Result<()> {
    if is_long {
        market.long_open_interest = ok(market.long_open_interest.checked_sub(closing))?;
    } else {
        market.short_open_interest = ok(market.short_open_interest.checked_sub(closing))?;
    }

    let reserve = ok(math::reserve_for_cap(cap_out))?;
    config.pool_reserved = config.pool_reserved.saturating_sub(reserve);

    if paid > margin_out {
        config.pool_assets = config
            .pool_assets
            .checked_sub(paid - margin_out)
            .ok_or_else(|| error!(VevoError::InsufficientLiquidity))?;
    } else {
        config.pool_assets = ok(config.pool_assets.checked_add(margin_out - paid))?;
    }
    Ok(())
}
