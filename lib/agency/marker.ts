// On-chain idempotency for deposit releases (B6 review, B1).
// Every release transaction also creates a tiny system-owned "marker" account whose address is derived
// deterministically from the custody wallet and the lease id (createAccountWithSeed). Creating an account that
// already exists fails, so a second release transaction for the same lease fails atomically on chain, whatever
// process or RPC node sent it and whatever the read lag. The marker holds no data and no PII: the seed is a
// truncated sha256 of the opaque lease id.
import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { sha256Hex } from "../solana/hash";

/** The system program limits a seed to 32 bytes. `rel:` + 24 hex chars is 28. */
export const MARKER_SEED_PREFIX = "rel:";
const MARKER_HASH_CHARS = 24;

export function releaseMarkerSeed(leaseId: string): string {
  return `${MARKER_SEED_PREFIX}${sha256Hex(leaseId).slice(0, MARKER_HASH_CHARS)}`;
}

/** Deterministic marker address for one lease under one custody wallet. */
export async function releaseMarkerAddress(custody: PublicKey, leaseId: string): Promise<PublicKey> {
  return PublicKey.createWithSeed(custody, releaseMarkerSeed(leaseId), SystemProgram.programId);
}

/** Creates the marker (space 0, owner System Program). `lamports` must be the rent-exempt minimum for 0 bytes. */
export async function releaseMarkerInstruction(custody: PublicKey, leaseId: string, lamports: number): Promise<TransactionInstruction> {
  return SystemProgram.createAccountWithSeed({
    fromPubkey: custody,
    basePubkey: custody,
    seed: releaseMarkerSeed(leaseId),
    newAccountPubkey: await releaseMarkerAddress(custody, leaseId),
    lamports,
    space: 0,
    programId: SystemProgram.programId,
  });
}

/**
 * True when a failed send (preflight simulation) or a failed confirmation is the marker rejecting a second release.
 * The marker instruction is always instruction 0, and the System Program's AccountAlreadyInUse is custom error 0.
 * Callers still confirm by reading the marker account, so this is only a hint.
 */
export function isAlreadyInUse(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  const logs = (error as { logs?: unknown } | null)?.logs;
  if (Array.isArray(logs)) parts.push(logs.join(" "));
  if (typeof error === "string") parts.push(error);
  else if (error && typeof error === "object" && !(error instanceof Error)) parts.push(JSON.stringify(error));
  return /already in use|AccountAlreadyInUse|Instruction 0: custom program error: 0x0\b|"InstructionError":\[0,\{"Custom":0\}\]/i.test(parts.join(" "));
}
