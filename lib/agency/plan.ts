// Pure decision step of a deposit release: is this lease releasable and is the proposed split valid?
// Business rules live here (and in approvals.ts), not in the route.
import { explorerTxUrl } from "../solana/explorer";
import { SplitError, validateSplit } from "./approvals";
import type { LeaseLedger } from "./ledger";

export class ReleaseError extends Error {
  constructor(
    message: string,
    /** HTTP status the route maps this to. */
    readonly status: 400 | 404 | 409 | 422 | 429 | 502 | 503,
    /** For "already released": explorer link of the original release (or of the marker account). */
    readonly explorerUrl?: string,
  ) {
    super(message);
    this.name = "ReleaseError";
  }
}

export interface ReleasePlan {
  leaseId: string;
  deposit: string;
  payer: string;
  toTenant: bigint;
  toLandlord: bigint;
}

/**
 * Refuses unless the lease has a deposit in custody and no verified release on chain yet (idempotency),
 * and the split adds up to exactly the deposit.
 */
export function planRelease(lease: LeaseLedger | undefined, toTenant: string, toLandlord: string): ReleasePlan {
  if (!lease) throw new ReleaseError("No lease with this id was found on chain.", 404);
  if (lease.release) {
    throw new ReleaseError("Already released: a release transaction authorised by the custody wallet exists on chain.", 409, explorerTxUrl(lease.release.signature));
  }
  if (!lease.deposit) throw new ReleaseError("This lease has no deposit in custody.", 409);
  try {
    const split = validateSplit(lease.deposit.amount, toTenant, toLandlord);
    return { leaseId: lease.leaseId, deposit: lease.deposit.amount, payer: lease.deposit.payer, ...split };
  } catch (err) {
    if (err instanceof SplitError) throw new ReleaseError(err.message, 422);
    throw err;
  }
}
