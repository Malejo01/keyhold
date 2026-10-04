// Integration tests for programs/rental_escrow on the local validator started by
// `anchor test --validator legacy` (CI job anchor-build). Run with node:test through tsx:
//   pnpm exec tsx --test --test-concurrency=1 tests/anchor/rental_escrow.ts
// Each test name starts with its id in docs/debates/anchor-accounts/qa-tests.md.
//
// The file name has no `.test.` on purpose: vitest (`pnpm test`) must not pick it up, because it
// needs a running validator.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { AnchorProvider, BN, EventParser, Program, Wallet, type Idl } from "@anchor-lang/core";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import {
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  closeAccount,
  createAccount,
  createAssociatedTokenAccountIdempotent,
  createAssociatedTokenAccountIdempotentInstruction,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  setAuthority,
  transferChecked,
} from "@solana/spl-token";
import { computePrice } from "../../lib/rules/pricing";

// ---------------------------------------------------------------------------------------------
// Constants and fixtures
// ---------------------------------------------------------------------------------------------

/** Pinned payment mint (devnet tUSDC address), preloaded from tests/anchor/fixtures/tusdc-mint.json. */
const MINT = new PublicKey("GiCyZLFrkhKd3X4CpFGe4sMHB2kiPob5ToH8FtjYou7X");
/**
 * Localnet-only mint authority of the fixture mint. Derived from a public string on purpose: it has
 * no power on devnet (the devnet mint authority is the platform key) and no keypair file exists.
 */
const MINT_AUTHORITY = Keypair.fromSeed(
  createHash("sha256").update("keyhold:rental_escrow:localnet-test-mint-authority").digest(),
);
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const DECIMALS = 6;
const RENT = 333_333_333;
const DEPOSIT = 1_000_000_000;
const PERIOD = 2_592_000;
const TERM = 12;
const U64_MAX = new BN("18446744073709551615");
const I64_MAX = new BN("9223372036854775807");
const IDL_PATH = "target/idl/rental_escrow.json";

// ---------------------------------------------------------------------------------------------
// Minimal typing over the dynamic Anchor client (the IDL is loaded at runtime)
// ---------------------------------------------------------------------------------------------

interface Builder {
  accountsStrict(accounts: Record<string, PublicKey>): Builder;
  remainingAccounts(accounts: AccountMeta[]): Builder;
  instruction(): Promise<TransactionInstruction>;
}
type Methods = Record<string, (...args: unknown[]) => Builder>;
type AccountClients = Record<string, { fetch(address: PublicKey): Promise<unknown>; fetchNullable(address: PublicKey): Promise<unknown> }>;

interface LeaseAcc {
  leaseId: number[];
  landlord: PublicKey;
  tenant: PublicKey;
  agency: PublicKey;
  mint: PublicKey;
  rentAmount: BN;
  depositAmount: BN;
  dueDayTs: BN;
  periodSeconds: BN;
  termMonths: number;
  discountUsdcBps: number;
  discountOntimeBps: number;
  contractHash: number[];
  entryReportHash: number[];
  exitReportHash: number[];
  depositHeld: boolean;
  monthsPaid: number;
  onTimeStreak: number;
  status: Record<string, unknown>;
  votes: number[][];
}

interface RecordAcc {
  lease: PublicKey;
  tenant: PublicKey;
  monthIndex: number;
  amountPaid: BN;
  discountAppliedBps: number;
  dueTs: BN;
  paidAt: BN;
  onTime: boolean;
}

interface LeaseParams {
  leaseId: number[];
  tenant: PublicKey;
  rentAmount: BN;
  depositAmount: BN;
  dueDayTs: BN;
  periodSeconds: BN;
  termMonths: number;
  discountUsdcBps: number;
  discountOntimeBps: number;
  contractHash: number[];
  entryReportHash: number[];
}

interface Ctx {
  lease: PublicKey;
  vault: PublicKey;
  params: LeaseParams;
  tenant: Keypair;
  landlord: Keypair;
  agency: Keypair;
}

interface Terms {
  toTenant: BN;
  toLandlord: BN;
  reasonHash: number[];
  exitReportHash: number[];
}

interface DecodedEvent {
  name: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------------

const idl = JSON.parse(readFileSync(IDL_PATH, "utf8")) as Idl;
const connection = new Connection(process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899", "confirmed");
const walletKp = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.ANCHOR_WALLET as string, "utf8")) as number[]),
);
const provider = new AnchorProvider(connection, new Wallet(walletKp), {
  commitment: "confirmed",
  preflightCommitment: "confirmed",
});
const program = new Program(idl, provider);
const methods = program.methods as unknown as Methods;
const accounts = program.account as unknown as AccountClients;
const eventParser = new EventParser(program.programId, program.coder);
const allEvents: DecodedEvent[] = [];
const memosSent: string[] = [];
/** Max compute units seen per program instruction (printed at the end, for docs/onchain.md). */
const maxCu: Record<string, number> = {};
let uniqCounter = 1;

const sha = (s: string): number[] => Array.from(createHash("sha256").update(s).digest());
const newLeaseId = (): number[] => Array.from(randomBytes(8));
const u16le = (n: number): Buffer => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};

function leasePda(landlord: PublicKey, leaseId: number[]): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lease"), landlord.toBuffer(), Buffer.from(leaseId)],
    program.programId,
  )[0];
}
function vaultPda(lease: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), lease.toBuffer()], program.programId)[0];
}
function recordPda(lease: PublicKey, month: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("payment"), lease.toBuffer(), u16le(month)],
    program.programId,
  )[0];
}
const ata = (owner: PublicKey, mint: PublicKey = MINT): PublicKey => getAssociatedTokenAddressSync(mint, owner);

async function clockNow(): Promise<number> {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, "confirmed");
  assert.ok(info, "clock sysvar");
  return Number(info.data.readBigInt64LE(32));
}

async function waitUntilClockAbove(ts: number): Promise<void> {
  for (let i = 0; i < 240; i++) {
    if ((await clockNow()) > ts) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`clock never passed ${ts}`);
}

/** Unique no-op prefix so two identical instructions never collide as the same transaction. */
const uniq = (): TransactionInstruction =>
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: uniqCounter++ });

async function send(ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
  const tx = new Transaction().add(uniq(), ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs);
  const sig = await provider.sendAndConfirm(tx, signers, { commitment: "confirmed" });
  const got = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const logs = got?.meta?.logMessages ?? [];
  for (const ev of eventParser.parseLogs(logs)) allEvents.push(ev as DecodedEvent);
  let current = "";
  for (const line of logs) {
    const ixName = /^Program log: Instruction: (\w+)$/.exec(line);
    if (ixName) current = ixName[1];
    const used = line.startsWith(`Program ${program.programId.toBase58()} consumed `)
      ? /consumed (\d+) of/.exec(line)
      : null;
    if (used && current) maxCu[current] = Math.max(maxCu[current] ?? 0, Number(used[1]));
  }
  return sig;
}

async function eventsOf(sig: string): Promise<DecodedEvent[]> {
  const got = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  return Array.from(eventParser.parseLogs(got?.meta?.logMessages ?? [])) as DecodedEvent[];
}

function errorText(e: unknown): string {
  const parts: string[] = [String(e)];
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    for (const k of ["logs", "transactionLogs", "errorLogs"]) {
      const v = o[k];
      if (Array.isArray(v)) parts.push(v.join("\n"));
    }
    const inner = o.error as { errorCode?: { code?: string } } | undefined;
    if (inner?.errorCode?.code) parts.push(`Error Code: ${inner.errorCode.code}`);
  }
  return parts.join("\n");
}

/** Asserts that the transaction fails and that one of `expected` (error names or log fragments) appears. */
async function expectFail(p: Promise<unknown>, expected: string[]): Promise<string> {
  let text: string | null = null;
  try {
    await p;
  } catch (e) {
    text = errorText(e);
  }
  assert.ok(text !== null, `expected failure with one of ${expected.join(" | ")}, but it succeeded`);
  assert.ok(
    expected.some((x) => text!.includes(x)),
    `expected one of ${expected.join(" | ")}, got:\n${text!.slice(0, 3000)}`,
  );
  return text!;
}

async function snapshot(keys: PublicKey[]): Promise<string[]> {
  const infos = await connection.getMultipleAccountsInfo(keys, "confirmed");
  return infos.map((i) => (i ? `${i.lamports}:${i.owner.toBase58()}:${i.data.toString("base64")}` : "null"));
}

async function tokenBalance(address: PublicKey): Promise<bigint> {
  return (await getAccount(connection, address, "confirmed")).amount;
}

async function fetchLease(lease: PublicKey): Promise<LeaseAcc> {
  return (await accounts.lease.fetch(lease)) as LeaseAcc;
}
async function fetchRecord(lease: PublicKey, month: number): Promise<RecordAcc> {
  return (await accounts.paymentRecord.fetch(recordPda(lease, month))) as RecordAcc;
}
const statusOf = (l: LeaseAcc): string => Object.keys(l.status)[0];

async function newParty(tokens = 0): Promise<Keypair> {
  const kp = Keypair.generate();
  const sig = await connection.requestAirdrop(kp.publicKey, 20 * LAMPORTS_PER_SOL);
  const bh = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  await createAssociatedTokenAccountIdempotent(connection, walletKp, MINT, kp.publicKey, { commitment: "confirmed" });
  if (tokens > 0) {
    await mintTo(connection, walletKp, MINT, ata(kp.publicKey), MINT_AUTHORITY, BigInt(tokens), [], {
      commitment: "confirmed",
    });
  }
  return kp;
}

// ---------------------------------------------------------------------------------------------
// Instruction builders
// ---------------------------------------------------------------------------------------------

function defaultParams(tenant: PublicKey, due: number, over: Partial<LeaseParams> = {}): LeaseParams {
  return {
    leaseId: newLeaseId(),
    tenant,
    rentAmount: new BN(RENT),
    depositAmount: new BN(DEPOSIT),
    dueDayTs: new BN(due),
    periodSeconds: new BN(PERIOD),
    termMonths: TERM,
    discountUsdcBps: 300,
    discountOntimeBps: 200,
    contractHash: sha("contract text + off-chain salt"),
    entryReportHash: sha("entry report + off-chain salt"),
    ...over,
  };
}

function createIx(
  p: LeaseParams,
  landlord: PublicKey,
  agency: PublicKey,
  over: Record<string, PublicKey> = {},
): Promise<TransactionInstruction> {
  const lease = over.lease ?? leasePda(landlord, p.leaseId);
  return methods
    .createLease(p)
    .accountsStrict({
      landlord,
      agency,
      mint: MINT,
      lease,
      vault: vaultPda(lease),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      ...over,
    })
    .instruction();
}

function depositIx(c: Ctx, over: Record<string, PublicKey> = {}, remaining: AccountMeta[] = []): Promise<TransactionInstruction> {
  return methods
    .depositEscrow()
    .accountsStrict({
      tenant: c.tenant.publicKey,
      lease: c.lease,
      mint: MINT,
      tenantToken: ata(c.tenant.publicKey),
      vault: c.vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      ...over,
    })
    .remainingAccounts(remaining)
    .instruction();
}

function payIx(
  c: Ctx,
  month: number,
  maxAmount: BN = U64_MAX,
  over: Record<string, PublicKey> = {},
  payer: PublicKey = c.tenant.publicKey,
): Promise<TransactionInstruction> {
  return methods
    .payRent(month, maxAmount)
    .accountsStrict({
      tenant: c.tenant.publicKey,
      payer,
      lease: c.lease,
      mint: MINT,
      tenantToken: ata(c.tenant.publicKey),
      landlordToken: ata(c.landlord.publicKey),
      paymentRecord: recordPda(c.lease, month),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      ...over,
    })
    .instruction();
}

function voteIx(c: Ctx, voter: PublicKey, t: Terms, over: Record<string, PublicKey> = {}): Promise<TransactionInstruction> {
  return methods
    .voteRelease(t.toTenant, t.toLandlord, t.reasonHash, t.exitReportHash)
    .accountsStrict({
      voter,
      lease: c.lease,
      mint: MINT,
      vault: c.vault,
      tenantToken: ata(c.tenant.publicKey),
      landlordToken: ata(c.landlord.publicKey),
      landlord: c.landlord.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      ...over,
    })
    .instruction();
}

function cancelIx(c: Ctx, over: Record<string, PublicKey> = {}): Promise<TransactionInstruction> {
  return methods
    .cancelLease()
    .accountsStrict({
      landlord: c.landlord.publicKey,
      lease: c.lease,
      mint: MINT,
      vault: c.vault,
      landlordToken: ata(c.landlord.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID,
      ...over,
    })
    .instruction();
}

const terms = (toTenant: number | BN, toLandlord: number | BN, tag = "exit"): Terms => ({
  toTenant: BN.isBN(toTenant) ? toTenant : new BN(toTenant),
  toLandlord: BN.isBN(toLandlord) ? toLandlord : new BN(toLandlord),
  reasonHash: sha(`reason:${tag}`),
  exitReportHash: sha(`exit report:${tag}`),
});

// ---------------------------------------------------------------------------------------------
// Shared parties
// ---------------------------------------------------------------------------------------------

let T: Keypair; // tenant
let L: Keypair; // landlord
let A: Keypair; // agency
let X: Keypair; // outsider
let L2: Keypair; // landlord of lease B

async function newLease(
  opts: {
    tenant?: Keypair;
    landlord?: Keypair;
    agency?: Keypair;
    due?: number;
    params?: Partial<LeaseParams>;
    deposit?: boolean;
  } = {},
): Promise<Ctx> {
  const tenant = opts.tenant ?? T;
  const landlord = opts.landlord ?? L;
  const agency = opts.agency ?? A;
  const due = opts.due ?? (await clockNow()) + 86_400;
  const params = defaultParams(tenant.publicKey, due, opts.params);
  const lease = leasePda(landlord.publicKey, params.leaseId);
  const c: Ctx = { lease, vault: vaultPda(lease), params, tenant, landlord, agency };
  await send([await createIx(params, landlord.publicKey, agency.publicKey)], [landlord, agency]);
  if (opts.deposit ?? true) await send([await depositIx(c)], [tenant]);
  return c;
}

async function pay(c: Ctx, month: number): Promise<string> {
  return send([await payIx(c, month)], [c.tenant]);
}
async function vote(c: Ctx, voter: Keypair, t: Terms): Promise<string> {
  return send([await voteIx(c, voter.publicKey, t)], [voter]);
}

/** Flips one account meta to non-signer, so the program (not web3.js) must reject the missing signature. */
function dropSigner(ix: TransactionInstruction, key: PublicKey): TransactionInstruction {
  ix.keys = ix.keys.map((k) => (k.pubkey.equals(key) ? { ...k, isSigner: false } : k));
  return ix;
}

/**
 * Classic SPL Token has no immutable owner: the wallet that owns an ATA can hand it to another key
 * (`SetAuthority AccountOwner`) at any time. qa B4 review, B1.
 */
async function moveAtaOwner(party: Keypair): Promise<void> {
  await setAuthority(
    connection,
    walletKp,
    ata(party.publicKey),
    party,
    AuthorityType.AccountOwner,
    Keypair.generate().publicKey,
    [],
    { commitment: "confirmed" },
  );
}

/** A fresh, non-ATA token account owned by `owner`. Anyone can create it without `owner`'s signature. */
function freshTokenAccount(owner: PublicKey): Promise<PublicKey> {
  return createAccount(connection, walletKp, MINT, owner, Keypair.generate(), { commitment: "confirmed" });
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe("rental_escrow", () => {
  before(async () => {
    // Fixture sanity: the pinned mint exists with the derived localnet authority.
    const mintInfo = await connection.getAccountInfo(MINT, "confirmed");
    assert.ok(mintInfo, "pinned mint fixture is loaded");
    T = await newParty(1_000_000_000_000);
    L = await newParty();
    A = await newParty();
    X = await newParty(10_000_000_000);
    L2 = await newParty();
  });

  // ------------------------------------------------------------------ Q: pricing parity
  describe("Q pricing parity with lib/rules/pricing.ts", () => {
    async function payAndCheck(c: Ctx, month: number, expected: number, onTime: boolean, bps: number): Promise<RecordAcc> {
      const before = await tokenBalance(ata(c.tenant.publicKey));
      const landlordBefore = await tokenBalance(ata(c.landlord.publicKey));
      await pay(c, month);
      const r = await fetchRecord(c.lease, month);
      const due = c.params.dueDayTs.toNumber() + month * c.params.periodSeconds.toNumber();
      const q = computePrice({
        listBaseUnits: BigInt(c.params.rentAmount.toString()),
        discountUsdcBps: c.params.discountUsdcBps,
        discountOntimeBps: c.params.discountOntimeBps,
        dueTs: due,
        atTs: r.paidAt.toNumber(),
        method: "usdc",
      });
      assert.equal(r.amountPaid.toString(), q.amountBaseUnits.toString(), "program == computePrice");
      assert.equal(r.amountPaid.toNumber(), expected, "literal cross-check");
      assert.equal(r.discountAppliedBps, bps);
      assert.equal(r.discountAppliedBps, q.discountBps);
      assert.equal(r.onTime, onTime);
      assert.equal(r.onTime, q.onTime);
      assert.equal(r.dueTs.toNumber(), due);
      assert.equal(before - (await tokenBalance(ata(c.tenant.publicKey))), BigInt(expected));
      assert.equal((await tokenBalance(ata(c.landlord.publicKey))) - landlordBefore, BigInt(expected));
      return r;
    }

    it("Q-01 none: usdc 0 bps, late", async () => {
      const c = await newLease({ due: (await clockNow()) - 3600, params: { discountUsdcBps: 0 } });
      await payAndCheck(c, 0, 333_333_333, false, 0);
      assert.equal((await fetchLease(c.lease)).onTimeStreak, 0);
    });

    it("Q-02 USDC only: 300 bps, late", async () => {
      const c = await newLease({ due: (await clockNow()) - 3600 });
      await payAndCheck(c, 0, 323_333_333, false, 300);
    });

    it("Q-03 on-time only: 0 + 200 bps", async () => {
      const c = await newLease({ due: (await clockNow()) + 3600, params: { discountUsdcBps: 0 } });
      await payAndCheck(c, 0, 326_666_666, true, 200);
      assert.equal((await fetchLease(c.lease)).onTimeStreak, 1);
    });

    it("Q-04 both: 300 + 200 bps, months 0, 1 and 2 (fixed periods)", async () => {
      const c = await newLease({ due: (await clockNow()) + 3600 });
      for (const m of [0, 1, 2]) {
        await payAndCheck(c, m, 316_666_666, true, 500);
        assert.equal((await fetchLease(c.lease)).onTimeStreak, m + 1);
      }
      const l = await fetchLease(c.lease);
      assert.equal(l.monthsPaid, 3);
    });

    it("Q-07 streak resets: on time, late, on time", async () => {
      // Short periods and real waiting on the validator Clock: due(m) = d + m * P.
      const P = 12;
      const now = await clockNow();
      const d = now + 8;
      const c = await newLease({ due: d, params: { periodSeconds: new BN(P) } });
      await pay(c, 0);
      assert.equal((await fetchRecord(c.lease, 0)).onTime, true, "month 0 on time");
      assert.equal((await fetchLease(c.lease)).onTimeStreak, 1);
      await waitUntilClockAbove(d + P);
      await pay(c, 1);
      assert.equal((await fetchRecord(c.lease, 1)).onTime, false, "month 1 late");
      assert.equal((await fetchLease(c.lease)).onTimeStreak, 0);
      await pay(c, 2);
      const r2 = await fetchRecord(c.lease, 2);
      assert.equal(r2.onTime, r2.paidAt.toNumber() <= d + 2 * P, "month 2 follows the clock");
      assert.equal(r2.onTime, true, "month 2 paid inside its window");
      assert.equal((await fetchLease(c.lease)).onTimeStreak, 1);
    });

    it("Q-08 max_amount below the quote fails with AmountAboveMax; state unchanged", async () => {
      const c = await newLease({ due: (await clockNow()) + 3600 });
      const keys = [c.lease, ata(T.publicKey), ata(L.publicKey)];
      const before = await snapshot(keys);
      await expectFail(send([await payIx(c, 0, new BN(316_666_666 - 1))], [T]), ["AmountAboveMax"]);
      assert.deepEqual(await snapshot(keys), before);
      // The exact quote passes.
      await send([await payIx(c, 0, new BN(316_666_666))], [T]);
    });

    it("Q-09 IDL: pay_rent takes only month_index and max_amount", () => {
      const ix = (idl.instructions as Array<{ name: string; args: Array<{ name: string }> }>).find(
        (i) => i.name === "pay_rent",
      );
      assert.ok(ix);
      assert.deepEqual(
        ix.args.map((a) => a.name),
        ["month_index", "max_amount"],
      );
    });
  });

  // ------------------------------------------------------------------ C: create_lease
  describe("C create_lease", () => {
    async function createWith(p: LeaseParams, landlord = L, agency = A): Promise<string> {
      return send([await createIx(p, landlord.publicKey, agency.publicKey)], [landlord, agency]);
    }

    it("C-01 parties must be distinct", async () => {
      const due = (await clockNow()) + 3600;
      await expectFail(createWith(defaultParams(L.publicKey, due)), ["InvalidParties"]); // tenant == landlord
      await expectFail(createWith(defaultParams(A.publicKey, due)), ["InvalidParties"]); // tenant == agency
      // landlord == agency: one key signs both roles.
      await expectFail(
        send([await createIx(defaultParams(T.publicKey, due), L.publicKey, L.publicKey)], [L]),
        ["InvalidParties"],
      );
    });

    it("C-02 missing agency signature -> AccountNotSigner", async () => {
      const p = defaultParams(T.publicKey, (await clockNow()) + 3600);
      const ix = dropSigner(await createIx(p, L.publicKey, A.publicKey), A.publicKey);
      await expectFail(send([ix], [L]), ["AccountNotSigner"]);
    });

    it("C-03 missing landlord signature; X signing as landlord for L's seeds", async () => {
      const p = defaultParams(T.publicKey, (await clockNow()) + 3600);
      const ix = dropSigner(await createIx(p, L.publicKey, A.publicKey), L.publicKey);
      await expectFail(send([ix], [A]), ["AccountNotSigner"]);
      const squat = await createIx(p, X.publicKey, A.publicKey, { lease: leasePda(L.publicKey, p.leaseId) });
      await expectFail(send([squat], [X, A]), ["ConstraintSeeds"]);
    });

    it("C-04 / C-05 / C-06 bps: sum 10_001, u16 wrap 65_535 + 1, and 100% discount", async () => {
      const due = (await clockNow()) + 3600;
      for (const [u, o] of [
        [5_001, 5_000],
        [65_535, 1],
        [5_000, 5_000],
        [10_000, 0],
      ]) {
        await expectFail(
          createWith(defaultParams(T.publicKey, due, { discountUsdcBps: u, discountOntimeBps: o })),
          ["InvalidBps"],
        );
      }
    });

    it("C-07 invalid params", async () => {
      const due = (await clockNow()) + 3600;
      const bad: Partial<LeaseParams>[] = [
        { periodSeconds: new BN(0) },
        { periodSeconds: new BN(-1) },
        { termMonths: 0 },
        { rentAmount: new BN(0) },
        { depositAmount: new BN(0) },
        { dueDayTs: new BN(0) },
        { dueDayTs: new BN(-5) },
        { leaseId: [0, 0, 0, 0, 0, 0, 0, 0] },
      ];
      for (const over of bad) {
        await expectFail(createWith(defaultParams(T.publicKey, due, over)), ["InvalidParams"]);
      }
    });

    it("C-08 / C-09 / C-10 mint substitution: 9 decimals, other 6-dec mint, freeze authority, Token-2022", async () => {
      const auth = Keypair.generate();
      const nine = await createMint(connection, walletKp, auth.publicKey, null, 9);
      const other6 = await createMint(connection, walletKp, auth.publicKey, null, 6);
      const frozen = await createMint(connection, walletKp, auth.publicKey, auth.publicKey, 6);
      const t22 = await createMint(connection, walletKp, auth.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID);
      for (const mint of [nine, other6, frozen]) {
        const p = defaultParams(T.publicKey, (await clockNow()) + 3600);
        const ix = await createIx(p, L.publicKey, A.publicKey, { mint });
        await expectFail(send([ix], [L, A]), ["InvalidMint", "ConstraintAddress"]);
      }
      const p = defaultParams(T.publicKey, (await clockNow()) + 3600);
      const ix = await createIx(p, L.publicKey, A.publicKey, { mint: t22, tokenProgram: TOKEN_2022_PROGRAM_ID });
      await expectFail(send([ix], [L, A]), ["InvalidProgramId", "AccountOwnedByWrongProgram", "InvalidMint"]);
    });

    it("C-11 lease_id is [u8; 8] in the IDL (no free text possible)", () => {
      const types = idl.types as Array<{ name: string; type: { fields?: Array<{ name: string; type: unknown }> } }>;
      const params = types.find((t) => t.name === "CreateLeaseParams");
      assert.ok(params?.type.fields);
      const f = params.type.fields.find((x) => x.name === "lease_id");
      assert.deepEqual(f?.type, { array: ["u8", 8] });
    });

    it("C-12 second create with the same seeds fails; the original is unchanged", async () => {
      const c = await newLease({ deposit: false });
      const before = await snapshot([c.lease, c.vault]);
      const again = { ...c.params, tenant: X.publicKey, rentAmount: new BN(1) };
      await expectFail(createWith(again), ["already in use"]);
      assert.deepEqual(await snapshot([c.lease, c.vault]), before);
    });

    it("C-13 happy path: fields, vault authority and LeaseCreated event", async () => {
      const due = (await clockNow()) + 3600;
      const p = defaultParams(T.publicKey, due);
      const lease = leasePda(L.publicKey, p.leaseId);
      const sig = await createWith(p);
      const l = await fetchLease(lease);
      assert.deepEqual(l.leaseId, p.leaseId);
      assert.ok(l.landlord.equals(L.publicKey));
      assert.ok(l.tenant.equals(T.publicKey));
      assert.ok(l.agency.equals(A.publicKey));
      assert.ok(l.mint.equals(MINT));
      assert.equal(l.rentAmount.toNumber(), RENT);
      assert.equal(l.depositAmount.toNumber(), DEPOSIT);
      assert.equal(l.dueDayTs.toNumber(), due);
      assert.equal(l.periodSeconds.toNumber(), PERIOD);
      assert.equal(l.termMonths, TERM);
      assert.equal(l.discountUsdcBps, 300);
      assert.equal(l.discountOntimeBps, 200);
      assert.deepEqual(l.contractHash, p.contractHash);
      assert.deepEqual(l.entryReportHash, p.entryReportHash);
      assert.deepEqual(l.exitReportHash, new Array(32).fill(0));
      assert.equal(l.depositHeld, false);
      assert.equal(statusOf(l), "created");
      const vault = await getAccount(connection, vaultPda(lease), "confirmed");
      assert.ok(vault.owner.equals(lease), "vault authority is the Lease PDA");
      assert.ok(vault.mint.equals(MINT));
      assert.equal(vault.amount, BigInt(0));
      const ev = (await eventsOf(sig)).find((e) => e.name.toLowerCase() === "leasecreated");
      assert.ok(ev, "LeaseCreated emitted");
      assert.deepEqual(ev.data.contractHash, p.contractHash);
      assert.deepEqual(ev.data.entryReportHash, p.entryReportHash);
      assert.ok((ev.data.agency as PublicKey).equals(A.publicKey));
    });

    it("P-12 a due date that overflows i64 within the term is rejected at create (MathOverflow)", async () => {
      const p = defaultParams(T.publicKey, 0, { dueDayTs: I64_MAX.subn(10), termMonths: 2 });
      await expectFail(createWith(p), ["MathOverflow"]);
    });
  });

  // ------------------------------------------------------------------ D: deposit_escrow
  describe("D deposit_escrow", () => {
    it("D-01 X signs as tenant -> ConstraintHasOne", async () => {
      const c = await newLease({ deposit: false });
      const ix = await depositIx(c, { tenant: X.publicKey, tenantToken: ata(X.publicKey) });
      await expectFail(send([ix], [X]), ["ConstraintHasOne"]);
    });

    it("D-02 second deposit -> LeaseNotCreated; unchanged", async () => {
      const c = await newLease();
      const keys = [c.lease, c.vault, ata(T.publicKey)];
      const before = await snapshot(keys);
      await expectFail(send([await depositIx(c)], [T]), ["LeaseNotCreated"]);
      assert.deepEqual(await snapshot(keys), before);
    });

    it("D-03 vault substituted by the tenant's own token account or by lease B's vault", async () => {
      const c = await newLease({ deposit: false });
      const b = await newLease({ landlord: L2, deposit: false });
      const own = await createAccount(connection, walletKp, MINT, T.publicKey, Keypair.generate());
      await expectFail(send([await depositIx(c, { vault: own })], [T]), ["ConstraintSeeds", "ConstraintTokenOwner"]);
      await expectFail(send([await depositIx(c, { vault: b.vault })], [T]), ["ConstraintSeeds"]);
      assert.equal((await fetchLease(c.lease)).depositHeld, false);
    });

    it("D-04 tenant token account with another mint -> ConstraintTokenMint", async () => {
      const c = await newLease({ deposit: false });
      const otherMint = await createMint(connection, walletKp, walletKp.publicKey, null, 6);
      const otherAta = await createAssociatedTokenAccountIdempotent(connection, walletKp, otherMint, T.publicKey);
      await expectFail(send([await depositIx(c, { tenantToken: otherAta })], [T]), ["ConstraintTokenMint"]);
    });

    it("D-05 tenant balance below the deposit -> token insufficient funds; lease stays Created", async () => {
      const poor = await newParty(DEPOSIT - 1);
      const c = await newLease({ tenant: poor, deposit: false });
      await expectFail(send([await depositIx(c)], [poor]), ["insufficient funds"]);
      assert.equal(statusOf(await fetchLease(c.lease)), "created");
    });

    it("D-06 one tx [create_lease, deposit_escrow + reference, memo] signed by T, L, A and a fee payer; < 1232 bytes", async () => {
      const p = defaultParams(T.publicKey, (await clockNow()) + 3600);
      const lease = leasePda(L.publicKey, p.leaseId);
      const c: Ctx = { lease, vault: vaultPda(lease), params: p, tenant: T, landlord: L, agency: A };
      const reference = Keypair.generate().publicKey;
      const leaseIdHex = Buffer.from(p.leaseId).toString("hex");
      const memo = `lease:v1:ls_${leaseIdHex}:deposit:${Buffer.from(p.contractHash).toString("hex")}`;
      memosSent.push(memo);
      const memoIx = new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(memo, "utf8") });
      const tx = new Transaction().add(
        await createIx(p, L.publicKey, A.publicKey),
        await depositIx(c, {}, [{ pubkey: reference, isSigner: false, isWritable: false }]),
        memoIx,
      );
      tx.feePayer = walletKp.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
      tx.sign(walletKp, L, A, T);
      const size = tx.serialize().length;
      assert.ok(size < 1232, `tx size ${size} must be < 1232`);
      const sig = await connection.sendRawTransaction(tx.serialize());
      const bh = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      const l = await fetchLease(lease);
      assert.equal(statusOf(l), "active");
      assert.equal(await tokenBalance(c.vault), BigInt(DEPOSIT));
      const found = await connection.getSignaturesForAddress(reference, {}, "confirmed");
      assert.equal(found[0]?.signature, sig, "the reference finds the tx");
    });
  });

  // ------------------------------------------------------------------ P: pay_rent
  describe("P pay_rent", () => {
    it("P-01 pay before the deposit -> LeaseNotActive", async () => {
      const c = await newLease({ deposit: false });
      await expectFail(pay(c, 0), ["LeaseNotActive"]);
    });

    it("P-02 double pay of month 0 is rejected; balances and months_paid unchanged", async () => {
      const c = await newLease();
      await pay(c, 0);
      const keys = [c.lease, ata(T.publicKey), ata(L.publicKey), recordPda(c.lease, 0)];
      const before = await snapshot(keys);
      await expectFail(pay(c, 0), ["already in use"]);
      assert.deepEqual(await snapshot(keys), before);
      assert.equal((await fetchLease(c.lease)).monthsPaid, 1);
    });

    it("P-03 skipping a month -> MonthOutOfOrder", async () => {
      const c = await newLease();
      await pay(c, 0);
      await expectFail(pay(c, 2), ["MonthOutOfOrder"]);
    });

    it("P-04 month_index == term_months -> MonthOutOfRange", async () => {
      const c = await newLease();
      await expectFail(pay(c, TERM), ["MonthOutOfRange"]);
    });

    it("P-05 pay after Closed -> LeaseNotActive", async () => {
      const c = await newLease();
      await vote(c, T, terms(DEPOSIT, 0));
      await vote(c, L, terms(DEPOSIT, 0));
      assert.equal(statusOf(await fetchLease(c.lease)), "closed");
      await expectFail(pay(c, 0), ["LeaseNotActive"]);
    });

    it("P-06 X signs as tenant with X's tokens -> ConstraintHasOne", async () => {
      const c = await newLease();
      const ix = await payIx(c, 0, U64_MAX, { tenant: X.publicKey, tenantToken: ata(X.publicKey) }, X.publicKey);
      await expectFail(send([ix], [X]), ["ConstraintHasOne"]);
    });

    it("P-07 tenant_token owned by X -> ConstraintTokenOwner", async () => {
      // X is not an account of the instruction, so it cannot co-sign; the owner check alone must reject it.
      const c = await newLease();
      const ix = await payIx(c, 0, U64_MAX, { tenantToken: ata(X.publicKey) });
      await expectFail(send([ix], [T]), ["ConstraintTokenOwner"]);
    });

    it("P-08 / P-09 landlord_token = X's ATA or the tenant's own ATA -> rejected; balances unchanged", async () => {
      const c = await newLease();
      const keys = [ata(X.publicKey), ata(T.publicKey)];
      const before = await snapshot(keys);
      await expectFail(send([await payIx(c, 0, U64_MAX, { landlordToken: ata(X.publicKey) })], [T]), [
        "ConstraintTokenOwner",
        "ConstraintAssociated",
      ]);
      await expectFail(send([await payIx(c, 0, U64_MAX, { landlordToken: ata(T.publicKey) })], [T]), [
        "ConstraintTokenOwner",
        "ConstraintAssociated",
        "ConstraintDuplicateMutableAccount",
      ]);
      assert.deepEqual(await snapshot(keys), before);
    });

    it("P-10 lease A with lease B's PaymentRecord PDA or lease B's landlord ATA -> rejected", async () => {
      const a = await newLease();
      const b = await newLease({ landlord: L2 });
      await expectFail(send([await payIx(a, 0, U64_MAX, { paymentRecord: recordPda(b.lease, 0) })], [T]), [
        "ConstraintSeeds",
      ]);
      await expectFail(send([await payIx(a, 0, U64_MAX, { landlordToken: ata(L2.publicKey) })], [T]), [
        "ConstraintTokenOwner",
        "ConstraintAssociated",
      ]);
    });

    it("P-11 a payer other than the tenant pays the record rent; record.tenant is the lease tenant", async () => {
      const c = await newLease();
      await send([await payIx(c, 0, U64_MAX, {}, walletKp.publicKey)], [T]);
      const r = await fetchRecord(c.lease, 0);
      assert.ok(r.tenant.equals(T.publicKey));
      assert.ok(!r.tenant.equals(walletKp.publicKey));
      assert.ok(r.lease.equals(c.lease));
    });

    it("P-13 landlord moves its ATA's owner before the due date; the tenant still pays on time into a fresh landlord account", async () => {
      const L6 = await newParty();
      const c = await newLease({ landlord: L6, due: (await clockNow()) + 3600 });
      await moveAtaOwner(L6);
      // The moved ATA no longer belongs to the landlord, so it is rejected ...
      await expectFail(pay(c, 0), ["ConstraintTokenOwner"]);
      // ... but any other token account the landlord owns is accepted, so the landlord cannot force a late payment.
      const fresh = await freshTokenAccount(L6.publicKey);
      await send([await payIx(c, 0, U64_MAX, { landlordToken: fresh })], [T]);
      const r = await fetchRecord(c.lease, 0);
      assert.equal(r.onTime, true, "paid on time");
      assert.equal(r.amountPaid.toNumber(), 316_666_666);
      assert.equal(await tokenBalance(fresh), BigInt(316_666_666));
      assert.equal((await fetchLease(c.lease)).onTimeStreak, 1);
    });
  });

  // ------------------------------------------------------------------ R: release (2-of-3 votes)
  describe("R release by 2-of-3 votes", () => {
    it("R-01 vote while Created -> LeaseNotActive", async () => {
      const c = await newLease({ deposit: false });
      await expectFail(vote(c, T, terms(DEPOSIT, 0)), ["LeaseNotActive"]);
    });

    it("R-02 split sum = deposit - 1 and deposit + 1 -> SplitMismatch", async () => {
      const c = await newLease();
      await expectFail(vote(c, L, terms(DEPOSIT - 1, 0)), ["SplitMismatch"]);
      await expectFail(vote(c, L, terms(DEPOSIT, 1)), ["SplitMismatch"]);
    });

    it("R-03 to_tenant = u64::MAX, to_landlord = deposit + 1 (wraps to the deposit) -> MathOverflow", async () => {
      const c = await newLease();
      await expectFail(vote(c, L, terms(U64_MAX, new BN(DEPOSIT + 1))), ["MathOverflow"]);
      assert.equal(await tokenBalance(c.vault), BigInt(DEPOSIT));
    });

    it("R-04 one signer only: funds stay in the vault, lease stays Active", async () => {
      const c = await newLease();
      await vote(c, T, terms(DEPOSIT, 0));
      assert.equal(await tokenBalance(c.vault), BigInt(DEPOSIT));
      const l = await fetchLease(c.lease);
      assert.equal(statusOf(l), "active");
      assert.equal(l.depositHeld, true);
    });

    it("R-05 a voter voting twice the same terms does not pay out", async () => {
      const c = await newLease();
      await vote(c, L, terms(0, DEPOSIT));
      await vote(c, L, terms(0, DEPOSIT));
      assert.equal(await tokenBalance(c.vault), BigInt(DEPOSIT));
      assert.equal(statusOf(await fetchLease(c.lease)), "active");
    });

    it("R-06 foreign signer -> NotAParty", async () => {
      const c = await newLease();
      await expectFail(vote(c, X, terms(0, DEPOSIT)), ["NotAParty"]);
    });

    it("R-07 IDL: vote_release takes no role argument (role comes from the signer)", () => {
      const ix = (idl.instructions as Array<{ name: string; args: Array<{ name: string }> }>).find(
        (i) => i.name === "vote_release",
      );
      assert.ok(ix);
      assert.deepEqual(
        ix.args.map((a) => a.name),
        ["to_tenant", "to_landlord", "reason_hash", "exit_report_hash"],
      );
    });

    async function checkReleased(c: Ctx, t: Terms, tenantBefore: bigint, landlordBefore: bigint, sig: string): Promise<void> {
      assert.equal(await connection.getAccountInfo(c.vault, "confirmed"), null, "vault closed");
      assert.equal((await tokenBalance(ata(c.tenant.publicKey))) - tenantBefore, BigInt(t.toTenant.toString()));
      assert.equal((await tokenBalance(ata(c.landlord.publicKey))) - landlordBefore, BigInt(t.toLandlord.toString()));
      const l = await fetchLease(c.lease);
      assert.equal(statusOf(l), "closed");
      assert.equal(l.depositHeld, false);
      assert.deepEqual(l.exitReportHash, t.exitReportHash);
      const ev = (await eventsOf(sig)).find((e) => e.name.toLowerCase() === "depositreleased");
      assert.ok(ev, "DepositReleased emitted");
    }

    for (const [label, first, second] of [
      ["T+L", "T", "L"],
      ["L+A", "L", "A"],
      ["T+A", "T", "A"],
    ] as const) {
      it(`R-08 2-of-3 happy path ${label} (async, separate txs)`, async () => {
        const c = await newLease();
        const who = { T: c.tenant, L: c.landlord, A: c.agency };
        const t = terms(600_000_000, 400_000_000, label);
        const tb = await tokenBalance(ata(c.tenant.publicKey));
        const lb = await tokenBalance(ata(c.landlord.publicKey));
        await vote(c, who[first], t);
        assert.equal(await tokenBalance(c.vault), BigInt(DEPOSIT), "no payout after one vote");
        const sig = await vote(c, who[second], t);
        await checkReleased(c, t, tb, lb, sig);
      });
    }

    it("R-08 atomic: L and A vote in one tx", async () => {
      const c = await newLease();
      const t = terms(250_000_000, 750_000_000, "atomic");
      const tb = await tokenBalance(ata(T.publicKey));
      const lb = await tokenBalance(ata(L.publicKey));
      const sig = await send([await voteIx(c, L.publicKey, t), await voteIx(c, A.publicKey, t)], [L, A]);
      await checkReleased(c, t, tb, lb, sig);
    });

    it("R-09 3-of-3: the third vote after the payout fails; no second payout", async () => {
      const c = await newLease();
      const t = terms(DEPOSIT, 0, "r09");
      await vote(c, T, t);
      await vote(c, L, t);
      const tb = await tokenBalance(ata(T.publicKey));
      await expectFail(vote(c, A, t), ["LeaseNotActive", "AccountNotInitialized"]);
      assert.equal(await tokenBalance(ata(T.publicKey)), tb);
    });

    it("R-10 changed vote: an old vote no longer matches; the new majority pays", async () => {
      const c = await newLease();
      const t1 = terms(500_000_000, 500_000_000, "t1");
      const t2 = terms(0, DEPOSIT, "t2");
      await vote(c, L, t1);
      await vote(c, L, t2); // L changes its mind
      await vote(c, A, t1); // A agrees with L's old terms: no payout
      assert.equal(await tokenBalance(c.vault), BigInt(DEPOSIT));
      const tb = await tokenBalance(ata(T.publicKey));
      const lb = await tokenBalance(ata(L.publicKey));
      const sig = await vote(c, T, t1); // T + A on t1
      await checkReleased(c, t1, tb, lb, sig);
    });

    it("R-11 griefing: T re-votes in a loop, L and A still release", async () => {
      const c = await newLease();
      const fair = terms(800_000_000, 200_000_000, "fair");
      await vote(c, L, fair);
      for (let i = 0; i < 3; i++) await vote(c, T, terms(DEPOSIT, 0, `grief-${i}`));
      const tb = await tokenBalance(ata(T.publicKey));
      const lb = await tokenBalance(ata(L.publicKey));
      const sig = await vote(c, A, fair);
      await checkReleased(c, fair, tb, lb, sig);
    });

    it("R-12 same split, different exit_report_hash or reason_hash -> no payout", async () => {
      const c = await newLease();
      const base = terms(DEPOSIT, 0, "r12");
      await vote(c, T, base);
      await vote(c, L, { ...base, exitReportHash: sha("another exit report") });
      await vote(c, A, { ...base, reasonHash: sha("another reason") });
      assert.equal(await tokenBalance(c.vault), BigInt(DEPOSIT));
      assert.equal(statusOf(await fetchLease(c.lease)), "active");
    });

    it("R-13 tenant_token = X's ATA in the payout -> rejected; X unchanged", async () => {
      const c = await newLease();
      const t = terms(DEPOSIT, 0, "r13");
      await vote(c, T, t);
      const before = await snapshot([ata(X.publicKey)]);
      const ix = await voteIx(c, L.publicKey, t, { tenantToken: ata(X.publicKey) });
      await expectFail(send([ix], [L]), ["ConstraintTokenOwner", "ConstraintAssociated"]);
      assert.deepEqual(await snapshot([ata(X.publicKey)]), before);
    });

    it("R-14 the vault passed as tenant_token or landlord_token -> rejected", async () => {
      const c = await newLease();
      const t = terms(DEPOSIT, 0, "r14");
      await vote(c, T, t);
      const overs: Record<string, PublicKey>[] = [{ tenantToken: c.vault }, { landlordToken: c.vault }];
      for (const over of overs) {
        await expectFail(send([await voteIx(c, L.publicKey, t, over)], [L]), [
          "ConstraintTokenOwner",
          "ConstraintAssociated",
          "ConstraintDuplicateMutableAccount",
        ]);
      }
      assert.equal(await tokenBalance(c.vault), BigInt(DEPOSIT));
    });

    it("R-15 dust donation: X sends 1 unit to the vault; release still succeeds and sweeps it to the landlord", async () => {
      const c = await newLease();
      await transferChecked(connection, walletKp, ata(X.publicKey), MINT, c.vault, X, BigInt(1), DECIMALS);
      assert.equal(await tokenBalance(c.vault), BigInt(DEPOSIT + 1));
      const t = terms(700_000_000, 300_000_000, "r15");
      const tb = await tokenBalance(ata(T.publicKey));
      const lb = await tokenBalance(ata(L.publicKey));
      await vote(c, T, t);
      const sig = await vote(c, L, t);
      assert.equal(await connection.getAccountInfo(c.vault, "confirmed"), null, "vault closed");
      assert.equal((await tokenBalance(ata(T.publicKey))) - tb, BigInt(700_000_000));
      assert.equal((await tokenBalance(ata(L.publicKey))) - lb, BigInt(300_000_001), "split + swept excess");
      const ev = (await eventsOf(sig)).find((e) => e.name.toLowerCase() === "depositreleased");
      assert.equal((ev?.data.excessToLandlord as BN).toNumber(), 1);
    });

    it("R-16 vault rent destination = an approver instead of the landlord -> ConstraintHasOne", async () => {
      const c = await newLease();
      const t = terms(DEPOSIT, 0, "r16");
      await vote(c, T, t);
      const before = await snapshot([A.publicKey, T.publicKey]);
      await expectFail(send([await voteIx(c, A.publicKey, t, { landlord: A.publicKey })], [A]), [
        "ConstraintHasOne",
      ]);
      await expectFail(send([await voteIx(c, A.publicKey, t, { landlord: T.publicKey })], [A]), [
        "ConstraintHasOne",
      ]);
      assert.deepEqual(await snapshot([A.publicKey, T.publicKey]), before);
    });

    it("R-17 landlord closed its ATA before the release; the tx recreates it idempotently", async () => {
      const L3 = await newParty();
      const c = await newLease({ landlord: L3 });
      const t = terms(100_000_000, 900_000_000, "r17");
      await vote(c, T, t);
      // The landlord closes its (empty) ATA to block the payout.
      await closeAccount(connection, walletKp, ata(L3.publicKey), L3.publicKey, L3);
      assert.equal(await connection.getAccountInfo(ata(L3.publicKey), "confirmed"), null);
      // Without the idempotent create every vote needs both ATAs, so it fails ...
      await expectFail(vote(c, A, t), ["AccountNotInitialized"]);
      // ... and with it (prepended by the client, paid by the fee payer) the payout goes through.
      const recreate = createAssociatedTokenAccountIdempotentInstruction(
        walletKp.publicKey,
        ata(L3.publicKey),
        L3.publicKey,
        MINT,
      );
      await send([recreate, await voteIx(c, A.publicKey, t)], [A]);
      assert.equal(await tokenBalance(ata(L3.publicKey)), BigInt(900_000_000));
      assert.equal(statusOf(await fetchLease(c.lease)), "closed");
    });

    it("R-18 lease A released with lease B's vault -> ConstraintSeeds", async () => {
      const a = await newLease();
      const b = await newLease({ landlord: L2 });
      const t = terms(DEPOSIT, 0, "r18");
      await vote(a, T, t);
      await expectFail(send([await voteIx(a, L.publicKey, t, { vault: b.vault })], [L]), ["ConstraintSeeds"]);
      assert.equal(await tokenBalance(b.vault), BigInt(DEPOSIT));
    });

    it("R-19 to_tenant = 0 and to_landlord = 0 both succeed (zero transfer skipped)", async () => {
      for (const [tt, tl] of [
        [0, DEPOSIT],
        [DEPOSIT, 0],
      ]) {
        const c = await newLease();
        const t = terms(tt, tl, `r19-${tt}`);
        const tb = await tokenBalance(ata(T.publicKey));
        const lb = await tokenBalance(ata(L.publicKey));
        await vote(c, L, t);
        const sig = await vote(c, A, t);
        await checkReleased(c, t, tb, lb, sig);
      }
    });

    it("R-20 landlord + agency can release at month 0 without the tenant (documented, intended)", async () => {
      const c = await newLease();
      const t = terms(0, DEPOSIT, "r20");
      await vote(c, L, t);
      await vote(c, A, t);
      const l = await fetchLease(c.lease);
      assert.equal(l.monthsPaid, 0);
      assert.equal(statusOf(l), "closed");
    });
    it("R-21 a party moves its ATA's owner away; the other two still release into a fresh account it owns", async () => {
      // Tenant side, at the end of the term (the tenant holds the deposit hostage).
      const T2 = await newParty(DEPOSIT + RENT);
      const c = await newLease({ tenant: T2, params: { termMonths: 1 } });
      await pay(c, 0);
      await moveAtaOwner(T2);
      const t = terms(700_000_000, 300_000_000, "r21-tenant");
      await expectFail(vote(c, L, t), ["ConstraintTokenOwner"]);
      const freshT = await freshTokenAccount(T2.publicKey);
      const lb = await tokenBalance(ata(L.publicKey));
      await send([await voteIx(c, L.publicKey, t, { tenantToken: freshT })], [L]);
      await send([await voteIx(c, A.publicKey, t, { tenantToken: freshT })], [A]);
      assert.equal(await connection.getAccountInfo(c.vault, "confirmed"), null, "vault closed");
      assert.equal(await tokenBalance(freshT), BigInt(700_000_000));
      assert.equal((await tokenBalance(ata(L.publicKey))) - lb, BigInt(300_000_000));
      assert.equal(statusOf(await fetchLease(c.lease)), "closed");

      // Landlord side (mirror): the landlord cannot block a tenant + agency release.
      const L4 = await newParty();
      const d = await newLease({ landlord: L4 });
      await moveAtaOwner(L4);
      const u = terms(900_000_000, 100_000_000, "r21-landlord");
      await expectFail(vote(d, T, u), ["ConstraintTokenOwner"]);
      const freshL = await freshTokenAccount(L4.publicKey);
      const tb = await tokenBalance(ata(T.publicKey));
      await send([await voteIx(d, T.publicKey, u, { landlordToken: freshL })], [T]);
      await send([await voteIx(d, A.publicKey, u, { landlordToken: freshL })], [A]);
      assert.equal(await connection.getAccountInfo(d.vault, "confirmed"), null, "vault closed");
      assert.equal((await tokenBalance(ata(T.publicKey))) - tb, BigInt(900_000_000));
      assert.equal(await tokenBalance(freshL), BigInt(100_000_000));
      assert.equal(statusOf(await fetchLease(d.lease)), "closed");
    });

    it("R-22 landlord wallet reassigned to another program; the release still succeeds and the vault rent reaches it", async () => {
      const L5 = await newParty();
      const c = await newLease({ landlord: L5 });
      const vaultLamports = (await connection.getAccountInfo(c.vault, "confirmed"))?.lamports ?? 0;
      assert.ok(vaultLamports > 0);
      const foreignOwner = Keypair.generate().publicKey;
      await send([SystemProgram.assign({ accountPubkey: L5.publicKey, programId: foreignOwner })], [L5]);
      assert.ok((await connection.getAccountInfo(L5.publicKey, "confirmed"))?.owner.equals(foreignOwner), "reassigned");
      const before = await connection.getBalance(L5.publicKey, "confirmed");
      const t = terms(DEPOSIT, 0, "r22");
      await vote(c, T, t);
      await vote(c, A, t);
      assert.equal(await connection.getAccountInfo(c.vault, "confirmed"), null, "vault closed");
      assert.equal((await connection.getBalance(L5.publicKey, "confirmed")) - before, vaultLamports, "vault rent to L5");
      assert.equal(statusOf(await fetchLease(c.lease)), "closed");
    });
  });

  // ------------------------------------------------------------------ X: substitution and lifecycle
  describe("X program-level substitution and lifecycle", () => {
    it("X-01 fake token_program in deposit, pay and release -> InvalidProgramId", async () => {
      const fake = MEMO_PROGRAM_ID;
      const c0 = await newLease({ deposit: false });
      await expectFail(send([await depositIx(c0, { tokenProgram: fake })], [T]), ["InvalidProgramId"]);
      const c = await newLease();
      await expectFail(send([await payIx(c, 0, U64_MAX, { tokenProgram: fake })], [T]), ["InvalidProgramId"]);
      await expectFail(send([await voteIx(c, T.publicKey, terms(DEPOSIT, 0), { tokenProgram: fake })], [T]), [
        "InvalidProgramId",
      ]);
    });

    it("X-02 fake system_program in create -> InvalidProgramId", async () => {
      const p = defaultParams(T.publicKey, (await clockNow()) + 3600);
      const ix = await createIx(p, L.publicKey, A.publicKey, { systemProgram: MEMO_PROGRAM_ID });
      await expectFail(send([ix], [L, A]), ["InvalidProgramId"]);
    });

    it("X-03 a PaymentRecord or a token account passed as Lease -> discriminator / owner error", async () => {
      const c = await newLease();
      await pay(c, 0);
      const fakeLease: Ctx = { ...c, lease: recordPda(c.lease, 0) };
      await expectFail(send([await payIx(fakeLease, 1)], [T]), [
        "AccountDiscriminatorMismatch",
        "ConstraintSeeds",
      ]);
      const tokenAsLease: Ctx = { ...c, lease: ata(T.publicKey) };
      await expectFail(send([await payIx(tokenAsLease, 1)], [T]), ["AccountOwnedByWrongProgram"]);
    });

    it("X-04 static: no UncheckedAccount / AccountInfo fields, no init_if_needed, overflow-checks on", () => {
      const src = readFileSync("programs/rental_escrow/src/lib.rs", "utf8");
      assert.ok(!/UncheckedAccount/.test(src), "no UncheckedAccount");
      assert.ok(!/:\s*AccountInfo<'info>/.test(src), "no raw AccountInfo fields");
      assert.ok(!/init_if_needed/.test(src), "no init_if_needed");
      const cargo = readFileSync("Cargo.toml", "utf8");
      assert.ok(/\[profile\.release\][^[]*overflow-checks\s*=\s*true/.test(cargo), "overflow-checks = true");
    });

    it("X-05 after Closed: vault gone with its rent to L; Lease and records kept; instructions fail", async () => {
      const c = await newLease();
      await pay(c, 0);
      const vaultLamports = (await connection.getAccountInfo(c.vault, "confirmed"))?.lamports ?? 0;
      const lSol = await connection.getBalance(L.publicKey, "confirmed");
      const t = terms(DEPOSIT, 0, "x05");
      await vote(c, T, t);
      await vote(c, A, t);
      assert.equal(await connection.getAccountInfo(c.vault, "confirmed"), null);
      assert.equal((await connection.getBalance(L.publicKey, "confirmed")) - lSol, vaultLamports, "vault rent to L");
      assert.ok(await connection.getAccountInfo(c.lease, "confirmed"), "Lease kept");
      assert.ok(await connection.getAccountInfo(recordPda(c.lease, 0), "confirmed"), "PaymentRecord kept");
      await expectFail(pay(c, 1), ["LeaseNotActive"]);
      await expectFail(send([await depositIx(c)], [T]), ["LeaseNotCreated", "AccountNotInitialized"]);
      await expectFail(send([await cancelIx(c)], [L]), ["LeaseNotCreated", "AccountNotInitialized"]);
    });

    it("X-06 cancel_lease: vault closed, Lease kept as Cancelled, re-create with the same seeds fails", async () => {
      const c = await newLease({ deposit: false });
      // A donated unit must not block the cancel.
      await transferChecked(connection, walletKp, ata(X.publicKey), MINT, c.vault, X, BigInt(1), DECIMALS);
      const lb = await tokenBalance(ata(L.publicKey));
      await expectFail(send([await cancelIx(c, { landlord: T.publicKey })], [T]), ["ConstraintHasOne"]);
      await send([await cancelIx(c)], [L]);
      assert.equal(await connection.getAccountInfo(c.vault, "confirmed"), null);
      assert.equal((await tokenBalance(ata(L.publicKey))) - lb, BigInt(1));
      assert.equal(statusOf(await fetchLease(c.lease)), "cancelled");
      await expectFail(
        send([await createIx(c.params, L.publicKey, A.publicKey)], [L, A]),
        ["already in use"],
      );
      const active = await newLease();
      await expectFail(send([await cancelIx(active)], [L]), ["LeaseNotCreated"]);
    });
  });

  // ------------------------------------------------------------------ H: privacy
  describe("H privacy (AD-12)", () => {
    function typeNames(t: unknown, out: string[] = []): string[] {
      if (typeof t === "string") out.push(t);
      else if (t && typeof t === "object") for (const v of Object.values(t)) typeNames(v, out);
      return out;
    }

    it("H-01 IDL: no string or bytes field in any account, event or type", () => {
      const all = typeNames(idl.types);
      assert.ok(!all.includes("string"), "no string");
      assert.ok(!all.includes("bytes"), "no bytes");
    });

    it("H-02 every event emitted in this run holds only pubkeys, integers, booleans and fixed byte arrays", () => {
      assert.ok(allEvents.length > 20, `events decoded: ${allEvents.length}`);
      for (const ev of allEvents) {
        for (const [k, v] of Object.entries(ev.data)) {
          const ok =
            v instanceof PublicKey ||
            BN.isBN(v) ||
            typeof v === "number" ||
            typeof v === "boolean" ||
            (Array.isArray(v) && (v.length === 32 || v.length === 8) && v.every((x) => Number.isInteger(x)));
          assert.ok(ok, `${ev.name}.${k} has an unexpected type`);
        }
      }
    });

    it("H-03 every memo sent in this run matches the lease:v1 format", () => {
      assert.ok(memosSent.length > 0);
      for (const m of memosSent) {
        assert.match(m, /^lease:v1:ls_[0-9a-f]{16}:(deposit|rent:\d+):[0-9a-f]{64}$/);
      }
    });
  });

  after(() => {
    console.log(`events decoded: ${allEvents.length}`);
    console.log(`max compute units per instruction: ${JSON.stringify(maxCu)}`);
  });
});
