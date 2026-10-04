// GET /api/agency/leases: contracts and payment status read from real devnet history (cached for 30 s).
import { loadLedger } from "@/lib/agency/chain";
import { toLeasesResponse } from "@/lib/agency/dto";
import { jsonError, logError } from "@/lib/db/http";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  // Optional ?lease=<id> reads a single lease (deep link from the panel); anything else is rejected, never passed to the RPC.
  const lease = new URL(request.url).searchParams.get("lease");
  if (lease !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(lease)) return jsonError("Invalid lease id", 400);
  try {
    return Response.json(toLeasesResponse(await loadLedger({ leaseId: lease ?? undefined })));
  } catch (err) {
    logError("agency/leases", err);
    return jsonError("Could not read the devnet history right now. Try again in a moment.", 502);
  }
}
