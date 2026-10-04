// JSON-safe view of the ledger for the panel and the API. Adds explorer links and demo persona labels.
import { explorerAddressUrl, explorerTxUrl } from "../solana/explorer";
import type { LeaseLedger, LeaseStatus, ReleaseEntry } from "./ledger";
import { CACHE_TTL_MS, tenantLabelFor, type LedgerSnapshot } from "./chain";

export interface TxRef {
  signature: string;
  explorerUrl: string;
  /** Unix seconds from the confirmed transaction, never from a device clock. */
  blockTime: number | null;
}

export interface LeaseDto {
  leaseId: string;
  legacyMemo: boolean;
  contractHash: string | null;
  status: LeaseStatus;
  payer: { wallet: string; label: string | null } | null;
  deposit: (TxRef & { amount: string }) | null;
  rent: Array<TxRef & { monthIndex: number; amount: string; discountBps: number | null; onTime: boolean | null }>;
  /** The earliest release, kept for the status badge. */
  release: ReleaseDto | null;
  /** Every release transaction on chain for this lease, oldest first. */
  releases: ReleaseDto[];
  /** More than one release landed, or the releases pay out more than the deposit. Shown in red. */
  duplicateRelease: boolean;
}

export type ReleaseDto = TxRef & { toTenant: string; toLandlord: string; reasonHash: string };

export interface LeasesResponse {
  leases: LeaseDto[];
  custody: { wallet: string; tokenAccount: string; explorerUrl: string };
  landlordTokenAccount: { address: string; explorerUrl: string };
  readAt: number;
  cached: boolean;
  stale: boolean;
  /** Lease transactions not read yet because of RPC rate limits; the panel keeps refreshing. */
  pending: number;
  /** Leases on chain in total; the list shows the newest ones unless a single lease was requested. */
  totalLeases: number;
  cacheTtlSeconds: number;
  /** Whether this deployment can sign releases (AGENCY_SECRET_KEY present). Never the key itself. */
  releaseAvailable: boolean;
  escrowMode: "custodial" | "program";
}

const tx = (signature: string, blockTime: number | null): TxRef => ({ signature, blockTime, explorerUrl: explorerTxUrl(signature) });

const releaseDto = (r: ReleaseEntry): ReleaseDto => ({
  ...tx(r.signature, r.blockTime),
  toTenant: r.toTenant,
  toLandlord: r.toLandlord,
  reasonHash: r.reasonHash,
});

export function toLeaseDto(l: LeaseLedger): LeaseDto {
  return {
    leaseId: l.leaseId,
    legacyMemo: l.legacy,
    contractHash: l.contractHash,
    status: l.status,
    payer: l.deposit ? { wallet: l.deposit.payer, label: tenantLabelFor(l.deposit.payer) } : null,
    deposit: l.deposit ? { ...tx(l.deposit.signature, l.deposit.blockTime), amount: l.deposit.amount } : null,
    rent: l.rent.map((r) => ({ ...tx(r.signature, r.blockTime), monthIndex: r.monthIndex, amount: r.amount, discountBps: r.discountBps, onTime: r.onTime })),
    release: l.release ? releaseDto(l.release) : null,
    releases: l.releases.map(releaseDto),
    duplicateRelease: l.duplicateRelease,
  };
}

export function toLeasesResponse(snap: LedgerSnapshot): LeasesResponse {
  const ctx = snap.ctx;
  return {
    leases: snap.leases.map(toLeaseDto),
    custody: { wallet: ctx.custodyOwner, tokenAccount: ctx.custodyAta, explorerUrl: explorerAddressUrl(ctx.custodyOwner) },
    landlordTokenAccount: { address: ctx.landlordAta, explorerUrl: explorerAddressUrl(ctx.landlordAta) },
    readAt: snap.readAt,
    cached: snap.cached,
    stale: snap.stale,
    pending: snap.pending,
    totalLeases: snap.totalLeases,
    cacheTtlSeconds: CACHE_TTL_MS / 1000,
    releaseAvailable: Boolean(process.env.AGENCY_SECRET_KEY?.trim()) && process.env.ESCROW_MODE?.trim() !== "program",
    escrowMode: process.env.ESCROW_MODE?.trim() === "program" ? "program" : "custodial",
  };
}
