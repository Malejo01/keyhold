import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  ApprovalError,
  SplitError,
  signWithSecretKey,
  termsMessage,
  validateSplit,
  verifyTwoOfThree,
  verifyWithPublicKey,
  type Approval,
  type ReleaseTerms,
  type Role,
  type SignerSet,
} from "./approvals";

const tenant = Keypair.generate();
const landlord = Keypair.generate();
const agency = Keypair.generate();
const stranger = Keypair.generate();
const parties: Record<Role, Keypair> = { tenant, landlord, agency };
const signers: SignerSet = {
  keys: { tenant: tenant.publicKey.toBytes(), landlord: landlord.publicKey.toBytes(), agency: agency.publicKey.toBytes() },
  base58: { tenant: tenant.publicKey.toBase58(), landlord: landlord.publicKey.toBase58(), agency: agency.publicKey.toBase58() },
};
const terms: ReleaseTerms = { leaseId: "ls_abc", toTenant: "300000000", toLandlord: "100000000", reasonHash: "e".repeat(64), nonce: "f".repeat(32) };

function approve(role: Role, kp: Keypair = parties[role], t: ReleaseTerms = terms): Approval {
  return { role, pubkey: kp.publicKey.toBase58(), signature: signWithSecretKey(kp.secretKey, termsMessage(t)) };
}

describe("validateSplit", () => {
  it("accepts shares that add up to the deposit", () => {
    expect(validateSplit("400000000", "300000000", "100000000")).toEqual({ toTenant: BigInt(300000000), toLandlord: BigInt(100000000) });
    expect(validateSplit("400000000", "400000000", "0").toLandlord).toBe(BigInt(0));
  });
  it("rejects a split that does not sum to the deposit", () => {
    expect(() => validateSplit("400000000", "300000000", "99999999")).toThrow(SplitError);
    expect(() => validateSplit("400000000", "300000000", "100000001")).toThrow(SplitError);
  });
  it("rejects negatives, decimals, junk and an empty deposit", () => {
    expect(() => validateSplit("400000000", "-1", "400000001")).toThrow(SplitError);
    expect(() => validateSplit("400000000", "1.5", "398500000")).toThrow(SplitError);
    expect(() => validateSplit("400000000", "abc", "0")).toThrow(SplitError);
    expect(() => validateSplit("0", "0", "0")).toThrow(SplitError);
  });
});

describe("ed25519 detached signatures", () => {
  it("verifies its own signature and rejects other messages, keys and malformed input", () => {
    const msg = termsMessage(terms);
    const sig = signWithSecretKey(agency.secretKey, msg);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyWithPublicKey(agency.publicKey.toBytes(), msg, sig)).toBe(true);
    expect(verifyWithPublicKey(agency.publicKey.toBytes(), termsMessage({ ...terms, toTenant: "400000000", toLandlord: "0" }), sig)).toBe(false);
    expect(verifyWithPublicKey(stranger.publicKey.toBytes(), msg, sig)).toBe(false);
    expect(verifyWithPublicKey(agency.publicKey.toBytes(), msg, "zz")).toBe(false);
  });
});

describe("verifyTwoOfThree", () => {
  it("accepts agency plus tenant, and agency plus landlord", () => {
    expect(verifyTwoOfThree(terms, [approve("agency"), approve("tenant")], signers).sort()).toEqual(["agency", "tenant"]);
    expect(verifyTwoOfThree(terms, [approve("agency"), approve("landlord")], signers).sort()).toEqual(["agency", "landlord"]);
  });
  it("rejects a single signer, even when it is submitted twice", () => {
    expect(() => verifyTwoOfThree(terms, [approve("agency")], signers)).toThrow(ApprovalError);
    expect(() => verifyTwoOfThree(terms, [approve("agency"), approve("agency")], signers)).toThrow(ApprovalError);
  });
  it("rejects a foreign signer standing in for a party", () => {
    expect(() => verifyTwoOfThree(terms, [approve("agency"), approve("tenant", stranger)], signers)).toThrow(ApprovalError);
    const claimed: Approval = { role: "tenant", pubkey: stranger.publicKey.toBase58(), signature: signWithSecretKey(stranger.secretKey, termsMessage(terms)) };
    expect(() => verifyTwoOfThree(terms, [approve("agency"), claimed], signers)).toThrow(ApprovalError);
  });
  it("rejects a signature made over different terms", () => {
    const other = { ...terms, toTenant: "400000000", toLandlord: "0" };
    expect(() => verifyTwoOfThree(terms, [approve("agency"), approve("tenant", tenant, other)], signers)).toThrow(ApprovalError);
  });
  it("rejects a nonce replayed from another proposal", () => {
    const old = { ...terms, nonce: "1".repeat(32) };
    expect(() => verifyTwoOfThree(terms, [approve("agency", agency, old), approve("tenant", tenant, old)], signers)).toThrow(ApprovalError);
  });
});

describe("termsMessage", () => {
  it("is deterministic and refuses malformed terms", () => {
    expect(Buffer.from(termsMessage(terms)).toString()).toBe(Buffer.from(termsMessage({ ...terms })).toString());
    expect(() => termsMessage({ ...terms, leaseId: "ls abc" })).toThrow();
    expect(() => termsMessage({ ...terms, reasonHash: "x" })).toThrow();
    expect(() => termsMessage({ ...terms, nonce: "zz" })).toThrow();
    expect(() => termsMessage({ ...terms, toTenant: "-5" })).toThrow();
  });
});
