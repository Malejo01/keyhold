import type { FinalDecision, LeaseResponse } from '@/lib/contracts';
import { findProperty } from '@/lib/agents/catalog';
import { evaluateTenant } from '@/lib/agents/prequal';
import { createLeaseDraft } from '@/lib/agents/lease';
import { applyEvent, hasUploadApproval } from '@/lib/agents/orchestrator';
import { leaseRequestSchema } from '@/lib/db/schemas';
import { signSession, verifySession } from '@/lib/db/session';
import { jsonError, logError, parseBody, sessionErrorResponse } from '@/lib/db/http';

export const runtime = 'nodejs';

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

  const { tenantId, selectedPropertyId } = state;
  if (!tenantId) return jsonError('No tenant selected in this session', 400);
  if (!selectedPropertyId) return jsonError('No property selected in this session', 400);

  // The client-held session is never the source of truth for an approval: re-run the decision here. A real upload
  // cannot be re-run (files are not stored), so its server-signed attestation (part of the HMAC'd state) is used.
  if (!hasUploadApproval(state)) {
    let decision: FinalDecision;
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
    const response: LeaseResponse = { lease, session: signSession(next) };
    return Response.json(response);
  } catch (err) {
    logError('lease', err);
    return jsonError('Could not create the lease', 500);
  }
}
