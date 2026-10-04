import { describe, expect, it } from "vitest";
import { buildLedger, inferDiscountBps, type ChainRecord, type LedgerContext } from "./ledger";

const H = "c".repeat(64);
const R = "d".repeat(64);
const ctx: LedgerContext = { custodyOwner: "CUSTODY", custodyAta: "CUSTODY_ATA", landlordAta: "LANDLORD_ATA" };
const TENANT = "TENANT_WALLET";

const dep = (id: string, t: number, amount = "400000000", sig = `dep-${id}`): ChainRecord => ({
  signature: sig,
  blockTime: t,
  memo: `[1] lease:v1:${id}:deposit:${H}`,
  transfers: [{ source: "TENANT_ATA", destination: "CUSTODY_ATA", authority: TENANT, amount }],
});
const rent = (id: string, month: number, t: number, amount: string, sig = `rent-${id}-${month}`): ChainRecord => ({
  signature: sig,
  blockTime: t,
  memo: `[1] lease:v1:${id}:rent:${month}:${H}`,
  transfers: [{ source: "TENANT_ATA", destination: "LANDLORD_ATA", authority: TENANT, amount }],
});
const release = (id: string, t: number, toTenant: string, toLandlord: string, authority = "CUSTODY"): ChainRecord => ({
  signature: `rel-${id}`,
  blockTime: t,
  memo: `[1] lease:v1:${id}:release:${R}`,
  transfers: [
    ...(toTenant !== "0" ? [{ source: "CUSTODY_ATA", destination: "TENANT_ATA", authority, amount: toTenant }] : []),
    ...(toLandlord !== "0" ? [{ source: "CUSTODY_ATA", destination: "LANDLORD_ATA", authority, amount: toLandlord }] : []),
  ],
});

describe("inferDiscountBps", () => {
  it("derives the discount against the deposit", () => {
    expect(inferDiscountBps("380000000", "400000000")).toBe(500);
    expect(inferDiscountBps("388000000", "400000000")).toBe(300);
    expect(inferDiscountBps("400000000", "400000000")).toBe(0);
  });
  it("returns null without a deposit or when rent exceeds it", () => {
    expect(inferDiscountBps("380000000", null)).toBeNull();
    expect(inferDiscountBps("410000000", "400000000")).toBeNull();
  });
});

describe("buildLedger", () => {
  it("groups deposit and rent by lease id with on-time inferred from the discount", () => {
    const ledger = buildLedger(
      [dep("ls_a", 100), rent("ls_a", 0, 200, "380000000"), rent("ls_a", 1, 300, "388000000"), dep("ls_b", 50)],
      ctx,
    );
    expect(ledger.map((l) => l.leaseId)).toEqual(["ls_a", "ls_b"]); // newest activity first
    const a = ledger[0];
    expect(a.status).toBe("deposit_held");
    expect(a.deposit).toMatchObject({ amount: "400000000", payer: TENANT, blockTime: 100 });
    expect(a.rent.map((r) => [r.monthIndex, r.discountBps, r.onTime])).toEqual([
      [0, 500, true],
      [1, 300, false],
    ]);
    expect(a.contractHash).toBe(H);
    expect(a.lastActivity).toBe(300);
  });

  it("marks a lease released only by a custody-authorised release memo", () => {
    const ok = buildLedger([dep("ls_a", 100), release("ls_a", 400, "300000000", "100000000")], ctx)[0];
    expect(ok.status).toBe("deposit_released");
    expect(ok.release).toMatchObject({ toTenant: "300000000", toLandlord: "100000000", reasonHash: R });

    // A release memo sent by anyone else must not block or fake a release.
    const forged = buildLedger([dep("ls_a", 100), release("ls_a", 400, "400000000", "0", "SOMEONE_ELSE")], ctx)[0];
    expect(forged.status).toBe("deposit_held");
    expect(forged.release).toBeNull();
  });

  it("ignores memos that do not match what moved on chain", () => {
    const wrongDestination: ChainRecord = { ...dep("ls_x", 10), transfers: [{ source: "T", destination: "OTHER_ATA", authority: TENANT, amount: "1" }] };
    expect(buildLedger([wrongDestination], ctx)).toEqual([]);
  });

  it("keeps the earliest of duplicate deposits and de-duplicates signatures", () => {
    const ledger = buildLedger(
      [dep("ls_a", 200, "999", "dep-late"), dep("ls_a", 100, "400000000", "dep-early"), dep("ls_a", 100, "400000000", "dep-early")],
      ctx,
    );
    expect(ledger[0].deposit?.signature).toBe("dep-early");
  });

  it("handles legacy memos and a lease with rent but no deposit", () => {
    const legacy: ChainRecord = { ...dep("demo-1", 10), memo: `[1] tuki:lease:demo-1:deposit:${H}` };
    const l = buildLedger([legacy, rent("ls_z", 0, 20, "380000000")], ctx);
    expect(l.find((x) => x.leaseId === "demo-1")?.legacy).toBe(true);
    const z = l.find((x) => x.leaseId === "ls_z");
    expect(z?.status).toBe("no_deposit");
    expect(z?.rent[0].onTime).toBeNull();
  });
});
