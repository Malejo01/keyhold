"use client";

import type { Lang } from "@/lib/contracts";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect } from "react";
import { formatUsdc } from "./format";

/**
 * Counts from the list price down to the discounted price (display only; the final text is the exact
 * server amount). With reduced motion the final value renders immediately.
 */
export function CountUp({ from, to, lang = "en", className }: { from: string; to: string; lang?: Lang; className?: string }) {
  const reduced = useReducedMotion();
  const start = Number(from) / 1_000_000;
  const end = Number(to) / 1_000_000;
  const value = useMotionValue(reduced ? end : start);
  const text = useTransform(value, (v) => (v === end ? formatUsdc(to, lang) : lang === "es" ? v.toFixed(2).replace(".", ",") : v.toFixed(2)));

  useEffect(() => {
    if (reduced) {
      value.set(end);
      return;
    }
    const controls = animate(value, end, { duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.35 });
    return () => controls.stop();
  }, [end, reduced, value]);

  return (
    <>
      <motion.span className={className} aria-hidden="true">
        {text}
      </motion.span>
      <span className="sr-only">{formatUsdc(to, lang)}</span>
    </>
  );
}
