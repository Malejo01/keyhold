// Server-only: persistence helpers used by the API routes. Each helper is ONE atomic SQL statement (neon-http
// has no interactive transactions). Idempotency and replay protection come from constraints, not from
// read-then-write checks:
//  - sessions.version  : upsert guarded by `WHERE sessions.version <= excluded.version`
//  - payments          : UNIQUE (lease_id, kind, month_index), claimed with INSERT ... ON CONFLICT DO NOTHING;
//                        UNIQUE (session_id) WHERE kind = 'deposit' keeps one paid lease per session
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { FinalDecision, LeaseDraft, PaymentKind, PaymentResult, SessionState } from '../contracts';
import type { PaymentAttempt } from '../solana/pay';
import type { Db } from './client';
import { DEMO_AGENCY_ID } from './reference';
import { DEPOSIT_MONTH_INDEX, leases, payments, prequalDecisions, sessions } from './schema';

// ---------- sessions ----------

/** Latest version the server accepted or issued for this session id; 0 when unknown. */
export async function getStoredVersion(db: Db, sessionId: string): Promise<number> {
  const rows = await db.select({ version: sessions.version }).from(sessions).where(eq(sessions.id, sessionId));
  return rows[0]?.version ?? 0;
}

/**
 * Atomically records the session at `state.version` (creating the row if needed).
 * Returns false when a NEWER version is already stored, i.e. the blob is stale and must be rejected.
 * Equal versions pass: resending the latest blob is idempotent, the payments constraint handles the rest.
 */
export async function touchSession(db: Db, state: SessionState): Promise<boolean> {
  const version = state.version ?? 0;
  const rows = await db
    .insert(sessions)
    .values({
      id: state.sessionId,
      tenantId: state.tenantId ?? null,
      stage: state.stage,
      selectedPropertyId: state.selectedPropertyId ?? null,
      version,
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: {
        tenantId: sql`coalesce(excluded.tenant_id, ${sessions.tenantId})`,
        stage: sql`excluded.stage`,
        selectedPropertyId: sql`coalesce(excluded.selected_property_id, ${sessions.selectedPropertyId})`,
        version: sql`excluded.version`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${sessions.version} <= excluded.version`,
    })
    .returning({ version: sessions.version });
  return rows.length > 0;
}

// ---------- leases ----------

/** Persists the lease carried by a (verified) session. Idempotent; the session row must already exist. */
export async function upsertLease(db: Db, state: SessionState, lease: LeaseDraft, lang = 'en'): Promise<void> {
  if (!state.tenantId) throw new Error('Cannot persist a lease without a tenant');
  await db
    .insert(leases)
    .values({
      id: lease.leaseId,
      sessionId: state.sessionId,
      propertyId: lease.propertyId,
      tenantId: lease.tenantId,
      agencyId: DEMO_AGENCY_ID,
      contractText: lease.contractText,
      contractHash: lease.contractHash,
      lang,
      stage: state.stage,
      startDate: lease.startDate,
      months: lease.months,
      rentBaseUnits: BigInt(lease.rentBaseUnits),
      depositBaseUnits: BigInt(lease.depositBaseUnits),
      dueTs: lease.dueTs,
      discountUsdcBps: lease.discountUsdcBps,
      discountOntimeBps: lease.discountOntimeBps,
    })
    .onConflictDoNothing();
}

export async function setLeaseStage(db: Db, leaseId: string, stage: string): Promise<void> {
  await db.update(leases).set({ stage }).where(eq(leases.id, leaseId));
}

/** True when ANOTHER lease of the same session already has a payment row (one paid lease per session). */
export async function sessionHasOtherLeasePayments(db: Db, sessionId: string, leaseId: string): Promise<boolean> {
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .innerJoin(leases, eq(payments.leaseId, leases.id))
    .where(and(eq(leases.sessionId, sessionId), ne(leases.id, leaseId)))
    .limit(1);
  return rows.length > 0;
}

export async function recordPrequal(
  db: Db,
  sessionId: string,
  propertyId: string,
  decision: FinalDecision,
): Promise<void> {
  await db.insert(prequalDecisions).values({
    sessionId,
    tenantId: decision.prequal.tenantId,
    propertyId,
    status: decision.status,
    decidedBy: decision.decidedBy,
    issues: [...decision.prequal.issues, ...decision.crosscheck.discrepancies],
    crosscheck: decision.crosscheck,
  });
}

// ---------- payments ----------

export function monthIndexFor(kind: PaymentKind, monthIndex: number | undefined): number {
  return kind === 'deposit' ? DEPOSIT_MONTH_INDEX : (monthIndex as number);
}

export type ClaimResult =
  | { claimed: true; id: string }
  | { claimed: false; status: 'pending' | 'confirmed' }
  /** Another lease of the same session already holds a deposit (UNIQUE (session_id) WHERE kind = 'deposit'). */
  | { claimed: false; status: 'other_lease_in_session' };

/**
 * Records the payment INTENT before any transfer is sent. The unique constraints make this the idempotency
 * lock: exactly one caller gets `claimed: true` for a (lease, kind, month); everyone else gets the status of
 * the existing row and must NOT send a transfer. A deposit also claims the session's single deposit slot.
 */
export async function claimPayment(
  db: Db,
  input: { leaseId: string; sessionId: string; kind: PaymentKind; monthIndex: number | undefined },
): Promise<ClaimResult> {
  const monthIndex = monthIndexFor(input.kind, input.monthIndex);
  // No conflict target: ANY unique violation (lease slot or session deposit slot) turns into "not inserted".
  const inserted = await db
    .insert(payments)
    .values({ leaseId: input.leaseId, sessionId: input.sessionId, kind: input.kind, monthIndex, status: 'pending' })
    .onConflictDoNothing()
    .returning({ id: payments.id });
  if (inserted[0]) return { claimed: true, id: inserted[0].id };
  const existing = await getPaymentRow(db, input.leaseId, input.kind, input.monthIndex);
  if (!existing) return { claimed: false, status: 'other_lease_in_session' };
  return { claimed: false, status: existing.status === 'confirmed' ? 'confirmed' : 'pending' };
}

export interface PaymentRow {
  id: string;
  status: 'pending' | 'confirmed';
  /** Present once the signed tx was stored (always before it was sent). */
  attempt: PaymentAttempt | null;
  /** Seconds since the claim was inserted, measured by the database clock. */
  ageSeconds: number;
}

/** The payment row of a slot, with its stored attempt (signature and blockhash validity) when there is one. */
export async function getPaymentRow(
  db: Db,
  leaseId: string,
  kind: PaymentKind,
  monthIndex: number | undefined,
): Promise<PaymentRow | null> {
  const rows = await db
    .select({
      id: payments.id,
      status: payments.status,
      signature: payments.signature,
      lastValidBlockHeight: payments.lastValidBlockHeight,
      amountBaseUnits: payments.amountBaseUnits,
      discountAppliedBps: payments.discountAppliedBps,
      memo: payments.memo,
      ageSeconds: sql<number>`extract(epoch from (now() - ${payments.createdAt}))`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.leaseId, leaseId),
        eq(payments.kind, kind),
        eq(payments.monthIndex, monthIndexFor(kind, monthIndex)),
      ),
    );
  const row = rows[0];
  if (!row) return null;
  const complete =
    row.signature !== null &&
    row.lastValidBlockHeight !== null &&
    row.amountBaseUnits !== null &&
    row.discountAppliedBps !== null &&
    row.memo !== null;
  return {
    id: row.id,
    status: row.status === 'confirmed' ? 'confirmed' : 'pending',
    attempt: complete
      ? {
          signature: row.signature as string,
          lastValidBlockHeight: row.lastValidBlockHeight as number,
          amountBaseUnits: (row.amountBaseUnits as bigint).toString(),
          discountAppliedBps: row.discountAppliedBps as number,
          memo: row.memo as string,
        }
      : null,
    ageSeconds: Number(row.ageSeconds),
  };
}

/**
 * Stores the signed tx's signature and facts on the claimed (pending) row. MUST run before the tx is sent: it is
 * what lets a later request tell "landed", "failed" and "can never land" apart. Throws when the row is gone.
 */
export async function recordAttempt(db: Db, id: string, attempt: PaymentAttempt): Promise<void> {
  const updated = await db
    .update(payments)
    .set({
      signature: attempt.signature,
      lastValidBlockHeight: attempt.lastValidBlockHeight,
      amountBaseUnits: BigInt(attempt.amountBaseUnits),
      discountAppliedBps: attempt.discountAppliedBps,
      memo: attempt.memo,
    })
    .where(and(eq(payments.id, id), eq(payments.status, 'pending')))
    .returning({ id: payments.id });
  if (updated.length === 0) throw new Error('Payment claim is no longer pending');
}

/** True when a payment row (any status) exists for this lease and kind. */
export async function hasPaymentRow(db: Db, leaseId: string, kind: PaymentKind): Promise<boolean> {
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.leaseId, leaseId), eq(payments.kind, kind)))
    .limit(1);
  return rows.length > 0;
}

/** Marks a claimed intent as confirmed with the on-chain facts (blockTime comes from the confirmed tx). */
export async function confirmPayment(db: Db, id: string, result: PaymentResult): Promise<void> {
  await db
    .update(payments)
    .set({
      status: 'confirmed',
      signature: result.signature,
      amountBaseUnits: BigInt(result.amountBaseUnits),
      discountAppliedBps: result.discountAppliedBps,
      blockTime: result.blockTime,
      onTime: result.onTime,
      memo: result.memo,
      confirmedAt: sql`now()`,
    })
    .where(eq(payments.id, id));
}

/**
 * Frees a claim whose transfer was certainly NOT sent (prepare failed, signature could not be stored, wallet
 * short of tokens). Deleting the row also frees the session's deposit slot.
 */
export async function releasePayment(db: Db, id: string): Promise<void> {
  await db.delete(payments).where(and(eq(payments.id, id), eq(payments.status, 'pending')));
}

/**
 * Frees a pending claim whose stored signature was proven dead (failed on chain, or blockhash expired).
 * Guarded by the signature, so a claim that was meanwhile re-claimed with a new attempt is never deleted.
 */
export async function releaseAttempt(db: Db, id: string, signature: string): Promise<boolean> {
  const deleted = await db
    .delete(payments)
    .where(and(eq(payments.id, id), eq(payments.status, 'pending'), eq(payments.signature, signature)))
    .returning({ id: payments.id });
  return deleted.length > 0;
}

/**
 * Frees a pending claim that never stored a signature and is older than `minAgeSeconds` (the request that held it
 * crashed or timed out before signing; since the signature is stored BEFORE sending, nothing was sent).
 */
export async function releaseStaleUnsigned(db: Db, id: string, minAgeSeconds: number): Promise<boolean> {
  const deleted = await db
    .delete(payments)
    .where(
      and(
        eq(payments.id, id),
        eq(payments.status, 'pending'),
        isNull(payments.signature),
        sql`${payments.createdAt} < now() - (${minAgeSeconds} * interval '1 second')`,
      ),
    )
    .returning({ id: payments.id });
  return deleted.length > 0;
}
