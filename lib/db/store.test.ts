import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../tests/db/pglite';
import { createLeaseDraft } from '../agents/lease';
import type { SessionState } from '../contracts';
import type { Db } from './client';
import { ensureReferenceData } from './reference';
import { DEPOSIT_MONTH_INDEX, payments } from './schema';
import {
  claimPayment,
  confirmPayment,
  getPaymentRow,
  getStoredVersion,
  recordAttempt,
  releaseAttempt,
  releasePayment,
  releaseStaleUnsigned,
  sessionHasOtherLeasePayments,
  touchSession,
  upsertLease,
} from './store';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await ensureReferenceData(db);
});
afterAll(async () => {
  await close();
});

function sessionWithLease(sessionId: string, version = 1): SessionState {
  const lease = createLeaseDraft('ana', 'prop-01');
  return { sessionId, stage: 'PAYMENT', tenantId: 'ana', selectedPropertyId: 'prop-01', lease, payments: [], history: [], version };
}

async function leaseFor(sessionId: string): Promise<{ state: SessionState; leaseId: string; sessionId: string }> {
  const state = sessionWithLease(sessionId);
  expect(await touchSession(db, state)).toBe(true);
  await upsertLease(db, state, state.lease!);
  return { state, leaseId: state.lease!.leaseId, sessionId };
}

describe('touchSession (stale session detection)', () => {
  it('creates the row, accepts equal and newer versions, rejects older ones', async () => {
    const base = sessionWithLease('s-touch');
    expect(await getStoredVersion(db, 's-touch')).toBe(0);
    expect(await touchSession(db, { ...base, version: 3 })).toBe(true);
    expect(await touchSession(db, { ...base, version: 3 })).toBe(true); // resending the latest blob is fine
    expect(await touchSession(db, { ...base, version: 5 })).toBe(true);
    expect(await touchSession(db, { ...base, version: 4 })).toBe(false); // replay of an older blob
    expect(await getStoredVersion(db, 's-touch')).toBe(5);
  });

  it('treats a legacy blob without version as version 0', async () => {
    const base = sessionWithLease('s-legacy');
    delete base.version;
    expect(await touchSession(db, base)).toBe(true);
    expect(await touchSession(db, { ...base, version: 2 })).toBe(true);
    expect(await touchSession(db, base)).toBe(false);
  });
});

describe('payments uniqueness', () => {
  it('the second claim of the same deposit loses and sees the first status', async () => {
    const { leaseId, sessionId } = await leaseFor('s-dup');
    const first = await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    expect(first.claimed).toBe(true);
    const second = await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    expect(second).toEqual({ claimed: false, status: 'pending' });
  });

  it('stores the deposit with the -1 sentinel, so the constraint works despite SQL NULL semantics', async () => {
    const { leaseId, sessionId } = await leaseFor('s-sentinel');
    await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    const rows = await db.select().from(payments).where(eq(payments.leaseId, leaseId));
    expect(rows).toHaveLength(1);
    expect(rows[0].monthIndex).toBe(DEPOSIT_MONTH_INDEX);
    // Raw duplicate insert (bypassing ON CONFLICT DO NOTHING) must be rejected by the database itself.
    await expect(
      db.insert(payments).values({ leaseId, kind: 'deposit', monthIndex: DEPOSIT_MONTH_INDEX }),
    ).rejects.toThrow();
  });

  it('rejects inconsistent kind/month combinations and a confirmed row without signature', async () => {
    const { leaseId } = await leaseFor('s-checks');
    await expect(db.insert(payments).values({ leaseId, kind: 'deposit', monthIndex: 0 })).rejects.toThrow();
    await expect(db.insert(payments).values({ leaseId, kind: 'rent', monthIndex: -1 })).rejects.toThrow();
    await expect(
      db.insert(payments).values({ leaseId, kind: 'rent', monthIndex: 0, status: 'confirmed' }),
    ).rejects.toThrow();
  });

  it('allows different months of rent and rejects a repeated month', async () => {
    const { leaseId, sessionId } = await leaseFor('s-months');
    expect((await claimPayment(db, { leaseId, sessionId, kind: 'rent', monthIndex: 0 })).claimed).toBe(true);
    expect((await claimPayment(db, { leaseId, sessionId, kind: 'rent', monthIndex: 1 })).claimed).toBe(true);
    expect((await claimPayment(db, { leaseId, sessionId, kind: 'rent', monthIndex: 0 })).claimed).toBe(false);
  });

  it('exactly one of many concurrent claims wins', async () => {
    const { leaseId, sessionId } = await leaseFor('s-race');
    const results = await Promise.all(
      Array.from({ length: 8 }, () => claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined })),
    );
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    const rows = await db.select().from(payments).where(eq(payments.leaseId, leaseId));
    expect(rows).toHaveLength(1);
  });

  it('confirm stores the on-chain facts; the same signature cannot back two payments', async () => {
    const { leaseId, sessionId } = await leaseFor('s-confirm');
    const a = await claimPayment(db, { leaseId, sessionId, kind: 'rent', monthIndex: 0 });
    const b = await claimPayment(db, { leaseId, sessionId, kind: 'rent', monthIndex: 1 });
    if (!a.claimed || !b.claimed) throw new Error('claims should succeed');
    const result = {
      kind: 'rent' as const,
      signature: 'sig-unique-1',
      explorerUrl: 'https://example.invalid',
      blockTime: 1_800_000_000,
      amountBaseUnits: '399000000',
      discountAppliedBps: 500,
      onTime: true,
      memo: `lease:v1:${leaseId}:rent:0:${'a'.repeat(64)}`,
    };
    await confirmPayment(db, a.id, result);
    const [row] = await db.select().from(payments).where(eq(payments.id, a.id));
    expect(row.status).toBe('confirmed');
    expect(row.signature).toBe('sig-unique-1');
    expect(row.amountBaseUnits).toBe(BigInt(399000000));
    expect(row.blockTime).toBe(1_800_000_000);
    await expect(confirmPayment(db, b.id, result)).rejects.toThrow();
  });

  it('release frees a pending claim but never a confirmed one', async () => {
    const { leaseId, sessionId } = await leaseFor('s-release');
    const pending = await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    if (!pending.claimed) throw new Error('claim should succeed');
    await releasePayment(db, pending.id);
    const again = await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    expect(again.claimed).toBe(true);
    if (!again.claimed) return;
    await confirmPayment(db, again.id, {
      kind: 'deposit',
      signature: 'sig-release-1',
      explorerUrl: 'x',
      blockTime: 1,
      amountBaseUnits: '1',
      discountAppliedBps: 0,
      onTime: true,
      memo: 'm',
    });
    await releasePayment(db, again.id);
    expect(await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined })).toEqual({
      claimed: false,
      status: 'confirmed',
    });
  });

  it('detects another lease with payments in the same session', async () => {
    const { state, leaseId, sessionId } = await leaseFor('s-other');
    await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    const other = createLeaseDraft('ana', 'prop-02');
    await upsertLease(db, state, other);
    expect(await sessionHasOtherLeasePayments(db, 's-other', other.leaseId)).toBe(true);
    expect(await sessionHasOtherLeasePayments(db, 's-other', leaseId)).toBe(false);
  });
});

describe('payment attempts (signature stored before the send)', () => {
  const attempt = {
    signature: 'sig-attempt-1',
    lastValidBlockHeight: 123_456,
    amountBaseUnits: '420000000',
    discountAppliedBps: 0,
    memo: 'lease:v1:x:deposit:' + 'b'.repeat(64),
  };

  it('stores and reads back the attempt on the pending row', async () => {
    const { leaseId, sessionId } = await leaseFor('s-attempt');
    const claim = await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    if (!claim.claimed) throw new Error('claim should succeed');
    expect((await getPaymentRow(db, leaseId, 'deposit', undefined))?.attempt).toBeNull();
    await recordAttempt(db, claim.id, attempt);
    const row = await getPaymentRow(db, leaseId, 'deposit', undefined);
    expect(row).toMatchObject({ id: claim.id, status: 'pending', attempt });
  });

  it('recordAttempt refuses a claim that was released', async () => {
    const { leaseId, sessionId } = await leaseFor('s-attempt-gone');
    const claim = await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    if (!claim.claimed) throw new Error('claim should succeed');
    await releasePayment(db, claim.id);
    await expect(recordAttempt(db, claim.id, attempt)).rejects.toThrow();
  });

  it('releaseAttempt only deletes a pending row that still carries that signature', async () => {
    const { leaseId, sessionId } = await leaseFor('s-release-attempt');
    const claim = await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    if (!claim.claimed) throw new Error('claim should succeed');
    await recordAttempt(db, claim.id, { ...attempt, signature: 'sig-attempt-2' });
    expect(await releaseAttempt(db, claim.id, 'some-other-signature')).toBe(false);
    expect(await releaseAttempt(db, claim.id, 'sig-attempt-2')).toBe(true);
    expect(await getPaymentRow(db, leaseId, 'deposit', undefined)).toBeNull();
  });

  it('releaseStaleUnsigned frees only old claims without a signature', async () => {
    const { leaseId, sessionId } = await leaseFor('s-stale-unsigned');
    const claim = await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    if (!claim.claimed) throw new Error('claim should succeed');
    expect(await releaseStaleUnsigned(db, claim.id, 180)).toBe(false); // too young
    await db.update(payments).set({ createdAt: new Date(Date.now() - 600_000) }).where(eq(payments.id, claim.id));
    await recordAttempt(db, claim.id, { ...attempt, signature: 'sig-attempt-3' });
    expect(await releaseStaleUnsigned(db, claim.id, 180)).toBe(false); // old but signed: never guess
    expect(await releaseAttempt(db, claim.id, 'sig-attempt-3')).toBe(true);
    const again = await claimPayment(db, { leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    if (!again.claimed) throw new Error('claim should succeed');
    await db.update(payments).set({ createdAt: new Date(Date.now() - 600_000) }).where(eq(payments.id, again.id));
    expect(await releaseStaleUnsigned(db, again.id, 180)).toBe(true);
  });

  it('one deposit per session: a deposit of another lease is refused, and freed again by a release', async () => {
    const first = await leaseFor('s-one-deposit');
    const other = createLeaseDraft('ana', 'prop-02');
    await upsertLease(db, first.state, other);
    const a = await claimPayment(db, { leaseId: first.leaseId, sessionId: 's-one-deposit', kind: 'deposit', monthIndex: undefined });
    if (!a.claimed) throw new Error('claim should succeed');
    const b = await claimPayment(db, { leaseId: other.leaseId, sessionId: 's-one-deposit', kind: 'deposit', monthIndex: undefined });
    expect(b).toEqual({ claimed: false, status: 'other_lease_in_session' });
    // Rent is not limited by the deposit index.
    expect((await claimPayment(db, { leaseId: first.leaseId, sessionId: 's-one-deposit', kind: 'rent', monthIndex: 0 })).claimed).toBe(true);
    await releasePayment(db, a.id);
    expect((await claimPayment(db, { leaseId: other.leaseId, sessionId: 's-one-deposit', kind: 'deposit', monthIndex: undefined })).claimed).toBe(true);
  });
});
