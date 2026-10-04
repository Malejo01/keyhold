// POST /api/solana-pay/status: the UI polls this. The server looks the ticket's reference up on devnet, validates the
// payment and, once confirmed, returns the receipt plus the updated signed session. onTime comes from the tx blockTime.
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import type { PayResponse, SignedSession } from "@/lib/contracts";
import { applyEvent } from "@/lib/agents/orchestrator";
import { jsonError, logError, parseBody, sessionErrorResponse } from "@/lib/db/http";
import { signedSessionSchema } from "@/lib/db/schemas";
import { signSession, verifySession } from "@/lib/db/session";
import { getDevnetConnection } from "@/lib/solana/connection";
import { getPaymentMint } from "@/lib/solana/keys";
import { buildMemo } from "@/lib/solana/pay";
import { findValidPayment, toPaymentResult } from "@/lib/solana/solana-pay";
import { custodialOnly, destinationOwnerFor, solanaPayEnabled } from "@/lib/solana/solana-pay-http";
import { InvalidTicketError, decodeTicket } from "@/lib/solana/solana-pay-ticket";

export const runtime = "nodejs";

/** A payment sent just before the ticket expired must still resolve while the UI keeps polling. */
const STATUS_GRACE_SECONDS = 10 * 60;

const bodySchema: z.ZodType<{ ticket: string; session: SignedSession }> = z.object({
  ticket: z.string().min(1).max(2048),
  session: signedSessionSchema,
});

export type SolanaPayStatusResponse = { status: "pending" } | ({ status: "confirmed" } & PayResponse);

export async function POST(request: Request): Promise<Response> {
  if (!solanaPayEnabled()) return jsonError("Not found", 404);
  if (!custodialOnly()) return jsonError("Solana Pay is only available in custodial escrow mode", 501);

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;

  let state;
  try {
    state = verifySession(body.data.session);
  } catch (err) {
    const response = sessionErrorResponse(err);
    if (response) return response;
    throw err;
  }

  let payload;
  try {
    // Server time minus a grace window: building a tx stops at expiry, but confirming one may land later.
    payload = decodeTicket(body.data.ticket, Math.floor(Date.now() / 1000) - STATUS_GRACE_SECONDS);
  } catch (err) {
    if (err instanceof InvalidTicketError) return jsonError(err.message, err.expired ? 410 : 401);
    logError("solana-pay/status", err);
    return jsonError("Server misconfigured", 500);
  }
  if (payload.sessionId !== state.sessionId || state.lease?.leaseId !== payload.intent.leaseId) {
    return jsonError("This ticket does not belong to this session", 403);
  }

  // Idempotent: the same payment is never recorded twice.
  const memo = buildMemo(payload.intent);
  const existing = state.payments.find((p) => p.memo === memo);
  if (existing) {
    const response: SolanaPayStatusResponse = { status: "confirmed", result: existing, session: signSession(state) };
    return Response.json(response);
  }

  try {
    const connection = await getDevnetConnection();
    const found = await findValidPayment(connection, {
      intent: payload.intent,
      reference: new PublicKey(payload.reference),
      destinationOwner: destinationOwnerFor(payload.intent.kind),
      mint: getPaymentMint(),
    });
    if (!found) return Response.json({ status: "pending" } satisfies SolanaPayStatusResponse);

    const result = toPaymentResult(payload.intent, found);
    const next = applyEvent(state, { type: "payment_confirmed", result });
    const response: SolanaPayStatusResponse = { status: "confirmed", result, session: signSession(next) };
    return Response.json(response);
  } catch (err) {
    logError("solana-pay/status", err);
    return jsonError("Could not check the payment status", 502);
  }
}
