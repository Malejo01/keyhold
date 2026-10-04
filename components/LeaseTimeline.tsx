"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Stage } from "@/lib/contracts";
import {
  loop,
  pulseRing,
  swap,
  timelineCheck,
  timelineConnectorX,
  timelineConnectorY,
  timelineDotFill,
  timelineLabel,
} from "@/lib/motion/presets";
import { useI18n } from "./I18nProvider";
import { STAGE_ORDER, stageIndex } from "./stages";
import { CheckIcon, cx } from "./ui";

type StepState = "pending" | "current" | "done";

function stateOf(index: number, current: number): StepState {
  if (index < current) return "done";
  if (index === current) return "current";
  return "pending";
}

/** Full vertical stepper (desktop sidebar). */
export function LeaseTimeline({ stage, className }: { stage: Stage; className?: string }) {
  const { t } = useI18n();
  const current = stageIndex(stage);
  const reduced = useReducedMotion();

  return (
    <nav aria-label={t.timeline.label} className={className}>
      <ol className="flex flex-col">
        {STAGE_ORDER.map((stageKey, i) => {
          const step = t.stages[stageKey];
          const state = stateOf(i, current);
          const isLast = i === STAGE_ORDER.length - 1;
          return (
            <li
              key={stageKey}
              aria-current={state === "current" ? "step" : undefined}
              className={cx("relative flex gap-3", !isLast && "pb-4")}
            >
              {/* Dot */}
              <div className="relative size-7 shrink-0">
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-primary"
                  variants={pulseRing}
                  initial={false}
                  animate={loop(reduced, state === "current" ? "active" : "idle")}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full border-2 border-border-strong bg-surface"
                />
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-primary ring-4 ring-primary-soft"
                  variants={timelineDotFill}
                  initial={false}
                  animate={state === "current" ? "current" : "pending"}
                />
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-success"
                  variants={timelineDotFill}
                  initial={false}
                  animate={state === "done" ? "done" : "pending"}
                />
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0 flex items-center justify-center text-primary-foreground"
                  variants={timelineCheck}
                  initial={false}
                  animate={state === "done" ? "done" : "pending"}
                >
                  <CheckIcon className="size-4" strokeWidth={3} />
                </motion.span>
                <span
                  aria-hidden="true"
                  className={cx(
                    "absolute inset-0 flex items-center justify-center text-xs font-bold transition-opacity duration-200",
                    state === "current" && "text-primary-foreground",
                    state === "pending" && "text-subtle",
                    state === "done" && "opacity-0",
                  )}
                >
                  {i + 1}
                </span>
              </div>

              {/* Connector to the next step */}
              {!isLast && (
                <div
                  aria-hidden="true"
                  className="absolute left-[13px] top-7 bottom-0 w-0.5 overflow-hidden rounded-full bg-border"
                >
                  <motion.div
                    className="h-full w-full origin-top bg-success"
                    variants={timelineConnectorY}
                    initial={false}
                    animate={state}
                  />
                </div>
              )}

              {/* Label */}
              <motion.div
                className={cx(
                  "min-w-0 flex-1 pt-0.5",
                  state === "current" && "-mt-0.5 rounded-md bg-primary-soft px-2.5 py-1.5",
                )}
                variants={timelineLabel}
                initial={false}
                animate={state}
              >
                <p
                  className={cx(
                    "text-sm leading-6",
                    state === "current" ? "font-semibold text-primary" : state === "done" ? "font-medium text-foreground" : "font-medium text-muted",
                  )}
                >
                  {step.label}
                  {state === "current" && (
                    <span aria-hidden="true" className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                      {t.timeline.now}
                    </span>
                  )}
                  {state === "done" && <span aria-hidden="true" className="ml-2 text-xs font-semibold text-success">{t.timeline.done}</span>}
                  <span className="sr-only"> ({t.timeline.state[state]})</span>
                </p>
                {state === "current" && <p className="text-xs text-muted">{step.hint}</p>}
              </motion.div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Compact progress strip for narrow screens. */
export function LeaseTimelineCompact({ stage, className }: { stage: Stage; className?: string }) {
  const { t } = useI18n();
  const current = stageIndex(stage);
  const stageKey = STAGE_ORDER[current];
  const step = t.stages[stageKey];

  return (
    <nav aria-label={t.timeline.label} className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {t.timeline.stepOf(current + 1, STAGE_ORDER.length)}
        </p>
        <div className="relative h-5 min-w-0 overflow-hidden text-right">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={stageKey}
              variants={swap}
              initial="initial"
              animate="animate"
              exit="exit"
              className="truncate text-sm font-semibold"
            >
              {step.label}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      <ol className="flex gap-1" aria-hidden="true">
        {STAGE_ORDER.map((s, i) => (
          <li key={s} className="h-2 flex-1 overflow-hidden rounded-full bg-border">
            <motion.div
              className={cx("h-full w-full origin-left", i < current ? "bg-success" : "bg-primary")}
              variants={timelineConnectorX}
              initial={false}
              animate={i <= current ? "done" : "pending"}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}
