// Small per-key sliding-window limiter for the agency routes (best effort, per warm instance, in memory).
// The key is the client IP. On Vercel the edge sets x-forwarded-for; on any other host it is client-controlled,
// so this is a courtesy limit, not a security boundary (the release itself is idempotent on chain).

export interface Limiter {
  /** 0 when allowed (and the hit is recorded), otherwise the seconds to wait. */
  check(key: string, now?: number): number;
  /** Like check but read-only: 0 when a hit would be allowed, otherwise the seconds to wait. Records nothing. */
  peek(key: string, now?: number): number;
}

export function createLimiter(opts: { windowMs: number; max: number; maxKeys?: number }): Limiter {
  const hits = new Map<string, number[]>();
  const maxKeys = opts.maxKeys ?? 2_000;
  return {
    peek(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (recent.length < opts.max) return 0;
      return Math.max(1, Math.ceil((opts.windowMs - (now - recent[0])) / 1000));
    },
    check(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return Math.max(1, Math.ceil((opts.windowMs - (now - recent[0])) / 1000));
      }
      recent.push(now);
      hits.delete(key); // re-insert so the Map keeps least recently used keys first
      hits.set(key, recent);
      // Drop the least recently used keys beyond the cap (the Map iterates in insertion order).
      for (const k of hits.keys()) {
        if (hits.size <= maxKeys) break;
        hits.delete(k);
      }
      return 0;
    },
  };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
