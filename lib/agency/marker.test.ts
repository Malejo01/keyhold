import { Keypair, PublicKey, SystemInstruction, SystemProgram, Transaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { isAlreadyInUse, releaseMarkerAddress, releaseMarkerInstruction, releaseMarkerSeed } from "./marker";

describe("release marker", () => {
  it("derives a deterministic seed within the 32-byte system program limit", () => {
    const seed = releaseMarkerSeed("ls_44c6adbf21d470c1");
    expect(seed).toMatch(/^rel:[0-9a-f]{24}$/);
    expect(Buffer.byteLength(seed)).toBeLessThanOrEqual(32);
    expect(releaseMarkerSeed("ls_44c6adbf21d470c1")).toBe(seed);
    expect(releaseMarkerSeed("ls_other")).not.toBe(seed);
    // Opaque: the lease id itself never appears in the seed.
    expect(seed).not.toContain("ls_");
  });

  it("derives the marker address from the custody wallet and the lease id", async () => {
    const custody = Keypair.generate().publicKey;
    const a = await releaseMarkerAddress(custody, "ls_a");
    expect(a.equals(await releaseMarkerAddress(custody, "ls_a"))).toBe(true);
    expect(a.equals(await releaseMarkerAddress(custody, "ls_b"))).toBe(false);
    expect(a.equals(await releaseMarkerAddress(Keypair.generate().publicKey, "ls_a"))).toBe(false);
    expect(a.equals(await PublicKey.createWithSeed(custody, releaseMarkerSeed("ls_a"), SystemProgram.programId))).toBe(true);
  });

  it("builds a createAccountWithSeed with space 0 owned by the system program", async () => {
    const custody = Keypair.generate().publicKey;
    const ix = await releaseMarkerInstruction(custody, "ls_a", 890_880);
    const tx = new Transaction().add(ix);
    tx.recentBlockhash = "11111111111111111111111111111111";
    tx.feePayer = custody;
    const decoded = SystemInstruction.decodeCreateWithSeed(Transaction.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).instructions[0]);
    expect(decoded.fromPubkey.equals(custody)).toBe(true);
    expect(decoded.basePubkey.equals(custody)).toBe(true);
    expect(decoded.seed).toBe(releaseMarkerSeed("ls_a"));
    expect(decoded.space).toBe(0);
    expect(decoded.lamports).toBe(890_880);
    expect(decoded.programId.equals(SystemProgram.programId)).toBe(true);
    expect(decoded.newAccountPubkey.equals(await releaseMarkerAddress(custody, "ls_a"))).toBe(true);
  });

  it("recognises the already-in-use failure in the shapes web3.js returns", () => {
    expect(isAlreadyInUse(new Error("Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0"))).toBe(true);
    expect(isAlreadyInUse({ InstructionError: [0, { Custom: 0 }] })).toBe(true);
    expect(isAlreadyInUse(Object.assign(new Error("x"), { logs: ["Allocate: account Address { address: X } already in use"] }))).toBe(true);
    expect(isAlreadyInUse({ InstructionError: [2, { Custom: 1 }] })).toBe(false);
    expect(isAlreadyInUse(new Error("blockhash not found"))).toBe(false);
  });
});
