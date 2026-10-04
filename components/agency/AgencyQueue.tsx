"use client";

import { MotionConfig, motion } from "framer-motion";
import type { Issue } from "@/lib/contracts";
import type { QueueSnapshot } from "@/lib/agency/queue";
import { itemIn, stagger } from "@/lib/motion/presets";
import { evidenceLabel, evidenceValue, issueMessage, mismatchTag, ruleText } from "../cards/prequalCopy";
import { useI18n } from "../I18nProvider";
import { AlertIcon, Badge, CardShell, CheckIcon, ShieldIcon } from "../ui";

function IssueBlock({ issue }: { issue: Issue }) {
  const { lang, t } = useI18n();
  return (
    <li className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">
          <AlertIcon className="size-3.5" />
          {t.cards.prequal.issueLabel[issue.code]}
        </Badge>
        {issue.docType && <span className="text-xs text-muted">{t.agency.queue.onDoc(t.cards.prequal.docNoun[issue.docType])}</span>}
      </div>
      <p className="mt-2 text-sm">{issueMessage(t, lang, issue)}</p>
      {issue.evidence && (
        <div className="mt-2 text-sm">
          <p className="text-muted">
            <span className="font-semibold text-foreground">{t.cards.prequal.ruleLabel}</span>{ruleText(t, lang, issue.evidence)}
          </p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {issue.evidence.compared.map((c) => (
              <div
                key={`${c.docType}-${c.labelKey}`}
                className={`rounded-md border p-2 ${c.mismatch ? "border-danger bg-danger-soft" : "border-border bg-surface"}`}
              >
                <dt className="text-xs text-muted">{evidenceLabel(t, c)}</dt>
                <dd className="break-words font-mono text-xs">
                  {evidenceValue(t, lang, issue.evidence!, c)}
                  {c.mismatch && (
                    <span className="mt-1 flex items-center gap-1 font-sans font-semibold text-danger">
                      <AlertIcon className="size-3.5" /> {mismatchTag(t, lang, issue.evidence!)}
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
  const { lang, t } = useI18n();
  const q = t.agency.queue;
  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="queue-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="queue-title" className="font-display text-xl font-bold">
            {q.title}
          </h2>
          <Badge tone="accent">{q.badge}</Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted">
          {q.introBefore}<span className="font-semibold text-foreground">{lang === "es" ? (queue.property.titleEs ?? queue.property.title) : queue.property.title}</span>
          {q.introAfter(queue.property.priceUsdc)}
        </p>
        {queue.cases.length === 0 ? (
          <CardShell label={q.emptyLabel}>
            <p className="flex items-center gap-2 text-sm">
              <CheckIcon className="size-4 text-success" /> {q.empty}
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
                      {c.status === "REJECTED" ? q.rejected : q.needsInfo}
                    </Badge>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                    <ShieldIcon className="size-3.5 text-accent" />
                    {q.decidedBy}<span className="font-semibold text-foreground">{q.decider[c.decidedBy]}</span>
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
            {q.cleared(queue.approved.join(", "))}
          </p>
        )}
      </section>
    </MotionConfig>
  );
}
