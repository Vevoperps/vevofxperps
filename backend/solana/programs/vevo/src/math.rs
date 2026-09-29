//! Every number the ticket prints, as pure arithmetic.
//!
//! Ported one-to-one from the EVM engine's `PositionMath.sol` and
//! `Funding.sol`, so the site, the handbook and the program keep agreeing to
//! the last unit:
//!
//! ```text
//! notional     = margin x leverage
//! pnl          = notional x (mark - entry) / entry, signed by side
//! equity       = margin + pnl - accrued funding
//! maintenance  = 0.5% of notional
//! payout       = margin + pnl - funding - exit fee, capped at 10x margin
//! ```
//!
//! Amounts are in USDC base units (6 decimals, `u64`). Prices and funding
//! indices are 1e18 fixed point (`u128` / `i128`). A pnl is a notional scaled
//! by a ratio of two prices, so the price scale cancels and the token's
//! decimals never enter the arithmetic.
//!
//! This file has no dependencies on purpose: it compiles and tests with plain
//! `rustc --test`, independent of the Solana toolchain.
//!
//! Every function returns `Option` and `None` means overflow. The program maps
//! that to `VevoError::MathOverflow`; nothing here panics.

/// Fixed-point one.
pub const WAD: u128 = 1_000_000_000_000_000_000;
pub const BPS: u128 = 10_000;

/// Charged on notional, each way: 0.05%.
pub const FEE_BPS: u128 = 5;
/// The floor equity is measured against: 0.5% of notional.
pub const MAINTENANCE_BPS: u128 = 50;
/// The most a position can return, as a multiple of its margin.
pub const PAYOUT_CAP: u64 = 10;
/// The liquidator's cut of whatever equity is left.
pub const LIQUIDATOR_SHARE_BPS: u128 = 5_000;

/// Funding cap per window, per unit of notional: 0.75%, in WAD.
pub const MAX_FUNDING_RATE: u128 = 7_500_000_000_000_000;
/// The window the funding rate is quoted in: 8 hours.
pub const FUNDING_WINDOW: u128 = 8 * 60 * 60;

/// 0.05% of the notional being opened or closed.
pub fn fee(notional: u64) -> Option<u64> {
    let value = (notional as u128).checked_mul(FEE_BPS)? / BPS;
    u64::try_from(value).ok()
}

/// What is left when a position closes itself: 0.5% of notional.
pub fn maintenance(notional: u64) -> Option<u64> {
    let value = (notional as u128).checked_mul(MAINTENANCE_BPS)? / BPS;
    u64::try_from(value).ok()
}

/// The result of the move, before costs. Truncates toward zero, as Solidity does.
pub fn pnl(notional: u64, entry_price: u128, mark_price: u128, is_long: bool) -> Option<i128> {
    if entry_price == 0 {
        return Some(0);
    }
    let entry = i128::try_from(entry_price).ok()?;
    let mark = i128::try_from(mark_price).ok()?;
    let movement = mark.checked_sub(entry)?;
    let gross = (notional as i128).checked_mul(movement)?.checked_div(entry)?;
    Some(if is_long { gross } else { gross.checked_neg()? })
}

/// Margin plus the unrealised result, less funding accrued against it.
pub fn equity(margin: u64, position_pnl: i128, accrued_funding: i128) -> Option<i128> {
    (margin as i128)
        .checked_add(position_pnl)?
        .checked_sub(accrued_funding)
}

/// What a slice of notional owes in funding: `notional * (index - entry) / WAD`.
pub fn accrued_funding(notional: u64, index_now: i128, index_at_entry: i128) -> Option<i128> {
    let delta = index_now.checked_sub(index_at_entry)?;
    (notional as i128).checked_mul(delta)?.checked_div(WAD as i128)
}

/// What actually lands back in the free balance on close: floored at zero,
/// capped at the slice of payout cap that was fixed when the position opened.
pub fn payout(margin: u64, position_pnl: i128, funding: i128, exit_fee: u64, cap: u64) -> Option<u64> {
    let net = (margin as i128)
        .checked_add(position_pnl)?
        .checked_sub(funding)?
        .checked_sub(exit_fee as i128)?;
    if net <= 0 {
        return Some(0);
    }
    let net = u64::try_from(net).unwrap_or(u64::MAX);
    Some(net.min(cap))
}

/// `a * b / c` in u128 without the intermediate overflowing for our ranges.
fn mul_div(a: u128, b: u128, c: u128) -> Option<u128> {
    a.checked_mul(b)?.checked_div(c)
}

/// The skew ratio, capped at one: `|long - short| / skew_scale`, in WAD.
fn skew_ratio(long_oi: u64, short_oi: u64, skew_scale: u64) -> Option<(bool, u128)> {
    let longs_pay = long_oi > short_oi;
    let gap = if longs_pay {
        long_oi - short_oi
    } else {
        short_oi - long_oi
    } as u128;
    let ratio = mul_div(gap, WAD, skew_scale as u128)?;
    Some((longs_pay, ratio.min(WAD)))
}

/// How far each side's cumulative funding index moves over `elapsed` seconds.
///
/// Returns `(delta_long, delta_short)`; positive means that side pays. The two
/// sides move by the same magnitude — the venue carries the skew and receives
/// funding on exactly that difference, without any transfer here.
///
/// With one side empty there is nobody to pay and nobody to be paid.
///
/// **One deliberate difference from the Solidity version:** that computed
/// `ratio * MAX_RATE * elapsed / (WAD * WINDOW)` in 256 bits. In 128 bits the
/// three-way product overflows after a few hours, so the per-window rate is
/// floored first (`ratio * MAX_RATE / WAD`) and then scaled by time. The rate
/// is at most 7.5e15, so the extra floor costs under one part in 1e15 of a
/// payment — below one USDC base unit on any realistic position.
pub fn funding_accrue(long_oi: u64, short_oi: u64, skew_scale: u64, elapsed: u64) -> Option<(i128, i128)> {
    if elapsed == 0 || skew_scale == 0 || long_oi == 0 || short_oi == 0 {
        return Some((0, 0));
    }
    let (longs_pay, ratio) = skew_ratio(long_oi, short_oi, skew_scale)?;
    let per_window = mul_div(ratio, MAX_FUNDING_RATE, WAD)?;
    let magnitude = mul_div(per_window, elapsed as u128, FUNDING_WINDOW)?;
    if magnitude == 0 {
        return Some((0, 0));
    }
    let m = i128::try_from(magnitude).ok()?;
    Some(if longs_pay { (m, -m) } else { (-m, m) })
}

/// The rate the ticket prints, per 8h, signed, in WAD. Positive: longs pay.
pub fn funding_rate(long_oi: u64, short_oi: u64, skew_scale: u64) -> Option<i128> {
    if skew_scale == 0 || long_oi == 0 || short_oi == 0 {
        return Some(0);
    }
    let (longs_pay, ratio) = skew_ratio(long_oi, short_oi, skew_scale)?;
    let m = i128::try_from(mul_div(ratio, MAX_FUNDING_RATE, WAD)?).ok()?;
    Some(if longs_pay { m } else { -m })
}

/// The part of a slice's payout cap the pool reserved: nine tenths of it.
/// Multiplied before divided, and rounded down: releasing more than was
/// reserved is the failure that matters.
pub fn reserve_for_cap(cap: u64) -> Option<u64> {
    let value = mul_div(cap as u128, (PAYOUT_CAP - 1) as u128, PAYOUT_CAP as u128)?;
    u64::try_from(value).ok()
}

/// `value * part / whole`, for scaling a position's margin and cap to a slice.
pub fn pro_rata(value: u64, part: u64, whole: u64) -> Option<u64> {
    u64::try_from(mul_div(value as u128, part as u128, whole as u128)?).ok()
}

/// The liquidator's half of whatever equity is left.
pub fn liquidator_reward(equity_left: u64) -> Option<u64> {
    u64::try_from(mul_div(equity_left as u128, LIQUIDATOR_SHARE_BPS, BPS)?).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const USDC: u64 = 1_000_000;

    /// 1.0 in the price scale.
    fn price(units: u128, thousandths: u128) -> u128 {
        units * WAD + thousandths * WAD / 1000
    }

    #[test]
    fn fee_is_five_bps_each_way() {
        // 1,000 USDC notional pays 0.50 USDC.
        assert_eq!(fee(1_000 * USDC), Some(500_000));
    }

    #[test]
    fn maintenance_is_half_a_percent() {
        assert_eq!(maintenance(1_000 * USDC), Some(5 * USDC));
    }

    #[test]
    fn pnl_long_and_short_are_mirror_images() {
        let entry = price(150, 0);
        let mark = price(151, 500); // +1%
        assert_eq!(pnl(1_000 * USDC, entry, mark, true), Some(10 * USDC as i128));
        assert_eq!(pnl(1_000 * USDC, entry, mark, false), Some(-(10 * USDC as i128)));
    }

    #[test]
    fn liquidation_distances_match_the_handbook() {
        // Liquidation when equity == maintenance, i.e. the move eats
        // margin - 0.5% of notional. At 10x that is 9.5%, at 25x 3.5%.
        for (leverage, distance_bps) in [(10u64, 950u128), (25, 350)] {
            let margin = 100 * USDC;
            let notional = margin * leverage;
            let entry = WAD;
            let mark = entry - entry * distance_bps / BPS;
            let p = pnl(notional, entry, mark, true).unwrap();
            let e = equity(margin, p, 0).unwrap();
            assert_eq!(e, maintenance(notional).unwrap() as i128, "leverage {leverage}");
        }
    }

    #[test]
    fn payout_is_capped_at_ten_times_margin() {
        let margin = 10 * USDC;
        let cap = margin * PAYOUT_CAP;
        assert_eq!(payout(margin, 500 * USDC as i128, 0, 0, cap), Some(cap));
    }

    #[test]
    fn payout_is_floored_at_zero() {
        assert_eq!(payout(10 * USDC, -(50 * USDC as i128), 0, 1, 100 * USDC), Some(0));
    }

    #[test]
    fn payout_takes_fee_and_funding() {
        // 10 margin + 2 pnl - 0.3 funding - 0.1 fee = 11.6
        let got = payout(10 * USDC, 2 * USDC as i128, 300_000, 100_000, 100 * USDC);
        assert_eq!(got, Some(11_600_000));
    }

    #[test]
    fn funding_caps_at_three_quarters_of_a_percent_per_window() {
        let window = FUNDING_WINDOW as u64;
        // Skew far past the scale: capped.
        let (long, short) = funding_accrue(10_000 * USDC, 1 * USDC, 1_000 * USDC, window).unwrap();
        assert_eq!(long, MAX_FUNDING_RATE as i128);
        assert_eq!(short, -(MAX_FUNDING_RATE as i128));
        // Over one window, 1,000 notional pays 7.50.
        assert_eq!(accrued_funding(1_000 * USDC, long, 0), Some(7_500_000));
    }

    #[test]
    fn funding_is_zero_with_one_side_empty() {
        assert_eq!(funding_accrue(1_000 * USDC, 0, 1_000 * USDC, 3600), Some((0, 0)));
        assert_eq!(funding_rate(0, 1_000 * USDC, 1_000 * USDC), Some(0));
    }

    #[test]
    fn funding_scales_with_skew_and_flips_sign() {
        // Half the scale: half the cap, shorts pay.
        let rate = funding_rate(500 * USDC, 1_000 * USDC, 1_000 * USDC).unwrap();
        assert_eq!(rate, -(MAX_FUNDING_RATE as i128) / 2);
    }

    #[test]
    fn funding_does_not_overflow_over_years() {
        let ten_years = 10 * 365 * 24 * 3600;
        assert!(funding_accrue(5_000_000 * USDC, 1, 1, ten_years).is_some());
    }

    #[test]
    fn reserve_is_nine_tenths_rounded_down() {
        assert_eq!(reserve_for_cap(100 * USDC), Some(90 * USDC));
        assert_eq!(reserve_for_cap(19), Some(17));
    }

    #[test]
    fn large_frontier_prices_do_not_overflow() {
        // USDVND ~ 26,000 and the largest notional a market allows.
        let entry = 26_000 * WAD;
        let mark = 27_000 * WAD;
        assert!(pnl(5_000_000 * USDC, entry, mark, true).is_some());
    }
}
