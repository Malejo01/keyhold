// Server-only module: uses SESSION_SECRET and node:crypto. Never import it from a Client Component.
// (The `server-only` package is not installed in this repo, so this comment is the guard.)
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SessionState, SignedSession, TenantId } from '../contracts';

const MIN_SECRET_LENGTH = 32;

/** Thrown when the session signature is missing, malformed or does not match. Routes map it to HTTP 401. */
export class InvalidSessionError extends Error {
  readonly status = 401;
  constructor(message = 'Invalid session signature') {
    super(message);
    this.name = 'InvalidSessionError';
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

export function signSession(state: SessionState): SignedSession {
  return { state, sig: hmacHex(state) };
}

/**
 * Returns the verified state. `undefined` yields a brand-new session.
 * Throws InvalidSessionError on a bad signature and SessionConfigError when the secret is unusable.
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
  return signed.state;
}
