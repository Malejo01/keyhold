/**
 * Retry with exponential backoff + jitter for rate limits and overloads (free-tier Gemini hits 429 often).
 * Respects a server-provided retry delay when present. Total wait is capped at ~60 s.
 */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 6;
const BASE_DELAY_MS = 2_000;
const MAX_TOTAL_WAIT_MS = 60_000;

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return undefined;
}

export function isRetryable(err: unknown): boolean {
  const status = statusOf(err);
  if (status !== undefined) return RETRYABLE_STATUS.has(status);
  const msg = err instanceof Error ? err.message : String(err);
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|rate limit/i.test(msg);
}

/** Reads `"retryDelay": "37s"` (Gemini RetryInfo) or a `retry-after` style hint from the error, in ms. */
export function retryDelayHintMs(err: unknown): number | undefined {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/"?retryDelay"?\s*:\s*"(\d+(?:\.\d+)?)s"/) ?? msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (m) return Math.ceil(Number(m[1]) * 1000);
  const headers = err && typeof err === 'object' && 'headers' in err ? (err as { headers?: unknown }).headers : undefined;
  if (headers && typeof (headers as Headers).get === 'function') {
    const ra = Number((headers as Headers).get('retry-after'));
    if (Number.isFinite(ra) && ra > 0) return ra * 1000;
  }
  return undefined;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let waited = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isRetryable(err)) throw err;
      const backoff = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 1_000);
      const hint = retryDelayHintMs(err);
      const delay = hint !== undefined ? hint + Math.floor(Math.random() * 500) : backoff;
      if (waited + delay > MAX_TOTAL_WAIT_MS) throw err;
      console.warn(`[ai] ${label}: retryable error (status ${statusOf(err) ?? '?'}), retry ${attempt} in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
      waited += delay;
    }
  }
}
