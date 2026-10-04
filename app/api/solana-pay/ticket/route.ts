// POST /api/solana-pay/ticket: from the HMAC-signed session, mint a payment ticket and the Solana Pay URL for the QR.
// Amount, memo and month are derived on the server from the session's lease. Nothing financial comes from the client.
import { z } from "zod";
import type { PaymentKind, SignedSession } from "@/lib/contracts";
import { buildPaymentIntent } from "@/lib/agents/lease";
import { APP_NAME } from "@/lib/config/brand";
import { jsonError, parseBody, sessionErrorResponse } from "@/lib/db/http";
import { signedSessionSchema } from "@/lib/db/schemas";
import { verifySession } from "@/lib/db/session";
import { nextPaymentSlot } from "@/lib/solana/payment-slot";
import { quoteForIntent } from "@/lib/solana/solana-pay";
import { custodialOnly, publicOrigin, solanaPayEnabled, transactionRequestUrl } from "@/lib/solana/solana-pay-http";
import { mintTicket } from "@/lib/solana/solana-pay-ticket";

export const runtime = "nodejs";

const bodySchema: z.ZodType<{ kind: PaymentKind; session: SignedSession }> = z.object({
  kind: z.enum(["deposit", "rent"]),
  session: signedSessionSchema,
});

export interface SolanaPayTicketResponse {
  ticket: string;
  reference: string;
  /** Unix seconds, server clock. */
  expiresAt: number;
  /** `solana:` transaction request URL to render as a QR code. */
  url: string;
  /** What the wallet will be asked to pay, for display only (the tx endpoint recomputes it). */
  amountBaseUnits: string;
}

export async function POST(request: Request): Promise<Response> {
  if (!solanaPayEnabled()) return jsonError("Not found", 404);
  if (!custodialOnly()) return jsonError("Solana Pay is only available in custodial escrow mode", 501);

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  const { kind, session } = body.data;

  let state;
  try {
    state = verifySession(session);
  } catch (err) {
    const response = sessionErrorResponse(err);
    if (response) return response;
    throw err;
  }
  const lease = state.lease;
  if (!lease) return jsonError("No lease in this session yet", 409);
  const slot = nextPaymentSlot(state, kind);
  if (!slot.ok) return jsonError(slot.error, slot.status);

  const intent = buildPaymentIntent(lease, kind, slot.monthIndex);
  const nowSec = Math.floor(Date.now() / 1000);
  const minted = mintTicket({ sessionId: state.sessionId, intent, nowSec });
  const response: SolanaPayTicketResponse = {
    ...minted,
    url: transactionRequestUrl(publicOrigin(request), minted.ticket, APP_NAME),
    amountBaseUnits: quoteForIntent(intent, nowSec).amountBaseUnits.toString(),
  };
  return Response.json(response, { headers: { "cache-control": "no-store" } });
}
