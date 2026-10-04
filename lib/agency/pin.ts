// Demo PIN gate for the agency release (server-only). The PIN is a shared demo secret, not account security:
// it keeps strangers on the public deployment from moving the demo escrow's test tokens.
import { createHash, timingSafeEqual } from "node:crypto";

/** The configured PIN, or null when DEMO_AGENCY_PIN is unset or blank (release stays disabled). */
export function configuredPin(): string | null {
  const pin = process.env.DEMO_AGENCY_PIN?.trim();
  return pin ? pin : null;
}

/** Constant-time comparison: both sides are hashed first so the buffers always have equal length. */
export function pinMatches(candidate: string, expected: string): boolean {
  const a = createHash("sha256").update(candidate, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
