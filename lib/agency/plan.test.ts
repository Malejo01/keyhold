import { describe, expect, it } from "vitest";
import type { LeaseLedger } from "./ledger";
import { ReleaseError, planRelease } from "./plan";

const base: LeaseLedger = {
  leaseId: "ls_a",
  legacy: false,
  contractHash: "a".repeat(64),
  status: "deposit_held",
  deposit: { signature: "s", blockTime: 1, amount: "400000000", payer: "TENANT" },
  rent: [],
  release: null,
  releases: [],
  duplicateRelease: false,
  lastActivity: 1,
};

function status(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof ReleaseError ? e.status : -1;
  }
  return undefined;
}

describe("planRelease", () => {
  it("plans a valid split", () => {
    expect(planRelease(base, "250000000", "150000000")).toMatchObject({ leaseId: "ls_a", payer: "TENANT", toTenant: BigInt(250000000), toLandlord: BigInt(150000000) });
  });
  it("is idempotent: refuses when a release memo already exists on chain", () => {
    const entry = { signature: "r", blockTime: 2, toTenant: "400000000", toLandlord: "0", reasonHash: "b".repeat(64) };
    const released: LeaseLedger = { ...base, status: "deposit_released", release: entry, releases: [entry] };
    expect(status(() => planRelease(released, "400000000", "0"))).toBe(409);
    try {
      planRelease(released, "400000000", "0");
    } catch (e) {
      expect((e as ReleaseError).explorerUrl).toContain("/tx/r");
    }
  });
  it("refuses an unknown lease and a lease without a deposit", () => {
    expect(status(() => planRelease(undefined, "1", "1"))).toBe(404);
    expect(status(() => planRelease({ ...base, deposit: null, status: "no_deposit" }, "0", "0"))).toBe(409);
  });
  it("refuses a split that does not add up", () => {
    expect(status(() => planRelease(base, "300000000", "99999999"))).toBe(422);
  });
});
