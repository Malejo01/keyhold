"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { LeaseDraft, VerifyResponse } from "@/lib/contracts";
import { pop, swap } from "@/lib/motion/presets";
import { formatBps, formatUsdcAmount, shortHash } from "../format";
import { Badge, Button, CardShell, CheckIcon, CrossIcon, FileIcon, cx } from "../ui";

type VerifyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; result: VerifyResponse }
  | { status: "error"; message: string };

export function ContractCard({
  lease,
  depositSignature,
  onVerify,
}: {
  lease: LeaseDraft;
  /** Signature of the confirmed deposit, if any. Verify stays disabled until it exists. */
  depositSignature: string | undefined;
  onVerify: (contractText: string, signature: string) => Promise<VerifyResponse>;
}) {
  const [verify, setVerify] = useState<VerifyState>({ status: "idle" });
  const canVerify = Boolean(depositSignature);

  async function runVerify() {
    if (!depositSignature) return;
    setVerify({ status: "checking" });
    try {
      const result = await onVerify(lease.contractText, depositSignature);
      setVerify({ status: "done", result });
    } catch (err) {
      setVerify({ status: "error", message: err instanceof Error ? err.message : "Verification failed." });
    }
  }

  return (
    <CardShell label="Lease contract" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          <FileIcon className="size-5 text-primary" />
          Lease contract
        </h3>
        <Badge tone="primary">{lease.months} months</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Monthly rent</dt>
          <dd className="font-semibold tabular-nums">{formatUsdcAmount(lease.rentBaseUnits)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Deposit</dt>
          <dd className="font-semibold tabular-nums">{formatUsdcAmount(lease.depositBaseUnits)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Start date</dt>
          <dd className="font-semibold">{lease.startDate}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Discounts</dt>
          <dd className="font-semibold">
            −{formatBps(lease.discountUsdcBps)} USDC, −{formatBps(lease.discountOntimeBps)} on time
          </dd>
        </div>
      </dl>

      <div
        tabIndex={0}
        role="region"
        aria-label="Contract text"
        className="scroll-thin max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-sunken p-3 font-mono text-xs leading-relaxed"
      >
        {lease.contractText}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>Contract fingerprint (SHA-256)</span>
        <code className="rounded bg-sunken px-2 py-1 font-mono text-foreground" title={lease.contractHash}>
          {shortHash(lease.contractHash, 10, 8)}
        </code>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={canVerify ? runVerify : undefined}
            aria-disabled={!canVerify || undefined}
            disabled={verify.status === "checking"}
            aria-describedby="verify-hint"
          >
            {verify.status === "checking" ? "Verifying…" : "Verify"}
          </Button>
          {!canVerify && (
            <p id="verify-hint" className="text-xs text-muted">
              Available after the deposit is paid.
            </p>
          )}
          {canVerify && verify.status === "idle" && (
            <p id="verify-hint" className="text-xs text-muted">
              Checks this text against the fingerprint recorded with your deposit payment.
            </p>
          )}
        </div>

        <div role="status" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            {verify.status === "done" && (
              <motion.div
                key={verify.result.match ? "match" : "mismatch"}
                variants={swap}
                initial="initial"
                animate="animate"
                exit="exit"
                className={cx(
                  "flex items-start gap-3 rounded-md p-3 text-sm",
                  verify.result.match ? "bg-success-soft" : "bg-danger-soft",
                )}
              >
                <motion.span
                  variants={pop}
                  initial="hidden"
                  animate="show"
                  className={cx(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    verify.result.match
                      ? "bg-success text-primary-foreground"
                      : "bg-danger text-primary-foreground",
                  )}
                >
                  {verify.result.match ? (
                    <CheckIcon className="size-4" strokeWidth={3} />
                  ) : (
                    <CrossIcon className="size-4" strokeWidth={3} />
                  )}
                </motion.span>
                <div className="min-w-0">
                  <p className={cx("font-semibold", verify.result.match ? "text-success" : "text-danger")}>
                    {verify.result.match
                      ? "Match: this is the contract you paid against"
                      : "Mismatch: the text was changed"}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-muted">
                    Computed {shortHash(verify.result.computedHash, 10, 8)}
                    <br />
                    Stored{" "}
                    {verify.result.memoHash
                      ? shortHash(verify.result.memoHash, 10, 8)
                      : "not found on the payment"}
                  </p>
                </div>
              </motion.div>
            )}
            {verify.status === "error" && (
              <motion.p
                key="error"
                variants={swap}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex items-start gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger"
              >
                <CrossIcon className="mt-0.5 size-4 shrink-0" strokeWidth={3} />
                {verify.message}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </CardShell>
  );
}
