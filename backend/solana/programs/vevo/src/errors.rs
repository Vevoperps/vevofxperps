use anchor_lang::prelude::*;

#[error_code]
pub enum VevoError {
    #[msg("Only the admin may do this")]
    NotAdmin,
    #[msg("Only the publisher may post marks")]
    NotPublisher,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Not enough free balance")]
    InsufficientBalance,
    #[msg("Market is paused for new positions")]
    MarketIsPaused,
    #[msg("Leverage is zero or above the market's maximum")]
    LeverageTooHigh,
    #[msg("Margin is below the market's minimum")]
    MarginTooSmall,
    #[msg("Open interest cap reached on this side")]
    OpenInterestCap,
    #[msg("Not enough free liquidity in the pool")]
    InsufficientLiquidity,
    #[msg("The pool holds shares but no assets")]
    EmptyPool,
    #[msg("Position is not below its maintenance margin")]
    NotLiquidatable,
    #[msg("This market has never been priced")]
    NoFeed,
    #[msg("The mark is older than the oracle allows")]
    StalePrice,
    #[msg("A mark must be greater than zero")]
    ZeroPrice,
    #[msg("Markets and prices differ in length")]
    LengthMismatch,
    #[msg("The same market appears twice in one post")]
    DuplicateMark,
    #[msg("The mark moved more than the deviation limit allows")]
    DeviationTooLarge,
    #[msg("Unknown market index")]
    UnknownMarket,
    #[msg("All market slots are in use")]
    TooManyMarkets,
    #[msg("Market parameters must be non-zero")]
    BadMarketParams,
    #[msg("Nothing to close, or more than the position holds")]
    BadCloseAmount,
    #[msg("No admin handover is pending for this key")]
    NoPendingAdmin,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
