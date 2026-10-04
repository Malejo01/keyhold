"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useId, useState } from "react";
import type { LeaseDto, LeasesResponse } from "@/lib/agency/dto";
import { landlordShare, usdcToBaseUnits } from "@/lib/agency/units";
import { itemIn, stagger, swap } from "@/lib/motion/presets";
import { formatBps, formatTs, formatUsdc, shortHash } from "../format";
import { AlertIcon, Badge, Button, CardShell, CheckIcon, ClockIcon, ExternalIcon } from "../ui";

interface ReleaseOk {
  signature: string;
  explorerUrl: string;
  memo: string;
  reasonHash: string;
  toTenant: string;
  toLandlord: string;
  approvedBy: string[];
}

const STATUS: Record<LeaseDto["status"], { label: string; tone: "accent" | "success" | "neutral" }> = {
  deposit_held: { label: "Deposit in custody", tone: "accent" },
  deposit_released: { label: "Deposit released", tone: "success" },
  no_deposit: { label: "No deposit seen", tone: "neutral" },
};

const sumReleases = (releases: LeaseDto["releases"]): string =>
  releases.reduce((sum, r) => sum + BigInt(r.toTenant) + BigInt(r.toLandlord), BigInt(0)).toString();

function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-accent underline underline-offset-2"
    >
      {children}
      <ExternalIcon className="size-3" />
      <span className="sr-only">(opens Solana Explorer in a new tab)</span>
    </a>
  );
}

function ReleaseForm({
  lease,
  onDone,
  onCancel,
}: {
  lease: LeaseDto;
  onDone: (result: ReleaseOk) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const deposit = lease.deposit?.amount ?? "0";
  const [tenantText, setTenantText] = useState("0");
  const [reason, setReason] = useState("");
  const [approver, setApprover] = useState<"tenant" | "landlord">("tenant");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; explorerUrl?: string } | null>(null);

  const tenantBase = usdcToBaseUnits(tenantText);
  const landlordBase = landlordShare(deposit, tenantBase);
  const splitOk = tenantBase !== null && landlordBase !== null;
  const valid = splitOk && reason.trim().length >= 3;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy || tenantBase === null || landlordBase === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agency/release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaseId: lease.leaseId, toTenant: tenantBase, toLandlord: landlordBase, reason: reason.trim(), approver }),
      });
      const json = (await res.json().catch(() => null)) as { release?: ReleaseOk; error?: string; explorerUrl?: string } | null;
      if (!res.ok || !json?.release) {
        setError({ message: json?.error ?? `The release failed (HTTP ${res.status}).`, explorerUrl: json?.explorerUrl });
        return;
      }
      onDone(json.release);
    } catch {
      setError({ message: "Network error. Check the lease status before trying again; a second release cannot pay out twice." });
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle";

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-md border border-border bg-background p-3" aria-label="Release deposit">
      <p className="text-sm">
        <span className="font-semibold">Propose a split of the {formatUsdc(deposit)} USDC deposit.</span> Both shares must add up to
        the deposit.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-t`} className="text-xs font-semibold text-muted">
            To tenant (USDC)
          </label>
          <input
            id={`${uid}-t`}
            inputMode="decimal"
            value={tenantText}
            onChange={(e) => setTenantText(e.target.value)}
            aria-invalid={!splitOk}
            aria-describedby={`${uid}-split`}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-l`} className="text-xs font-semibold text-muted">
            To landlord (USDC, the rest)
          </label>
          <input id={`${uid}-l`} readOnly value={landlordBase === null ? "" : formatUsdc(landlordBase)} className={`${fieldClass} bg-sunken`} />
        </div>
      </div>
      <p id={`${uid}-split`} className={`text-xs ${splitOk ? "text-muted" : "font-semibold text-danger"}`}>
        {splitOk ? "The two shares add up to the deposit." : "Enter an amount from 0 up to the deposit, with at most 6 decimals."}
      </p>
      <div>
        <label htmlFor={`${uid}-r`} className="text-xs font-semibold text-muted">
          Reason (hashed with sha256 on the server; the text is not stored)
        </label>
        <textarea
          id={`${uid}-r`}
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Move-out inspection agreed; deduction for repainting"
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-muted">Do not type personal data. Only the hash goes on chain.</p>
      </div>
      <div>
        <label htmlFor={`${uid}-a`} className="text-xs font-semibold text-muted">
          Second approval (next to the agency)
        </label>
        <select id={`${uid}-a`} value={approver} onChange={(e) => setApprover(e.target.value as "tenant" | "landlord")} className={fieldClass}>
          <option value="tenant">Tenant</option>
          <option value="landlord">Landlord</option>
        </select>
      </div>
      <p className="rounded-md bg-warning-soft p-2 text-xs text-warning">
        Simulated 2-of-3 approval: the demo server holds all three keys. The Anchor program (built and tested, not yet deployed) will enforce this on chain.
      </p>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            {error.message}
            {error.explorerUrl && (
              <>
                {" "}
                <ExplorerLink href={error.explorerUrl}>Original release</ExplorerLink>
              </>
            )}
          </span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!valid || busy} aria-busy={busy}>
          {busy ? "Signing and sending…" : "Approve and release"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function LeaseCard({
  lease,
  releaseAvailable,
  onReleased,
}: {
  lease: LeaseDto;
  releaseAvailable: boolean;
  onReleased: (r: ReleaseOk) => void;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<ReleaseOk | null>(null);
  const status = STATUS[lease.status];
  const canRelease = lease.status === "deposit_held" && !done;

  return (
    <CardShell label={`Lease ${lease.leaseId}`} className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-all font-mono text-sm font-semibold">{lease.leaseId}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {lease.payer ? `Paid by ${lease.payer.label ?? shortHash(lease.payer.wallet, 6, 4)}` : "No payer seen"}
            {lease.legacyMemo && " · legacy memo prefix"}
          </p>
        </div>
        <Badge tone={done ? "success" : status.tone}>{done ? "Deposit released" : status.label}</Badge>
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Deposit</dt>
          <dd>
            {lease.deposit ? (
              <>
                <span className="font-semibold">{formatUsdc(lease.deposit.amount)} USDC</span>{" "}
                <ExplorerLink href={lease.deposit.explorerUrl}>tx</ExplorerLink>
                {lease.deposit.blockTime && <span className="block text-xs text-muted">{formatTs(lease.deposit.blockTime)}</span>}
              </>
            ) : (
              <span className="text-muted">Not paid</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Contract hash (from the memo)</dt>
          <dd className="break-all font-mono text-xs">{lease.contractHash ? shortHash(lease.contractHash, 12, 8) : "—"}</dd>
        </div>
      </dl>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
        Rent paid: {lease.rent.length} {lease.rent.length === 1 ? "month" : "months"}
      </h4>
      {lease.rent.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {lease.rent.map((r) => (
            <li key={r.signature} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <span className="font-semibold">Month {r.monthIndex + 1}</span>
              <span>{formatUsdc(r.amount)} USDC</span>
              {r.discountBps !== null && <span className="text-xs text-muted">{formatBps(r.discountBps)} discount</span>}
              {r.onTime !== null && (
                <Badge tone={r.onTime ? "success" : "warning"}>
                  {r.onTime ? <CheckIcon className="size-3" /> : <ClockIcon className="size-3" />}
                  {r.onTime ? "On time" : "Late"}
                </Badge>
              )}
              {r.blockTime && <span className="text-xs text-muted">{formatTs(r.blockTime)}</span>}
              <ExplorerLink href={r.explorerUrl}>tx</ExplorerLink>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No rent payments yet.</p>
      )}
      {lease.rent.some((r) => r.onTime !== null) && (
        <p className="mt-2 text-xs text-muted">On time is inferred from the amount: a 5% discount means the payment was confirmed by the due date.</p>
      )}

      {lease.duplicateRelease && (
        <div role="alert" className="mt-4 rounded-md border border-danger bg-danger-soft p-3 text-sm font-semibold text-danger">
          <p className="flex items-start gap-1.5">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              Duplicate release: {lease.releases.length} release transactions are on chain for this lease, paying out{" "}
              {formatUsdc(sumReleases(lease.releases))} USDC against a {lease.deposit ? formatUsdc(lease.deposit.amount) : "0.00"} USDC deposit.
              Check every transaction below.
            </span>
          </p>
        </div>
      )}
      {(lease.releases.length > 0 || done) && (
        <div className="mt-4 flex flex-col gap-2">
          {lease.releases.map((r, i) => (
            <div
              key={r.signature}
              className={`rounded-md border p-3 text-sm ${lease.duplicateRelease ? "border-danger bg-danger-soft text-danger" : "border-border bg-success-soft text-success"}`}
            >
              <p className="flex items-center gap-1.5 font-semibold">
                {lease.duplicateRelease ? <AlertIcon className="size-4" /> : <CheckIcon className="size-4" />}
                {lease.releases.length > 1 ? `Release ${i + 1} of ${lease.releases.length}: ` : "Released: "}
                {formatUsdc(r.toTenant)} USDC to the tenant, {formatUsdc(r.toLandlord)} USDC to the landlord
              </p>
              <p className="mt-1 break-all font-mono text-xs">Reason hash: {shortHash(r.reasonHash, 12, 8)}</p>
              {r.blockTime && <p className="mt-1 text-xs">{formatTs(r.blockTime)}</p>}
              <p className="mt-1">
                <ExplorerLink href={r.explorerUrl}>Release transaction</ExplorerLink>
              </p>
            </div>
          ))}
          {done && lease.releases.length === 0 && (
            <div className="rounded-md border border-border bg-success-soft p-3 text-sm text-success">
              <p className="flex items-center gap-1.5 font-semibold">
                <CheckIcon className="size-4" /> Released: {formatUsdc(done.toTenant)} USDC to the tenant, {formatUsdc(done.toLandlord)} USDC to the landlord
              </p>
              <p className="mt-1 text-xs">Approved by {done.approvedBy.join(" and ")} (simulated 2-of-3).</p>
              <p className="mt-1 break-all font-mono text-xs">Reason hash: {shortHash(done.reasonHash, 12, 8)}</p>
              <p className="mt-1">
                <ExplorerLink href={done.explorerUrl}>Release transaction</ExplorerLink>
              </p>
            </div>
          )}
        </div>
      )}

      {canRelease && (
        <div className="mt-4">
          {!open ? (
            <>
              <Button variant="secondary" onClick={() => setOpen(true)} disabled={!releaseAvailable} aria-describedby={`rel-${lease.leaseId}`}>
                Release deposit
              </Button>
              {!releaseAvailable && (
                <p id={`rel-${lease.leaseId}`} className="mt-2 text-xs text-muted">
                  Release is not available on this deployment (no agency key, or the escrow is not custodial).
                </p>
              )}
            </>
          ) : (
            <ReleaseForm
              lease={lease}
              onCancel={() => setOpen(false)}
              onDone={(r) => {
                setDone(r);
                setOpen(false);
                onReleased(r);
              }}
            />
          )}
        </div>
      )}
    </CardShell>
  );
}

export function AgencyLeases({ focusLeaseId }: { focusLeaseId?: string }) {
  const [data, setData] = useState<LeasesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [announce, setAnnounce] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(focusLeaseId ? `/api/agency/leases?lease=${encodeURIComponent(focusLeaseId)}` : "/api/agency/leases", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as (LeasesResponse & { error?: string }) | null;
      if (!res.ok || !json || !("leases" in json)) {
        setError(json?.error ?? `Could not load the devnet history (HTTP ${res.status}).`);
        return;
      }
      setData(json);
      setAnnounce(`Loaded ${json.leases.length} ${json.leases.length === 1 ? "lease" : "leases"} from devnet.`);
    } catch {
      setError("Network error while reading the devnet history.");
    } finally {
      setLoading(false);
    }
  }, [focusLeaseId]);

  const pending = data?.pending ?? 0;
  const [followUps, setFollowUps] = useState(0);
  useEffect(() => {
    // The public RPC rate-limits, so the server reads history in slices: keep asking (a few times) until it is complete.
    if (pending <= 0 || loading || followUps >= 8) return;
    const timer = window.setTimeout(() => {
      setFollowUps((n) => n + 1);
      void load();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [pending, loading, followUps, load]);

  useEffect(() => {
    // Fetch on mount; state updates happen after the awaited response, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="leases-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="leases-title" className="font-display text-xl font-bold">
            Contracts and payments
          </h2>
          <Badge tone="success">Real devnet history</Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Read from the custody wallet and the landlord token account on Solana devnet and grouped by the lease id in each payment
          memo. Memos hold only ids, month numbers and hashes. Escrow is custodial: the platform wallet holds the deposit.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => { setFollowUps(0); void load(); }} disabled={loading} aria-busy={loading}>
            {loading ? "Reading chain…" : "Refresh"}
          </Button>
          {data && (
            <span className="text-xs text-muted">
              Read {new Date(data.readAt).toLocaleTimeString("en-GB")}
              {data.cached ? ` (cached up to ${data.cacheTtlSeconds} s)` : ""}
              {data.stale ? ", RPC unavailable: showing the last good read" : ""}
            </span>
          )}
          {data && data.pending > 0 && (
            <span className="text-xs font-semibold text-warning" role="status">
              Still reading {data.pending} older {data.pending === 1 ? "transaction" : "transactions"} (RPC rate limit)…
            </span>
          )}
          {data && (
            <span className="flex flex-wrap gap-3">
              <ExplorerLink href={data.custody.explorerUrl}>Custody wallet</ExplorerLink>
              <ExplorerLink href={data.landlordTokenAccount.explorerUrl}>Landlord token account</ExplorerLink>
            </span>
          )}
        </div>
        {focusLeaseId && (
          <p className="text-sm">
            Showing lease <span className="break-all font-mono">{focusLeaseId}</span> only.{" "}
            <a href="/agency" className="font-semibold text-accent underline underline-offset-2">
              Show the newest leases
            </a>
          </p>
        )}
        {data && !focusLeaseId && data.totalLeases > data.leases.length && (
          <p className="text-xs text-muted">
            Showing the newest {data.leases.length} of {data.totalLeases} leases on chain. Open a specific one with <code className="font-mono">?lease=&lt;id&gt;</code>.
          </p>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {announce}
        </p>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-danger bg-danger-soft p-3 text-sm font-semibold text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}

        <AnimatePresence mode="wait">
          {loading && !data ? (
            <motion.p key="loading" variants={swap} initial="initial" animate="animate" exit="exit" className="text-sm text-muted">
              Reading Solana devnet…
            </motion.p>
          ) : data && data.leases.length === 0 ? (
            <motion.p key="empty" variants={swap} initial="initial" animate="animate" exit="exit" className="text-sm text-muted">
              No lease payments found on the custody or landlord token accounts yet.
            </motion.p>
          ) : data ? (
            <motion.ul key="list" variants={stagger} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-2">
              {data.leases.map((l) => (
                <motion.li key={l.leaseId} variants={itemIn}>
                  <LeaseCard lease={l} releaseAvailable={data.releaseAvailable} onReleased={(r) => setAnnounce(`Deposit released. Transaction ${shortHash(r.signature)}.`)} />
                </motion.li>
              ))}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </section>
    </MotionConfig>
  );
}
