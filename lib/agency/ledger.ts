// Pure grouping of on-chain lease activity into one ledger row per lease. No I/O: lib/agency/chain.ts
// fetches the raw records, this file decides what they mean (the model extracts, the code decides).
import { extractLeaseMemo, type ParsedLeaseMemo } from "./memo";

/** One SPL transferChecked inside a confirmed transaction. Addresses are base58 strings. */
export interface ChainTransfer {
  /** Source token account. */
  source: string;
  /** Destination token account. */
  destination: string;
  /** Wallet that authorised the transfer. */
  authority: string;
  /** Base units (6 decimals) as a decimal string. */
  amount: string;
}

/** A confirmed, successful transaction that touched the custody or landlord token account. */
export interface ChainRecord {
  signature: string;
  blockTime: number | null;
  /** Raw memo text as returned by the RPC (`[len] text`). */
  memo: string | null;
  transfers: ChainTransfer[];
}

export interface LedgerContext {
  /** Custody (platform) wallet and its tUSDC token account. */
  custodyOwner: string;
  custodyAta: string;
  /** Landlord tUSDC token account. */
  landlordAta: string;
}

export interface DepositEntry {
  signature: string;
  blockTime: number | null;
  amount: string;
  /** Wallet that paid the deposit (a demo tenant wallet). */
  payer: string;
}

export interface RentEntry {
  signature: string;
  blockTime: number | null;
  monthIndex: number;
  amount: string;
  /** Discount against the deposit-sized list rent, in bps. Null when it cannot be inferred. */
  discountBps: number | null;
  /** 500 bps (USDC 3% + on-time 2%) means the payment landed by the due date. Null when unknown. */
  onTime: boolean | null;
}

export interface ReleaseEntry {
  signature: string;
  blockTime: number | null;
  toTenant: string;
  toLandlord: string;
  reasonHash: string;
}

export type LeaseStatus = "deposit_held" | "deposit_released" | "no_deposit";

export interface LeaseLedger {
  leaseId: string;
  legacy: boolean;
  /** sha256 of the contract text, from the deposit (or first rent) memo. */
  contractHash: string | null;
  status: LeaseStatus;
  deposit: DepositEntry | null;
  rent: RentEntry[];
  release: ReleaseEntry | null;
  /** Latest blockTime across entries, for sorting. */
  lastActivity: number | null;
}

/** Full discount (USDC 3% + on-time 2%) expressed in bps. Mirrors DISCOUNT_* in lib/agents/lease.ts. */
export const ON_TIME_TOTAL_BPS = 500;

/**
 * Infers the discount from the amount paid against the deposit, which equals one month of list rent in the
 * contract template. Returns null when there is no deposit to compare with or the amount is above it.
 */
export function inferDiscountBps(rentAmount: string, depositAmount: string | null): number | null {
  if (!depositAmount) return null;
  const rent = BigInt(rentAmount);
  const list = BigInt(depositAmount);
  if (list <= BigInt(0) || rent > list) return null;
  // Round to the nearest bp so integer truncation in the on-chain amount does not matter.
  const paidBps = (rent * BigInt(10_000) * BigInt(2) + list) / (list * BigInt(2));
  return 10_000 - Number(paidBps);
}

function earliest<T extends { blockTime: number | null }>(a: T | undefined, b: T): T {
  if (!a) return b;
  return (b.blockTime ?? Infinity) < (a.blockTime ?? Infinity) ? b : a;
}

/** Groups records by leaseId. Entries that do not match their memo's kind are ignored (anyone can send a memo). */
export function buildLedger(records: ChainRecord[], ctx: LedgerContext): LeaseLedger[] {
  interface Acc {
    legacy: boolean;
    hash: string | null;
    deposit?: DepositEntry;
    rent: Map<number, RentEntry>;
    release?: ReleaseEntry;
  }
  const byLease = new Map<string, Acc>();
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.signature)) continue;
    seen.add(record.signature);
    const memo: ParsedLeaseMemo | null = extractLeaseMemo(record.memo);
    if (!memo) continue;

    let entry: { kind: "deposit"; v: DepositEntry } | { kind: "rent"; v: RentEntry } | { kind: "release"; v: ReleaseEntry } | null = null;

    if (memo.kind === "deposit") {
      const t = record.transfers.find((x) => x.destination === ctx.custodyAta);
      if (t) {
        entry = { kind: "deposit", v: { signature: record.signature, blockTime: record.blockTime, amount: t.amount, payer: t.authority } };
      }
    } else if (memo.kind === "rent") {
      const t = record.transfers.find((x) => x.destination === ctx.landlordAta);
      if (t && memo.monthIndex !== undefined) {
        entry = {
          kind: "rent",
          v: { signature: record.signature, blockTime: record.blockTime, monthIndex: memo.monthIndex, amount: t.amount, discountBps: null, onTime: null },
        };
      }
    } else {
      // A release only counts when the custody wallet itself authorised every transfer out of its token account.
      const out = record.transfers.filter((x) => x.source === ctx.custodyAta && x.authority === ctx.custodyOwner);
      if (out.length > 0 && out.length === record.transfers.length) {
        let toTenant = BigInt(0);
        let toLandlord = BigInt(0);
        for (const t of out) {
          if (t.destination === ctx.landlordAta) toLandlord += BigInt(t.amount);
          else toTenant += BigInt(t.amount);
        }
        entry = {
          kind: "release",
          v: { signature: record.signature, blockTime: record.blockTime, toTenant: toTenant.toString(), toLandlord: toLandlord.toString(), reasonHash: memo.hash },
        };
      }
    }
    if (!entry) continue;

    const acc = byLease.get(memo.leaseId) ?? { legacy: memo.legacy, hash: null, rent: new Map<number, RentEntry>() };
    byLease.set(memo.leaseId, acc);
    if (memo.kind !== "release") acc.hash ??= memo.hash;
    if (!memo.legacy) acc.legacy = false;
    if (entry.kind === "deposit") acc.deposit = earliest(acc.deposit, entry.v);
    else if (entry.kind === "rent") acc.rent.set(entry.v.monthIndex, earliest(acc.rent.get(entry.v.monthIndex), entry.v));
    else acc.release = earliest(acc.release, entry.v);
  }

  const ledgers: LeaseLedger[] = [];
  for (const [leaseId, acc] of byLease) {
    const deposit = acc.deposit ?? null;
    const rent = [...acc.rent.values()]
      .map((r) => {
        const discountBps = inferDiscountBps(r.amount, deposit?.amount ?? null);
        return { ...r, discountBps, onTime: discountBps === null ? null : discountBps >= ON_TIME_TOTAL_BPS };
      })
      .sort((a, b) => a.monthIndex - b.monthIndex);
    const release = acc.release ?? null;
    const times = [deposit?.blockTime, release?.blockTime, ...rent.map((r) => r.blockTime)].filter((t): t is number => typeof t === "number");
    ledgers.push({
      leaseId,
      legacy: acc.legacy,
      contractHash: acc.hash,
      status: !deposit ? "no_deposit" : release ? "deposit_released" : "deposit_held",
      deposit,
      rent,
      release,
      lastActivity: times.length ? Math.max(...times) : null,
    });
  }
  return ledgers.sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));
}
