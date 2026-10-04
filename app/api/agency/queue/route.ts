// GET /api/agency/queue: the simulated NEEDS_INFO queue (replayed agents + deterministic rules).
import { loadQueue } from "@/lib/agency/queue";
import { jsonError, logError } from "@/lib/db/http";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await loadQueue());
  } catch (err) {
    logError("agency/queue", err);
    return jsonError("Could not compute the demo queue", 502);
  }
}
