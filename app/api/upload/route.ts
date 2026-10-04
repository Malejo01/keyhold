import type { ChatResponse } from '@/lib/contracts';
import { AiRefusalError, aiMode, ReplayMissError } from '@/lib/ai';
import { runDocumentsUpload } from '@/lib/agents/orchestrator';
import {
  MAX_UPLOAD_TOTAL_BYTES,
  UploadError,
  assertUploadLimits,
  toUploadedDocument,
  type UploadedDocument,
} from '@/lib/agents/uploads';
import { langSchema, uploadSessionFieldSchema } from '@/lib/db/schemas';
import { signSession, verifySession } from '@/lib/db/session';
import { jsonError, logError, sessionErrorResponse } from '@/lib/db/http';

export const runtime = 'nodejs';
/** Two sequential multimodal calls (prequal, then crosscheck). */
export const maxDuration = 60;

/**
 * POST /api/upload (multipart/form-data): `session` (JSON) + `files` (1..6 images/PDFs, 4 MB in total).
 * Files are read into memory, type-checked by magic bytes, evaluated and dropped: nothing is written to disk or public/.
 */

// Same best-effort in-memory limiter as /api/chat (per warm instance). Live uploads cost two model calls each.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_LIVE = 8;
const MAX_REQUESTS_REPLAY = 40;
const hits = new Map<string, number[]>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function checkRateLimit(ip: string, now: number): number {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  const max = aiMode() === 'replay' ? MAX_REQUESTS_REPLAY : MAX_REQUESTS_LIVE;
  if (recent.length >= max) {
    hits.set(ip, recent);
    return Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000));
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
  }
  return 0;
}

/** multipart envelope overhead allowed on top of the file bytes. */
const ENVELOPE_BYTES = 640 * 1024;

/** Reads the body with a hard byte cap, so a missing or lying Content-Length cannot make us buffer more. */
async function readBodyCapped(request: Request, cap: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > cap || !request.body) return declared > cap ? null : new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function uploadErrorStatus(err: UploadError): number {
  if (err.code === 'too_large') return 413;
  if (err.code === 'unsupported_type' || err.code === 'active_content') return 415;
  return 400;
}

export async function POST(request: Request): Promise<Response> {
  const retryAfter = checkRateLimit(clientIp(request), Date.now());
  if (retryAfter > 0) return jsonError('Too many requests, slow down', 429, { 'Retry-After': String(retryAfter) });

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) return jsonError('Expected multipart/form-data', 415);

  const body = await readBodyCapped(request, MAX_UPLOAD_TOTAL_BYTES + ENVELOPE_BYTES);
  if (!body) return jsonError('The upload is larger than 4 MB', 413);

  let form: FormData;
  try {
    form = await new Response(Buffer.from(body), { headers: { 'content-type': contentType } }).formData();
  } catch {
    return jsonError('Could not read the upload', 400);
  }

  const sessionField = form.get('session');
  const parsedSession = uploadSessionFieldSchema.safeParse(typeof sessionField === 'string' ? sessionField : '');
  if (!parsedSession.success) return jsonError('Invalid request: missing or malformed session', 400);

  // Route language of the page (optional: old clients fall back to detection from the last chat message).
  const langField = form.get('lang');
  const routeLang = langSchema.safeParse(typeof langField === 'string' ? langField : undefined).data;

  let state;
  try {
    state = verifySession(parsedSession.data);
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    logError('upload', err);
    return jsonError('Internal error', 500);
  }
  if (state.stage !== 'DOCUMENTS' || !state.tenantId) {
    return jsonError('Documents are requested after the visit is confirmed', 409);
  }

  const files = form.getAll('files').filter((v): v is File => typeof v !== 'string');
  let docs: UploadedDocument[];
  try {
    assertUploadLimits(files.map((f) => f.size));
    docs = [];
    for (const file of files) docs.push(toUploadedDocument(file.name, new Uint8Array(await file.arrayBuffer())));
  } catch (err) {
    if (err instanceof UploadError) return jsonError(err.message, uploadErrorStatus(err));
    logError('upload', err);
    return jsonError('Could not read the files', 400);
  }

  try {
    const turn = await runDocumentsUpload(state, docs, routeLang);
    const response: ChatResponse = {
      reply: turn.reply,
      stage: turn.state.stage,
      cards: turn.cards,
      session: signSession(turn.state),
    };
    return Response.json(response);
  } catch (err) {
    if (err instanceof ReplayMissError) {
      return jsonError('Demo replay mode can only review the sample documents. Use the files from the sample set.', 422);
    }
    if (err instanceof AiRefusalError) return jsonError('The documents could not be reviewed automatically.', 422);
    const res = sessionErrorResponse(err);
    if (res) return res;
    logError('upload', err);
    return jsonError('Could not review the documents', 502);
  }
}
