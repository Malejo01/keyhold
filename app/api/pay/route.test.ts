// Route-level tests for POST /api/pay. The Solana steps (prepare, send, reconcile check) are mocked and counted; the
// database is a real Postgres (PGlite) with the committed migrations, so the unique constraints are real.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/db/pglite';
import { createLeaseDraft } from '../../../lib/agents/lease';
import type { SessionState, SignedSession } from '../../../lib/contracts';
import { setDbForTests, type Db } from '../../../lib/db/client';
import { ensureReferenceData } from '../../../lib/db/reference';
import { payments, sessions } from '../../../lib/db/schema';
import { newSession, signSession } from '../../../lib/db/session';
import { claimPayment, getStoredVersion, touchSession, upsertLease } from '../../../lib/db/store';
import { resetSolanaState, type SolanaMockState } from '../../../tests/helpers/solana-mock';

const solana = vi.hoisted(
  (): SolanaMockState => ({ transfers: 0, prepares: 0, prepareFail: [], sendFail: [], checks: [], landed: new Set() }),
);

vi.mock('@/lib/solana/pay', async (importOriginal) => {
  const { solanaMockModule } = await import('../../../tests/helpers/solana-mock');
  return solanaMockModule(await importOriginal<typeof import('../../../lib/solana/pay')>(), solana);
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
  resetSolanaState(solana);
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
    solana.prepareFail = [new InsufficientFundsError()];
    const failed = await pay('deposit', issued);
    expect(failed.status).toBe(409);
    expect(solana.transfers).toBe(0);
    const retry = await pay('deposit', issued);
    expect(retry.status).toBe(200);
    expect(solana.transfers).toBe(1);
  });

  it('B3-1: any failure before the send (RPC 429, blockhash, missing key) frees the claim and a retry pays once', async () => {
    const state = leaseSession();
    const issued = blob(state);
    solana.prepareFail = [new Error('429 Too Many Requests')];
    expect((await pay('deposit', issued)).status).toBe(502);
    expect(await db.select().from(payments).where(eq(payments.leaseId, state.lease!.leaseId))).toHaveLength(0);
    const retry = await pay('deposit', issued);
    expect(retry.status).toBe(200);
    expect(solana.transfers).toBe(1);
  });

  it('stores the signature on the pending row BEFORE the send result is known', async () => {
    const state = leaseSession();
    solana.sendFail = [{ error: new Error('RPC timeout'), landed: false }];
    const failed = await pay('deposit', blob(state));
    expect(failed.status).toBe(502);
    expect(failed.json.code).toBe('pending_confirmation');
    const [row] = await db.select().from(payments).where(eq(payments.leaseId, state.lease!.leaseId));
    expect(row.status).toBe('pending');
    expect(row.signature).toMatch(/^sig-/);
    expect(row.lastValidBlockHeight).toBe(1000);
    expect(row.memo).toContain(':deposit:');
  });

  it('keeps the claim after an ambiguous send and answers in_progress while the tx could still land', async () => {
    const state = leaseSession();
    const issued = blob(state);
    solana.sendFail = [{ error: new Error('RPC timeout while confirming'), landed: false }];
    const failed = await pay('deposit', issued);
    expect(failed.status).toBe(502);
    const [row] = await db.select().from(payments).where(eq(payments.leaseId, state.lease!.leaseId));
    expect(row.status).toBe('pending');
    const retry = await pay('deposit', issued); // not on chain, blockhash still valid
    expect(retry.status).toBe(409);
    expect(retry.json.code).toBe('in_progress');
    expect(solana.transfers).toBe(0);
    expect(solana.prepares).toBe(1); // no second transaction was even built
  });

  it('B3-1 reconcile: the send failed after the tx landed; the retry confirms it, returns the receipt, no second transfer', async () => {
    const state = leaseSession();
    const issued = blob(state);
    solana.sendFail = [{ error: new Error('fetch failed after send'), landed: true }];
    expect((await pay('deposit', issued)).status).toBe(502);
    expect(solana.transfers).toBe(1);
    const retry = await pay('deposit', issued);
    expect(retry.status).toBe(200);
    expect(retry.json.result.signature).toMatch(/^sig-1-/);
    expect(retry.json.session.state.payments).toHaveLength(1);
    expect(solana.transfers).toBe(1);
    expect(solana.prepares).toBe(1);
    const [row] = await db.select().from(payments).where(eq(payments.leaseId, state.lease!.leaseId));
    expect(row).toMatchObject({ status: 'confirmed', signature: retry.json.result.signature });
    // The recovered session is usable: rent can follow.
    const rent = await pay('rent', retry.json.session);
    expect(rent.status).toBe(200);
    expect(solana.transfers).toBe(2);
  });

  it('B3-1 reconcile: not found and the blockhash expired; the retry releases the claim and pays once', async () => {
    const state = leaseSession();
    const issued = blob(state);
    solana.sendFail = [{ error: new Error('socket hang up'), landed: false }];
    expect((await pay('deposit', issued)).status).toBe(502);
    solana.checks = ['expired'];
    const retry = await pay('deposit', issued);
    expect(retry.status).toBe(200);
    expect(solana.transfers).toBe(1);
    expect(solana.prepares).toBe(2);
    const rows = await db.select().from(payments).where(eq(payments.leaseId, state.lease!.leaseId));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('confirmed');
  });

  it('B3-1 reconcile: a tx that failed on chain moved no tokens, so the claim is released', async () => {
    const issued = blob(leaseSession());
    solana.sendFail = [{ error: new Error('failed on chain'), landed: false }];
    expect((await pay('deposit', issued)).status).toBe(502);
    solana.checks = ['failed'];
    expect((await pay('deposit', issued)).status).toBe(200);
    expect(solana.transfers).toBe(1);
  });

  it('B3-1 reconcile: an unreachable RPC keeps the claim (503) instead of guessing', async () => {
    const state = leaseSession();
    const issued = blob(state);
    solana.sendFail = [{ error: new Error('timeout'), landed: true }];
    expect((await pay('deposit', issued)).status).toBe(502);
    solana.checks = [new Error('429 Too Many Requests')];
    const retry = await pay('deposit', issued);
    expect(retry.status).toBe(503);
    expect(retry.json.code).toBe('reconcile_unavailable');
    const [row] = await db.select().from(payments).where(eq(payments.leaseId, state.lease!.leaseId));
    expect(row.status).toBe('pending');
    expect(solana.transfers).toBe(1);
    // RPC is back: it confirms (landed), still no second transfer.
    expect((await pay('deposit', issued)).status).toBe(200);
    expect(solana.transfers).toBe(1);
  });

  it('a pending claim with no signature is released only once it is old enough (the request died before signing)', async () => {
    const state = leaseSession();
    const issued = blob(state);
    // Simulate a crash between the claim and the signature: a bare pending row.
    await touchSession(db, state);
    await upsertLease(db, state, state.lease!);
    const claim = await claimPayment(db, {
      leaseId: state.lease!.leaseId,
      sessionId: state.sessionId,
      kind: 'deposit',
      monthIndex: undefined,
    });
    expect(claim.claimed).toBe(true);
    const fresh = await pay('deposit', issued);
    expect(fresh.status).toBe(409);
    expect(fresh.json.code).toBe('in_progress');
    await db
      .update(payments)
      .set({ createdAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(payments.leaseId, state.lease!.leaseId));
    const later = await pay('deposit', issued);
    expect(later.status).toBe(200);
    expect(solana.transfers).toBe(1);
  });

  it('frees the claim when the signature cannot be stored (nothing was sent)', async () => {
    const state = leaseSession();
    // A database that fails on UPDATE only: the claim insert works, storing the attempt does not.
    const flaky = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'update') {
          return () => {
            throw new Error('connection reset');
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    setDbForTests(flaky as Db);
    const res = await pay('deposit', blob(state));
    expect(res.status).toBe(503);
    expect(solana.transfers).toBe(0);
    expect(solana.prepares).toBe(1);
    setDbForTests(db);
    expect(await db.select().from(payments).where(eq(payments.leaseId, state.lease!.leaseId))).toHaveLength(0);
  });

  it('B3-4: two leases of one session cannot both hold a deposit claim (database constraint)', async () => {
    const sessionId = crypto.randomUUID();
    const a = leaseSession(sessionId, 'prop-01');
    const b = leaseSession(sessionId, 'prop-02');
    await touchSession(db, a);
    await upsertLease(db, a, a.lease!);
    await upsertLease(db, b, b.lease!);
    const first = await claimPayment(db, { leaseId: a.lease!.leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    const second = await claimPayment(db, { leaseId: b.lease!.leaseId, sessionId, kind: 'deposit', monthIndex: undefined });
    expect(first.claimed).toBe(true);
    expect(second).toEqual({ claimed: false, status: 'other_lease_in_session' });
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
