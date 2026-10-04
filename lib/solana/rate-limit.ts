// Best-effort in-memory sliding-window rate limit per client IP, same approach as /api/chat.
// On serverless every warm instance has its own memory, so this stops a runaway loop or a casual abuser from
// burning the RPC quota; it is not a hard guarantee. Server-only.

export interface RateLimitOptions {
  /** Distinct name per route, so one route's traffic does not eat another's budget. */
  bucket: string;
  max: number;
  windowMs: number;
}

const buckets = new Map<string, Map<string, number[]>>();

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Returns seconds to wait when over the limit, or 0 when the request is allowed (and counted). */
export function checkRateLimit(opts: RateLimitOptions, ip: string, now: number): number {
  let hits = buckets.get(opts.bucket);
  if (!hits) {
    hits = new Map();
    buckets.set(opts.bucket, hits);
  }
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < opts.windowMs);
  if (recent.length >= opts.max) {
    hits.set(ip, recent);
    return Math.max(1, Math.ceil((opts.windowMs - (now - recent[0])) / 1000));
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= opts.windowMs)) hits.delete(key);
    }
  }
  return 0;
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}

const WINDOW_MS = 5 * 60 * 1000;

/** Budgets per IP per 5 minutes. Status is polled every 2.5 s by the UI (about 120 per 5 min for one open QR). */
export const SOLANA_PAY_LIMITS = {
  ticket: { bucket: "solana-pay-ticket", max: 20, windowMs: WINDOW_MS },
  tx: { bucket: "solana-pay-tx", max: 30, windowMs: WINDOW_MS },
  status: { bucket: "solana-pay-status", max: 200, windowMs: WINDOW_MS },
} as const satisfies Record<string, RateLimitOptions>;
