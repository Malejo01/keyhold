// POST /api/pay: the server builds the PaymentIntent from the signed session's lease and sends a real
// devnet transaction. Amounts, payer and month are never taken from the client.
import { z } from "zod";
import type { PayRequest, PayResponse, PaymentKind, PaymentResult, SessionState } from "@/lib/contracts";
import { buildPaymentIntent } from "@/lib/agents/lease";
import { applyEvent } from "@/lib/agents/orchestrator";
import { jsonError, logError, parseBody, sessionErrorResponse } from "@/lib/db/http";
import { signedSessionSchema } from "@/lib/db/schemas";
import { signSession, verifySession } from "@/lib/db/session";
import { InsufficientFundsError, executePayment } from "@/lib/solana/pay";

export const runtime = "nodejs";

const payRequestSchema: z.ZodType<PayRequest> = z.object({
  kind: z.enum(["deposit", "rent"]),
  session: signedSessionSchema,
});

/** Month indexes (0-based) already paid, read back from the memos the server itself wrote. */
function paidRentMonths(payments: PaymentResult[]): Set<number> {
  const months = new Set<number>();
  for (const payment of payments) {
    if (payment.kind !== "rent") continue;
    const match = /:rent:(\d+):[0-9a-f]{64}$/.exec(payment.memo);
    if (match) months.add(Number(match[1]));
  }
  return months;
}

/**
 * In-process guard against a double submit of the same session: the session blob is client-held, so
 * two concurrent requests would both pass the "already paid" check. Keyed by session + payment slot.
 * (Single-instance only; good enough for the custodial demo. The Anchor program enforces this on chain.)
 */
const inFlight = new Set<string>();

export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, payRequestSchema);
  if (!body.ok) return body.response;
  const { kind, session } = body.data;

  let state: SessionState;
  try {
    state = verifySession(session);
  } catch (err) {
    const response = sessionErrorResponse(err);
    if (response) return response;
    throw err;
  }

  const lease = state.lease;
  if (!lease) return jsonError("No lease in this session yet", 409);

  let monthIndex: number | undefined;
  if (kind === "deposit") {
    if (state.payments.some((p) => p.kind === "deposit")) return jsonError("Deposit already paid", 409);
  } else {
    const paid = paidRentMonths(state.payments);
    // The next unpaid month, in order. The client cannot choose or skip a month.
    monthIndex = 0;
    while (paid.has(monthIndex)) monthIndex += 1;
    if (monthIndex >= lease.months) return jsonError("All rent months are already paid", 409);
  }

  const slot = `${state.sessionId}:${kind}:${monthIndex ?? "-"}`;
  if (inFlight.has(slot)) return jsonError("A payment for this item is already in progress", 409);
  inFlight.add(slot);
  try {
    const intent = buildPaymentIntent(lease, kind as PaymentKind, monthIndex);
    const result = await executePayment(intent);
    const next = applyEvent(state, { type: "payment_confirmed", result });
    const response: PayResponse = { result, session: signSession(next) };
    return Response.json(response);
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return jsonError("The demo wallet is out of test tokens. Run `pnpm setup:devnet` to top it up.", 409);
    }
    logError("pay", err);
    return jsonError("Payment could not be completed", 502);
  } finally {
    inFlight.delete(slot);
  }
}
