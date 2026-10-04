// GET /api/agency/leases: contracts and payment status read from real devnet history (cached for 30 s).
import { loadLedger } from "@/lib/agency/chain";
import { toLeasesResponse } from "@/lib/agency/dto";
import { clientIp, createLimiter } from "@/lib/agency/ratelimit";
import { jsonError, logError } from "@/lib/db/http";

export const runtime = "nodejs";

// A single-lease lookup pages back through devnet history (several RPC calls) and bypasses the shared snapshot,
// so it is limited per IP. The panel's own use is one call plus a few follow-ups.
const leaseLookupLimiter = createLimiter({ windowMs: 5 * 60 * 1000, max: 20 });

export async function GET(request: Request): Promise<Response> {
  // Optional ?lease=<id> reads a single lease (deep link from the panel); anything else is rejected, never passed to the RPC.
  const lease = new URL(request.url).searchParams.get("lease");
  if (lease !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(lease)) return jsonError("Invalid lease id", 400);
  if (lease !== null) {
    const wait = leaseLookupLimiter.check(clientIp(request));
    if (wait > 0) return jsonError("Too many lease lookups, slow down", 429, { "Retry-After": String(wait) });
  }
  try {
    return Response.json(toLeasesResponse(await loadLedger({ leaseId: lease ?? undefined })));
  } catch (err) {
    logError("agency/leases", err);
    return jsonError("Could not read the devnet history right now. Try again in a moment.", 502);
  }
}
