// Server-only: reads the real devnet history of the custody wallet and the landlord token account.
// Signatures come with their memo, so only lease transactions are fetched in full (for the amounts).
// Results are cached for CACHE_TTL_MS (public devnet RPC rate-limits hard); confirmed transactions never change,
// so they are also kept per signature and are fetched at most once per server instance.
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { getDevnetConnection, getRpcUrl } from "../solana/connection";
import { getPaymentMint, landlordKeypair, platformKeypair, tenantKeypair } from "../solana/keys";
import { buildLedger, type ChainRecord, type ChainTransfer, type LeaseLedger, type LedgerContext } from "./ledger";
import { matchBySignature } from "./match";
import { extractLeaseMemo } from "./memo";

if (typeof window !== "undefined") {
  throw new Error("lib/agency/chain.ts must only be imported on the server.");
}

export const CACHE_TTL_MS = 30_000;
/** Newest leases listed (by latest activity). Older leases stay reachable with ?lease=<id>. */
const MAX_LEASES = 12;
/** The signature list is shared by every request for this long (it is the cheapest call, but still rate limited). */
const SIGNATURE_LIST_TTL_MS = 8_000;
const SIGNATURES_PER_ADDRESS = 100;
/** Public devnet rate-limits per RPC method, so transactions are read in small chunks, newest first. */
const FETCH_CHUNK = 3;
/** Pause between chunks and the time one refresh may spend reading transactions. */
const CHUNK_PAUSE_MS = 700;
const READ_BUDGET_MS = 9_000;
/** A partial read (rate limited) is cached only briefly so the next refresh continues where it stopped. */
const PARTIAL_TTL_MS = 3_000;
const RATE_LIMIT_RE = /too many requests|429|rate limit/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface LedgerSnapshot {
  ctx: LedgerContext;
  leases: LeaseLedger[];
  /** Unix ms when the chain was read. */
  readAt: number;
  /** True when this response came from the 30 s cache. */
  cached: boolean;
  /** True when the RPC failed and an older snapshot is being served. */
  stale: boolean;
  /** Lease transactions found on chain whose amounts could not be read yet (RPC rate limit). */
  pending: number;
  /** Distinct leases found on chain, including the ones not listed (older than the newest MAX_LEASES). */
  totalLeases: number;
}

export function currentContext(): LedgerContext {
  const mint = getPaymentMint();
  const custody = platformKeypair().publicKey;
  return {
    custodyOwner: custody.toBase58(),
    custodyAta: getAssociatedTokenAddressSync(mint, custody).toBase58(),
    landlordAta: getAssociatedTokenAddressSync(mint, landlordKeypair().publicKey).toBase58(),
  };
}

/** Demo persona label for a wallet, when it is one of the three demo tenants. Never a name from a document. */
export function tenantLabelFor(wallet: string): string | null {
  for (const id of ["ana", "bruno", "carla"] as const) {
    try {
      if (tenantKeypair(id).publicKey.toBase58() === wallet) return id.charAt(0).toUpperCase() + id.slice(1);
    } catch {
      /* key not configured in this environment */
    }
  }
  return null;
}

function transfersOf(tx: ParsedTransactionWithMeta, mint: string): ChainTransfer[] {
  const out: ChainTransfer[] = [];
  for (const ix of tx.transaction.message.instructions) {
    if (!("parsed" in ix) || !ix.programId.equals(TOKEN_PROGRAM_ID)) continue;
    const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> } | undefined;
    if (parsed?.type !== "transferChecked" || !parsed.info) continue;
    const info = parsed.info as {
      source?: string;
      destination?: string;
      authority?: string;
      mint?: string;
      tokenAmount?: { amount?: string };
    };
    if (info.mint !== mint || !info.source || !info.destination || !info.authority || !info.tokenAmount?.amount) continue;
    out.push({ source: info.source, destination: info.destination, authority: info.authority, amount: info.tokenAmount.amount });
  }
  return out;
}

const txCache = new Map<string, ChainRecord>();
const snapshots = new Map<string, { at: number; ttl: number; value: LedgerSnapshot }>();
const inflight = new Map<string, Promise<LedgerSnapshot>>();
let signatureList: { at: number; value: SigInfo[] } | null = null;

export function invalidateLedgerCache(): void {
  snapshots.clear();
  signatureList = null;
}

let pacedConnection: Connection | undefined;

/**
 * Same endpoint as the rest of the app (devnet is verified through getDevnetConnection first), but without
 * web3.js automatic 429 retries: pacing and giving up are decided here so a refresh never hangs for minutes.
 */
async function readConnection(): Promise<Connection> {
  await getDevnetConnection();
  pacedConnection ??= new Connection(getRpcUrl(), { commitment: "confirmed", disableRetryOnRateLimit: true });
  return pacedConnection;
}

interface SigInfo {
  signature: string;
  blockTime: number | null;
  memo: string | null;
}

/**
 * Successful signatures on the custody and landlord token accounts that carry a lease memo, newest first.
 * Without `leaseId`: the newest page of each account (shared 8 s cache). With `leaseId`: pages back through history
 * (up to MAX_PAGES per account) until that lease shows up, so an old lease can still be opened.
 */
async function listLeaseSignatures(connection: Connection, ctx: LedgerContext, opts: { fresh?: boolean; leaseId?: string } = {}): Promise<SigInfo[]> {
  if (opts.leaseId) return fetchLeaseSignatures(connection, ctx, opts.leaseId);
  if (!opts.fresh && signatureList && Date.now() - signatureList.at < SIGNATURE_LIST_TTL_MS) return signatureList.value;
  const value = await fetchLeaseSignatures(connection, ctx);
  signatureList = { at: Date.now(), value };
  return value;
}

const MAX_PAGES = 6;

async function signaturePage(connection: Connection, address: string, before?: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await connection.getSignaturesForAddress(new PublicKey(address), { limit: SIGNATURES_PER_ADDRESS, before }, "confirmed");
    } catch (err) {
      if (attempt >= 3 || !RATE_LIMIT_RE.test(err instanceof Error ? err.message : "")) throw err;
      await sleep(1_500 * (attempt + 1));
    }
  }
}

async function fetchLeaseSignatures(connection: Connection, ctx: LedgerContext, leaseId?: string): Promise<SigInfo[]> {
  const bySig = new Map<string, SigInfo>();
  for (const address of [ctx.custodyAta, ctx.landlordAta]) {
    let before: string | undefined;
    for (let page = 0; page < (leaseId ? MAX_PAGES : 1); page++) {
      const infos = await signaturePage(connection, address, before);
      let foundLease = false;
      for (const info of infos) {
        if (info.err) continue;
        const memo = extractLeaseMemo(info.memo);
        if (!memo) continue;
        if (leaseId && memo.leaseId === leaseId) foundLease = true;
        bySig.set(info.signature, { signature: info.signature, blockTime: info.blockTime ?? null, memo: info.memo ?? null });
      }
      if (foundLease || infos.length < SIGNATURES_PER_ADDRESS) break;
      before = infos[infos.length - 1].signature;
    }
  }
  return [...bySig.values()].sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));
}

/**
 * Reads the transactions that are not cached yet, in small paced chunks, newest first. Stops on a rate limit or
 * when the time budget is spent; whatever was read stays cached for the next call.
 */
async function readTransactions(connection: Connection, sigs: SigInfo[], mint: string, budgetMs: number): Promise<void> {
  const missing = sigs.filter((w) => !txCache.has(w.signature));
  let rateLimited = false;
  const startedAt = Date.now();
  for (let i = 0; i < missing.length && !rateLimited && Date.now() - startedAt < budgetMs; i += FETCH_CHUNK) {
    if (i > 0) await sleep(CHUNK_PAUSE_MS);
    const chunk = missing.slice(i, i + FETCH_CHUNK);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const txs = await connection.getParsedTransactions(
          chunk.map((c) => c.signature),
          { commitment: "confirmed", maxSupportedTransactionVersion: 0 },
        );
        for (const [c, tx] of matchBySignature(chunk, txs)) {
          if (tx.meta?.err) continue;
          txCache.set(c.signature, { signature: c.signature, blockTime: tx.blockTime ?? c.blockTime, memo: c.memo, transfers: transfersOf(tx, mint) });
        }
        break;
      } catch (err) {
        if (!RATE_LIMIT_RE.test(err instanceof Error ? err.message : "")) throw err;
        if (attempt === 1) rateLimited = true;
        else await sleep(2_000);
      }
    }
  }
}

/** Keeps every transaction of the `max` leases with the newest activity (all of a lease, never half of it). */
function newestLeases(sigs: SigInfo[], max: number): SigInfo[] {
  const keep: string[] = [];
  for (const s of sigs) {
    const id = extractLeaseMemo(s.memo)?.leaseId;
    if (id && !keep.includes(id)) keep.push(id);
    if (keep.length >= max) break;
  }
  return sigs.filter((s) => keep.includes(extractLeaseMemo(s.memo)?.leaseId ?? ""));
}

async function readChain(leaseId?: string): Promise<LedgerSnapshot> {
  const connection = await readConnection();
  const ctx = currentContext();
  const mint = getPaymentMint().toBase58();
  const all = await listLeaseSignatures(connection, ctx, { leaseId });
  const wanted = leaseId ? all.filter((s) => extractLeaseMemo(s.memo)?.leaseId === leaseId) : newestLeases(all, MAX_LEASES);
  await readTransactions(connection, wanted, mint, READ_BUDGET_MS);
  const records = wanted.map((w) => txCache.get(w.signature)).filter((r): r is ChainRecord => !!r);
  return {
    ctx,
    leases: buildLedger(records, ctx),
    readAt: Date.now(),
    cached: false,
    stale: false,
    pending: wanted.length - records.length,
    totalLeases: new Set(all.map((s) => extractLeaseMemo(s.memo)?.leaseId)).size,
  };
}

/**
 * What a release needs to know about one lease, without reading every other lease: whether any release memo exists
 * (read from the signature list, no transaction fetch) and the lease's own deposit and rent transactions.
 * A release memo seen on chain blocks a second release even if its transfers are not verified here (refusing is the
 * safe side). Returns `incomplete` when the deposit transaction could not be read (rate limit).
 */
export async function loadLeaseForRelease(
  leaseId: string,
): Promise<{ lease: LeaseLedger | undefined; releaseMemoSeen: boolean; incomplete: boolean }> {
  const connection = await readConnection();
  const ctx = currentContext();
  const mint = getPaymentMint().toBase58();
  const all = (await listLeaseSignatures(connection, ctx, { fresh: true, leaseId })).filter((s) => extractLeaseMemo(s.memo)?.leaseId === leaseId);
  const releaseMemoSeen = all.some((s) => extractLeaseMemo(s.memo)?.kind === "release");
  const needed = all.filter((s) => extractLeaseMemo(s.memo)?.kind !== "release");
  await readTransactions(connection, needed, mint, READ_BUDGET_MS);
  const records = all.map((w) => txCache.get(w.signature)).filter((r): r is ChainRecord => !!r);
  const lease = buildLedger(records, ctx).find((l) => l.leaseId === leaseId);
  return { lease, releaseMemoSeen, incomplete: needed.some((s) => !txCache.has(s.signature)) && !lease?.deposit };
}

/**
 * Ledger of the newest leases with activity on the custody or landlord token account (cached for 30 s), or, with
 * `leaseId`, of that single lease.
 */
export async function loadLedger(opts: { fresh?: boolean; leaseId?: string } = {}): Promise<LedgerSnapshot> {
  const key = opts.leaseId ?? "*";
  const now = Date.now();
  const hit = snapshots.get(key);
  if (!opts.fresh && hit && now - hit.at < hit.ttl) return { ...hit.value, cached: true };
  let pending = inflight.get(key);
  if (!pending) {
    pending = readChain(opts.leaseId)
      .then((value) => {
        snapshots.set(key, { at: Date.now(), ttl: value.pending > 0 || value.leases.length === 0 ? PARTIAL_TTL_MS : CACHE_TTL_MS, value });
        if (snapshots.size > 50) snapshots.delete(snapshots.keys().next().value as string);
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, pending);
  }
  try {
    return await pending;
  } catch (err) {
    if (hit) return { ...hit.value, cached: true, stale: true };
    throw err;
  }
}
