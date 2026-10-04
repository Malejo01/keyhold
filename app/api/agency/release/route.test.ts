import { beforeEach, describe, expect, it, vi } from "vitest";

const release = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/release", () => ({ releaseDeposit: release }));

import { POST } from "./route";

const PIN = "424242";
let ipCounter = 0;

function req(body: Record<string, unknown>, ip: string): Request {
  return new Request("http://localhost/api/agency/release", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}
const base = { leaseId: "lease-1", toTenant: "0", toLandlord: "420000000", reason: "agreed exit inspection", approver: "tenant" as const };
const freshIp = () => `10.0.0.${++ipCounter}`;

beforeEach(() => {
  release.mockReset();
  release.mockResolvedValue({ signature: "sig", explorerUrl: "https://explorer.solana.com/tx/sig" });
  process.env.DEMO_AGENCY_PIN = PIN;
});

describe("POST /api/agency/release PIN gate", () => {
  it("rejects a missing PIN with 401 and never releases", async () => {
    const res = await POST(req(base, freshIp()));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Wrong PIN");
    expect(release).not.toHaveBeenCalled();
  });

  it("rejects a wrong PIN with 401 and does not echo it", async () => {
    const res = await POST(req({ ...base, pin: "000000" }, freshIp()));
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain("000000");
    expect(release).not.toHaveBeenCalled();
  });

  it("proceeds with the right PIN, without passing the PIN on", async () => {
    const res = await POST(req({ ...base, pin: PIN }, freshIp()));
    expect(res.status).toBe(200);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0][0]).toEqual(base);
  });

  it("is disabled with 503 when DEMO_AGENCY_PIN is unset or blank, whatever the PIN sent", async () => {
    delete process.env.DEMO_AGENCY_PIN;
    expect((await POST(req({ ...base, pin: PIN }, freshIp()))).status).toBe(503);
    process.env.DEMO_AGENCY_PIN = "  ";
    expect((await POST(req({ ...base, pin: "" }, freshIp()))).status).toBe(503);
    expect(release).not.toHaveBeenCalled();
  });

  it("blocks an IP after 5 wrong PINs with 429, even for the right PIN", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) expect((await POST(req({ ...base, pin: `bad${i}` }, ip))).status).toBe(401);
    const blocked = await POST(req({ ...base, pin: PIN }, ip));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect(release).not.toHaveBeenCalled();
    // Another IP is unaffected.
    expect((await POST(req({ ...base, pin: PIN }, freshIp()))).status).toBe(200);
  });
});
