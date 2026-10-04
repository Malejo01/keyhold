// POST /api/pay: the server builds the PaymentIntent from the signed session's lease and sends a real
// devnet transaction. Amounts, payer and month are never taken from the client.
//
// Two modes (AD-11b):
//  - DATABASE_URL set: replay protection and idempotency live in Postgres. The session version must not be
//    older than the stored one, and the payment INTENT is inserted (status pending) BEFORE the transfer is sent;
//    UNIQUE (lease_id, kind, month_index) guarantees that exactly one request can send it. A payment runs in
//    steps: claim -> prepare (build + sign, no side effect) -> store the signature on the pending row -> send.
//    Errors before the send free the claim; an ambiguous send keeps it pending WITH its signature, and the next
//    retry reconciles against devnet (landed -> confirm and return the receipt, can never land -> release).
//  - DATABASE_URL unset: the legacy path (HMAC blob + per-instance in-flight guard), plus the storage-free
//    issuedAt checks inside verifySession.
import type { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import type { PayRequest, PayResponse, PaymentIntent, PaymentKind, PaymentResult, SessionState } from "@/lib/contracts";
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
  getPaymentRow,
  hasPaymentRow,
  recordAttempt,
  releaseAttempt,
  releasePayment,
  releaseStaleUnsigned,
  sessionHasOtherLeasePayments,
  setLeaseStage,
  touchSession,
  upsertLease,
} from "@/lib/db/store";
import { InsufficientFundsError, checkPayment, preparePayment, submitPayment } from "@/lib/solana/pay";
import type { PreparedPayment } from "@/lib/solana/pay";
import { getDevnetConnection } from "@/lib/solana/connection";
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
 * It is a cheap first line (it saves DB round trips); with a database the unique constraint is the real lock.
 */
const inFlight = new Set<string>();

/** A claim without a signature older than this never got as far as signing (the request died): nothing was sent. */
const STALE_UNSIGNED_SECONDS = 180;

function conflict(error: string, code: string): Response {
  return Response.json({ error, code }, { status: 409 });
}

const inProgress = () =>
  conflict("A payment for this item is already in progress. Try again in a minute.", "in_progress");

/** Outcome of the persistent gate: stop with a response, go on to send, or the money already moved. */
type Gate =
  | { kind: "response"; response: Response }
  | { kind: "claimed"; claimId: string }
  | { kind: "recovered"; claimId: string; result: PaymentResult };

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
  if (!next.ok) {
    // "Deposit already paid" keeps its machine-readable code (the client and the B3 attack tests rely on it).
    if (kind === "deposit" && state.payments.some((p) => p.kind === "deposit")) {
      return conflict(next.error, "already_paid");
    }
    return jsonError(next.error, next.status);
  }
  const monthIndex = next.monthIndex;

  const slot = `${state.sessionId}:${kind}:${monthIndex ?? "-"}`;
  if (inFlight.has(slot)) return jsonError("A payment for this item is already in progress", 409);
  inFlight.add(slot);

  const db = getDb();
  let claimId: string | null = null;
  try {
    const intent = buildPaymentIntent(lease, kind as PaymentKind, monthIndex);
    // Solana Pay on: the button shares the slot reference with the QR flow. A wallet payment that is already on chain
    // for this slot (not yet recorded in the session) must not be paid a second time. This check runs BEFORE the
    // claim, so a refused attempt never leaves a pending row behind.
    let reference: PublicKey | undefined;
    if (solanaPayEnabled() && custodialOnly()) {
      reference = slotReference(state.sessionId, intent);
      if (await findValidPayment(await getDevnetConnection(), validateParamsFor(intent, reference))) {
        return jsonError("This payment was already made with a wallet. Check the QR payment status.", 409);
      }
    }
    let result: PaymentResult | undefined;
    if (db) {
      const gate = await claimInDatabase(db, state, kind, monthIndex, intent);
      if (gate.kind === "response") return gate.response;
      claimId = gate.claimId;
      if (gate.kind === "recovered") result = gate.result;
    }

    if (!result) {
      // Prepare = validate, quote, read the balance, build and sign. Nothing is sent, so ANY error here means the
      // transfer did not happen: the claim is freed and the tenant can simply retry.
      let prepared: PreparedPayment;
      try {
        prepared = await preparePayment(intent, { reference });
      } catch (err) {
        if (db && claimId) await releaseNotSent(db, claimId);
        throw err;
      }
      // The signature goes into the pending row BEFORE sending. If that fails, nothing has been sent yet.
      if (db && claimId) {
        try {
          await recordAttempt(db, claimId, prepared);
        } catch (err) {
          logError("pay.attempt", err);
          await releaseNotSent(db, claimId);
          return jsonError("Payments are temporarily unavailable", 503);
        }
      }
      try {
        result = await submitPayment(intent, prepared);
      } catch (err) {
        if (!db) throw err;
        // Ambiguous: the tx may have landed. The claim stays pending with its signature; a retry reconciles it.
        logError("pay.send", err);
        return Response.json(
          {
            error: "The payment was submitted but not confirmed yet. Try again in a minute: it will not be charged twice.",
            code: "pending_confirmation",
          },
          { status: 502 },
        );
      }
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
 * payment slot (-> reconcile a pending claim left by an earlier attempt). Any database failure refuses the
 * payment (503): paying without the lock would defeat the point.
 */
async function claimInDatabase(
  db: Db,
  state: SessionState,
  kind: PaymentKind,
  monthIndex: number | undefined,
  intent: PaymentIntent,
): Promise<Gate> {
  const lease = state.lease as NonNullable<SessionState["lease"]>;
  const stop = (response: Response): Gate => ({ kind: "response", response });
  try {
    await ensureReferenceData(db);
    const fresh = await touchSession(db, state);
    if (!fresh) {
      // A newer version of this session exists: this blob is a replay (or a lost response was never applied).
      if (await hasPaymentRow(db, lease.leaseId, kind)) return stop(conflict("Already paid", "already_paid"));
      return stop(conflict("This session is out of date. Start over to continue.", "stale_session"));
    }
    await upsertLease(db, state, lease);
    if (await sessionHasOtherLeasePayments(db, state.sessionId, lease.leaseId)) {
      return stop(conflict("This session already has another lease with payments", "other_lease_paid"));
    }

    const input = { leaseId: lease.leaseId, sessionId: state.sessionId, kind, monthIndex };
    let claim = await claimPayment(db, input);
    if (claim.claimed) return { kind: "claimed", claimId: claim.id };
    if (claim.status === "other_lease_in_session") {
      return stop(conflict("This session already has another lease with payments", "other_lease_paid"));
    }
    if (claim.status === "confirmed") return stop(conflict("Already paid", "already_paid"));

    // A pending row: an attempt is running elsewhere, or an earlier one ended ambiguously. Reconcile it once.
    const reconciled = await reconcilePending(db, lease.leaseId, kind, monthIndex, intent);
    if (reconciled.kind !== "released") return reconciled;
    claim = await claimPayment(db, input);
    if (claim.claimed) return { kind: "claimed", claimId: claim.id };
    if (claim.status === "other_lease_in_session") {
      return stop(conflict("This session already has another lease with payments", "other_lease_paid"));
    }
    return stop(claim.status === "confirmed" ? conflict("Already paid", "already_paid") : inProgress());
  } catch (err) {
    logError("pay.db", err);
    return stop(jsonError("Payments are temporarily unavailable", 503));
  }
}

/**
 * Decides what a pending claim means, using the signature stored BEFORE the send:
 *  - no signature and old: the request died before signing, nothing was sent -> release
 *  - signature, found confirmed on devnet: the money moved -> hand back the receipt (recovered)
 *  - signature, failed on chain or blockhash expired: it can never land -> release
 *  - anything else (still in flight, RPC unreachable): keep the claim, the tenant retries later
 */
async function reconcilePending(
  db: Db,
  leaseId: string,
  kind: PaymentKind,
  monthIndex: number | undefined,
  intent: PaymentIntent,
): Promise<Gate | { kind: "released" }> {
  const row = await getPaymentRow(db, leaseId, kind, monthIndex);
  if (!row) return { kind: "released" }; // freed in the meantime
  if (row.status === "confirmed") return { kind: "response", response: conflict("Already paid", "already_paid") };
  if (!row.attempt) {
    return (await releaseStaleUnsigned(db, row.id, STALE_UNSIGNED_SECONDS))
      ? { kind: "released" }
      : { kind: "response", response: inProgress() };
  }
  let check;
  try {
    check = await checkPayment(intent, row.attempt);
  } catch (err) {
    logError("pay.reconcile", err);
    return {
      kind: "response",
      response: Response.json(
        { error: "Could not verify the previous payment attempt. Try again shortly.", code: "reconcile_unavailable" },
        { status: 503 },
      ),
    };
  }
  if (check.state === "confirmed") return { kind: "recovered", claimId: row.id, result: check.result };
  if (check.state === "pending") return { kind: "response", response: inProgress() };
  await releaseAttempt(db, row.id, row.attempt.signature);
  return { kind: "released" };
}

/** Frees a claim whose transfer was certainly NOT sent. A failure to free it is logged, never thrown. */
async function releaseNotSent(db: Db, claimId: string): Promise<void> {
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
