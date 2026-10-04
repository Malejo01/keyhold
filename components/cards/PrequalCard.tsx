"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { DocType, FinalDecision, Issue, IssueCode, IssueEvidence, PrequalStatus } from "@/lib/contracts";
import { insightHalo, pop } from "@/lib/motion/presets";
import { AlertIcon, Badge, Button, CardShell, CheckIcon, CrossIcon, ShieldIcon, cx } from "../ui";

const statusLabel: Record<PrequalStatus, string> = {
  APPROVED: "Approved",
  NEEDS_INFO: "More information needed",
  REJECTED: "Not eligible",
};
const statusTone: Record<PrequalStatus, "success" | "warning" | "danger"> = {
  APPROVED: "success",
  NEEDS_INFO: "warning",
  REJECTED: "danger",
};

const issueLabel: Record<IssueCode, string> = {
  missing_document: "Missing document",
  expired_payslip: "Payslip out of date",
  name_mismatch: "Name does not match",
  income_ratio_exceeded: "Income too low for this rent",
};

const docLabel: Record<DocType, string> = {
  dni: "ID",
  payslip: "Payslip",
  income_proof: "Income proof",
  guarantee: "Guarantee",
};

/** Side-by-side values the deterministic rule compared. The breaking value is marked with an icon and text, not only colour. */
function EvidenceCompare({ evidence }: { evidence: IssueEvidence }) {
  return (
    <div className="mt-2">
      <ul className="grid gap-2 sm:grid-cols-2">
        {evidence.compared.map((item) => (
          <li
            key={`${item.docType}-${item.label}`}
            className={cx(
              "rounded-md border p-2.5",
              item.mismatch ? "border-danger bg-danger-soft" : "border-border bg-surface",
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{docLabel[item.docType]}</p>
            <p className="text-xs text-muted">{item.label}</p>
            <p className="mt-0.5 break-words font-mono text-sm font-semibold">{item.value}</p>
            {item.mismatch && (
              <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-danger">
                <CrossIcon className="size-3.5" strokeWidth={3} />
                Does not match
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        <span className="font-semibold text-foreground">Rule: </span>
        {evidence.rule}
      </p>
    </div>
  );
}

/** Merge issues from both agents without repeating the same finding. */
function mergeIssues(decision: FinalDecision): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const issue of [...decision.prequal.issues, ...decision.crosscheck.discrepancies]) {
    const key = `${issue.code}|${issue.docType ?? ""}|${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

export function PrequalCard({
  decision,
  canGenerateContract,
  generating,
  onGenerateContract,
}: {
  decision: FinalDecision;
  /** True when the final status is APPROVED and no contract exists yet. */
  canGenerateContract: boolean;
  generating: boolean;
  onGenerateContract: () => void;
}) {
  const reduced = useReducedMotion();
  const crosscheckDecided = decision.decidedBy === "crosscheck";
  const issues = mergeIssues(decision);
  const tone = statusTone[decision.status];

  return (
    <div className="relative">
      {crosscheckDecided && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-xl border-2 border-accent shadow-glow"
          variants={insightHalo}
          initial="hidden"
          animate={reduced ? { opacity: 0.8, scale: 1 } : "show"}
        />
      )}
      <CardShell
        label="Pre-qualification result"
        className={cx("flex flex-col gap-4", crosscheckDecided && "border-accent")}
      >
        {/* The aha moment */}
        {crosscheckDecided && (
          <div className="-mx-card -mt-card flex items-start gap-3 rounded-t-lg bg-accent px-card py-3 text-accent-foreground">
            <ShieldIcon className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-display text-sm font-semibold leading-snug">
                Independent cross-check found a discrepancy
              </p>
              <p className="mt-0.5 text-xs opacity-90">
                A second agent read the same documents on its own and disagreed with the first result.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold">Pre-qualification</h3>
          <motion.div variants={pop} initial="hidden" animate="show">
            <Badge tone={tone}>
              {decision.status === "APPROVED" ? (
                <CheckIcon className="size-3.5" strokeWidth={3} />
              ) : (
                <AlertIcon className="size-3.5" />
              )}
              {statusLabel[decision.status]}
            </Badge>
          </motion.div>
        </div>

        {/* Two-agent comparison, only when the second reading changed the outcome */}
        {crosscheckDecided && (
          <div className="grid gap-2 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="rounded-md bg-sunken p-3">
              <p className="text-xs uppercase tracking-wide text-muted">First review</p>
              <p className="mt-1 flex items-center gap-1.5 font-semibold">
                {decision.prequal.status === "APPROVED" ? (
                  <CheckIcon className="size-4 text-success" strokeWidth={3} />
                ) : (
                  <AlertIcon className="size-4 text-warning" />
                )}
                {statusLabel[decision.prequal.status]}
              </p>
            </div>
            <span aria-hidden="true" className="hidden text-center text-muted sm:block">
              vs
            </span>
            <div className="rounded-md bg-accent-soft p-3">
              <p className="text-xs uppercase tracking-wide text-accent">Cross-check</p>
              <p className="mt-1 flex items-center gap-1.5 font-semibold">
                <CrossIcon className="size-4 text-accent" strokeWidth={3} />
                Discrepancy found
              </p>
            </div>
          </div>
        )}

        {/* Reasons */}
        {issues.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {crosscheckDecided ? "What the cross-check found" : "Why"}
            </p>
            <ul className="flex flex-col gap-2">
              {issues.map((issue, i) => (
                <li
                  key={`${issue.code}-${i}`}
                  className={cx(
                    "flex items-start gap-2 rounded-md p-3 text-sm",
                    crosscheckDecided && decision.crosscheck.discrepancies.includes(issue)
                      ? "bg-accent-soft"
                      : "bg-warning-soft",
                  )}
                >
                  <AlertIcon
                    className={cx(
                      "mt-0.5 size-4 shrink-0",
                      crosscheckDecided && decision.crosscheck.discrepancies.includes(issue)
                        ? "text-accent"
                        : "text-warning",
                    )}
                  />
                  <div>
                    <p className="font-semibold">
                      {issueLabel[issue.code]}
                      {issue.docType ? ` · ${docLabel[issue.docType]}` : ""}
                    </p>
                    <p className="text-muted">{issue.message}</p>
                    {issue.evidence && <EvidenceCompare evidence={issue.evidence} />}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Approved summary */}
        {decision.status === "APPROVED" && (
          <div className="rounded-md bg-success-soft p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-success">
              <CheckIcon className="size-4" strokeWidth={3} />
              All checks passed, and the independent cross-check agrees.
            </p>
            {decision.prequal.extracted.documentsPresent.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {decision.prequal.extracted.documentsPresent.map((d) => (
                  <li key={d} className="rounded-full bg-surface px-2.5 py-1 text-xs text-muted">
                    {docLabel[d]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {decision.status === "NEEDS_INFO" && (
          <p className="text-sm text-muted">
            The agency can continue once the items above are fixed. Upload the updated documents to try again.
          </p>
        )}

        {canGenerateContract && (
          <Button onClick={generating ? undefined : onGenerateContract} aria-disabled={generating || undefined} className="self-start">
            {generating ? "Preparing contract…" : "Generate the contract"}
          </Button>
        )}
      </CardShell>
    </div>
  );
}
