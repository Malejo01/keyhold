// Two release requests for the same lease served by two separate "instances" (separate module registries, so the
// in-memory in-flight guard does not help) against a mock devnet. The on-chain marker account must let exactly one land.
import { AccountLayout, TOKEN_PROGRAM_ID, decodeTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, PublicKey, SystemInstruction, SystemProgram, Transaction } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeaseLedger } from "./ledger";

const keys = {
  platform: Keypair.generate(),
  landlord: Keypair.generate(),
  agency: Keypair.generate(),
  ana: Keypair.generate(),
};
const mint = Keypair.generate().publicKey;
const DEPOSIT = BigInt(420_000_000);
const CUSTODY_ATA = getAssociatedTokenAddressSync(mint, keys.platform.publicKey);

process.env.PLATFORM_SECRET_KEY = JSON.stringify([...keys.platform.secretKey]);
process.env.LANDLORD_SECRET_KEY = JSON.stringify([...keys.landlord.secretKey]);
process.env.AGENCY_SECRET_KEY = JSON.stringify([...keys.agency.secretKey]);
process.env.TENANT_ANA_SECRET_KEY = JSON.stringify([...keys.ana.secretKey]);
process.env.PAYMENT_MINT = mint.toBase58();
delete process.env.ESCROW_MODE;

const chain = vi.hoisted(() => ({
  markers: new Map<string, string>(),
  landed: [] as string[],
  tokensOut: BigInt(0),
  blockhashCalls: 0,
  barrier: null as null | { promise: Promise<void>; release: () => void },
  failConfirmOnce: false,
}));

function fakeConnection() {
  return {
    async getAccountInfo(pk: PublicKey) {
      if (chain.markers.has(pk.toBase58())) {
        return { lamports: 890_880, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false };
      }
      if (pk.equals(CUSTODY_ATA)) {
        const data = Buffer.alloc(AccountLayout.span);
        AccountLayout.encode(
          {
            mint,
            owner: keys.platform.publicKey,
            amount: BigInt(10_000_000_000),
            delegateOption: 0,
            delegate: PublicKey.default,
            state: 1,
            isNativeOption: 0,
            isNative: BigInt(0),
            delegatedAmount: BigInt(0),
            closeAuthorityOption: 0,
            closeAuthority: PublicKey.default,
          },
          data,
        );
        return { lamports: 2_039_280, data, owner: TOKEN_PROGRAM_ID, executable: false };
      }
      return null;
    },
    async getMinimumBalanceForRentExemption() {
      return 890_880;
    },
    async getLatestBlockhash() {
      chain.blockhashCalls++;
      if (chain.barrier) {
        if (chain.blockhashCalls >= 2) chain.barrier.release();
        await chain.barrier.promise;
      }
      return { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1 };
    },
    async sendRawTransaction(raw: Buffer) {
      await new Promise((r) => setTimeout(r, 2));
      const tx = Transaction.from(raw);
      const signature = Buffer.from(tx.signature as Uint8Array).toString("hex");
      // The cluster runs the instructions in order: instruction 0 fails when the marker account already exists.
      const create = SystemInstruction.decodeCreateWithSeed(tx.instructions[0]);
      const address = create.newAccountPubkey.toBase58();
      if (chain.markers.has(address)) {
        throw Object.assign(new Error("Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0"), {
          logs: [`Allocate: account Address { address: ${address} } already in use`],
        });
      }
      chain.markers.set(address, signature);
      chain.landed.push(signature);
      for (const ix of tx.instructions) {
        if (ix.programId.equals(TOKEN_PROGRAM_ID) && ix.data[0] === 12) {
          chain.tokensOut += decodeTransferCheckedInstruction(ix).data.amount;
        }
      }
      return signature;
    },
    async confirmTransaction() {
      if (chain.failConfirmOnce) {
        chain.failConfirmOnce = false;
        throw new Error("Transaction was not confirmed in 30.00 seconds");
      }
      return { value: { err: null } };
    },
    async getTransaction() {
      return { blockTime: 1_800_000_000, slot: 1 };
    },
    async getSignaturesForAddress(pk: PublicKey) {
      const signature = chain.markers.get(pk.toBase58());
      return signature ? [{ signature, err: null }] : [];
    },
  };
}

vi.mock("../solana/connection", () => ({
  getDevnetConnection: async () => fakeConnection(),
  getRpcUrl: () => "http://mock",
  getConnection: () => fakeConnection(),
}));

const lease: LeaseLedger = {
  leaseId: "ls_race_test",
  legacy: false,
  contractHash: "a".repeat(64),
  status: "deposit_held",
  deposit: { signature: "dep", blockTime: 1, amount: DEPOSIT.toString(), payer: keys.ana.publicKey.toBase58() },
  rent: [],
  release: null,
  releases: [],
  duplicateRelease: false,
  lastActivity: 1,
};
vi.mock("./chain", () => ({
  loadLeaseForRelease: async () => ({ lease, incomplete: false }),
  invalidateLedgerCache: () => undefined,
}));

const input = { leaseId: "ls_race_test", toTenant: "420000000", toLandlord: "0", reason: "move-out agreed", approver: "tenant" as const };

/** A fresh module registry stands for another serverless instance: its own in-flight Set, shared chain. */
async function freshInstance() {
  vi.resetModules();
  return (await import("./release")).releaseDeposit;
}

beforeEach(() => {
  chain.markers.clear();
  chain.landed.length = 0;
  chain.tokensOut = BigInt(0);
  chain.blockhashCalls = 0;
  chain.barrier = null;
  chain.failConfirmOnce = false;
});

describe("releaseDeposit idempotency on chain", () => {
  it("two concurrent releases from two instances: exactly one lands, the deposit leaves custody once", async () => {
    let open!: () => void;
    chain.barrier = { promise: new Promise<void>((r) => (open = r)), release: () => open() };
    const a = await freshInstance();
    const b = await freshInstance();
    const results = await Promise.allSettled([a(input), b(input)]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(chain.landed).toHaveLength(1);
    expect(chain.tokensOut).toBe(DEPOSIT); // 420 tUSDC out, not 840

    expect(failed[0].reason).toMatchObject({ name: "ReleaseError", status: 409 });
    expect(failed[0].reason.message).toMatch(/already released/i);
    const winner = (ok[0] as PromiseFulfilledResult<{ signature: string }>).value.signature;
    expect(failed[0].reason.explorerUrl).toContain(`/tx/${winner}`); // link of the original release
  });

  it("a later attempt is refused up front with the original link, without sending anything", async () => {
    const a = await freshInstance();
    const first = await a(input);
    const b = await freshInstance();
    const sentBefore = chain.landed.length;
    await expect(b(input)).rejects.toMatchObject({ status: 409, explorerUrl: expect.stringContaining(first.signature) });
    expect(chain.landed.length).toBe(sentBefore);
    expect(chain.tokensOut).toBe(DEPOSIT);
  });

  it("the same instance still refuses a concurrent duplicate", async () => {
    const a = await freshInstance();
    const results = await Promise.allSettled([a(input), a(input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(chain.tokensOut).toBe(DEPOSIT);
  });

  it("a confirmation timeout for a transaction that did land is reported as a success", async () => {
    chain.failConfirmOnce = true;
    const a = await freshInstance();
    const r = await a(input);
    expect(chain.landed).toEqual([r.signature]);
    expect(chain.tokensOut).toBe(DEPOSIT);
  });

  it("creates the marker in the release transaction and keeps the release memo", async () => {
    const a = await freshInstance();
    const r = await a(input);
    expect(r.memo).toMatch(/^lease:v1:ls_race_test:release:[0-9a-f]{64}$/);
    const address = await (await import("./marker")).releaseMarkerAddress(keys.platform.publicKey, "ls_race_test");
    expect(chain.markers.get(address.toBase58())).toBe(r.signature);
  });
});
