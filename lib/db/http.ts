// Server-only helpers shared by the JSON API routes (chat, lease, verify).
import type { z } from 'zod';
import { InvalidSessionError, SessionConfigError } from './session';

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
  if (err instanceof InvalidSessionError) return jsonError('Invalid session', 401);
  if (err instanceof SessionConfigError) {
    console.error('[session] misconfiguration:', err.message);
    return jsonError('Server misconfigured', 500);
  }
  return null;
}

/** Logs only the error message, never request bodies, sessions or env values. */
export function logError(scope: string, err: unknown): void {
  console.error(`[${scope}]`, err instanceof Error ? err.message : 'unknown error');
}
