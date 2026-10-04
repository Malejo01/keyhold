// POST /api/pay: the server builds the PaymentIntent from the signed session's lease and sends a real
// devnet transaction. Amounts, payer and month are never taken from the client.
//
// Two modes (AD-11b):
//  - DATABASE_URL set: replay protection and idempotency live in Postgres. The session version must not be
//    older than the stored one, and the payment INTENT is inserted (status pending) BEFORE the transfer is sent;
//    UNIQUE (lease_id, kind, month_index) guarantees that exactly one request can send it.
//  - DATABASE_URL unset: the legacy path (HMAC blob + per-instance in-flight guard), plus the storage-free
//    issuedAt checks inside verifySession.
import { z } from "zod";
import type { PayRequest, PayResponse, PaymentKind, PaymentResult, SessionState } from "@/lib/contracts";
import { buildPaymentIntent } from "@/lib/agents/lease";
import { applyEvent } from "@/lib/agents/orchestrator";
import { getDb, type Db } from "@/lib/db/client";
import { jsonError, logError, parseBody, sessionErrorResponse } from "@/lib/db/http";
import { ensureReferenceData } from "@/lib/db/reference";
import { signedSessionSchema } from "@/lib/db/schemas";
import { signSession, verifySession } from "@/lib/db/session";
import {
  claimPayment,
  confirmPayment,
  hasPaymentRow,
  releasePayment,
  sessionHasOtherLeasePayments,
  setLeaseStage,
  touchSession,
  upsertLease,
} from "@/lib/db/store";
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
 * It is a cheap first line (it saves DB round trips); with a database the unique constraint is the real lock.
 */
const inFlight = new Set<string>();

function conflict(error: string, code: string): Response {
  return Response.json({ error, code }, { status: 409 });
}

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
    if (state.payments.some((p) => p.kind === "deposit")) return conflict("Deposit already paid", "already_paid");
  } else {
    if (!state.payments.some((p) => p.kind === "deposit")) return jsonError("Pay the deposit first.", 409);
    const paid = paidRentMonths(state.payments);
    // The next unpaid month, in order. The client cannot choose or skip a month.
    monthIndex = 0;
    while (paid.has(monthIndex)) monthIndex += 1;
    if (monthIndex >= lease.months) return jsonError("All rent months are already paid", 409);
  }

  const slot = `${state.sessionId}:${kind}:${monthIndex ?? "-"}`;
  if (inFlight.has(slot)) return jsonError("A payment for this item is already in progress", 409);
  inFlight.add(slot);

  const db = getDb();
  let claimId: string | null = null;
  try {
    if (db) {
      const gate = await claimInDatabase(db, state, kind, monthIndex);
      if (gate.response) return gate.response;
      claimId = gate.claimId;
    }

    const intent = buildPaymentIntent(lease, kind as PaymentKind, monthIndex);
    let result: PaymentResult;
    try {
      result = await executePayment(intent);
    } catch (err) {
      if (db && claimId) await releaseOnlyIfNotSent(db, claimId, err);
      throw err;
    }

    const next = applyEvent(state, { type: "payment_confirmed", result });
    const signed = signSession(next);
    if (db && claimId) await recordConfirmed(db, claimId, result, signed.state);
    const response: PayResponse = { result, session: signed };
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

/**
 * Persistent gate, in this order: session not stale -> lease row -> one paid lease per session -> claim the
 * payment slot. Any database failure refuses the payment (503): paying without the lock would defeat the point.
 */
async function claimInDatabase(
  db: Db,
  state: SessionState,
  kind: PaymentKind,
  monthIndex: number | undefined,
): Promise<{ response: Response; claimId: null } | { response: null; claimId: string }> {
  const lease = state.lease as NonNullable<SessionState["lease"]>;
  try {
    await ensureReferenceData(db);
    const fresh = await touchSession(db, state);
    if (!fresh) {
      // A newer version of this session exists: this blob is a replay (or a lost response was never applied).
      if (await hasPaymentRow(db, lease.leaseId, kind)) return { response: conflict("Already paid", "already_paid"), claimId: null };
      return {
        response: conflict("This session is out of date. Reload the page to continue.", "stale_session"),
        claimId: null,
      };
    }
    await upsertLease(db, state, lease);
    if (await sessionHasOtherLeasePayments(db, state.sessionId, lease.leaseId)) {
      return { response: conflict("This session already has another lease with payments", "other_lease_paid"), claimId: null };
    }
    const claim = await claimPayment(db, { leaseId: lease.leaseId, kind, monthIndex });
    if (!claim.claimed) {
      return claim.status === "confirmed"
        ? { response: conflict("Already paid", "already_paid"), claimId: null }
        : { response: conflict("A payment for this item is already in progress", "in_progress"), claimId: null };
    }
    return { response: null, claimId: claim.id };
  } catch (err) {
    logError("pay.db", err);
    return { response: jsonError("Payments are temporarily unavailable", 503), claimId: null };
  }
}

/**
 * Only an error raised BEFORE anything was sent frees the claim. Any other failure (RPC timeout, confirmation
 * error) is ambiguous: the transfer may have landed, so the row stays `pending` and blocks a retry instead of
 * risking a second transfer. The tenant can start a new session; reconciling pending rows is a follow-up.
 */
async function releaseOnlyIfNotSent(db: Db, claimId: string, err: unknown): Promise<void> {
  if (!(err instanceof InsufficientFundsError)) return;
  try {
    await releasePayment(db, claimId);
  } catch (releaseErr) {
    logError("pay.release", releaseErr);
  }
}

/** The money has moved: never fail the response because the bookkeeping failed. Retry once, then log. */
async function recordConfirmed(db: Db, claimId: string, result: PaymentResult, issued: SessionState): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await confirmPayment(db, claimId, result);
      await touchSession(db, issued);
      if (issued.lease) await setLeaseStage(db, issued.lease.leaseId, issued.stage);
      return;
    } catch (err) {
      logError("pay.confirm", err);
    }
  }
  console.error(`[pay.confirm] payment ${result.signature} confirmed on chain but not recorded in the database`);
}
