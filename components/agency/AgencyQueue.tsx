"use client";

import { MotionConfig, motion } from "framer-motion";
import type { Issue, IssueCode } from "@/lib/contracts";
import type { QueueCase, QueueSnapshot } from "@/lib/agency/queue";
import { itemIn, stagger } from "@/lib/motion/presets";
import { AlertIcon, Badge, CardShell, CheckIcon, ShieldIcon } from "../ui";

const CODE_LABEL: Record<IssueCode, string> = {
  missing_document: "Missing document",
  expired_payslip: "Expired payslip",
  name_mismatch: "Name mismatch",
  income_ratio_exceeded: "Rent too high for income",
};

const DECIDER: Record<QueueCase["decidedBy"], string> = {
  prequal: "Pre-qualification rules",
  crosscheck: "Cross-check agent (independent second read)",
};

function IssueBlock({ issue }: { issue: Issue }) {
  return (
    <li className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">
          <AlertIcon className="size-3.5" />
          {CODE_LABEL[issue.code]}
        </Badge>
        {issue.docType && <span className="text-xs text-muted">on the {issue.docType.replace("_", " ")}</span>}
      </div>
      <p className="mt-2 text-sm">{issue.message}</p>
      {issue.evidence && (
        <div className="mt-2 text-sm">
          <p className="text-muted">
            <span className="font-semibold text-foreground">Rule:</span> {issue.evidence.rule}
          </p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {issue.evidence.compared.map((c) => (
              <div
                key={`${c.docType}-${c.label}`}
                className={`rounded-md border p-2 ${c.mismatch ? "border-danger bg-danger-soft" : "border-border bg-surface"}`}
              >
                <dt className="text-xs text-muted">{c.label}</dt>
                <dd className="break-words font-mono text-xs">
                  {c.value}
                  {c.mismatch && (
                    <span className="mt-1 flex items-center gap-1 font-sans font-semibold text-danger">
                      <AlertIcon className="size-3.5" /> Breaks the rule
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </li>
  );
}

export function AgencyQueue({ queue }: { queue: QueueSnapshot }) {
  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="queue-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="queue-title" className="font-display text-xl font-bold">
            Needs info
          </h2>
          <Badge tone="accent">Demo queue (simulated tenants)</Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Applications the agents could not clear for <span className="font-semibold text-foreground">{queue.property.title}</span> (
          {queue.property.priceUsdc} USDC a month). The model reads the documents; the rules decide, and each reason below
          is the rule sentence plus the values it compared.
        </p>
        {queue.cases.length === 0 ? (
          <CardShell label="Empty queue">
            <p className="flex items-center gap-2 text-sm">
              <CheckIcon className="size-4 text-success" /> Nothing is waiting for information.
            </p>
          </CardShell>
        ) : (
          <motion.ul variants={stagger} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-2">
            {queue.cases.map((c) => (
              <motion.li key={c.tenantId} variants={itemIn}>
                <CardShell label={`${c.tenantName}: ${c.status}`} className="h-full">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-base font-semibold">{c.tenantName}</h3>
                    <Badge tone={c.status === "REJECTED" ? "danger" : "warning"}>
                      {c.status === "REJECTED" ? "Rejected" : "Needs info"}
                    </Badge>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                    <ShieldIcon className="size-3.5 text-accent" />
                    Decided by: <span className="font-semibold text-foreground">{DECIDER[c.decidedBy]}</span>
                  </p>
                  <ul className="mt-3 flex flex-col gap-3">
                    {c.issues.map((issue, i) => (
                      <IssueBlock key={`${issue.code}-${i}`} issue={issue} />
                    ))}
                  </ul>
                </CardShell>
              </motion.li>
            ))}
          </motion.ul>
        )}
        {queue.approved.length > 0 && (
          <p className="text-xs text-muted">
            Cleared without flags: {queue.approved.join(", ")}. Not in the queue.
          </p>
        )}
      </section>
    </MotionConfig>
  );
}
