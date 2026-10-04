import { afterEach, describe, expect, it } from "vitest";
import { configuredPin, pinMatches } from "./pin";

describe("pin", () => {
  afterEach(() => {
    delete process.env.DEMO_AGENCY_PIN;
  });
  it("matches only the exact PIN, whatever the length", () => {
    expect(pinMatches("123456", "123456")).toBe(true);
    expect(pinMatches("12345", "123456")).toBe(false);
    expect(pinMatches("1234567", "123456")).toBe(false);
    expect(pinMatches("", "123456")).toBe(false);
  });
  it("treats an unset or blank env as no PIN", () => {
    delete process.env.DEMO_AGENCY_PIN;
    expect(configuredPin()).toBeNull();
    process.env.DEMO_AGENCY_PIN = "   ";
    expect(configuredPin()).toBeNull();
    process.env.DEMO_AGENCY_PIN = " 9 ";
    expect(configuredPin()).toBe("9");
  });
});
