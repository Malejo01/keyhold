import { describe, expect, it } from "vitest";
import { sha256Hex } from "./hash";

describe("sha256Hex", () => {
  it("matches known vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("is deterministic, 64 lowercase hex chars, and sensitive to input", () => {
    const a = sha256Hex("lease text");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("lease text")).toBe(a);
    expect(sha256Hex("lease text.")).not.toBe(a);
  });

  it("hashes UTF-8 bytes", () => {
    expect(sha256Hex("Alquiler Salta ñ")).toMatch(/^[0-9a-f]{64}$/);
  });
});
