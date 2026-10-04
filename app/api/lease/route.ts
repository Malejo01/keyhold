import type { FinalDecision, LeaseResponse, SessionState } from '@/lib/contracts';
import { findProperty } from '@/lib/agents/catalog';
import { evaluateTenant } from '@/lib/agents/prequal';
import { createLeaseDraft } from '@/lib/agents/lease';
import { applyEvent, hasUploadApproval } from '@/lib/agents/orchestrator';
import { leaseRequestSchema } from '@/lib/db/schemas';
import { signSession, verifySession } from '@/lib/db/session';
import { jsonError, logError, parseBody, sessionErrorResponse, staleSessionResponse } from '@/lib/db/http';
import { getDb } from '@/lib/db/client';
import { ensureReferenceData } from '@/lib/db/reference';
import { recordPrequal, touchSession, upsertLease } from '@/lib/db/store';

export const runtime = 'nodejs';

/** Best effort: the lease also gets upserted by /api/pay, so a database blip here must not break the demo. */
/** `decision` is absent for an upload approval: the files are never stored, the signed attestation is the record. */
async function persistLease(state: SessionState, decision?: FinalDecision): Promise<void> {
  const db = getDb();
  if (!db || !state.lease) return;
  try {
    await ensureReferenceData(db);
    await touchSession(db, state);
    await upsertLease(db, state, state.lease);
    if (decision) await recordPrequal(db, state.sessionId, state.lease.propertyId, decision);
  } catch (err) {
    logError('lease.persist', err);
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, leaseRequestSchema);
  if (!body.ok) return body.response;

  let state;
  try {
    state = verifySession(body.data.session);
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    logError('lease', err);
    return jsonError('Internal error', 500);
  }

  const stale = await staleSessionResponse(state);
  if (stale) return stale;

  const { tenantId, selectedPropertyId } = state;
  if (!tenantId) return jsonError('No tenant selected in this session', 400);
  if (!selectedPropertyId) return jsonError('No property selected in this session', 400);

  // The client-held session is never the source of truth for an approval: re-run the decision here. A real upload
  // cannot be re-run (files are not stored), so its server-signed attestation (part of the HMAC'd state) is used.
  let decision: FinalDecision | undefined;
  if (!hasUploadApproval(state)) {
    try {
      decision = await evaluateTenant(tenantId, findProperty(selectedPropertyId)?.priceUsdc);
    } catch (err) {
      logError('lease', err);
      return jsonError('Could not evaluate the application', 502);
    }
    if (decision.status !== 'APPROVED') {
      return Response.json(
        { error: 'Application is not approved', decision },
        { status: 409 },
      );
    }
  }

  try {
    const lease = createLeaseDraft(tenantId, selectedPropertyId);
    const next = applyEvent(state, { type: 'lease_created', lease });
    const signed = signSession(next);
    await persistLease(signed.state, decision);
    const response: LeaseResponse = { lease, session: signed };
    return Response.json(response);
  } catch (err) {
    logError('lease', err);
    return jsonError('Could not create the lease', 500);
  }
}
