"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { agentLine, agentState, reviewLink } from "@/lib/motion/presets";
import type { AgentId, AgentRow } from "./deriveAgents";
import { useI18n } from "./I18nProvider";
import { AlertIcon, CheckIcon, FileIcon, PinIcon, ShieldIcon, cx } from "./ui";

const ICONS: Record<AgentId, (cls: string) => ReactNode> = {
  orchestrator: (cls) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      className={cls}
    >
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
    </svg>
  ),
  listings: (cls) => <PinIcon className={cls} />,
  prequal: (cls) => <CheckIcon className={cls} />,
  crosscheck: (cls) => <ShieldIcon className={cls} />,
  lease: (cls) => <FileIcon className={cls} />,
};

function Avatar({ row, size }: { row: AgentRow; size: "sm" | "md" }) {
  const warn = row.tone === "warn";
  return (
    <motion.span
      variants={agentState}
      initial={false}
      animate={row.state}
      className={cx(
        "relative z-10 flex shrink-0 items-center justify-center rounded-full border-2",
        size === "md" ? "size-9" : "size-8",
        row.state === "idle" && "border-border-strong bg-surface text-subtle",
        row.state !== "idle" && !warn && row.id !== "crosscheck" && "border-primary bg-primary-soft text-primary",
        row.state !== "idle" && !warn && row.id === "crosscheck" && "border-accent bg-accent-soft text-accent",
        warn && "border-warning bg-warning-soft text-warning",
      )}
    >
      {warn ? <AlertIcon className="size-4" /> : ICONS[row.id]("size-4")}
    </motion.span>
  );
}

/** Full list for the desktop sidebar. The connector shows the cross-check reviewing pre-qualification. */
export function AgentActivity({ rows, className }: { rows: AgentRow[]; className?: string }) {
  const { t } = useI18n();
  const latest = [...rows].reverse().find((r) => r.summary);
  return (
    <section aria-label={t.agents.title} className={className}>
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">{t.agents.title}</h2>
      <p role="status" aria-live="polite" className="sr-only">
        {latest ? `${latest.name}: ${latest.summary}` : ""}
      </p>
      <ul className="mt-3 flex flex-col">
        {rows.map((r, i) => {
          const isLast = i === rows.length - 1;
          const reviewed = r.id === "prequal" && rows[i + 1]?.state === "done";
          return (
            <li key={r.id} className={cx("relative flex gap-3", !isLast && "pb-3")}>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-[17px] top-9 w-0.5 overflow-hidden rounded-full bg-border"
                >
                  {reviewed && (
                    <motion.span
                      variants={reviewLink}
                      initial="off"
                      animate="on"
                      className="block h-full w-full origin-top bg-accent"
                    />
                  )}
                </span>
              )}
              <Avatar row={r} size="md" />
              <motion.div variants={agentState} initial={false} animate={r.state} className="min-w-0 pt-1">
                <p className={cx("text-sm font-semibold leading-5", r.state === "idle" && "text-muted")}>
                  {r.name}
                  {reviewed && <span className="ml-1.5 text-xs font-medium text-accent">{t.agents.reviewedBy}</span>}
                </p>
                {r.summary ? (
                  <motion.p
                    key={r.summary}
                    variants={agentLine}
                    initial="hidden"
                    animate="show"
                    className="text-xs text-muted"
                  >
                    {r.summary}
                  </motion.p>
                ) : (
                  <p className="text-xs text-muted">{r.role}</p>
                )}
              </motion.div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Compact strip for small screens: five avatars and the most recent line. */
export function AgentActivityCompact({ rows }: { rows: AgentRow[] }) {
  const { t } = useI18n();
  const latest = [...rows].reverse().find((r) => r.summary);
  return (
    <div aria-label={t.agents.title} role="group" className="flex flex-col gap-1.5">
      <ul className="flex items-center gap-2">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-2">
            <span title={r.name}>
              <Avatar row={r} size="sm" />
              <span className="sr-only">
                {r.name}: {r.summary ?? t.agents.waiting}
              </span>
            </span>
            {i < rows.length - 1 && (
              <span
                aria-hidden="true"
                className={cx("h-0.5 w-3 rounded-full", r.state === "done" ? "bg-border-strong" : "bg-border")}
              />
            )}
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="truncate text-xs text-muted">
        {latest ? `${latest.name}: ${latest.summary}` : t.agents.idleHint}
      </p>
    </div>
  );
}
