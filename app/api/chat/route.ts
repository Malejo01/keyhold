import type { ChatResponse } from '@/lib/contracts';
import { aiMode } from '@/lib/ai';
import { runTurn } from '@/lib/agents/orchestrator';
import { chatRequestSchema } from '@/lib/db/schemas';
import { newSession, signSession, verifySession } from '@/lib/db/session';
import { jsonError, logError, parseBody, sessionErrorResponse } from '@/lib/db/http';

export const runtime = 'nodejs';

// Cost guard: simple in-memory sliding-window rate limit per IP.
// Best effort only: on serverless every instance has its own memory, so the effective limit is
// per warm instance and resets on cold start. It is meant to stop a runaway loop, not an attacker.
// Live AI costs money: 30 messages per 5 min per IP. Replay mode (REPLAY=1, no key, or daily cap
// reached; see aiMode() in lib/ai) costs nothing, so recording sessions get 120 per 5 min.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_LIVE = 30;
const MAX_REQUESTS_REPLAY = 120;
const hits = new Map<string, number[]>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** Returns seconds to wait when over the limit, or 0 when the request is allowed. */
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
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return 0;
}

export async function POST(request: Request): Promise<Response> {
  const retryAfter = checkRateLimit(clientIp(request), Date.now());
  if (retryAfter > 0) {
    return jsonError('Too many requests, slow down', 429, { 'Retry-After': String(retryAfter) });
  }

  const body = await parseBody(request, chatRequestSchema);
  if (!body.ok) return body.response;
  const { message, session, tenantId, lang } = body.data;

  let state;
  try {
    state = verifySession(session);
    // Persona switcher: a different tenant resets the session.
    if (tenantId && tenantId !== state.tenantId) {
      state = newSession(tenantId);
    }
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    logError('chat', err);
    return jsonError('Internal error', 500);
  }

  try {
    const turn = await runTurn(state, message, lang);
    const response: ChatResponse = {
      reply: turn.reply,
      stage: turn.state.stage,
      cards: turn.cards,
      session: signSession(turn.state),
    };
    return Response.json(response);
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    logError('chat', err);
    return jsonError('The assistant could not complete this turn', 502);
  }
}
