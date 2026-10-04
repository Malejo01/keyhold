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
