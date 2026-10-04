// Pure amount helpers shared by the panel and its tests. tUSDC has 6 decimals; amounts travel as base-unit strings.

const USDC_RE = /^[0-9]{1,12}(\.[0-9]{1,6})?$/;

/** "12.5" -> "12500000". Returns null for anything that is not a plain non-negative USDC amount. */
export function usdcToBaseUnits(text: string): string | null {
  const t = text.trim();
  if (!USDC_RE.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return (BigInt(whole) * BigInt(1_000_000) + BigInt(frac.padEnd(6, "0"))).toString();
}

/** Deposit minus the tenant share, as base units. Null when the tenant share is invalid or above the deposit. */
export function landlordShare(deposit: string, tenantShare: string | null): string | null {
  if (tenantShare === null) return null;
  const rest = BigInt(deposit) - BigInt(tenantShare);
  return rest < BigInt(0) ? null : rest.toString();
}
