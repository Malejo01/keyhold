// Route-level tests for POST /api/pay. The Solana transfer (executePayment) is mocked and counted; the
// database is a real Postgres (PGlite) with the committed migrations, so the unique constraints are real.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/db/pglite';
import { createLeaseDraft } from '../../../lib/agents/lease';
import type { PaymentIntent, PaymentResult, SessionState, SignedSession } from '../../../lib/contracts';
import { setDbForTests, type Db } from '../../../lib/db/client';
import { ensureReferenceData } from '../../../lib/db/reference';
import { payments, sessions } from '../../../lib/db/schema';
import { newSession, signSession } from '../../../lib/db/session';
import { getStoredVersion, touchSession } from '../../../lib/db/store';

const solana = vi.hoisted(() => ({ transfers: 0, failWith: [] as Error[] }));

vi.mock('@/lib/solana/pay', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/solana/pay')>();
  return {
    ...original,
    executePayment: vi.fn(async (intent: PaymentIntent): Promise<PaymentResult> => {
      const failure = solana.failWith.shift();
      if (failure) throw failure;
      solana.transfers += 1;
      await new Promise((r) => setTimeout(r, 25)); // keep concurrent requests overlapping
      return {
        kind: intent.kind,
        signature: `sig-${solana.transfers}-${Math.random().toString(36).slice(2)}`,
        explorerUrl: 'https://explorer.invalid/tx',
        blockTime: 1_800_000_000,
        amountBaseUnits: intent.listAmountBaseUnits,
        discountAppliedBps: 0,
        onTime: true,
        memo: original.buildMemo(intent),
      };
    }),
  };
});

// Imported after vi.mock so the route sees the mocked module.
const { POST } = await import('./route');
const { InsufficientFundsError } = await import('../../../lib/solana/pay');

const original = process.env.SESSION_SECRET;
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-123456';
  ({ db, close } = await createTestDb());
  await ensureReferenceData(db);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(async () => {
  vi.restoreAllMocks();
  if (original === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = original;
  await close();
});
beforeEach(() => {
  solana.transfers = 0;
  solana.failWith = [];
  setDbForTests(db);
});
afterEach(() => setDbForTests(undefined));

/** A session at PAYMENT stage with a lease, as the client would hold it after the contract step. */
function leaseSession(sessionId = crypto.randomUUID(), propertyId = 'prop-01'): SessionState {
  const lease = createLeaseDraft('ana', propertyId);
  return { ...newSession('ana'), sessionId, stage: 'PAYMENT', selectedPropertyId: propertyId, lease };
}

/** What the browser would do: JSON round trip of the signed blob. */
function blob(state: SessionState): SignedSession {
  return JSON.parse(JSON.stringify(signSession(state)));
}

// Response bodies are asserted field by field; a loose type keeps the tests readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function pay(kind: 'deposit' | 'rent', session: SignedSession): Promise<{ status: number; json: Json }> {
  const response = await POST(
    new Request('http://localhost/api/pay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, session }),
    }),
  );
  return { status: response.status, json: await response.json() };
}

describe('POST /api/pay with a database', () => {
  it('pays once, records the confirmed row and advances the stored session version', async () => {
    const state = leaseSession();
    const issued = blob(state); // version 1
    const res = await pay('deposit', issued);
    expect(res.status).toBe(200);
    expect(solana.transfers).toBe(1);

    const rows = await db.select().from(payments).where(eq(payments.leaseId, state.lease!.leaseId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'deposit', monthIndex: -1, status: 'confirmed', signature: res.json.result.signature });
    expect(res.json.session.state.version).toBe(2);
    expect(await getStoredVersion(db, state.sessionId)).toBe(2);
  });

  it('double-pay with the same session blob: second request is 409 and only one transfer is sent', async () => {
    const issued = blob(leaseSession());
    const first = await pay('deposit', issued);
    const second = await pay('deposit', issued);
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.json.error).toBe('Already paid');
    expect(solana.transfers).toBe(1);
  });

  it('a replayed pre-deposit blob cannot pay the deposit again after the session moved on (issue 1)', async () => {
    const preDeposit = blob(leaseSession()); // v1, no payments
    const first = await pay('deposit', preDeposit);
    expect(first.status).toBe(200);
    // The attacker keeps `preDeposit` and also holds the legitimate newer blob; both are replayed.
    const replayOld = await pay('deposit', preDeposit);
    const replayNew = await pay('deposit', first.json.session);
    expect(replayOld.status).toBe(409);
    expect(replayNew.status).toBe(409);
    expect(solana.transfers).toBe(1);
  });

  it('rejects an older session version with stale_session when nothing was paid for that slot', async () => {
    const state = leaseSession();
    const older = blob(state); // version 1
    // The server has meanwhile accepted a newer version of the same session.
    expect(await touchSession(db, { ...state, version: 7 })).toBe(true);
    const res = await pay('deposit', older);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('stale_session');
    expect(solana.transfers).toBe(0);
    expect(await db.select().from(payments).where(eq(payments.leaseId, state.lease!.leaseId))).toHaveLength(0);
  });

  it('concurrent double request: one wins, the other is 409, one transfer. The unique constraint decides across sessions', async () => {
    // Same lease, two different session ids: the in-process guard and the session version do not apply,
    // so only UNIQUE (lease_id, kind, month_index) stands between the two requests and a double transfer.
    const base = leaseSession();
    const a = blob({ ...base, sessionId: `${base.sessionId}-a` });
    const b = blob({ ...base, sessionId: `${base.sessionId}-b` });
    const [ra, rb] = await Promise.all([pay('deposit', a), pay('deposit', b)]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(solana.transfers).toBe(1);
    const rows = await db.select().from(payments).where(eq(payments.leaseId, base.lease!.leaseId));
    expect(rows).toHaveLength(1);
  });

  it('concurrent double request on the same session is also 200 + 409', async () => {
    const issued = blob(leaseSession());
    const results = await Promise.all([pay('deposit', issued), pay('deposit', issued), pay('deposit', issued)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(solana.transfers).toBe(1);
  });

  it('pays the deposit, then rent months in order, then refuses a replayed rent blob', async () => {
    const deposit = await pay('deposit', blob(leaseSession()));
    expect(deposit.status).toBe(200);
    const rent0 = await pay('rent', deposit.json.session);
    expect(rent0.status).toBe(200);
    expect(rent0.json.result.memo).toContain(':rent:0:');
    const rent1 = await pay('rent', rent0.json.session);
    expect(rent1.status).toBe(200);
    expect(rent1.json.result.memo).toContain(':rent:1:');
    const replay = await pay('rent', deposit.json.session); // older blob wants month 0 again
    expect(replay.status).toBe(409);
    expect(solana.transfers).toBe(3);
    const stored = await db.select().from(payments);
    expect(stored.filter((p) => p.leaseId === rent1.json.session.state.lease.leaseId && p.status === 'confirmed')).toHaveLength(3);
  });

  it('refuses a second lease in a session that already paid', async () => {
    const first = await pay('deposit', blob(leaseSession()));
    expect(first.status).toBe(200);
    const secondLease = createLeaseDraft('ana', 'prop-02');
    const forked: SessionState = { ...first.json.session.state, lease: secondLease, payments: [], stage: 'PAYMENT' };
    const res = await pay('deposit', blob(forked));
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('other_lease_paid');
    expect(solana.transfers).toBe(1);
  });

  it('frees the slot when the tenant wallet cannot pay (nothing was sent) so a retry works', async () => {
    const issued = blob(leaseSession());
    solana.failWith = [new InsufficientFundsError()];
    const failed = await pay('deposit', issued);
    expect(failed.status).toBe(409);
    expect(solana.transfers).toBe(0);
    const retry = await pay('deposit', issued);
    expect(retry.status).toBe(200);
    expect(solana.transfers).toBe(1);
  });

  it('keeps the claim after an ambiguous failure so a retry cannot send a second transfer', async () => {
    const state = leaseSession();
    const issued = blob(state);
    solana.failWith = [new Error('RPC timeout while confirming')];
    const failed = await pay('deposit', issued);
    expect(failed.status).toBe(502);
    const [row] = await db.select().from(payments).where(eq(payments.leaseId, state.lease!.leaseId));
    expect(row.status).toBe('pending');
    const retry = await pay('deposit', issued);
    expect(retry.status).toBe(409);
    expect(retry.json.code).toBe('in_progress');
    expect(solana.transfers).toBe(0);
  });

  it('refuses to pay (503) when the database is unreachable instead of paying without the lock', async () => {
    const broken = new Proxy({}, { get: () => () => { throw new Error('connection refused'); } }) as unknown as Db;
    setDbForTests(broken);
    const res = await pay('deposit', blob(leaseSession()));
    expect(res.status).toBe(503);
    expect(solana.transfers).toBe(0);
  });

  it('persists the session row for the agency view', async () => {
    const state = leaseSession();
    await pay('deposit', blob(state));
    const [row] = await db.select().from(sessions).where(eq(sessions.id, state.sessionId));
    expect(row).toMatchObject({ tenantId: 'ana', selectedPropertyId: 'prop-01' });
  });
});

describe('POST /api/pay without DATABASE_URL (fallback)', () => {
  beforeEach(() => setDbForTests(null));

  it('behaves like before: pays once per signed blob and refuses the deposit again from the updated blob', async () => {
    const first = await pay('deposit', blob(leaseSession()));
    expect(first.status).toBe(200);
    expect(first.json.session.state.version).toBe(2); // version is still stamped without storage
    const again = await pay('deposit', first.json.session);
    expect(again.status).toBe(409);
    expect(again.json.error).toBe('Deposit already paid');
    expect(solana.transfers).toBe(1);
  });

  it('concurrent double submit of the same blob is still stopped by the in-process guard', async () => {
    const issued = blob(leaseSession());
    const results = await Promise.all([pay('deposit', issued), pay('deposit', issued)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(solana.transfers).toBe(1);
  });

  it('documents the known limitation: an old blob replayed sequentially is NOT blocked without a database', async () => {
    const preDeposit = blob(leaseSession());
    expect((await pay('deposit', preDeposit)).status).toBe(200);
    expect((await pay('deposit', preDeposit)).status).toBe(200);
    expect(solana.transfers).toBe(2);
  });

  it('a tampered blob is still a 401', async () => {
    const issued = blob(leaseSession());
    issued.state.stage = 'ACTIVE';
    const res = await pay('deposit', issued);
    expect(res.status).toBe(401);
    expect(solana.transfers).toBe(0);
  });
});
