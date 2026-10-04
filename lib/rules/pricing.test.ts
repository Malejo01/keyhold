import { describe, expect, it } from "vitest";
import { computePrice } from "./pricing";

const base = {
  listBaseUnits: BigInt(1_000_000_000), // 1,000 tUSDC
  discountUsdcBps: 500,
  discountOntimeBps: 300,
  dueTs: 1_000,
};

describe("computePrice", () => {
  it("no discount: offchain and late", () => {
    const q = computePrice({ ...base, atTs: 1_001, method: "offchain" });
    expect(q.amountBaseUnits).toBe(BigInt(1_000_000_000));
    expect(q.discountBps).toBe(0);
    expect(q.onTime).toBe(false);
    expect(q.breakdown).toEqual({ usdcBps: 0, ontimeBps: 0 });
  });

  it("USDC discount only: usdc but late", () => {
    const q = computePrice({ ...base, atTs: 1_001, method: "usdc" });
    expect(q.discountBps).toBe(500);
    expect(q.amountBaseUnits).toBe(BigInt(950_000_000));
    expect(q.onTime).toBe(false);
    expect(q.breakdown).toEqual({ usdcBps: 500, ontimeBps: 0 });
  });

  it("on-time discount only: offchain and on time (boundary atTs === dueTs)", () => {
    const q = computePrice({ ...base, atTs: 1_000, method: "offchain" });
    expect(q.discountBps).toBe(300);
    expect(q.amountBaseUnits).toBe(BigInt(970_000_000));
    expect(q.onTime).toBe(true);
    expect(q.breakdown).toEqual({ usdcBps: 0, ontimeBps: 300 });
  });

  it("both discounts: usdc and on time", () => {
    const q = computePrice({ ...base, atTs: 999, method: "usdc" });
    expect(q.discountBps).toBe(800);
    expect(q.amountBaseUnits).toBe(BigInt(920_000_000));
    expect(q.onTime).toBe(true);
    expect(q.breakdown).toEqual({ usdcBps: 500, ontimeBps: 300 });
  });

  it("floors with integer math and keeps list untouched", () => {
    const q = computePrice({ ...base, listBaseUnits: BigInt(333), atTs: 0, method: "usdc" });
    expect(q.listBaseUnits).toBe(BigInt(333));
    expect(q.amountBaseUnits).toBe((BigInt(333) * BigInt(9_200)) / BigInt(10_000));
  });

  it("rejects out-of-range bps", () => {
    expect(() => computePrice({ ...base, discountUsdcBps: 10_001, atTs: 0, method: "usdc" })).toThrow(RangeError);
  });
});
