// Server-only helpers shared by the JSON API routes (chat, lease, verify).
import type { z } from 'zod';
import type { SessionState } from '../contracts';
import { getDb } from './client';
import { getStoredVersion } from './store';
import { ExpiredSessionError, InvalidSessionError, SessionConfigError, StaleSessionError } from './session';

/** Upper bound for a request body. Session blobs carry the chat history and contract text. */
const MAX_BODY_BYTES = 512 * 1024;

export function jsonError(error: string, status: number, headers?: Record<string, string>): Response {
  return Response.json({ error }, { status, headers });
}

/** Reads and validates a JSON body. Returns the parsed data or a ready-made error Response. */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError('Request body too large', 413) };
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: jsonError('Could not read request body', 400) };
  }
  if (raw.length > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError('Request body too large', 413) };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, response: jsonError('Invalid JSON body', 400) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` at "${issue.path.join('.')}"` : '';
    return { ok: false, response: jsonError(`Invalid request${where}: ${issue?.message ?? 'bad body'}`, 400) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Maps session errors to responses: bad signature -> 401, misconfigured secret -> 500
 * (message kept generic so nothing about the secret leaks). Returns null for other errors.
 */
export function sessionErrorResponse(err: unknown): Response | null {
  if (err instanceof ExpiredSessionError) return jsonError('Session expired', 401);
  if (err instanceof InvalidSessionError) return jsonError('Invalid session', 401);
  if (err instanceof StaleSessionError) return Response.json({ error: err.message, code: 'stale_session' }, { status: 409 });
  if (err instanceof SessionConfigError) {
    console.error('[session] misconfiguration:', err.message);
    return jsonError('Server misconfigured', 500);
  }
  return null;
}

/**
 * Replay protection for routes that do not pay: with a database, a blob older than the latest stored version
 * of its session is refused (409). Returns null when persistence is off, when the blob is current, or when the
 * database is unreachable (these routes fail open and log; /api/pay fails closed).
 */
export async function staleSessionResponse(state: SessionState): Promise<Response | null> {
  const db = getDb();
  if (!db) return null;
  try {
    if ((state.version ?? 0) < (await getStoredVersion(db, state.sessionId))) {
      return sessionErrorResponse(new StaleSessionError());
    }
  } catch (err) {
    logError('session.stale-check', err);
  }
  return null;
}

/** Logs only the error message, never request bodies, sessions or env values. */
export function logError(scope: string, err: unknown): void {
  console.error(`[${scope}]`, err instanceof Error ? err.message : 'unknown error');
}
