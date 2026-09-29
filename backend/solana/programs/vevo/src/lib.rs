//! vevo — perpetual futures on the world's currencies, settled in USDC.
//!
//! A port of the EVM `PerpEngine` + `PushOracle` to one Solana program.
//!
//! **The venue is the counterparty.** There is no order book: a trade fills at
//! the posted mark, and the other side of it is a pool of USDC that liquidity
//! providers own. Every open position has the most it can ever return — ten
//! times its margin — reserved out of the pool before it opens, so the number
//! on the ticket is backed rather than promised.
//!
//! **Custody.** Nobody can move a trader's balance except that trader. The
//! admin lists markets and sets their parameters, and names the publisher.
//! Closing works on a paused market. `poke`, `snapshot` and `liquidate` are
//! open to anyone.
//!
//! **Prices.** The publisher (our keeper) posts FX marks into one `Marks`
//! account. They are posted, not signed by a third party: the publisher
//! decides the price a position fills and liquidates at. That is the same
//! arrangement the EVM deployment had, and it is stated here rather than
//! hidden.
//!
//! **Fixed while porting**, relative to the EVM contracts:
//! - a market can appear only once per `post_marks`, so the deviation limit
//!   cannot be walked past by repeating one market inside one transaction
//!   (across several transactions it still can: the limit guards against a
//!   bad rate from the source, not against the publisher, who is trusted);
//! - only the program's upgrade authority can initialise it, so nobody can
//!   take the config between deploy and setup;
//! - adding liquidity to a pool that holds shares but no assets is refused
//!   instead of dividing by zero;
//! - admin handover is two-step;
//! - the oracle is part of the program, so there is no `set_oracle` that
//!   could point the engine at a different price source in one call.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

pub mod engine;
pub mod errors;
pub mod events;
pub mod math;
pub mod state;

use engine::{accrue, mark_price, now, ok, price_close, release, side_index};
use errors::VevoError;
use events::*;
use state::*;

// Replaced by `anchor keys sync` with the address of this program's keypair.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod vevo {
    use super::*;

    // ------------------------------------------------------------ admin

    /// Creates the config, the marks account and the USDC vault.
    pub fn initialize(
        ctx: Context<Initialize>,
        publisher: Pubkey,
        max_age: u32,
        max_deviation_bps: u16,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.pending_admin = Pubkey::default();
        config.publisher = publisher;
        config.mint = ctx.accounts.mint.key();
        config.vault = ctx.accounts.vault.key();
        config.pool_assets = 0;
        config.pool_reserved = 0;
        config.pool_shares = 0;
        config.max_age = max_age;
        config.max_deviation_bps = max_deviation_bps;
        config.market_count = 0;
        config.bump = ctx.bumps.config;
        config.vault_bump = ctx.bumps.vault;
        config.marks_bump = ctx.bumps.marks;

        // Writes the zero-copy account's discriminator; every slot starts at
        // zero, which reads as "never posted".
        ctx.accounts.marks.load_init()?;
        Ok(())
    }

    pub fn set_oracle_params(ctx: Context<AdminOnly>, max_age: u32, max_deviation_bps: u16) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.max_age = max_age;
        config.max_deviation_bps = max_deviation_bps;
        Ok(())
    }

    pub fn set_publisher(ctx: Context<AdminOnly>, publisher: Pubkey) -> Result<()> {
        ctx.accounts.config.publisher = publisher;
        Ok(())
    }

    /// Step one of an admin handover. The new key must call `accept_admin`.
    pub fn propose_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.config.pending_admin = new_admin;
        Ok(())
    }

    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require_keys_neq!(config.pending_admin, Pubkey::default(), VevoError::NoPendingAdmin);
        require_keys_eq!(
            config.pending_admin,
            ctx.accounts.new_admin.key(),
            VevoError::NoPendingAdmin
        );

        emit!(AdminChanged {
            from: config.admin,
            to: config.pending_admin
        });
        config.admin = config.pending_admin;
        config.pending_admin = Pubkey::default();
        Ok(())
    }

    pub fn list_market(
        ctx: Context<ListMarket>,
        symbol: [u8; 8],
        max_leverage: u16,
        skew_scale: u64,
        max_open_interest: u64,
        min_margin: u64,
    ) -> Result<()> {
        require!(max_leverage > 0 && skew_scale > 0, VevoError::BadMarketParams);

        let config = &mut ctx.accounts.config;
        require!(
            (config.market_count as usize) < MAX_MARKETS,
            VevoError::TooManyMarkets
        );

        let market = &mut ctx.accounts.market;
        market.symbol = symbol;
        market.index = config.market_count;
        market.max_leverage = max_leverage;
        market.paused = false;
        market.bump = ctx.bumps.market;
        market.skew_scale = skew_scale;
        market.max_open_interest = max_open_interest;
        market.min_margin = min_margin;
        market.long_open_interest = 0;
        market.short_open_interest = 0;
        market.funding_long = 0;
        market.funding_short = 0;
        market.last_accrual = now()?;
        market.reference_price = 0;
        market.reference_at = 0;

        config.market_count += 1;

        emit!(MarketListed {
            market: market.key(),
            symbol,
            index: market.index
        });
        Ok(())
    }

    /// Changes a market's parameters. Funding is brought up to date on the old
    /// skew scale first, because the rate is a function of it.
    pub fn configure_market(
        ctx: Context<ConfigureMarket>,
        max_leverage: u16,
        skew_scale: u64,
        max_open_interest: u64,
        min_margin: u64,
        paused: bool,
    ) -> Result<()> {
        require!(max_leverage > 0 && skew_scale > 0, VevoError::BadMarketParams);

        let market = &mut ctx.accounts.market;
        accrue(market, now()?)?;

        market.max_leverage = max_leverage;
        market.skew_scale = skew_scale;
        market.max_open_interest = max_open_interest;
        market.min_margin = min_margin;
        market.paused = paused;

        emit!(MarketConfigured {
            market: market.key(),
            max_leverage,
            skew_scale,
            max_open_interest,
            min_margin,
            paused,
        });
        Ok(())
    }

    // ----------------------------------------------------------- oracle

    /// Posts marks for any number of markets, by slot index.
    ///
    /// A fresh mark may move at most `max_deviation_bps` per post. A mark that
    /// has already gone stale is not held to its old value — the world moved
    /// while nobody was posting, and holding the new price to the old one
    /// would lock the market out until someone noticed.
    pub fn post_marks(ctx: Context<PostMarks>, indices: Vec<u8>, prices: Vec<u128>) -> Result<()> {
        require!(indices.len() == prices.len(), VevoError::LengthMismatch);

        let config = &ctx.accounts.config;
        let mut marks = ctx.accounts.marks.load_mut()?;
        let at = now()?;

        let mut seen = [false; MAX_MARKETS];

        for (index, price) in indices.iter().zip(prices.iter()) {
            let slot_index = *index as usize;
            require!(*index < config.market_count, VevoError::UnknownMarket);
            require!(!seen[slot_index], VevoError::DuplicateMark);
            seen[slot_index] = true;
            require!(*price > 0, VevoError::ZeroPrice);

            let slot = &mut marks.slots[slot_index];

            let fresh = slot.updated_at != 0 && at <= slot.updated_at.saturating_add(config.max_age as i64);

            if fresh && config.max_deviation_bps != 0 && slot.price != 0 {
                let previous = slot.price;
                let gap = if *price > previous {
                    *price - previous
                } else {
                    previous - *price
                };
                let moved = ok(gap.checked_mul(math::BPS))? / previous;
                require!(
                    moved <= config.max_deviation_bps as u128,
                    VevoError::DeviationTooLarge
                );
            }

            slot.price = *price;
            slot.updated_at = at;
        }

        emit!(MarksPosted {
            count: indices.len() as u8,
            at
        });
        Ok(())
    }

    // --------------------------------------------------------- balances

    /// Moves USDC in. Nothing trades until this happens.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VevoError::ZeroAmount);

        let trader = &mut ctx.accounts.trader;
        if trader.owner == Pubkey::default() {
            trader.owner = ctx.accounts.owner.key();
            trader.bump = ctx.bumps.trader;
        }
        trader.balance = ok(trader.balance.checked_add(amount))?;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.owner_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        emit!(Deposited {
            owner: ctx.accounts.owner.key(),
            amount
        });
        Ok(())
    }

    /// Moves free balance out. Margin behind an open position is not free.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, VevoError::ZeroAmount);

        let trader = &mut ctx.accounts.trader;
        require!(trader.balance >= amount, VevoError::InsufficientBalance);
        trader.balance -= amount;

        vault_out(
            &ctx.accounts.config,
            &ctx.accounts.vault,
            &ctx.accounts.mint,
            &ctx.accounts.owner_token,
            &ctx.accounts.token_program,
            amount,
        )?;

        emit!(Withdrawn {
            owner: ctx.accounts.owner.key(),
            amount
        });
        Ok(())
    }

    // -------------------------------------------------------- liquidity

    /// Backs the venue's side of the book, in exchange for shares of it.
    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount: u64) -> Result<()> {
        require!(amount > 0, VevoError::ZeroAmount);

        let config = &mut ctx.accounts.config;
        let shares = if config.pool_shares == 0 {
            INITIAL_SHARES
        } else {
            require!(config.pool_assets > 0, VevoError::EmptyPool);
            ok((amount as u128).checked_mul(config.pool_shares))? / config.pool_assets as u128
        };
        require!(shares > 0, VevoError::ZeroAmount);

        config.pool_shares = ok(config.pool_shares.checked_add(shares))?;
        config.pool_assets = ok(config.pool_assets.checked_add(amount))?;

        let trader = &mut ctx.accounts.trader;
        if trader.owner == Pubkey::default() {
            trader.owner = ctx.accounts.owner.key();
            trader.bump = ctx.bumps.trader;
        }
        trader.shares = ok(trader.shares.checked_add(shares))?;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.owner_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        emit!(LiquidityAdded {
            provider: ctx.accounts.owner.key(),
            amount,
            shares
        });
        Ok(())
    }

    /// Redeems shares for their part of the pool — only the free part:
    /// liquidity reserved behind an open position's payout cannot leave.
    pub fn remove_liquidity(ctx: Context<RemoveLiquidity>, shares: u128) -> Result<()> {
        require!(shares > 0, VevoError::ZeroAmount);

        let trader = &mut ctx.accounts.trader;
        require!(trader.shares >= shares, VevoError::InsufficientBalance);

        let config = &mut ctx.accounts.config;
        let amount = ok(shares.checked_mul(config.pool_assets as u128))? / config.pool_shares;
        let amount = ok(u64::try_from(amount).ok())?;
        require!(amount <= config.pool_free(), VevoError::InsufficientLiquidity);

        trader.shares -= shares;
        config.pool_shares -= shares;
        config.pool_assets -= amount;

        vault_out(
            &ctx.accounts.config,
            &ctx.accounts.vault,
            &ctx.accounts.mint,
            &ctx.accounts.owner_token,
            &ctx.accounts.token_program,
            amount,
        )?;

        emit!(LiquidityRemoved {
            provider: ctx.accounts.owner.key(),
            shares,
            amount
        });
        Ok(())
    }

    // ---------------------------------------------------------- trading

    /// Opens an isolated position at the mark.
    ///
    /// Only nine tenths of the payout cap come out of the pool: the trader's
    /// own margin is the first of the ten units the ticket promises.
    pub fn open_position(
        ctx: Context<OpenPosition>,
        is_long: bool,
        margin: u64,
        leverage: u16,
    ) -> Result<()> {
        let at = now()?;
        let config = &mut ctx.accounts.config;
        let market = &mut ctx.accounts.market;

        require!(!market.paused, VevoError::MarketIsPaused);
        require!(
            leverage > 0 && leverage <= market.max_leverage,
            VevoError::LeverageTooHigh
        );
        require!(
            margin >= market.min_margin && margin > 0,
            VevoError::MarginTooSmall
        );

        let notional = ok(margin.checked_mul(leverage as u64))?;
        let entry_fee = ok(math::fee(notional))?;

        let trader = &mut ctx.accounts.trader;
        let cost = ok(margin.checked_add(entry_fee))?;
        require!(trader.balance >= cost, VevoError::InsufficientBalance);

        accrue(market, at)?;

        let reserve = ok(margin.checked_mul(math::PAYOUT_CAP - 1))?;
        require!(reserve <= config.pool_free(), VevoError::InsufficientLiquidity);

        let side = if is_long {
            ok(market.long_open_interest.checked_add(notional))?
        } else {
            ok(market.short_open_interest.checked_add(notional))?
        };
        require!(side <= market.max_open_interest, VevoError::OpenInterestCap);

        let entry_price = mark_price(&*ctx.accounts.marks.load()?, market.index, at, config.max_age)?;

        trader.balance -= cost;
        config.pool_assets = ok(config.pool_assets.checked_add(entry_fee))?;
        config.pool_reserved = ok(config.pool_reserved.checked_add(reserve))?;

        if is_long {
            market.long_open_interest = side;
        } else {
            market.short_open_interest = side;
        }

        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.market = market.key();
        position.margin = margin;
        position.notional = notional;
        position.payout_cap = ok(margin.checked_mul(math::PAYOUT_CAP))?;
        position.entry_price = entry_price;
        position.entry_funding = side_index(market, is_long);
        position.opened_at = at;
        position.is_long = is_long;
        position.bump = ctx.bumps.position;

        emit!(PositionOpened {
            owner: position.owner,
            market: position.market,
            is_long,
            margin,
            notional,
            entry_price,
            fee: entry_fee,
        });
        Ok(())
    }

    /// Posts more margin behind an open position. Buys distance to the
    /// liquidation price and nothing else: the payout cap stays where it was.
    pub fn add_margin(ctx: Context<AddMargin>, amount: u64) -> Result<()> {
        require!(amount > 0, VevoError::ZeroAmount);

        let trader = &mut ctx.accounts.trader;
        require!(trader.balance >= amount, VevoError::InsufficientBalance);
        trader.balance -= amount;

        let position = &mut ctx.accounts.position;
        position.margin = ok(position.margin.checked_add(amount))?;

        emit!(MarginAdded {
            owner: position.owner,
            market: position.market,
            amount,
            margin: position.margin,
        });
        Ok(())
    }

    /// Closes all or part of a position at the mark and settles into the free
    /// balance. `notional_to_close` equal to the whole notional is a full
    /// close, and the position account is closed and its rent returned.
    ///
    /// Works on a paused market. A partial close that would leave a stub below
    /// the market's minimum margin is refused: a stub too small to liquidate
    /// is a liability the pool would carry for free.
    pub fn reduce_position(ctx: Context<ReducePosition>, notional_to_close: u64) -> Result<()> {
        let at = now()?;
        let config = &mut ctx.accounts.config;
        let market = &mut ctx.accounts.market;
        let position = &mut ctx.accounts.position;

        require!(
            notional_to_close > 0 && notional_to_close <= position.notional,
            VevoError::BadCloseAmount
        );

        accrue(market, at)?;

        let exit_price = mark_price(&*ctx.accounts.marks.load()?, market.index, at, config.max_age)?;
        let close = price_close(market, position, notional_to_close, exit_price)?;

        release(
            config,
            market,
            position.is_long,
            notional_to_close,
            close.margin_out,
            close.cap_out,
            close.amount,
        )?;

        let trader = &mut ctx.accounts.trader;
        trader.balance = ok(trader.balance.checked_add(close.amount))?;

        let owner = position.owner;
        let market_key = market.key();

        if close.whole {
            emit!(PositionClosed {
                owner,
                market: market_key,
                exit_price,
                payout: close.amount,
                pnl: close.pnl,
                funding: close.funding,
                fee: close.exit_fee,
            });
            ctx.accounts
                .position
                .close(ctx.accounts.owner.to_account_info())?;
        } else {
            position.margin -= close.margin_out;
            position.notional -= notional_to_close;
            position.payout_cap -= close.cap_out;
            require!(position.margin >= market.min_margin, VevoError::MarginTooSmall);

            emit!(PositionReduced {
                owner,
                market: market_key,
                exit_price,
                closed_notional: notional_to_close,
                payout: close.amount,
                pnl: close.pnl,
                funding: close.funding,
                fee: close.exit_fee,
            });
        }
        Ok(())
    }

    /// Closes a position whose equity has fallen to its maintenance margin.
    ///
    /// Anyone may call it, and whoever does takes half of the equity left as
    /// the fee for doing so; the rest stays with the pool, which carried the
    /// other side of the move. The position's rent goes back to its owner.
    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        let at = now()?;
        let config = &mut ctx.accounts.config;
        let market = &mut ctx.accounts.market;
        let position = &ctx.accounts.position;

        accrue(market, at)?;

        let exit_price = mark_price(&*ctx.accounts.marks.load()?, market.index, at, config.max_age)?;
        let pnl = ok(math::pnl(
            position.notional,
            position.entry_price,
            exit_price,
            position.is_long,
        ))?;
        let funding = ok(math::accrued_funding(
            position.notional,
            side_index(market, position.is_long),
            position.entry_funding,
        ))?;
        let equity = ok(math::equity(position.margin, pnl, funding))?;
        let maintenance = ok(math::maintenance(position.notional))?;

        require!(equity <= maintenance as i128, VevoError::NotLiquidatable);

        let left = if equity > 0 { equity as u64 } else { 0 };
        let reward = ok(math::liquidator_reward(left))?;

        release(
            config,
            market,
            position.is_long,
            position.notional,
            position.margin,
            position.payout_cap,
            reward,
        )?;

        let liquidator_trader = &mut ctx.accounts.liquidator_trader;
        if liquidator_trader.owner == Pubkey::default() {
            liquidator_trader.owner = ctx.accounts.liquidator.key();
            liquidator_trader.bump = ctx.bumps.liquidator_trader;
        }
        liquidator_trader.balance = ok(liquidator_trader.balance.checked_add(reward))?;

        emit!(PositionLiquidated {
            owner: position.owner,
            market: market.key(),
            liquidator: ctx.accounts.liquidator.key(),
            exit_price,
            reward,
        });
        // The position account itself is closed by the `close = owner`
        // constraint once this returns.
        Ok(())
    }

    // ------------------------------------------------------ maintenance

    /// Brings a market's funding up to now. Permissionless.
    pub fn poke(ctx: Context<Poke>) -> Result<()> {
        accrue(&mut ctx.accounts.market, now()?)
    }

    /// Records the current mark as the market's 24h reference.
    ///
    /// Anyone may call it; it changes nothing until a window has passed (the
    /// first one is taken immediately), so a keeper can run it on a loop and a
    /// stranger cannot move the reference around. It fails on a stale mark,
    /// because a reference taken from a dead feed is worse than none.
    pub fn snapshot(ctx: Context<Snapshot>) -> Result<()> {
        let at = now()?;
        let market = &mut ctx.accounts.market;

        if market.reference_at != 0 && at < market.reference_at.saturating_add(REFERENCE_WINDOW) {
            return Ok(());
        }

        market.reference_price = mark_price(
            &*ctx.accounts.marks.load()?,
            market.index,
            at,
            ctx.accounts.config.max_age,
        )?;
        market.reference_at = at;

        emit!(ReferenceTaken {
            market: market.key(),
            price: market.reference_price,
            at
        });
        Ok(())
    }
}

/// Pays USDC out of the vault, signed by the config PDA that owns it.
fn vault_out<'info>(
    config: &Account<'info, Config>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    let bump = [config.bump];
    let seeds: &[&[u8]] = &[CONFIG_SEED, &bump];
    let signer: &[&[&[u8]]] = &[seeds];

    token_interface::transfer_checked(
        CpiContext::new(
            token_program.key(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: config.to_account_info(),
            },
        )
        .with_signer(signer),
        amount,
        mint.decimals,
    )
}

// ================================================================ accounts

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Must be the program's upgrade authority — the key that deployed it.
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::Vevo>,

    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ VevoError::NotAdmin)]
    pub program_data: Account<'info, ProgramData>,

    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    #[account(init, payer = admin, space = 8 + std::mem::size_of::<Marks>(), seeds = [MARKS_SEED], bump)]
    pub marks: AccountLoader<'info, Marks>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [VAULT_SEED],
        bump,
        token::mint = mint,
        token::authority = config,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ VevoError::NotAdmin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    pub new_admin: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(symbol: [u8; 8], max_leverage: u16, skew_scale: u64, max_open_interest: u64, min_margin: u64)]
pub struct ListMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ VevoError::NotAdmin)]
    pub config: Account<'info, Config>,

    #[account(init, payer = admin, space = 8 + Market::INIT_SPACE, seeds = [MARKET_SEED, symbol.as_ref()], bump)]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConfigureMarket<'info> {
    pub admin: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ VevoError::NotAdmin)]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [MARKET_SEED, market.symbol.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct PostMarks<'info> {
    pub publisher: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = publisher @ VevoError::NotPublisher)]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [MARKS_SEED], bump = config.marks_bump)]
    pub marks: AccountLoader<'info, Marks>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Trader::INIT_SPACE,
        seeds = [TRADER_SEED, owner.key().as_ref()],
        bump,
    )]
    pub trader: Account<'info, Trader>,

    #[account(address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub owner_token: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, address = config.vault)]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [TRADER_SEED, owner.key().as_ref()], bump = trader.bump, has_one = owner)]
    pub trader: Account<'info, Trader>,

    #[account(address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub owner_token: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, address = config.vault)]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Trader::INIT_SPACE,
        seeds = [TRADER_SEED, owner.key().as_ref()],
        bump,
    )]
    pub trader: Account<'info, Trader>,

    #[account(address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub owner_token: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, address = config.vault)]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    pub owner: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [TRADER_SEED, owner.key().as_ref()], bump = trader.bump, has_one = owner)]
    pub trader: Account<'info, Trader>,

    #[account(address = config.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub owner_token: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, address = config.vault)]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(seeds = [MARKS_SEED], bump = config.marks_bump)]
    pub marks: AccountLoader<'info, Marks>,

    #[account(mut, seeds = [MARKET_SEED, market.symbol.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [TRADER_SEED, owner.key().as_ref()], bump = trader.bump, has_one = owner)]
    pub trader: Account<'info, Trader>,

    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, market.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddMargin<'info> {
    pub owner: Signer<'info>,

    #[account(mut, seeds = [TRADER_SEED, owner.key().as_ref()], bump = trader.bump, has_one = owner)]
    pub trader: Account<'info, Trader>,

    #[account(
        mut,
        seeds = [POSITION_SEED, position.market.as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner,
    )]
    pub position: Account<'info, Position>,
}

#[derive(Accounts)]
pub struct ReducePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(seeds = [MARKS_SEED], bump = config.marks_bump)]
    pub marks: AccountLoader<'info, Marks>,

    #[account(mut, seeds = [MARKET_SEED, market.symbol.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(mut, seeds = [TRADER_SEED, owner.key().as_ref()], bump = trader.bump, has_one = owner)]
    pub trader: Account<'info, Trader>,

    #[account(
        mut,
        seeds = [POSITION_SEED, market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner,
        has_one = market,
    )]
    pub position: Account<'info, Position>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(seeds = [MARKS_SEED], bump = config.marks_bump)]
    pub marks: AccountLoader<'info, Marks>,

    #[account(mut, seeds = [MARKET_SEED, market.symbol.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        close = owner,
        seeds = [POSITION_SEED, market.key().as_ref(), position.owner.as_ref()],
        bump = position.bump,
        has_one = market,
        has_one = owner,
    )]
    pub position: Account<'info, Position>,

    /// CHECK: receives the position's rent. Its address is pinned by
    /// `has_one = owner` on the position. `dup` because a trader may liquidate
    /// their own position, making it the same account as `liquidator`.
    #[account(mut, dup)]
    pub owner: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = liquidator,
        space = 8 + Trader::INIT_SPACE,
        seeds = [TRADER_SEED, liquidator.key().as_ref()],
        bump,
    )]
    pub liquidator_trader: Account<'info, Trader>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Poke<'info> {
    #[account(mut, seeds = [MARKET_SEED, market.symbol.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct Snapshot<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(seeds = [MARKS_SEED], bump = config.marks_bump)]
    pub marks: AccountLoader<'info, Marks>,

    #[account(mut, seeds = [MARKET_SEED, market.symbol.as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
}
