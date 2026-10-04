import { describe, expect, it } from "vitest";
import { loadQueue } from "./queue";

describe("loadQueue (replayed agents, deterministic rules)", () => {
  it("lists Bruno (expired payslip, prequal) and Carla (name mismatch, cross-check) with evidence", async () => {
    const prev = process.env.REPLAY;
    delete process.env.REPLAY; // the queue must force replay itself
    try {
      const q = await loadQueue();
      expect(q.simulated).toBe(true);
      expect(q.cases.map((c) => c.tenantId)).toEqual(["bruno", "carla"]);

      const bruno = q.cases[0];
      expect(bruno).toMatchObject({ status: "NEEDS_INFO", decidedBy: "prequal" });
      expect(bruno.issues[0]).toMatchObject({ code: "expired_payslip" });
      expect(bruno.issues[0].evidence?.rule).toMatch(/90 days/);

      const carla = q.cases[1];
      expect(carla).toMatchObject({ status: "NEEDS_INFO", decidedBy: "crosscheck" });
      expect(carla.issues[0]).toMatchObject({ code: "name_mismatch" });
      expect(carla.issues[0].evidence?.compared.some((c) => c.mismatch)).toBe(true);

      expect(q.approved.length).toBe(1);
      expect(process.env.REPLAY).toBeUndefined(); // restored
    } finally {
      if (prev !== undefined) process.env.REPLAY = prev;
    }
  });
});
