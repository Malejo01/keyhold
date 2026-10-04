import type { Transition, Variants } from "framer-motion";

/**
 * Central Framer Motion presets. Rules:
 *  - transform and opacity only (no layout-affecting properties);
 *  - `prefers-reduced-motion` is honored by wrapping the app in
 *    <MotionConfig reducedMotion="user"> (see components/Shell). With it, transform
 *    animations are skipped and only opacity changes remain. Infinite loops must also
 *    check `useReducedMotion()` before starting (see `loop`).
 */

export const ease = [0.22, 1, 0.36, 1] as const;

export const spring: Transition = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 };
export const springSoft: Transition = { type: "spring", stiffness: 220, damping: 26 };
export const quick: Transition = { duration: 0.18, ease };
export const smooth: Transition = { duration: 0.35, ease };

/** Chat message entering the list. */
export const messageIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: smooth },
};

/** A card appearing inside a message, staggered by the parent. */
export const cardIn: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring },
};

/** Parent that staggers its children (cards in a message, properties in a row). */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

/** Suggested-prompt chips and small list items. */
export const itemIn: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: quick },
};

/** Typing indicator dots. Applied with a per-dot delay. */
export const typingDot: Variants = {
  idle: { opacity: 0.3, y: 0 },
  active: {
    opacity: [0.3, 1, 0.3],
    y: [0, -3, 0],
    transition: { duration: 0.9, repeat: Infinity, ease: "easeInOut" },
  },
};

// ---------- Lease timeline ----------

/** Dot background layer: the "filled" state fades and scales in. */
export const timelineDotFill: Variants = {
  pending: { opacity: 0, scale: 0.4 },
  current: { opacity: 1, scale: 1, transition: spring },
  done: { opacity: 1, scale: 1, transition: spring },
};

/** Check mark inside a completed dot. */
export const timelineCheck: Variants = {
  pending: { opacity: 0, scale: 0.3 },
  current: { opacity: 0, scale: 0.3 },
  done: { opacity: 1, scale: 1, transition: { ...spring, delay: 0.1 } },
};

/** Connector fill between two steps: vertical (scaleY, origin top) and horizontal (scaleX, origin left). */
export const timelineConnectorY: Variants = {
  pending: { scaleY: 0 },
  current: { scaleY: 0 },
  done: { scaleY: 1, transition: { duration: 0.5, ease } },
};
export const timelineConnectorX: Variants = {
  pending: { scaleX: 0 },
  current: { scaleX: 0 },
  done: { scaleX: 1, transition: { duration: 0.5, ease } },
};

/** Soft expanding ring behind the current step. */
export const pulseRing: Variants = {
  idle: { opacity: 0, scale: 1 },
  active: {
    opacity: [0.55, 0],
    scale: [1, 1.9],
    transition: { duration: 1.6, repeat: Infinity, ease: "easeOut" },
  },
};

/** Step label: the current one is full opacity, the rest subdued. */
export const timelineLabel: Variants = {
  pending: { opacity: 0.55 },
  current: { opacity: 1 },
  done: { opacity: 0.85 },
};

// ---------- Cards and feedback ----------

/** Cross-check "aha" ring: a violet halo that breathes. */
export const insightHalo: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  show: {
    opacity: [0.25, 0.9, 0.25],
    scale: 1,
    transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
  },
};

/** Pop-in for badges, ticks and results. */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 520, damping: 20 } },
};

/** Price swap: struck list price stays, discounted price rises in. */
export const priceRise: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { ...smooth, delay: 0.1 } },
};

/** Swap between content states (idle, processing, confirmed). */
export const swap: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: quick },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12 } },
};

/** Receipt reveal. */
export const receiptIn: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { ...spring, delay: 0.05 } },
};

/** Spinner: rotates continuously. */
export const spin: Variants = {
  idle: { rotate: 0 },
  active: { rotate: 360, transition: { duration: 0.9, repeat: Infinity, ease: "linear" } },
};

/** Persona switch: the whole conversation fades while resetting. */
export const resetFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

/**
 * Helper for infinite loops: returns the right variant name so reduced-motion users
 * get a static state. Usage: `animate={loop(reduced, "active")}`.
 */
export function loop(reduced: boolean | null, active: string, idle = "idle"): string {
  return reduced ? idle : active;
}
