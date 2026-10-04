//! Pure, deterministic math shared by the instructions. No accounts, no syscalls except sha256.
//!
//! `quote` mirrors `computePrice` in `lib/rules/pricing.ts` with `method = 'usdc'` (the program only
//! accepts the payment token). Both sides run the vectors in `tests/anchor/vectors/pricing.json`.

/// Basis-point denominator (100% = 10_000).
pub const BPS_DENOMINATOR: u64 = 10_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Quote {
    pub amount: u64,
    pub discount_bps: u16,
    pub on_time: bool,
}

/// Due timestamp of period `month_index`: `due_day_ts + month_index * period_seconds`.
/// Fixed-length periods, not calendar months. `None` on overflow.
pub fn due_ts(due_day_ts: i64, month_index: u16, period_seconds: i64) -> Option<i64> {
    i64::from(month_index)
        .checked_mul(period_seconds)?
        .checked_add(due_day_ts)
}

/// Discount configuration accepted at `create_lease`: each value <= 10_000 and the sum strictly
/// below 10_000, so a payment is never free (qa C-04, C-05, C-06). The sum is computed in u32.
pub fn bps_are_valid(usdc_bps: u16, ontime_bps: u16) -> bool {
    let usdc = u32::from(usdc_bps);
    let ontime = u32::from(ontime_bps);
    match usdc.checked_add(ontime) {
        Some(sum) => usdc <= 10_000 && ontime <= 10_000 && sum < 10_000,
        None => false,
    }
}

/// Rent to charge at time `now` for a period due at `due`.
///
/// - `on_time = now <= due` (inclusive, same as pricing.ts `atTs <= dueTs`).
/// - `discount_bps = usdc_bps + (on_time ? ontime_bps : 0)`, capped at 10_000 like pricing.ts.
/// - `amount = rent * (10_000 - discount_bps) / 10_000`, floor division, u128 intermediate.
///
/// `None` only if a value cannot be represented (never for valid `u64` rent and bps <= 10_000).
pub fn quote(rent: u64, usdc_bps: u16, ontime_bps: u16, now: i64, due: i64) -> Option<Quote> {
    let on_time = now <= due;
    let ontime_applied = if on_time { u32::from(ontime_bps) } else { 0 };
    let bps = u32::from(usdc_bps)
        .checked_add(ontime_applied)?
        .min(BPS_DENOMINATOR as u32);
    let keep = u128::from(BPS_DENOMINATOR).checked_sub(u128::from(bps))?;
    let amount = u128::from(rent)
        .checked_mul(keep)?
        .checked_div(u128::from(BPS_DENOMINATOR))?;
    Some(Quote {
        amount: u64::try_from(amount).ok()?,
        discount_bps: u16::try_from(bps).ok()?,
        on_time,
    })
}

/// Whether landlord + agency may complete a release **without** the tenant's vote (qa objection 10).
///
/// Allowed only when the tenant can no longer be hurt by an early exit:
/// - every month of the term is paid (`months_paid >= term_months`), or
/// - the first unpaid month is overdue past the grace period: `now > due(months_paid) + grace`.
///
/// While the tenant is current, a release needs the tenant's vote. An abandoned lease (the tenant
/// stops paying) stays releasable by landlord + agency once the grace period has passed.
/// An unrepresentable deadline means "never overdue" (`false`), never a wrap-around.
pub fn release_without_tenant_allowed(
    months_paid: u16,
    term_months: u16,
    due_day_ts: i64,
    period_seconds: i64,
    grace_seconds: i64,
    now: i64,
) -> bool {
    if months_paid >= term_months {
        return true;
    }
    let deadline =
        due_ts(due_day_ts, months_paid, period_seconds).and_then(|d| d.checked_add(grace_seconds));
    match deadline {
        Some(deadline) => now > deadline,
        None => false,
    }
}

/// Hash that binds a release vote to its full terms:
/// `sha256(to_tenant_le_u64 || to_landlord_le_u64 || reason_hash || exit_report_hash)`.
pub fn terms_hash(
    to_tenant: u64,
    to_landlord: u64,
    reason_hash: &[u8; 32],
    exit_report_hash: &[u8; 32],
) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[
        &to_tenant.to_le_bytes(),
        &to_landlord.to_le_bytes(),
        reason_hash,
        exit_report_hash,
    ])
    .to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    const VECTORS: &str = include_str!("../../../tests/anchor/vectors/pricing.json");

    fn as_u64(v: &serde_json::Value) -> u64 {
        v.as_str()
            .expect("u64 values are JSON strings")
            .parse()
            .expect("u64")
    }

    /// Q-05 / Q-06: the same vectors run through computePrice in vitest.
    #[test]
    fn q05_q06_pricing_vectors_match() {
        let doc: serde_json::Value = serde_json::from_str(VECTORS).expect("vectors JSON");
        let vectors = doc["vectors"].as_array().expect("vectors array");
        assert!(vectors.len() >= 8);
        for v in vectors {
            let name = v["name"].as_str().unwrap();
            let due = due_ts(
                v["due_day_ts"].as_i64().unwrap(),
                v["month_index"].as_u64().unwrap() as u16,
                v["period_seconds"].as_i64().unwrap(),
            )
            .expect(name);
            assert_eq!(due, v["expected_due"].as_i64().unwrap(), "{name}: due");
            let q = quote(
                as_u64(&v["rent"]),
                v["usdc_bps"].as_u64().unwrap() as u16,
                v["ontime_bps"].as_u64().unwrap() as u16,
                v["now"].as_i64().unwrap(),
                due,
            )
            .expect(name);
            assert_eq!(q.amount, as_u64(&v["expected_amount"]), "{name}: amount");
            assert_eq!(
                u64::from(q.discount_bps),
                v["expected_discount_bps"].as_u64().unwrap(),
                "{name}: bps"
            );
            assert_eq!(q.on_time, v["expected_on_time"].as_bool().unwrap(), "{name}: on_time");
        }
    }

    #[test]
    fn q06_u64_max_rent_does_not_overflow() {
        let q = quote(u64::MAX, 300, 200, 0, 0).unwrap();
        assert_eq!(q.amount, 17_524_406_870_024_074_034);
        assert_eq!(q.discount_bps, 500);
    }

    #[test]
    fn p12_due_overflow_is_none() {
        assert_eq!(due_ts(i64::MAX - 10, 1, 2_592_000), None);
        assert_eq!(due_ts(0, u16::MAX, i64::MAX), None);
        assert_eq!(due_ts(100, 0, i64::MAX), Some(100));
    }

    #[test]
    fn c04_c05_c06_bps_validation() {
        assert!(bps_are_valid(300, 200));
        assert!(bps_are_valid(0, 0));
        assert!(bps_are_valid(9_999, 0));
        assert!(!bps_are_valid(5_000, 5_000)); // 100% discount
        assert!(!bps_are_valid(5_001, 5_000));
        assert!(!bps_are_valid(u16::MAX, 1)); // would wrap to 0 in u16
        assert!(!bps_are_valid(10_001, 0));
    }

    #[test]
    fn r20_r23_release_without_tenant_gate() {
        let d = 1_000_000;
        let p = 2_592_000;
        let g = 864_000;
        // Tenant current: before the due date, at it, and up to the end of the grace period.
        assert!(!release_without_tenant_allowed(0, 12, d, p, g, d - 1));
        assert!(!release_without_tenant_allowed(0, 12, d, p, g, d));
        assert!(!release_without_tenant_allowed(0, 12, d, p, g, d + g)); // inclusive boundary
        // Overdue past the grace period.
        assert!(release_without_tenant_allowed(0, 12, d, p, g, d + g + 1));
        // Paying the overdue month moves the reference to the next month and restores the veto.
        assert!(!release_without_tenant_allowed(1, 12, d, p, g, d + g + 1));
        assert!(release_without_tenant_allowed(1, 12, d, p, g, d + p + g + 1));
        // Whole term paid.
        assert!(release_without_tenant_allowed(12, 12, d, p, g, 0));
        assert!(release_without_tenant_allowed(1, 1, d, p, g, i64::MIN));
        // Unrepresentable deadline: never overdue, no wrap-around.
        assert!(!release_without_tenant_allowed(0, 2, i64::MAX - 10, p, g, i64::MAX));
        assert!(!release_without_tenant_allowed(1, 2, i64::MAX - p, p, g, i64::MAX));
    }

    #[test]
    fn terms_hash_binds_every_field() {
        let a = terms_hash(1, 2, &[0; 32], &[0; 32]);
        assert_ne!(a, terms_hash(2, 1, &[0; 32], &[0; 32]));
        assert_ne!(a, terms_hash(1, 2, &[1; 32], &[0; 32]));
        assert_ne!(a, terms_hash(1, 2, &[0; 32], &[1; 32]));
        assert_eq!(a, terms_hash(1, 2, &[0; 32], &[0; 32]));
    }
}
