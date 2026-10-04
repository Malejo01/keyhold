// POST /api/pay: the server builds the PaymentIntent from the signed session's lease and sends a real
// devnet transaction. Amounts, payer and month are never taken from the client.
import { z } from "zod";
import type { PayRequest, PayResponse, PaymentKind, SessionState } from "@/lib/contracts";
import { buildPaymentIntent } from "@/lib/agents/lease";
import { applyEvent } from "@/lib/agents/orchestrator";
import { jsonError, logError, parseBody, sessionErrorResponse } from "@/lib/db/http";
import { signedSessionSchema } from "@/lib/db/schemas";
import { signSession, verifySession } from "@/lib/db/session";
import { getDevnetConnection } from "@/lib/solana/connection";
import { InsufficientFundsError, executePayment } from "@/lib/solana/pay";
import { nextPaymentSlot } from "@/lib/solana/payment-slot";
import { findValidPayment } from "@/lib/solana/solana-pay";
import { custodialOnly, solanaPayEnabled, validateParamsFor } from "@/lib/solana/solana-pay-http";
import { slotReference } from "@/lib/solana/solana-pay-ticket";

export const runtime = "nodejs";

const payRequestSchema: z.ZodType<PayRequest> = z.object({
  kind: z.enum(["deposit", "rent"]),
  session: signedSessionSchema,
});

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

  const next = nextPaymentSlot(state, kind);
  if (!next.ok) return jsonError(next.error, next.status);
  const monthIndex = next.monthIndex;

  const slot = `${state.sessionId}:${kind}:${monthIndex ?? "-"}`;
  if (inFlight.has(slot)) return jsonError("A payment for this item is already in progress", 409);
  inFlight.add(slot);
  try {
    const intent = buildPaymentIntent(lease, kind as PaymentKind, monthIndex);
    // Solana Pay on: the button shares the slot reference with the QR flow. A wallet payment that is already on chain
    // for this slot (not yet recorded in the session) must not be paid a second time.
    let reference;
    if (solanaPayEnabled() && custodialOnly()) {
      reference = slotReference(state.sessionId, intent);
      if (await findValidPayment(await getDevnetConnection(), validateParamsFor(intent, reference))) {
        return jsonError("This payment was already made with a wallet. Check the QR payment status.", 409);
      }
    }
    const result = await executePayment(intent, { reference });
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
