import type { PriceQuote, PricingInput } from "../contracts";

// BigInt() instead of literals: tsconfig targets ES2017.
const BPS_DENOMINATOR = BigInt(10_000);
const MAX_BPS = 10_000;

/**
 * Pure, deterministic rent pricing. Integer bigint math only.
 *
 *   amount = list * (10_000 - discountBps) / 10_000   (floor division)
 *
 * - The USDC discount applies only when `method === 'usdc'`.
 * - The on-time discount applies only when `atTs <= dueTs`.
 * - `atTs` is server time for a quote and the confirmed tx `blockTime` for the record;
 *   it must never come from the client.
 */
export function computePrice(input: PricingInput): PriceQuote {
  const { listBaseUnits, discountUsdcBps, discountOntimeBps, dueTs, atTs, method } = input;
  if (listBaseUnits < BigInt(0)) throw new RangeError("listBaseUnits must be >= 0");
  for (const bps of [discountUsdcBps, discountOntimeBps]) {
    if (!Number.isInteger(bps) || bps < 0 || bps > MAX_BPS) {
      throw new RangeError("discount bps must be an integer in [0, 10000]");
    }
  }

  const onTime = atTs <= dueTs;
  const usdcBps = method === "usdc" ? discountUsdcBps : 0;
  const ontimeBps = onTime ? discountOntimeBps : 0;
  const discountBps = Math.min(MAX_BPS, usdcBps + ontimeBps);
  const amountBaseUnits = (listBaseUnits * (BPS_DENOMINATOR - BigInt(discountBps))) / BPS_DENOMINATOR;

  return {
    listBaseUnits,
    amountBaseUnits,
    discountBps,
    onTime,
    breakdown: { usdcBps, ontimeBps },
  };
}
