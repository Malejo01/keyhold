import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../tests/db/pglite';
import { setDbForTests, type Db } from './client';
import { staleSessionResponse } from './http';
import { ensureReferenceData } from './reference';
import { newSession } from './session';
import { touchSession } from './store';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await ensureReferenceData(db);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => setDbForTests(undefined));
afterAll(async () => {
  vi.restoreAllMocks();
  await close();
});

describe('staleSessionResponse (chat and lease replay guard)', () => {
  it('is a no-op without a database', async () => {
    setDbForTests(null);
    expect(await staleSessionResponse({ ...newSession('ana'), version: 1 })).toBeNull();
  });

  it('refuses an older version with 409 stale_session and accepts the current one', async () => {
    setDbForTests(db);
    const state = { ...newSession('ana'), version: 4 };
    expect(await touchSession(db, state)).toBe(true);
    expect(await staleSessionResponse(state)).toBeNull();
    expect(await staleSessionResponse({ ...state, version: 5 })).toBeNull();
    const stale = await staleSessionResponse({ ...state, version: 3 });
    expect(stale?.status).toBe(409);
    expect(await stale?.json()).toMatchObject({ code: 'stale_session' });
  });

  it('lets a legacy blob through for an unknown session', async () => {
    setDbForTests(db);
    expect(await staleSessionResponse(newSession('bruno'))).toBeNull();
  });

  it('fails open (and logs) when the database is unreachable', async () => {
    setDbForTests(new Proxy({}, { get: () => () => { throw new Error('down'); } }) as unknown as Db);
    expect(await staleSessionResponse({ ...newSession('ana'), version: 1 })).toBeNull();
  });
});

describe('describeError / logError (no bound parameters in logs)', () => {
  it('logs the driver cause of a failed query, never its SQL parameters', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    const { upsertLease } = await import('./store');
    const { createLeaseDraft } = await import('../agents/lease');
    const { logError } = await import('./http');
    const lease = createLeaseDraft('ana', 'prop-01');
    const state = { ...newSession('ana'), lease };
    await upsertLease(db, state, lease).catch((err) => logError('lease.persist', err)); // FK: no session row
    const out = lines.join('\n');
    expect(out).toContain('database query failed');
    expect(out).toContain('foreign key');
    expect(out).not.toContain(state.sessionId);
    expect(out).not.toContain(lease.contractText.slice(0, 30));
  });

  it('cuts a parameter dump from any other error message', async () => {
    const { describeError } = await import('./http');
    expect(describeError(new Error('boom\nparams: secret-value'))).toBe('boom');
    expect(describeError('x')).toBe('unknown error');
  });
});
