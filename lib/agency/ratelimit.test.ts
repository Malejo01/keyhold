import { describe, expect, it } from "vitest";
import { createLimiter } from "./ratelimit";

describe("createLimiter", () => {
  it("allows max hits per window, then reports seconds to wait, then recovers", () => {
    const l = createLimiter({ windowMs: 60_000, max: 3 });
    expect([l.check("a", 0), l.check("a", 1), l.check("a", 2)]).toEqual([0, 0, 0]);
    expect(l.check("a", 1_000)).toBe(59);
    expect(l.check("b", 1_000)).toBe(0); // other keys are independent
    expect(l.check("a", 60_001)).toBe(0);
  });

  it("caps the number of tracked keys", () => {
    const l = createLimiter({ windowMs: 60_000, max: 1, maxKeys: 5 });
    for (let i = 0; i < 50; i++) l.check(`ip-${i}`, i);
    // The oldest keys were dropped, so they are allowed again; the newest is still limited.
    expect(l.check("ip-0", 100)).toBe(0);
    expect(l.check("ip-49", 100)).toBeGreaterThan(0);
  });
});

describe("createLimiter.peek", () => {
  it("reports without recording a hit", () => {
    const l = createLimiter({ windowMs: 60_000, max: 1 });
    expect(l.peek("a", 0)).toBe(0);
    expect(l.peek("a", 1)).toBe(0);
    expect(l.check("a", 2)).toBe(0);
    expect(l.peek("a", 3)).toBeGreaterThan(0);
    expect(l.peek("a", 60_003)).toBe(0);
  });
});
