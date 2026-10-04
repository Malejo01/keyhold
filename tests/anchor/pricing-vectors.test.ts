// Q-05 / Q-06 (TS side): the vectors that `cargo test` runs against the program's `quote()` must
// also hold for lib/rules/pricing.ts computePrice (method 'usdc'), so TS and Rust cannot drift.
// The due date uses the program rule: due_day_ts + month_index * period_seconds.
import { describe, expect, it } from "vitest";
import { computePrice } from "../../lib/rules/pricing";
import vectors from "./vectors/pricing.json";

interface Vector {
  name: string;
  rent: string;
  usdc_bps: number;
  ontime_bps: number;
  due_day_ts: number;
  period_seconds: number;
  month_index: number;
  now: number;
  expected_due: number;
  expected_amount: string;
  expected_discount_bps: number;
  expected_on_time: boolean;
}

const doc = vectors as { vectors: Vector[] };

describe("pricing vectors shared with the rental_escrow program", () => {
  it("has the mandatory cases", () => {
    expect(doc.vectors.length).toBeGreaterThanOrEqual(8);
  });

  for (const v of doc.vectors) {
    it(v.name, () => {
      const due = v.due_day_ts + v.month_index * v.period_seconds;
      expect(due).toBe(v.expected_due);
      const q = computePrice({
        listBaseUnits: BigInt(v.rent),
        discountUsdcBps: v.usdc_bps,
        discountOntimeBps: v.ontime_bps,
        dueTs: due,
        atTs: v.now,
        method: "usdc",
      });
      expect(q.amountBaseUnits).toBe(BigInt(v.expected_amount));
      expect(q.discountBps).toBe(v.expected_discount_bps);
      expect(q.onTime).toBe(v.expected_on_time);
    });
  }
});
