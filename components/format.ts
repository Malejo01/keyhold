/**
 * Formatting helpers. Amounts arrive from the server as base-unit strings (6 decimals).
 * They are formatted only here, at the UI edge; nothing is computed with them.
 * Every helper takes the route language so separators follow the reader (1,234.50 vs 1.234,50).
 */
import type { Lang } from "@/lib/contracts";
import { LOCALE } from "@/lib/i18n";

const DECIMALS = 6;

function separators(lang: Lang): { group: string; decimal: string } {
  return lang === "es" ? { group: ".", decimal: "," } : { group: ",", decimal: "." };
}

function groupDigits(whole: bigint, group: string): string {
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, group);
}

/** "485000000" -> "485.00"; "484850000" -> "484.85"; "1234567000" -> "1,234.567" (Spanish: "485,00", "1.234,567"). */
export function formatUsdc(baseUnits: string, lang: Lang = "en"): string {
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
  const { group, decimal } = separators(lang);
  return `${negative ? "-" : ""}${groupDigits(whole, group)}${decimal}${trimmed}`;
}

/** Same as formatUsdc plus the unit. */
export function formatUsdcAmount(baseUnits: string, lang: Lang = "en"): string {
  return `${formatUsdc(baseUnits, lang)} USDC`;
}

/** Decimal number with the language's separator, e.g. 35.7 -> "35.7" / "35,7". */
export function formatNumber(value: number | string, lang: Lang = "en"): string {
  return String(value).replace(".", separators(lang).decimal);
}

/** 300 -> "3%", 250 -> "2.5%" (Spanish "2,5%"). */
export function formatBps(bps: number, lang: Lang = "en"): string {
  const pct = bps / 100;
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0+$/, "");
  return `${formatNumber(text, lang)}%`;
}

/** First and last characters of a long hex string or signature. */
export function shortHash(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Plain catalog price (a number in whole USDC per month, from the property catalog). */
export function formatMonthlyUsdc(amount: number, lang: Lang = "en"): string {
  return `${amount.toLocaleString(LOCALE[lang])} USDC`;
}

/** Unix seconds -> "12 Oct 2026, 14:03" (English) or "12 oct 2026, 14:03" (Spanish), in the viewer's time zone. */
export function formatTs(ts: number, lang: Lang = "en"): string {
  return new Date(ts * 1000).toLocaleString(lang === "es" ? "es-AR" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
