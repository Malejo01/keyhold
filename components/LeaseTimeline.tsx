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
import { STAGES, stageIndex } from "./stages";
import { CheckIcon, cx } from "./ui";

type StepState = "pending" | "current" | "done";

function stateOf(index: number, current: number): StepState {
  if (index < current) return "done";
  if (index === current) return "current";
  return "pending";
}

const stateText: Record<StepState, string> = {
  done: "completed",
  current: "current step",
  pending: "upcoming",
};

/** Full vertical stepper (desktop sidebar). */
export function LeaseTimeline({ stage, className }: { stage: Stage; className?: string }) {
  const current = stageIndex(stage);
  const reduced = useReducedMotion();

  return (
    <nav aria-label="Lease timeline" className={className}>
      <ol className="flex flex-col">
        {STAGES.map((step, i) => {
          const state = stateOf(i, current);
          const isLast = i === STAGES.length - 1;
          return (
            <li
              key={step.stage}
              aria-current={state === "current" ? "step" : undefined}
              className={cx("relative flex gap-3", !isLast && "pb-7")}
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
                  className="absolute inset-0 rounded-full bg-primary"
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
              <motion.div className="min-w-0 pt-0.5" variants={timelineLabel} initial={false} animate={state}>
                <p
                  className={cx(
                    "text-sm leading-6",
                    state === "current" ? "font-semibold text-foreground" : "font-medium text-foreground",
                  )}
                >
                  {step.label}
                  <span className="sr-only"> ({stateText[state]})</span>
                </p>
                <p className="text-xs text-muted">{step.hint}</p>
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
  const current = stageIndex(stage);
  const step = STAGES[current];

  return (
    <nav aria-label="Lease timeline" className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Step {current + 1} of {STAGES.length}
        </p>
        <div className="relative h-5 min-w-0 overflow-hidden text-right">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={step.stage}
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
        {STAGES.map((s, i) => (
          <li key={s.stage} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <motion.div
              className="h-full w-full origin-left bg-primary"
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
