import { describe, expect, it } from "vitest";
import { landlordShare, usdcToBaseUnits } from "./units";

describe("usdcToBaseUnits", () => {
  it("converts plain amounts", () => {
    expect(usdcToBaseUnits("0")).toBe("0");
    expect(usdcToBaseUnits("12.5")).toBe("12500000");
    expect(usdcToBaseUnits(" 400 ")).toBe("400000000");
    expect(usdcToBaseUnits("0.000001")).toBe("1");
    expect(usdcToBaseUnits("0370")).toBe("370000000"); // leading zeros are harmless
  });
  it("rejects junk", () => {
    for (const bad of ["", "-1", "1.1234567", "1e3", "abc", "1,5", "1."]) expect(usdcToBaseUnits(bad)).toBeNull();
  });
});

describe("landlordShare", () => {
  it("is the remainder of the deposit", () => {
    expect(landlordShare("400000000", "300000000")).toBe("100000000");
    expect(landlordShare("400000000", "0")).toBe("400000000");
  });
  it("is null when invalid or above the deposit", () => {
    expect(landlordShare("400000000", null)).toBeNull();
    expect(landlordShare("400000000", "400000001")).toBeNull();
  });
});
