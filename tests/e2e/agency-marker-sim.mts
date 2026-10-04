// QA check (simulate only, sends nothing): the per-lease release marker of lib/agency/marker.ts.
// Usage: pnpm exec tsx --env-file=.env.local tests/e2e/agency-marker-sim.mts <releasedLeaseId>
//
// 1. A second release transaction for an already released lease fails at instruction 0 (marker already in use).
// 2. Open risk: if anyone pre-funds the marker address of a lease that was never released, the release fails the
//    same way (createAccountWithSeed refuses an address that holds lamports). Simulated by a lamport transfer to the
//    marker placed before the release instructions in one transaction.
// 3. Candidate fix: transfer the rent-exempt minimum for 1 byte, then allocateWithSeed(space 1). allocate only
//    refuses an account that already has data or a non-system owner, and only the base (custody) can sign it, so
//    pre-funding cannot block it, while a second allocate for the same lease still fails.
// The fee payer is the custody wallet; simulateTransaction is called with sigVerify false and replaceRecentBlockhash.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { releaseMarkerAddress, releaseMarkerInstruction, releaseMarkerSeed } from "../../lib/agency/marker";

const released = process.argv[2];
if (!released) throw new Error("usage: agency-marker-sim.mts <releasedLeaseId>");
const rpc = process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
if (!/devnet/.test(rpc)) throw new Error("devnet only");
const connection = new Connection(rpc, "confirmed");
const custody = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.PLATFORM_SECRET_KEY ?? "[]")));
const mint = new PublicKey(process.env.PAYMENT_MINT ?? "");
const custodyAta = getAssociatedTokenAddressSync(mint, custody.publicKey);

async function simulate(label: string, ixs: TransactionInstruction[]) {
  const tx = new Transaction();
  tx.add(...ixs);
  tx.feePayer = custody.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  const msg = tx.compileMessage();
  const { VersionedTransaction, VersionedMessage } = await import("@solana/web3.js");
  const vtx = new VersionedTransaction(VersionedMessage.deserialize(msg.serialize()));
  const res = await connection.simulateTransaction(vtx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  const logs = (res.value.logs ?? []).filter((l) => /already in use|Create Account|Allocate|failed|error/i.test(l));
  console.log(`${label}\n  err: ${JSON.stringify(res.value.err)}\n  logs: ${logs.join(" | ") || "(none matching)"}`);
  return res.value.err;
}

const rent0 = await connection.getMinimumBalanceForRentExemption(0);
const rent1 = await connection.getMinimumBalanceForRentExemption(1);
const tokenIx = createTransferCheckedInstruction(custodyAta, mint, custodyAta, custody.publicKey, BigInt(1), 6); // self-transfer, harmless

// 1. second release of a released lease
const m1 = await releaseMarkerAddress(custody.publicKey, released);
console.log(`released lease ${released}: marker ${m1.toBase58()} exists=${!!(await connection.getAccountInfo(m1))}`);
const e1 = await simulate("[1] second release (marker ix + token ix)", [await releaseMarkerInstruction(custody.publicKey, released, rent0), tokenIx]);

// 2. pre-funded marker of a lease that was never released
const fresh = `ls_qasim_${Date.now().toString(16)}`;
const m2 = await releaseMarkerAddress(custody.publicKey, fresh);
const prefund = SystemProgram.transfer({ fromPubkey: custody.publicKey, toPubkey: m2, lamports: rent0 });
const e2a = await simulate(`[2a] fresh lease ${fresh}, no prefund: marker ix + token ix`, [await releaseMarkerInstruction(custody.publicKey, fresh, rent0), tokenIx]);
const e2b = await simulate("[2b] same lease, marker pre-funded by a third party (simulated in-tx)", [prefund, await releaseMarkerInstruction(custody.publicKey, fresh, rent0), tokenIx]);

// 3. candidate fix: transfer + allocateWithSeed(space 1)
const seed = releaseMarkerSeed(fresh);
const alloc = () =>
  SystemProgram.allocate({ accountPubkey: m2, basePubkey: custody.publicKey, seed, space: 1, programId: SystemProgram.programId });
const fund = SystemProgram.transfer({ fromPubkey: custody.publicKey, toPubkey: m2, lamports: rent1 });
const e3a = await simulate("[3a] fix, pre-funded marker: transfer rent(1) + allocateWithSeed + token ix", [prefund, fund, alloc(), tokenIx]);
const e3b = await simulate("[3b] fix, second release in the same lease: ... + allocateWithSeed again", [prefund, fund, alloc(), alloc(), tokenIx]);

const ok =
  JSON.stringify(e1) === '{"InstructionError":[0,{"Custom":0}]}' &&
  e2a === null &&
  JSON.stringify(e2b) === '{"InstructionError":[1,{"Custom":0}]}' &&
  e3a === null &&
  JSON.stringify(e3b) === '{"InstructionError":[3,{"Custom":0}]}';
console.log(ok ? "ALL EXPECTED" : "UNEXPECTED RESULT");
