import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
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
    expect(verifySession(viaJson)).toEqual(state);
    const reordered = { sig: signed.sig, state: Object.fromEntries(Object.entries(state).reverse()) };
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
