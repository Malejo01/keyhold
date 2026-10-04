import { describe, expect, it } from "vitest";
import { buildReleaseMemo, extractLeaseMemo, parseLeaseMemo } from "./memo";

const H = "a".repeat(64);
const H2 = "b".repeat(64);

describe("parseLeaseMemo", () => {
  it("parses deposit, rent and release memos", () => {
    expect(parseLeaseMemo(`lease:v1:ls_abc123:deposit:${H}`)).toEqual({ leaseId: "ls_abc123", kind: "deposit", hash: H, legacy: false });
    expect(parseLeaseMemo(`lease:v1:ls_abc123:rent:3:${H}`)).toEqual({ leaseId: "ls_abc123", kind: "rent", monthIndex: 3, hash: H, legacy: false });
    expect(parseLeaseMemo(`lease:v1:ls_abc123:release:${H2}`)).toEqual({ leaseId: "ls_abc123", kind: "release", hash: H2, legacy: false });
  });

  it("accepts the legacy tuki prefix for deposit and rent only", () => {
    expect(parseLeaseMemo(`tuki:lease:demo-bec00d360594:deposit:${H}`)).toMatchObject({ leaseId: "demo-bec00d360594", kind: "deposit", legacy: true });
    expect(parseLeaseMemo(`tuki:lease:demo-bec00d360594:rent:0:${H}`)).toMatchObject({ kind: "rent", monthIndex: 0, legacy: true });
    expect(parseLeaseMemo(`tuki:lease:demo-bec00d360594:release:${H}`)).toBeNull();
  });

  it("rejects anything else, including free text and uppercase hashes", () => {
    expect(parseLeaseMemo("hello")).toBeNull();
    expect(parseLeaseMemo(`lease:v1:ls_a:deposit:${H.toUpperCase()}`)).toBeNull();
    expect(parseLeaseMemo(`lease:v1:ls_a:deposit:${H}:extra`)).toBeNull();
    expect(parseLeaseMemo(`lease:v1:ls_a:rent:x:${H}`)).toBeNull();
    expect(parseLeaseMemo(`lease:v1:Ana Perez:deposit:${H}`)).toBeNull();
    expect(parseLeaseMemo(`lease:v2:ls_a:deposit:${H}`)).toBeNull();
  });
});

describe("extractLeaseMemo", () => {
  it("strips the RPC length prefix and finds the lease memo among several", () => {
    const memo = `lease:v1:ls_a:rent:1:${H}`;
    expect(extractLeaseMemo(`[${memo.length}] ${memo}`)).toMatchObject({ kind: "rent", monthIndex: 1 });
    expect(extractLeaseMemo(`[5] hello; [${memo.length}] ${memo}`)).toMatchObject({ kind: "rent" });
    expect(extractLeaseMemo(null)).toBeNull();
    expect(extractLeaseMemo("[5] hello")).toBeNull();
  });
});

describe("buildReleaseMemo", () => {
  it("round-trips through the parser", () => {
    expect(parseLeaseMemo(buildReleaseMemo("ls_abc", H))).toEqual({ leaseId: "ls_abc", kind: "release", hash: H, legacy: false });
  });
  it("refuses ids or hashes that could carry free text", () => {
    expect(() => buildReleaseMemo("ls abc", H)).toThrow();
    expect(() => buildReleaseMemo("ls_abc", "not a hash")).toThrow();
    expect(() => buildReleaseMemo("ls_abc:evil", H)).toThrow();
  });
});
