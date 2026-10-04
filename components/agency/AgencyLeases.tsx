"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useId, useState } from "react";
import type { LeaseDto, LeasesResponse } from "@/lib/agency/dto";
import { landlordShare, usdcToBaseUnits } from "@/lib/agency/units";
import { itemIn, stagger, swap } from "@/lib/motion/presets";
import { formatBps, formatTs, formatUsdc, shortHash } from "../format";
import { useI18n } from "../I18nProvider";
import { LOCALE } from "@/lib/i18n";
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

const STATUS_TONE: Record<LeaseDto["status"], "accent" | "success" | "neutral"> = {
  deposit_held: "accent",
  deposit_released: "success",
  no_deposit: "neutral",
};

const sumReleases = (releases: LeaseDto["releases"]): string =>
  releases.reduce((sum, r) => sum + BigInt(r.toTenant) + BigInt(r.toLandlord), BigInt(0)).toString();

function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-accent underline underline-offset-2"
    >
      {children}
      <ExternalIcon className="size-3" />
      <span className="sr-only">{t.agency.leases.opensExplorer}</span>
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
  const { lang, t } = useI18n();
  const L = t.agency.leases;
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
        setError({ message: json?.error ?? L.releaseFailed(res.status), explorerUrl: json?.explorerUrl });
        return;
      }
      onDone(json.release);
    } catch {
      setError({ message: L.releaseNetwork });
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle";

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-md border border-border bg-background p-3" aria-label={L.releaseFormLabel}>
      <p className="text-sm">
        <span className="font-semibold">{L.proposeBold(formatUsdc(deposit, lang))}</span>{L.proposeRest}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-t`} className="text-xs font-semibold text-muted">
            {L.toTenant}
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
            {L.toLandlord}
          </label>
          <input id={`${uid}-l`} readOnly value={landlordBase === null ? "" : formatUsdc(landlordBase, lang)} className={`${fieldClass} bg-sunken`} />
        </div>
      </div>
      <p id={`${uid}-split`} className={`text-xs ${splitOk ? "text-muted" : "font-semibold text-danger"}`}>
        {splitOk ? L.splitOk : L.splitBad}
      </p>
      <div>
        <label htmlFor={`${uid}-r`} className="text-xs font-semibold text-muted">
          {L.reasonLabel}
        </label>
        <textarea
          id={`${uid}-r`}
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={L.reasonPlaceholder}
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-muted">{L.reasonHint}</p>
      </div>
      <div>
        <label htmlFor={`${uid}-a`} className="text-xs font-semibold text-muted">
          {L.approverLabel}
        </label>
        <select id={`${uid}-a`} value={approver} onChange={(e) => setApprover(e.target.value as "tenant" | "landlord")} className={fieldClass}>
          <option value="tenant">{L.tenant}</option>
          <option value="landlord">{L.landlord}</option>
        </select>
      </div>
      <p className="rounded-md bg-warning-soft p-2 text-xs text-warning">
        {L.simulatedNote}
      </p>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            {error.message}
            {error.explorerUrl && (
              <>
                {" "}
                <ExplorerLink href={error.explorerUrl}>{L.originalRelease}</ExplorerLink>
              </>
            )}
          </span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!valid || busy} aria-busy={busy}>
          {busy ? L.signing : L.approve}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {L.cancel}
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
  const { lang, t } = useI18n();
  const L = t.agency.leases;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<ReleaseOk | null>(null);
  const statusLabel = {
    deposit_held: L.statusDepositHeld,
    deposit_released: L.statusDepositReleased,
    no_deposit: L.statusNoDeposit,
  }[lease.status];
  const canRelease = lease.status === "deposit_held" && !done;

  return (
    <CardShell label={L.leaseLabel(lease.leaseId)} className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-all font-mono text-sm font-semibold">{lease.leaseId}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {lease.payer ? L.paidBy(lease.payer.label ?? shortHash(lease.payer.wallet, 6, 4)) : L.noPayer}
            {lease.legacyMemo && L.legacyMemo}
          </p>
        </div>
        <Badge tone={done ? "success" : STATUS_TONE[lease.status]}>{done ? L.statusDepositReleased : statusLabel}</Badge>
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">{L.deposit}</dt>
          <dd>
            {lease.deposit ? (
              <>
                <span className="font-semibold">{formatUsdc(lease.deposit.amount, lang)} USDC</span>{" "}
                <ExplorerLink href={lease.deposit.explorerUrl}>{L.tx}</ExplorerLink>
                {lease.deposit.blockTime && <span className="block text-xs text-muted">{formatTs(lease.deposit.blockTime, lang)}</span>}
              </>
            ) : (
              <span className="text-muted">{L.notPaid}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{L.contractHash}</dt>
          <dd className="break-all font-mono text-xs">{lease.contractHash ? shortHash(lease.contractHash, 12, 8) : "—"}</dd>
        </div>
      </dl>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
        {L.rentPaid(lease.rent.length)}
      </h4>
      {lease.rent.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {lease.rent.map((r) => (
            <li key={r.signature} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <span className="font-semibold">{L.month(r.monthIndex + 1)}</span>
              <span>{formatUsdc(r.amount, lang)} USDC</span>
              {r.discountBps !== null && <span className="text-xs text-muted">{L.discount(formatBps(r.discountBps, lang))}</span>}
              {r.onTime !== null && (
                <Badge tone={r.onTime ? "success" : "warning"}>
                  {r.onTime ? <CheckIcon className="size-3" /> : <ClockIcon className="size-3" />}
                  {r.onTime ? L.onTime : L.late}
                </Badge>
              )}
              {r.blockTime && <span className="text-xs text-muted">{formatTs(r.blockTime, lang)}</span>}
              <ExplorerLink href={r.explorerUrl}>{L.tx}</ExplorerLink>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{L.noRent}</p>
      )}
      {lease.rent.some((r) => r.onTime !== null) && (
        <p className="mt-2 text-xs text-muted">{L.onTimeNote}</p>
      )}

      {lease.duplicateRelease && (
        <div role="alert" className="mt-4 rounded-md border border-danger bg-danger-soft p-3 text-sm font-semibold text-danger">
          <p className="flex items-start gap-1.5">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {L.duplicate(
                lease.releases.length,
                formatUsdc(sumReleases(lease.releases), lang),
                lease.deposit ? formatUsdc(lease.deposit.amount, lang) : "0.00",
              )}
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
                {lease.releases.length > 1 ? L.releaseN(i + 1, lease.releases.length) : L.released}
                {L.releasedSplit(formatUsdc(r.toTenant, lang), formatUsdc(r.toLandlord, lang))}
              </p>
              <p className="mt-1 break-all font-mono text-xs">{L.reasonHash}{shortHash(r.reasonHash, 12, 8)}</p>
              {r.blockTime && <p className="mt-1 text-xs">{formatTs(r.blockTime, lang)}</p>}
              <p className="mt-1">
                <ExplorerLink href={r.explorerUrl}>{L.releaseTx}</ExplorerLink>
              </p>
            </div>
          ))}
          {done && lease.releases.length === 0 && (
            <div className="rounded-md border border-border bg-success-soft p-3 text-sm text-success">
              <p className="flex items-center gap-1.5 font-semibold">
                <CheckIcon className="size-4" /> {L.released}{L.releasedSplit(formatUsdc(done.toTenant, lang), formatUsdc(done.toLandlord, lang))}
              </p>
              <p className="mt-1 text-xs">{L.approvedBy(done.approvedBy.map((a) => (a === "tenant" ? L.tenant : a === "landlord" ? L.landlord : a)).join(L.and))}</p>
              <p className="mt-1 break-all font-mono text-xs">{L.reasonHash}{shortHash(done.reasonHash, 12, 8)}</p>
              <p className="mt-1">
                <ExplorerLink href={done.explorerUrl}>{L.releaseTx}</ExplorerLink>
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
                {L.releaseDeposit}
              </Button>
              {!releaseAvailable && (
                <p id={`rel-${lease.leaseId}`} className="mt-2 text-xs text-muted">
                  {L.releaseUnavailable}
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
  const { lang, t } = useI18n();
  const L = t.agency.leases;
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
        setError(json?.error ?? L.loadFailed(res.status));
        return;
      }
      setData(json);
      setAnnounce(L.loaded(json.leases.length));
    } catch {
      setError(L.loadNetwork);
    } finally {
      setLoading(false);
    }
  }, [focusLeaseId, L]);

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
            {L.title}
          </h2>
          <Badge tone="success">{L.badge}</Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted">
          {L.intro}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => { setFollowUps(0); void load(); }} disabled={loading} aria-busy={loading}>
            {loading ? L.reading : L.refresh}
          </Button>
          {data && (
            <span className="text-xs text-muted">
              {L.readAt(new Date(data.readAt).toLocaleTimeString(LOCALE[lang]))}
              {data.cached ? L.cached(data.cacheTtlSeconds) : ""}
              {data.stale ? L.stale : ""}
            </span>
          )}
          {data && data.pending > 0 && (
            <span className="text-xs font-semibold text-warning" role="status">
              {L.pending(data.pending)}
            </span>
          )}
          {data && (
            <span className="flex flex-wrap gap-3">
              <ExplorerLink href={data.custody.explorerUrl}>{L.custodyWallet}</ExplorerLink>
              <ExplorerLink href={data.landlordTokenAccount.explorerUrl}>{L.landlordAccount}</ExplorerLink>
            </span>
          )}
        </div>
        {focusLeaseId && (
          <p className="text-sm">
            {L.showingLease}<span className="break-all font-mono">{focusLeaseId}</span>{L.only}
            <a href={`/${lang}/agency`} className="font-semibold text-accent underline underline-offset-2">
              {L.showNewest}
            </a>
          </p>
        )}
        {data && !focusLeaseId && data.totalLeases > data.leases.length && (
          <p className="text-xs text-muted">
            {L.showingNewest(data.leases.length, data.totalLeases)}<code className="font-mono">?lease=&lt;id&gt;</code>.
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
              {L.readingDevnet}
            </motion.p>
          ) : data && data.leases.length === 0 ? (
            <motion.p key="empty" variants={swap} initial="initial" animate="animate" exit="exit" className="text-sm text-muted">
              {L.emptyLeases}
            </motion.p>
          ) : data ? (
            <motion.ul key="list" variants={stagger} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-2">
              {data.leases.map((l) => (
                <motion.li key={l.leaseId} variants={itemIn}>
                  <LeaseCard lease={l} releaseAvailable={data.releaseAvailable} onReleased={(r) => setAnnounce(L.announceReleased(shortHash(r.signature)))} />
                </motion.li>
              ))}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </section>
    </MotionConfig>
  );
}
