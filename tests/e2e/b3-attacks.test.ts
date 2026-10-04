// QA attack tests for block B3 (persistence + idempotent /api/pay). Owned by qa-security-reviewer.
// See docs/reviews/b3-db.md. The Solana transfer is mocked and counted; the database is PGlite with the
// committed migrations, so the constraints are real.
//
// `it.fails` marks a property the code does NOT have yet (a reviewed finding). When the owner fixes it, the
// test turns red: drop `.fails` and keep it as a regression test.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../db/pglite';
import { createLeaseDraft } from '../../lib/agents/lease';
import type { PaymentIntent, PaymentResult, SessionState, SignedSession } from '../../lib/contracts';
import type { Db } from '../../lib/db/client';
import { payments } from '../../lib/db/schema';
import { newSession, signSession } from '../../lib/db/session';

const solana = vi.hoisted(() => ({ transfers: 0, failWith: [] as Error[] }));

vi.mock('@/lib/solana/pay', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/solana/pay')>();
  return {
    ...original,
    executePayment: vi.fn(async (intent: PaymentIntent): Promise<PaymentResult> => {
      const failure = solana.failWith.shift();
      if (failure) throw failure;
      solana.transfers += 1;
      await new Promise((r) => setTimeout(r, 25));
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

// Two copies of the route + db client = two serverless instances (separate in-flight guards, same database).
const instanceA = { route: await import('../../app/api/pay/route'), client: await import('../../lib/db/client') };
vi.resetModules();
const instanceB = { route: await import('../../app/api/pay/route'), client: await import('../../lib/db/client') };
const { logError } = await import('../../lib/db/http');
const { upsertLease } = await import('../../lib/db/store');

const originalSecret = process.env.SESSION_SECRET;
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  process.env.SESSION_SECRET = 'qa-secret-qa-secret-qa-secret-qa-secret-1';
  ({ db, close } = await createTestDb());
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(async () => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
  await close();
});
beforeEach(() => {
  solana.transfers = 0;
  solana.failWith = [];
  instanceA.client.setDbForTests(db);
  instanceB.client.setDbForTests(db);
});
afterEach(() => {
  instanceA.client.setDbForTests(undefined);
  instanceB.client.setDbForTests(undefined);
});

function leaseSession(sessionId = crypto.randomUUID(), propertyId = 'prop-01'): SessionState {
  const lease = createLeaseDraft('ana', propertyId);
  return { ...newSession('ana'), sessionId, stage: 'PAYMENT', selectedPropertyId: propertyId, lease };
}

function blob(state: SessionState): SignedSession {
  return JSON.parse(JSON.stringify(signSession(state)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function pay(
  kind: 'deposit' | 'rent',
  session: SignedSession,
  instance = instanceA,
): Promise<{ status: number; json: Json }> {
  const res = await instance.route.POST(
    new Request('http://localhost/api/pay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, session }),
    }),
  );
  return { status: res.status, json: await res.json() };
}

describe('B3 attacks on /api/pay with a database', () => {
  it('two instances, same lease, same blob: exactly one transfer (unique constraint is the arbiter)', async () => {
    const issued = blob(leaseSession());
    const results = await Promise.all([
      pay('deposit', issued, instanceA),
      pay('deposit', issued, instanceB),
      pay('deposit', issued, instanceA),
      pay('deposit', issued, instanceB),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(solana.transfers).toBe(1);
  });

  // Finding B3-1: errors raised BEFORE anything is sent (RPC 429 on the balance read, blockhash fetch, missing
  // keypair env) are treated as ambiguous, so the slot stays `pending` forever and the lease cannot be paid.
  it.fails('a failure before the transfer is sent (RPC 429 on the balance read) does not lock the slot', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const issued = blob(leaseSession());
    solana.failWith = [new Error('429 Too Many Requests')]; // what getAccount() throws on a devnet rate limit
    expect((await pay('deposit', issued)).status).toBe(502);
    const retry = await pay('deposit', issued);
    expect(retry.status).toBe(200);
  });

  // Finding B3-3 (documented limitation): the transfer landed and was recorded, but the response was lost. The
  // client still holds the pre-payment blob; the retry is refused (good: no second transfer) and returns no
  // session, so the client cannot move on to rent without starting over.
  it('lost response: the retry is refused without a second transfer, but carries no recoverable session', async () => {
    const preDeposit = blob(leaseSession());
    expect((await pay('deposit', preDeposit)).status).toBe(200);
    const retry = await pay('deposit', preDeposit);
    expect(retry.status).toBe(409);
    expect(retry.json.code).toBe('already_paid');
    expect(retry.json.session).toBeUndefined();
    expect(solana.transfers).toBe(1);
  });

  // Finding B3-4: "one paid lease per session" is a read-then-write check. Across two instances, two leases of
  // the same session can both pass it. Not a money-safety boundary (anyone can open a new session), but the ADR
  // states it as a rule.
  it.fails('two instances cannot pay deposits for two different leases of the same session', async () => {
    const sessionId = crypto.randomUUID();
    const a = blob(leaseSession(sessionId, 'prop-01'));
    const b = blob(leaseSession(sessionId, 'prop-02'));
    const [ra, rb] = await Promise.all([pay('deposit', a, instanceA), pay('deposit', b, instanceB)]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    expect(solana.transfers).toBe(1);
  });

  it('a forged lower version or later issuedAt breaks the HMAC (401), no DB write, no transfer', async () => {
    const issued = blob(leaseSession());
    const forged = structuredClone(issued);
    forged.state.version = 999;
    const res = await pay('deposit', forged);
    expect(res.status).toBe(401);
    const forged2 = structuredClone(issued);
    forged2.state.issuedAt = Date.now() + 1;
    expect((await pay('deposit', forged2)).status).toBe(401);
    expect(solana.transfers).toBe(0);
    expect(await db.select().from(payments).where(eq(payments.leaseId, issued.state.lease!.leaseId))).toHaveLength(0);
  });

  it('SQL metacharacters in a server-signed field are stored as data (drizzle binds parameters)', async () => {
    const state = leaseSession(`x'); drop table payments; --`);
    const res = await pay('deposit', blob(state));
    expect(res.status).toBe(200);
    expect(await db.select().from(payments)).not.toHaveLength(0);
  });
});

describe('B3 logging', () => {
  // Finding B3-2: logError() logs err.message. drizzle-orm 0.45 wraps every failed query in DrizzleQueryError whose
  // message is "Failed query: <sql>\nparams: <params>", so the bound values (contract text, session id, crosscheck
  // evidence) reach the server logs. The real cause (err.cause) is dropped.
  it.fails('a failed query does not write bound parameters to the logs', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    const state = leaseSession(); // no session row -> FK violation on insert
    try {
      await upsertLease(db, state, state.lease!);
    } catch (err) {
      logError('lease.persist', err);
    }
    expect(lines.join('\n')).not.toContain('RESIDENTIAL LEASE AGREEMENT');
    expect(lines.join('\n')).not.toContain(state.sessionId);
  });
});
