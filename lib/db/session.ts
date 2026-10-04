// Server-only module: uses SESSION_SECRET and node:crypto. Never import it from a Client Component.
// (The `server-only` package is not installed in this repo, so this comment is the guard.)
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SessionState, SignedSession, TenantId } from '../contracts';

const MIN_SECRET_LENGTH = 32;
/** A blob issued further in the future than this (clock skew allowance) is rejected. */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
/** Default lifetime of a signed session blob. Override with SESSION_MAX_AGE_HOURS. */
const DEFAULT_MAX_AGE_HOURS = 24 * 7;

/** Thrown when the session signature is missing, malformed or does not match. Routes map it to HTTP 401. */
export class InvalidSessionError extends Error {
  readonly status = 401;
  constructor(message = 'Invalid session signature') {
    super(message);
    this.name = 'InvalidSessionError';
  }
}

/** The blob is signed correctly but too old or issued in the future. Same HTTP 401 as a bad signature. */
export class ExpiredSessionError extends InvalidSessionError {
  constructor(message = 'Session expired') {
    super(message);
    this.name = 'ExpiredSessionError';
  }
}

/**
 * The blob is genuine but a newer version of the same session exists on the server (replay of an old blob).
 * Needs persistence; routes map it to HTTP 409.
 */
export class StaleSessionError extends Error {
  readonly status = 409;
  constructor(message = 'This session is out of date. Start over to continue.') {
    super(message);
    this.name = 'StaleSessionError';
  }
}

/** Thrown when SESSION_SECRET is missing or too short. This is a server misconfiguration (HTTP 500). */
export class SessionConfigError extends Error {
  readonly status = 500;
  constructor(message: string) {
    super(message);
    this.name = 'SessionConfigError';
  }
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new SessionConfigError(
      `SESSION_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters long`,
    );
  }
  return secret;
}

/**
 * Deterministic JSON: object keys sorted recursively, `undefined` properties dropped
 * (same as JSON.stringify would), so the signature survives a client JSON round-trip.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    // JSON.stringify(undefined) is undefined; only reachable for top-level or array members.
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(obj).sort()) {
    if (obj[key] === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${canonicalize(obj[key])}`);
  }
  return `{${parts.join(',')}}`;
}

function hmacHex(state: SessionState): string {
  return createHmac('sha256', getSecret()).update(canonicalize(state)).digest('hex');
}

/** A fresh session at the SEARCH stage with a random opaque id. */
export function newSession(tenantId?: TenantId): SessionState {
  const state: SessionState = {
    sessionId: randomUUID(),
    stage: 'SEARCH',
    payments: [],
    history: [],
  };
  if (tenantId) state.tenantId = tenantId;
  return state;
}

function maxAgeMs(): number {
  const hours = Number(process.env.SESSION_MAX_AGE_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_MAX_AGE_HOURS) * 60 * 60 * 1000;
}

/**
 * Stamps the state with the next monotonic `version` and the server time (`issuedAt`), then signs it.
 * The input object is not mutated; the stamped copy is returned in `state`.
 */
export function signSession(state: SessionState, now: number = Date.now()): SignedSession {
  const stamped: SessionState = { ...state, version: (state.version ?? 0) + 1, issuedAt: now };
  return { state: stamped, sig: hmacHex(stamped) };
}

/**
 * Checks that need no storage. Blobs issued before AD-11b carry no issuedAt/version and are accepted
 * (version 0, no age limit) so the recorded demo and open tabs keep working.
 */
function assertFreshEnough(state: SessionState, now: number = Date.now()): void {
  const { issuedAt, version } = state;
  if (version !== undefined && (!Number.isInteger(version) || version < 0)) {
    throw new InvalidSessionError('Malformed session');
  }
  if (issuedAt === undefined) return;
  if (!Number.isFinite(issuedAt) || issuedAt > now + MAX_FUTURE_SKEW_MS) {
    throw new ExpiredSessionError('Session issued in the future');
  }
  if (now - issuedAt > maxAgeMs()) throw new ExpiredSessionError();
}

/**
 * Returns the verified state. `undefined` yields a brand-new session.
 * Throws InvalidSessionError on a bad signature (ExpiredSessionError when too old) and
 * SessionConfigError when the secret is unusable.
 */
export function verifySession(signed: SignedSession | undefined): SessionState {
  if (signed === undefined) return newSession();
  if (
    !signed ||
    typeof signed !== 'object' ||
    typeof signed.sig !== 'string' ||
    !signed.state ||
    typeof signed.state !== 'object'
  ) {
    throw new InvalidSessionError('Malformed session');
  }
  const expected = Buffer.from(hmacHex(signed.state), 'hex');
  const given = Buffer.from(signed.sig, 'hex');
  // Buffer.from(..., 'hex') silently truncates bad input, so require an exact 32-byte digest.
  if (given.length !== expected.length || signed.sig.length !== expected.length * 2) {
    throw new InvalidSessionError();
  }
  if (!timingSafeEqual(expected, given)) {
    throw new InvalidSessionError();
  }
  assertFreshEnough(signed.state);
  return signed.state;
}
