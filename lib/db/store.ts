// Server-only: persistence helpers used by the API routes. Each helper is ONE atomic SQL statement (neon-http
// has no interactive transactions). Idempotency and replay protection come from constraints, not from
// read-then-write checks:
//  - sessions.version  : upsert guarded by `WHERE sessions.version <= excluded.version`
//  - payments          : UNIQUE (lease_id, kind, month_index), claimed with INSERT ... ON CONFLICT DO NOTHING
import { and, eq, ne, sql } from 'drizzle-orm';
import type { FinalDecision, LeaseDraft, PaymentKind, PaymentResult, SessionState } from '../contracts';
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
  | { claimed: false; status: 'pending' | 'confirmed' };

/**
 * Records the payment INTENT before any transfer is sent. The unique constraint makes this the idempotency
 * lock: exactly one caller gets `claimed: true` for a (lease, kind, month); everyone else gets the status of
 * the existing row and must NOT send a transfer.
 */
export async function claimPayment(
  db: Db,
  input: { leaseId: string; kind: PaymentKind; monthIndex: number | undefined },
): Promise<ClaimResult> {
  const monthIndex = monthIndexFor(input.kind, input.monthIndex);
  const inserted = await db
    .insert(payments)
    .values({ leaseId: input.leaseId, kind: input.kind, monthIndex, status: 'pending' })
    .onConflictDoNothing({ target: [payments.leaseId, payments.kind, payments.monthIndex] })
    .returning({ id: payments.id });
  if (inserted[0]) return { claimed: true, id: inserted[0].id };
  const existing = await db
    .select({ status: payments.status })
    .from(payments)
    .where(
      and(eq(payments.leaseId, input.leaseId), eq(payments.kind, input.kind), eq(payments.monthIndex, monthIndex)),
    );
  return { claimed: false, status: existing[0]?.status === 'confirmed' ? 'confirmed' : 'pending' };
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

/** Frees a claim whose transfer was certainly NOT sent (e.g. insufficient token balance). */
export async function releasePayment(db: Db, id: string): Promise<void> {
  await db.delete(payments).where(and(eq(payments.id, id), eq(payments.status, 'pending')));
}
