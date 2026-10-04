// Demo NEEDS_INFO queue. Sessions are client-held (no database yet), so the queue is computed on the server by
// running the real prequal + cross-check agents and the deterministic rules for the three simulated demo
// tenants against one demo property. The agents run from recordings (REPLAY) so the result is identical on
// every load and costs no model call. Everything here is simulated data; nothing is written on chain.
import type { FinalDecision, Issue, PrequalStatus, TenantId } from "../contracts";
import { evaluateTenant } from "../agents/prequal";
import { findProperty } from "../agents/catalog";
import { TENANT_IDS, tenantDisplayName } from "../agents/tenants";

export const DEMO_PROPERTY_ID = "prop-01";

export interface QueueCase {
  tenantId: TenantId;
  /** Demo persona name from the seed (simulated). */
  tenantName: string;
  status: PrequalStatus;
  decidedBy: "prequal" | "crosscheck";
  /** Issues from the deciding agent: prequal issues, or the cross-check discrepancies when it disagreed. */
  issues: Issue[];
}

export interface QueueSnapshot {
  property: { id: string; title: string; titleEs?: string; priceUsdc: number };
  /** Applications that need information (NEEDS_INFO) or were rejected, in a stable order. */
  cases: QueueCase[];
  /** Demo tenants whose application was approved without a flag. */
  approved: string[];
  simulated: true;
}

/**
 * Runs `fn` with REPLAY=1 so the agents serve recordings, whatever the environment says. Calls are serialised
 * and the variable restored afterwards; replay lookups are in-memory, so the window is a few milliseconds.
 */
let replayChain: Promise<unknown> = Promise.resolve();
function withReplay<T>(fn: () => Promise<T>): Promise<T> {
  const run = replayChain.then(async () => {
    const previous = process.env.REPLAY;
    process.env.REPLAY = "1";
    try {
      return await fn();
    } finally {
      if (previous === undefined) delete process.env.REPLAY;
      else process.env.REPLAY = previous;
    }
  });
  replayChain = run.catch(() => undefined);
  return run;
}

/** Issues behind the final status. The cross-check wins when it vetoed an otherwise clean pre-qualification. */
export function reasonsOf(decision: FinalDecision): Issue[] {
  if (decision.decidedBy === "crosscheck") return decision.crosscheck.discrepancies;
  return decision.prequal.issues;
}

export function toCase(tenantId: TenantId, decision: FinalDecision): QueueCase {
  return {
    tenantId,
    tenantName: tenantDisplayName(tenantId),
    status: decision.status,
    decidedBy: decision.decidedBy,
    issues: reasonsOf(decision),
  };
}

let cached: Promise<QueueSnapshot> | null = null;

export function loadQueue(): Promise<QueueSnapshot> {
  cached ??= (async () => {
    const property = findProperty(DEMO_PROPERTY_ID);
    if (!property) throw new Error(`Demo property ${DEMO_PROPERTY_ID} is missing from the catalog.`);
    const decisions = await withReplay(async () => {
      const out: Array<[TenantId, FinalDecision]> = [];
      for (const id of TENANT_IDS) out.push([id, await evaluateTenant(id, property.priceUsdc)]);
      return out;
    });
    const cases = decisions.filter(([, d]) => d.status !== "APPROVED").map(([id, d]) => toCase(id, d));
    const approved = decisions.filter(([, d]) => d.status === "APPROVED").map(([id]) => tenantDisplayName(id));
    return {
      property: { id: property.id, title: property.title, titleEs: property.titleEs, priceUsdc: property.priceUsdc },
      cases,
      approved,
      simulated: true as const,
    };
  })().catch((err) => {
    cached = null; // do not cache a failure
    throw err;
  });
  return cached;
}
