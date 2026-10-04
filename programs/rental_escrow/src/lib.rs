//! rental_escrow: lease terms, a program-owned deposit vault, rent payments with discounts computed
//! from the on-chain Clock, and a 2-of-3 (tenant, landlord, agency) deposit release.
//!
//! Devnet only. No PII on chain: pubkeys, amounts, timestamps and sha256 hashes only.
//! Design and threat notes: docs/onchain.md.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked};

pub mod math;

// Placeholder id with no keypair behind it. The deployer generates the program keypair and runs
// `anchor keys sync` before the devnet deploy (docs/onchain.md, "Deploy").
declare_id!("BJiwpRFDpNoURJFKiuetaF4D2hw19JSkqbuVjUWuTLVb");

/// The only accepted payment mint: the devnet tUSDC test mint (6 decimals, no freeze authority)
/// created by scripts/setup-devnet.ts. Classic SPL Token only.
#[constant]
pub const PAYMENT_MINT: Pubkey = Pubkey::from_str_const("GiCyZLFrkhKd3X4CpFGe4sMHB2kiPob5ToH8FtjYou7X");
#[constant]
pub const PAYMENT_DECIMALS: u8 = 6;
#[constant]
pub const LEASE_SEED: &[u8] = b"lease";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
#[constant]
pub const PAYMENT_SEED: &[u8] = b"payment";
#[constant]
pub const ROLE_TENANT: u8 = 0;
#[constant]
pub const ROLE_LANDLORD: u8 = 1;
#[constant]
pub const ROLE_AGENCY: u8 = 2;
/// Without the tenant's vote, landlord + agency can release only after the full term is paid or
/// when the first unpaid month is overdue by more than this (10 days). qa objection 10.
#[constant]
pub const RELEASE_GRACE_SECONDS: i64 = 864_000;

const EMPTY_VOTE: [u8; 32] = [0u8; 32];

#[program]
pub mod rental_escrow {
    use super::*;

    /// Creates the `Lease` PDA and its empty deposit vault. Landlord (payer) and agency sign.
    /// The tenant is named in `params` and consents by signing `deposit_escrow`.
    pub fn create_lease(ctx: Context<CreateLease>, params: CreateLeaseParams) -> Result<()> {
        let landlord = ctx.accounts.landlord.key();
        let agency = ctx.accounts.agency.key();
        let tenant = params.tenant;

        require!(
            tenant != Pubkey::default()
                && tenant != landlord
                && tenant != agency
                && landlord != agency,
            EscrowError::InvalidParties
        );
        require!(params.lease_id != [0u8; 8], EscrowError::InvalidParams);
        require!(
            params.rent_amount > 0
                && params.deposit_amount > 0
                && params.due_day_ts > 0
                && params.period_seconds > 0
                && params.term_months >= 1,
            EscrowError::InvalidParams
        );
        require!(
            math::bps_are_valid(params.discount_usdc_bps, params.discount_ontime_bps),
            EscrowError::InvalidBps
        );
        // Every due date of the term must be representable, so pay_rent can never overflow.
        math::due_ts(
            params.due_day_ts,
            params.term_months - 1,
            params.period_seconds,
        )
        .ok_or(EscrowError::MathOverflow)?;

        let lease_key = ctx.accounts.lease.key();
        ctx.accounts.lease.set_inner(Lease {
            lease_id: params.lease_id,
            landlord,
            tenant,
            agency,
            mint: ctx.accounts.mint.key(),
            rent_amount: params.rent_amount,
            deposit_amount: params.deposit_amount,
            due_day_ts: params.due_day_ts,
            period_seconds: params.period_seconds,
            term_months: params.term_months,
            discount_usdc_bps: params.discount_usdc_bps,
            discount_ontime_bps: params.discount_ontime_bps,
            contract_hash: params.contract_hash,
            entry_report_hash: params.entry_report_hash,
            exit_report_hash: [0u8; 32],
            deposit_held: false,
            months_paid: 0,
            on_time_streak: 0,
            status: LeaseStatus::Created,
            votes: [EMPTY_VOTE; 3],
            bump: ctx.bumps.lease,
            vault_bump: ctx.bumps.vault,
        });

        emit!(LeaseCreated {
            lease: lease_key,
            lease_id: params.lease_id,
            landlord,
            tenant,
            agency,
            mint: ctx.accounts.mint.key(),
            rent_amount: params.rent_amount,
            deposit_amount: params.deposit_amount,
            due_day_ts: params.due_day_ts,
            period_seconds: params.period_seconds,
            term_months: params.term_months,
            discount_usdc_bps: params.discount_usdc_bps,
            discount_ontime_bps: params.discount_ontime_bps,
            contract_hash: params.contract_hash,
            entry_report_hash: params.entry_report_hash,
        });
        Ok(())
    }

    /// The tenant moves `deposit_amount` into the vault. `Created` -> `Active`.
    pub fn deposit_escrow(ctx: Context<DepositEscrow>) -> Result<()> {
        let lease = &ctx.accounts.lease;
        require!(
            lease.status == LeaseStatus::Created && !lease.deposit_held,
            EscrowError::LeaseNotCreated
        );
        let amount = lease.deposit_amount;

        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.tenant_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.tenant.to_account_info(),
                },
            ),
            amount,
            PAYMENT_DECIMALS,
        )?;

        let lease = &mut ctx.accounts.lease;
        lease.deposit_held = true;
        lease.status = LeaseStatus::Active;

        emit!(DepositHeld {
            lease: lease.key(),
            tenant: lease.tenant,
            amount,
            held_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Pays period `month_index` (must equal `months_paid`). The amount and the on-time flag are
    /// computed here from the lease terms and `Clock`; the client only bounds it with `max_amount`.
    pub fn pay_rent(ctx: Context<PayRent>, month_index: u16, max_amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let lease = &ctx.accounts.lease;
        require!(lease.status == LeaseStatus::Active, EscrowError::LeaseNotActive);
        require!(month_index < lease.term_months, EscrowError::MonthOutOfRange);
        require!(month_index == lease.months_paid, EscrowError::MonthOutOfOrder);

        let due = math::due_ts(lease.due_day_ts, month_index, lease.period_seconds)
            .ok_or(EscrowError::MathOverflow)?;
        let q = math::quote(
            lease.rent_amount,
            lease.discount_usdc_bps,
            lease.discount_ontime_bps,
            now,
            due,
        )
        .ok_or(EscrowError::MathOverflow)?;
        require!(q.amount > 0, EscrowError::ZeroAmount);
        require!(q.amount <= max_amount, EscrowError::AmountAboveMax);

        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.tenant_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.landlord_token.to_account_info(),
                    authority: ctx.accounts.tenant.to_account_info(),
                },
            ),
            q.amount,
            PAYMENT_DECIMALS,
        )?;

        let lease_key = ctx.accounts.lease.key();
        let tenant = ctx.accounts.lease.tenant;
        ctx.accounts.payment_record.set_inner(PaymentRecord {
            lease: lease_key,
            tenant,
            month_index,
            amount_paid: q.amount,
            discount_applied_bps: q.discount_bps,
            due_ts: due,
            paid_at: now,
            on_time: q.on_time,
            bump: ctx.bumps.payment_record,
        });

        let lease = &mut ctx.accounts.lease;
        lease.months_paid = lease
            .months_paid
            .checked_add(1)
            .ok_or(EscrowError::MathOverflow)?;
        lease.on_time_streak = if q.on_time {
            lease
                .on_time_streak
                .checked_add(1)
                .ok_or(EscrowError::MathOverflow)?
        } else {
            0
        };

        emit!(RentPaid {
            lease: lease_key,
            tenant,
            month_index,
            amount: q.amount,
            discount_bps: q.discount_bps,
            on_time: q.on_time,
            due_ts: due,
            paid_at: now,
            on_time_streak: lease.on_time_streak,
        });
        Ok(())
    }

    /// One party (role resolved from the signer, never from an argument) records its vote for the
    /// release terms. Each role owns one slot and can only overwrite its own. When two slots hold
    /// the same terms hash, the vault pays the split, sweeps any excess to the landlord and closes.
    /// A release the tenant did not vote for also needs the full term paid or the tenant overdue
    /// past `RELEASE_GRACE_SECONDS` (`ReleaseNeedsTenant`).
    pub fn vote_release(
        ctx: Context<VoteRelease>,
        to_tenant: u64,
        to_landlord: u64,
        reason_hash: [u8; 32],
        exit_report_hash: [u8; 32],
    ) -> Result<()> {
        let voter = ctx.accounts.voter.key();
        let lease_key = ctx.accounts.lease.key();
        let now = Clock::get()?.unix_timestamp;

        let (role, matched, deposit_amount) = {
            let lease = &mut ctx.accounts.lease;
            require!(
                lease.status == LeaseStatus::Active && lease.deposit_held,
                EscrowError::LeaseNotActive
            );
            let role = lease.role_of(&voter).ok_or(EscrowError::NotAParty)?;
            let sum = to_tenant
                .checked_add(to_landlord)
                .ok_or(EscrowError::MathOverflow)?;
            require!(sum == lease.deposit_amount, EscrowError::SplitMismatch);

            let terms = math::terms_hash(to_tenant, to_landlord, &reason_hash, &exit_report_hash);
            lease.votes[usize::from(role)] = terms;
            let matched = (0..3usize)
                .any(|r| r != usize::from(role) && lease.votes[r] == terms);
            // qa objection 10: landlord + agency cannot end the lease early while the tenant is current.
            if matched && lease.votes[usize::from(ROLE_TENANT)] != terms {
                require!(
                    math::release_without_tenant_allowed(
                        lease.months_paid,
                        lease.term_months,
                        lease.due_day_ts,
                        lease.period_seconds,
                        RELEASE_GRACE_SECONDS,
                        now,
                    ),
                    EscrowError::ReleaseNeedsTenant
                );
            }

            emit!(ReleaseVoted {
                lease: lease_key,
                voter,
                role,
                terms_hash: terms,
                to_tenant,
                to_landlord,
                reason_hash,
                exit_report_hash,
            });
            (role, matched, lease.deposit_amount)
        };

        if !matched {
            return Ok(());
        }

        // Anything above the deposit (e.g. a donated "dust" transfer) goes to the landlord, so the
        // vault always reaches zero and can be closed (qa R-15).
        let excess = ctx
            .accounts
            .vault
            .amount
            .checked_sub(deposit_amount)
            .ok_or(EscrowError::VaultShortfall)?;
        let landlord_total = to_landlord
            .checked_add(excess)
            .ok_or(EscrowError::MathOverflow)?;

        let landlord_key = ctx.accounts.lease.landlord;
        let lease_id = ctx.accounts.lease.lease_id;
        let bump = [ctx.accounts.lease.bump];
        let seeds: &[&[u8]] = &[LEASE_SEED, landlord_key.as_ref(), lease_id.as_ref(), &bump];
        let signer: &[&[&[u8]]] = &[seeds];

        if to_tenant > 0 {
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.tenant_token.to_account_info(),
                        authority: ctx.accounts.lease.to_account_info(),
                    },
                    signer,
                ),
                to_tenant,
                PAYMENT_DECIMALS,
            )?;
        }
        if landlord_total > 0 {
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.landlord_token.to_account_info(),
                        authority: ctx.accounts.lease.to_account_info(),
                    },
                    signer,
                ),
                landlord_total,
                PAYMENT_DECIMALS,
            )?;
        }
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.landlord.to_account_info(),
                authority: ctx.accounts.lease.to_account_info(),
            },
            signer,
        ))?;

        let lease = &mut ctx.accounts.lease;
        lease.exit_report_hash = exit_report_hash;
        lease.deposit_held = false;
        lease.status = LeaseStatus::Closed;

        emit!(DepositReleased {
            lease: lease_key,
            completed_by: voter,
            completed_by_role: role,
            terms_hash: lease.votes[usize::from(role)],
            to_tenant,
            to_landlord,
            excess_to_landlord: excess,
            reason_hash,
            exit_report_hash,
        });
        Ok(())
    }

    /// Landlord cancels a lease that never received its deposit. Any donated tokens in the vault
    /// go to the landlord, the vault is closed (rent back to the landlord) and the `Lease` is kept
    /// with status `Cancelled`, so the same seeds can never be re-created with other terms.
    pub fn cancel_lease(ctx: Context<CancelLease>) -> Result<()> {
        {
            let lease = &ctx.accounts.lease;
            require!(
                lease.status == LeaseStatus::Created && !lease.deposit_held,
                EscrowError::LeaseNotCreated
            );
        }
        let landlord_key = ctx.accounts.lease.landlord;
        let lease_id = ctx.accounts.lease.lease_id;
        let bump = [ctx.accounts.lease.bump];
        let seeds: &[&[u8]] = &[LEASE_SEED, landlord_key.as_ref(), lease_id.as_ref(), &bump];
        let signer: &[&[&[u8]]] = &[seeds];

        let dust = ctx.accounts.vault.amount;
        if dust > 0 {
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.landlord_token.to_account_info(),
                        authority: ctx.accounts.lease.to_account_info(),
                    },
                    signer,
                ),
                dust,
                PAYMENT_DECIMALS,
            )?;
        }
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.landlord.to_account_info(),
                authority: ctx.accounts.lease.to_account_info(),
            },
            signer,
        ))?;

        let lease_key = ctx.accounts.lease.key();
        ctx.accounts.lease.status = LeaseStatus::Cancelled;
        emit!(LeaseCancelled {
            lease: lease_key,
            cancelled_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

// ---------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(params: CreateLeaseParams)]
pub struct CreateLease<'info> {
    #[account(mut)]
    pub landlord: Signer<'info>,
    pub agency: Signer<'info>,
    #[account(
        address = PAYMENT_MINT @ EscrowError::InvalidMint,
        constraint = mint.decimals == PAYMENT_DECIMALS @ EscrowError::InvalidMint,
        constraint = mint.freeze_authority.is_none() @ EscrowError::InvalidMint,
    )]
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = landlord,
        space = 8 + Lease::INIT_SPACE,
        seeds = [LEASE_SEED, landlord.key().as_ref(), params.lease_id.as_ref()],
        bump,
    )]
    pub lease: Box<Account<'info, Lease>>,
    #[account(
        init,
        payer = landlord,
        seeds = [VAULT_SEED, lease.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = lease,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositEscrow<'info> {
    pub tenant: Signer<'info>,
    #[account(
        mut,
        seeds = [LEASE_SEED, lease.landlord.as_ref(), lease.lease_id.as_ref()],
        bump = lease.bump,
        has_one = tenant,
        has_one = mint,
    )]
    pub lease: Box<Account<'info, Lease>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = tenant)]
    pub tenant_token: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [VAULT_SEED, lease.key().as_ref()],
        bump = lease.vault_bump,
        token::mint = mint,
        token::authority = lease,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(month_index: u16)]
pub struct PayRent<'info> {
    pub tenant: Signer<'info>,
    /// Pays the `PaymentRecord` rent. May be the tenant or a platform fee payer; it has no role.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [LEASE_SEED, lease.landlord.as_ref(), lease.lease_id.as_ref()],
        bump = lease.bump,
        has_one = tenant,
        has_one = mint,
    )]
    pub lease: Box<Account<'info, Lease>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = tenant)]
    pub tenant_token: Box<Account<'info, TokenAccount>>,
    /// Any token account of the pinned mint whose current owner is the landlord, not only its ATA:
    /// classic SPL Token lets the landlord move its ATA's owner, which must not block an on-time
    /// payment (qa B4 review, B1; test P-13).
    #[account(mut, token::mint = mint, token::authority = lease.landlord)]
    pub landlord_token: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        space = 8 + PaymentRecord::INIT_SPACE,
        seeds = [PAYMENT_SEED, lease.key().as_ref(), &month_index.to_le_bytes()],
        bump,
    )]
    pub payment_record: Box<Account<'info, PaymentRecord>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VoteRelease<'info> {
    pub voter: Signer<'info>,
    #[account(
        mut,
        seeds = [LEASE_SEED, lease.landlord.as_ref(), lease.lease_id.as_ref()],
        bump = lease.bump,
        has_one = mint,
        has_one = landlord,
    )]
    pub lease: Box<Account<'info, Lease>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [VAULT_SEED, lease.key().as_ref()],
        bump = lease.vault_bump,
        token::mint = mint,
        token::authority = lease,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    /// Any token account of the pinned mint whose current owner is the tenant (B1: an ATA's owner
    /// can be moved, so pinning the ATA would let one party block every release; test R-21).
    #[account(mut, token::mint = mint, token::authority = lease.tenant)]
    pub tenant_token: Box<Account<'info, TokenAccount>>,
    /// Same rule for the landlord's share.
    #[account(mut, token::mint = mint, token::authority = lease.landlord)]
    pub landlord_token: Box<Account<'info, TokenAccount>>,
    /// CHECK: lamports destination only (the vault's rent when it closes), pinned to `lease.landlord`
    /// by `address` and by `has_one = landlord` on `lease`. Not `SystemAccount`: the landlord could
    /// reassign its wallet to another program and block the release (B1; test R-22). Crediting
    /// lamports to an account owned by any program is allowed; nothing is read from it.
    #[account(mut, address = lease.landlord)]
    pub landlord: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelLease<'info> {
    #[account(mut)]
    pub landlord: Signer<'info>,
    #[account(
        mut,
        seeds = [LEASE_SEED, lease.landlord.as_ref(), lease.lease_id.as_ref()],
        bump = lease.bump,
        has_one = landlord,
        has_one = mint,
    )]
    pub lease: Box<Account<'info, Lease>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [VAULT_SEED, lease.key().as_ref()],
        bump = lease.vault_bump,
        token::mint = mint,
        token::authority = lease,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = lease.landlord)]
    pub landlord_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateLeaseParams {
    /// Raw 8 random bytes of the off-chain id `ls_<16 hex>` (the same id the memo uses).
    pub lease_id: [u8; 8],
    pub tenant: Pubkey,
    pub rent_amount: u64,
    pub deposit_amount: u64,
    pub due_day_ts: i64,
    pub period_seconds: i64,
    pub term_months: u16,
    pub discount_usdc_bps: u16,
    pub discount_ontime_bps: u16,
    pub contract_hash: [u8; 32],
    pub entry_report_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum LeaseStatus {
    Created,
    Active,
    Closed,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Lease {
    pub lease_id: [u8; 8],
    pub landlord: Pubkey,
    pub tenant: Pubkey,
    pub agency: Pubkey,
    pub mint: Pubkey,
    pub rent_amount: u64,
    pub deposit_amount: u64,
    pub due_day_ts: i64,
    pub period_seconds: i64,
    pub term_months: u16,
    pub discount_usdc_bps: u16,
    pub discount_ontime_bps: u16,
    pub contract_hash: [u8; 32],
    pub entry_report_hash: [u8; 32],
    pub exit_report_hash: [u8; 32],
    pub deposit_held: bool,
    pub months_paid: u16,
    pub on_time_streak: u16,
    pub status: LeaseStatus,
    /// Release vote slots, indexed by role (tenant 0, landlord 1, agency 2). All zero = no vote.
    pub votes: [[u8; 32]; 3],
    pub bump: u8,
    pub vault_bump: u8,
}

impl Lease {
    pub fn role_of(&self, key: &Pubkey) -> Option<u8> {
        if *key == self.tenant {
            Some(ROLE_TENANT)
        } else if *key == self.landlord {
            Some(ROLE_LANDLORD)
        } else if *key == self.agency {
            Some(ROLE_AGENCY)
        } else {
            None
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct PaymentRecord {
    pub lease: Pubkey,
    pub tenant: Pubkey,
    pub month_index: u16,
    pub amount_paid: u64,
    pub discount_applied_bps: u16,
    pub due_ts: i64,
    pub paid_at: i64,
    pub on_time: bool,
    pub bump: u8,
}

// ---------------------------------------------------------------------------------------------
// Events (pubkeys, integers, booleans and 32-byte hashes only)
// ---------------------------------------------------------------------------------------------

#[event]
pub struct LeaseCreated {
    pub lease: Pubkey,
    pub lease_id: [u8; 8],
    pub landlord: Pubkey,
    pub tenant: Pubkey,
    pub agency: Pubkey,
    pub mint: Pubkey,
    pub rent_amount: u64,
    pub deposit_amount: u64,
    pub due_day_ts: i64,
    pub period_seconds: i64,
    pub term_months: u16,
    pub discount_usdc_bps: u16,
    pub discount_ontime_bps: u16,
    pub contract_hash: [u8; 32],
    pub entry_report_hash: [u8; 32],
}

#[event]
pub struct DepositHeld {
    pub lease: Pubkey,
    pub tenant: Pubkey,
    pub amount: u64,
    pub held_at: i64,
}

#[event]
pub struct RentPaid {
    pub lease: Pubkey,
    pub tenant: Pubkey,
    pub month_index: u16,
    pub amount: u64,
    pub discount_bps: u16,
    pub on_time: bool,
    pub due_ts: i64,
    pub paid_at: i64,
    pub on_time_streak: u16,
}

#[event]
pub struct ReleaseVoted {
    pub lease: Pubkey,
    pub voter: Pubkey,
    pub role: u8,
    pub terms_hash: [u8; 32],
    pub to_tenant: u64,
    pub to_landlord: u64,
    pub reason_hash: [u8; 32],
    pub exit_report_hash: [u8; 32],
}

#[event]
pub struct DepositReleased {
    pub lease: Pubkey,
    pub completed_by: Pubkey,
    pub completed_by_role: u8,
    pub terms_hash: [u8; 32],
    pub to_tenant: u64,
    pub to_landlord: u64,
    pub excess_to_landlord: u64,
    pub reason_hash: [u8; 32],
    pub exit_report_hash: [u8; 32],
}

#[event]
pub struct LeaseCancelled {
    pub lease: Pubkey,
    pub cancelled_at: i64,
}

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

#[error_code]
pub enum EscrowError {
    #[msg("Tenant, landlord and agency must be three distinct, non-default keys")]
    InvalidParties,
    #[msg("Invalid lease parameters")]
    InvalidParams,
    #[msg("Each discount must be <= 10000 bps and their sum < 10000 bps")]
    InvalidBps,
    #[msg("Mint must be the pinned 6-decimal payment mint with no freeze authority")]
    InvalidMint,
    #[msg("The lease is not in the Created state")]
    LeaseNotCreated,
    #[msg("The lease is not active")]
    LeaseNotActive,
    #[msg("month_index must equal months_paid")]
    MonthOutOfOrder,
    #[msg("month_index is outside the lease term")]
    MonthOutOfRange,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("to_tenant + to_landlord must equal the deposit")]
    SplitMismatch,
    #[msg("Signer is not the tenant, the landlord or the agency of this lease")]
    NotAParty,
    #[msg("The computed rent is above the max_amount the payer approved")]
    AmountAboveMax,
    #[msg("The computed rent is zero")]
    ZeroAmount,
    #[msg("The vault holds less than the deposit")]
    VaultShortfall,
    #[msg("Without the tenant's vote, a release needs the full term paid or rent overdue past the grace period")]
    ReleaseNeedsTenant,
}
