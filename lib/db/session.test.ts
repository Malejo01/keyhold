import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ExpiredSessionError,
  InvalidSessionError,
  SessionConfigError,
  newSession,
  signSession,
  verifySession,
} from './session';

const original = process.env.SESSION_SECRET;

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-123456';
});
afterAll(() => {
  if (original === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = original;
});

describe('session signing', () => {
  it('round-trips a signed state, even after a JSON round-trip with key reordering', () => {
    const state = newSession('ana');
    state.history.push({ role: 'user', text: 'hola' });
    const signed = signSession(state);
    const viaJson = JSON.parse(JSON.stringify(signed));
    expect(verifySession(viaJson)).toEqual(signed.state);
    expect(signed.state).toMatchObject({ ...state, version: 1 });
    const reordered = { sig: signed.sig, state: Object.fromEntries(Object.entries(signed.state).reverse()) };
    expect(() => verifySession(reordered as never)).not.toThrow();
  });

  it('creates a fresh SEARCH session for undefined', () => {
    const a = verifySession(undefined);
    const b = verifySession(undefined);
    expect(a.stage).toBe('SEARCH');
    expect(a.payments).toEqual([]);
    expect(a.history).toEqual([]);
    expect(a.sessionId).not.toBe(b.sessionId);
  });

  it('rejects a tampered state', () => {
    const signed = signSession(newSession('bruno'));
    const tampered = { ...signed, state: { ...signed.state, stage: 'ACTIVE' as const } };
    expect(() => verifySession(tampered)).toThrow(InvalidSessionError);
  });

  it('rejects a tampered or malformed signature', () => {
    const signed = signSession(newSession());
    const flipped = (signed.sig[0] === 'a' ? 'b' : 'a') + signed.sig.slice(1);
    expect(() => verifySession({ ...signed, sig: flipped })).toThrow(InvalidSessionError);
    expect(() => verifySession({ ...signed, sig: '' })).toThrow(InvalidSessionError);
    expect(() => verifySession({ ...signed, sig: 'zz' })).toThrow(InvalidSessionError);
    expect(() => verifySession({ ...signed, sig: signed.sig + '00' })).toThrow(InvalidSessionError);
  });

  it('rejects a signature made with another secret', () => {
    const signed = signSession(newSession());
    process.env.SESSION_SECRET = 'another-secret-another-secret-another-1234';
    try {
      expect(() => verifySession(signed)).toThrow(InvalidSessionError);
    } finally {
      process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-123456';
    }
  });

  it('throws a clear error when the secret is missing or too short', () => {
    const prev = process.env.SESSION_SECRET;
    try {
      process.env.SESSION_SECRET = 'short';
      expect(() => signSession(newSession())).toThrow(SessionConfigError);
      delete process.env.SESSION_SECRET;
      expect(() => signSession(newSession())).toThrow(/SESSION_SECRET/);
    } finally {
      process.env.SESSION_SECRET = prev;
    }
  });
});

describe('session version and issuedAt (AD-11b)', () => {
  const NOW = Date.now();

  it('increases the version by one on every signing and does not mutate the input', () => {
    const state = newSession('ana');
    const v1 = signSession(state, NOW);
    expect(state.version).toBeUndefined();
    expect(v1.state).toMatchObject({ version: 1, issuedAt: NOW });
    const v2 = signSession(verifySession(JSON.parse(JSON.stringify(v1))), NOW + 1000);
    expect(v2.state).toMatchObject({ version: 2, issuedAt: NOW + 1000 });
  });

  it('a client cannot lower the version or move issuedAt without breaking the signature', () => {
    const signed = signSession(signSession(newSession(), NOW).state, NOW);
    expect(signed.state.version).toBe(2);
    expect(() => verifySession({ ...signed, state: { ...signed.state, version: 1 } })).toThrow(InvalidSessionError);
    expect(() => verifySession({ ...signed, state: { ...signed.state, issuedAt: Date.now() } })).toThrow(
      InvalidSessionError,
    );
  });

  it('accepts a legacy blob without version and issuedAt (recorded demo, open tabs)', () => {
    const legacy = newSession('bruno');
    // Signed the way the pre-AD-11b server did: same canonical JSON, no version/issuedAt.
    const legacySigned = { state: legacy, sig: legacyHmac(legacy) };
    expect(verifySession(legacySigned).sessionId).toBe(legacy.sessionId);
  });

  it('rejects a blob older than the max age and one issued in the future', () => {
    const old = signSession(newSession(), Date.now() - 8 * 24 * 3600 * 1000);
    expect(() => verifySession(old)).toThrow(ExpiredSessionError);
    const future = signSession(newSession(), Date.now() + 60 * 60 * 1000);
    expect(() => verifySession(future)).toThrow(ExpiredSessionError);
    const recent = signSession(newSession(), Date.now() - 6 * 24 * 3600 * 1000);
    expect(() => verifySession(recent)).not.toThrow();
  });

  it('honours SESSION_MAX_AGE_HOURS', () => {
    process.env.SESSION_MAX_AGE_HOURS = '1';
    try {
      expect(() => verifySession(signSession(newSession(), Date.now() - 2 * 3600 * 1000))).toThrow(ExpiredSessionError);
      expect(() => verifySession(signSession(newSession(), Date.now() - 30 * 60 * 1000))).not.toThrow();
    } finally {
      delete process.env.SESSION_MAX_AGE_HOURS;
    }
  });
});

/** HMAC the way the pre-AD-11b server computed it: same canonical JSON, no version/issuedAt. */
function legacyHmac(state: object): string {
  const canon = (v: unknown): string =>
    v === null || typeof v !== 'object'
      ? (JSON.stringify(v) ?? 'null')
      : Array.isArray(v)
        ? `[${v.map(canon).join(',')}]`
        : `{${Object.keys(v as object)
            .sort()
            .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
            .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
            .join(',')}}`;
  return createHmac('sha256', process.env.SESSION_SECRET as string).update(canon(state)).digest('hex');
}
