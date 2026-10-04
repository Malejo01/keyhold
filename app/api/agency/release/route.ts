// POST /api/agency/release: custodial deposit release with a simulated 2-of-3 approval (see lib/agency/release.ts).
// The reason text is hashed on the server; only the sha256 is returned and written (as the memo hash).
import { z } from "zod";
import { releaseDeposit } from "@/lib/agency/release";
import { ReleaseError } from "@/lib/agency/plan";
import { SplitError } from "@/lib/agency/approvals";
import { configuredPin, pinMatches } from "@/lib/agency/pin";
import { clientIp, createLimiter } from "@/lib/agency/ratelimit";
import { jsonError, logError, parseBody } from "@/lib/db/http";

export const runtime = "nodejs";

const bodySchema = z.strictObject({
  leaseId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  toTenant: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
  toLandlord: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
  reason: z.string().trim().min(3).max(500),
  approver: z.enum(["tenant", "landlord"]),
  // Demo PIN. Optional in the schema so a missing PIN is a 401 (not a 400); never logged or echoed.
  pin: z.string().max(64).optional(),
});

// Every call can move test tokens: keep a small per-IP budget (best effort, per warm instance).
const limiter = createLimiter({ windowMs: 5 * 60 * 1000, max: 6 });

// Stricter budget for wrong PINs: 5 failures per 10 minutes per IP, after which even the right PIN is refused.
const failedPins = createLimiter({ windowMs: 10 * 60 * 1000, max: 5 });

export async function POST(request: Request): Promise<Response> {
  // Never open: without a configured PIN the release is disabled.
  const expected = configuredPin();
  if (!expected) return jsonError("Release is disabled on this deployment (no demo PIN configured)", 503);

  const ip = clientIp(request);
  const wait = limiter.check(ip);
  if (wait > 0) return jsonError("Too many release attempts, slow down", 429, { "Retry-After": String(wait) });
  const blocked = failedPins.peek(ip);
  if (blocked > 0) return jsonError("Too many wrong PINs, try again later", 429, { "Retry-After": String(blocked) });

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;

  const { pin, ...input } = body.data;
  if (typeof pin !== "string" || !pinMatches(pin, expected)) {
    const lockWait = failedPins.check(ip);
    if (lockWait > 0) return jsonError("Too many wrong PINs, try again later", 429, { "Retry-After": String(lockWait) });
    return jsonError("Wrong PIN", 401);
  }

  try {
    return Response.json({ release: await releaseDeposit(input) });
  } catch (err) {
    if (err instanceof ReleaseError) {
      // "Already released" carries the explorer link of the original release.
      return Response.json(err.explorerUrl ? { error: err.message, explorerUrl: err.explorerUrl } : { error: err.message }, { status: err.status });
    }
    if (err instanceof SplitError) return jsonError(err.message, 422);
    logError("agency/release", err);
    return jsonError("The release could not be completed", 502);
  }
}
