/**
 * Formatting helpers. Amounts arrive from the server as base-unit strings (6 decimals).
 * They are formatted only here, at the UI edge; nothing is computed with them.
 */

const DECIMALS = 6;

/** "485000000" -> "485.00"; "484850000" -> "484.85"; "1234567000" -> "1,234.567". */
export function formatUsdc(baseUnits: string): string {
  let value: bigint;
  try {
    value = BigInt(baseUnits);
  } catch {
    return "—";
  }
  const negative = value < BigInt(0);
  if (negative) value = -value;
  const scale = BigInt(10) ** BigInt(DECIMALS);
  const whole = value / scale;
  const frac = (value % scale).toString().padStart(DECIMALS, "0");
  // Keep at least 2 decimals, drop trailing zeros beyond that.
  let trimmed = frac.replace(/0+$/, "");
  if (trimmed.length < 2) trimmed = trimmed.padEnd(2, "0");
  const wholeStr = whole.toLocaleString("en-US");
  return `${negative ? "-" : ""}${wholeStr}.${trimmed}`;
}

/** Same as formatUsdc plus the unit. */
export function formatUsdcAmount(baseUnits: string): string {
  return `${formatUsdc(baseUnits)} USDC`;
}

/** 300 -> "3%", 250 -> "2.5%". */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, "")}%`;
}

/** First and last characters of a long hex string or signature. */
export function shortHash(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Plain catalog price (a number in whole USDC per month, from the property catalog). */
export function formatMonthlyUsdc(amount: number): string {
  return `${amount.toLocaleString("en-US")} USDC`;
}

/** Unix seconds -> "12 Oct 2026, 14:03" in the viewer's locale. */
export function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
