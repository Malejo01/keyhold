// Simulated 2-of-3 approval of a deposit release. The demo server holds all three demo keys, so this is NOT
// a trust boundary: it shows the intended flow (agency proposes, one more party approves, terms are signed
// and verified) until the Anchor program enforces the 2-of-3 on chain. Ed25519 detached signatures over a
// canonical text message, using node:crypto only (no extra dependency).
import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from "node:crypto";
import { HASH_RE, ID_RE } from "./memo";

export type Role = "tenant" | "landlord" | "agency";
export const ROLES: readonly Role[] = ["tenant", "landlord", "agency"];

export interface ReleaseTerms {
  leaseId: string;
  /** Base units (6 decimals) as decimal strings. */
  toTenant: string;
  toLandlord: string;
  /** sha256 of the reason text. The text itself is never stored. */
  reasonHash: string;
  /** Random hex, so a signature cannot be replayed for another proposal. */
  nonce: string;
}

export interface Approval {
  role: Role;
  /** Base58 public key of the signer. */
  pubkey: string;
  /** Detached ed25519 signature, hex (128 chars). */
  signature: string;
}

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitError";
  }
}

const DECIMAL_RE = /^(0|[1-9][0-9]{0,17})$/;

/**
 * The split must be two non-negative integers (base units) that sum exactly to the deposit,
 * with something to release. Returns both as bigint.
 */
export function validateSplit(deposit: string, toTenant: string, toLandlord: string): { toTenant: bigint; toLandlord: bigint } {
  if (!DECIMAL_RE.test(deposit)) throw new SplitError("The deposit amount is invalid.");
  if (!DECIMAL_RE.test(toTenant) || !DECIMAL_RE.test(toLandlord)) {
    throw new SplitError("Each share must be a non-negative whole number of base units.");
  }
  const total = BigInt(deposit);
  const a = BigInt(toTenant);
  const b = BigInt(toLandlord);
  if (total <= BigInt(0)) throw new SplitError("There is no deposit to release.");
  if (a + b !== total) throw new SplitError("The two shares must add up to exactly the deposit.");
  return { toTenant: a, toLandlord: b };
}

/** Canonical bytes that every approver signs. Fixed field order, newline separated, versioned. */
export function termsMessage(terms: ReleaseTerms): Uint8Array {
  if (!ID_RE.test(terms.leaseId)) throw new Error("Invalid leaseId.");
  if (!HASH_RE.test(terms.reasonHash)) throw new Error("Invalid reason hash.");
  if (!/^[0-9a-f]{16,64}$/.test(terms.nonce)) throw new Error("Invalid nonce.");
  if (!DECIMAL_RE.test(terms.toTenant) || !DECIMAL_RE.test(terms.toLandlord)) throw new Error("Invalid split.");
  const text = ["keyhold:release:v1", terms.leaseId, terms.toTenant, terms.toLandlord, terms.reasonHash, terms.nonce].join("\n");
  return new TextEncoder().encode(text);
}

// DER prefixes: PKCS8 wrapper for a 32-byte ed25519 seed, SPKI wrapper for a 32-byte public key.
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Detached ed25519 signature with a Solana secret key (64 bytes: 32-byte seed + 32-byte public key). */
export function signWithSecretKey(secretKey: Uint8Array, message: Uint8Array): string {
  if (secretKey.length !== 64) throw new Error("Expected a 64-byte secret key.");
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(secretKey.slice(0, 32))]), format: "der", type: "pkcs8" });
  return edSign(null, message, key).toString("hex");
}

/** Verifies a detached signature against a raw 32-byte public key. Never throws. */
export function verifyWithPublicKey(publicKey: Uint8Array, message: Uint8Array, signatureHex: string): boolean {
  try {
    if (publicKey.length !== 32 || !/^[0-9a-f]{128}$/.test(signatureHex)) return false;
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKey)]), format: "der", type: "spki" });
    return edVerify(null, message, key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

export interface SignerSet {
  /** The three parties' public keys, 32 raw bytes each, by role. */
  keys: Record<Role, Uint8Array>;
  /** Base58 of the same keys, to compare with Approval.pubkey. */
  base58: Record<Role, string>;
}

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

/**
 * Requires at least 2 distinct parties among tenant, landlord and agency, each with a valid signature over
 * the terms by the key registered for that role. A signature from any other key does not count, a role
 * counted twice counts once, and a signature over different terms is invalid.
 */
export function verifyTwoOfThree(terms: ReleaseTerms, approvals: Approval[], signers: SignerSet): Role[] {
  const message = termsMessage(terms);
  const valid = new Set<Role>();
  for (const approval of approvals) {
    if (!ROLES.includes(approval.role)) continue;
    if (approval.pubkey !== signers.base58[approval.role]) continue; // foreign signer for this role
    if (verifyWithPublicKey(signers.keys[approval.role], message, approval.signature)) valid.add(approval.role);
  }
  if (valid.size < 2) {
    throw new ApprovalError(`At least 2 of 3 valid approvals are required, got ${valid.size}.`);
  }
  return [...valid];
}
