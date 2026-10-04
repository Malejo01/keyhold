import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { type Connection, Keypair, type PublicKey, Transaction, type VersionedTransactionResponse } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import type { PaymentIntent } from "../contracts";
import { buildMemo } from "./pay";
import {
  ForbiddenPayerError,
  QUOTE_LOOKAHEAD_SECONDS,
  assertFeePayerAuthorizesNothing,
  buildSolanaPayTransaction,
  findValidPayment,
  findValidPayments,
  quoteForBuild,
  quoteForIntent,
  serializeForWallet,
  toPaymentResult,
  transferAmountIfValid,
} from "./solana-pay";
import { InvalidTicketError, decodeTicket, encodeTicket, mintTicket, slotReference } from "./solana-pay-ticket";
import { nextPaymentSlot } from "./payment-slot";
import { memoInstruction } from "./transfer";

const HASH = "a".repeat(64);
const DUE = 1_800_000_000;
const feePayer = Keypair.generate();
const payer = Keypair.generate().publicKey;
const landlord = Keypair.generate().publicKey;
const agency = Keypair.generate().publicKey;
const custody = feePayer.publicKey;
/** What the server holds: platform (= custody = fee payer), landlord, agency. */
const serverKeys = [feePayer.publicKey, landlord, agency];
const mint = Keypair.generate().publicKey;
const reference = Keypair.generate().publicKey;
const BLOCKHASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

const rent: PaymentIntent = {
  leaseId: "ls_0123456789abcdef",
  kind: "rent",
  monthIndex: 0,
  payer: "ana",
  listAmountBaseUnits: "1000000000",
  contractHash: HASH,
  dueTs: DUE,
  discountUsdcBps: 500,
  discountOntimeBps: 300,
};
const deposit: PaymentIntent = { ...rent, kind: "deposit", monthIndex: undefined };

beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(40);
});

function build(intent: PaymentIntent, amount: bigint, ref: PublicKey = reference) {
  return buildSolanaPayTransaction({
    intent,
    payer,
    reference: ref,
    destinationOwner: intent.kind === "deposit" ? custody : landlord,
    mint,
    amountBaseUnits: amount,
    feePayer,
    blockhash: BLOCKHASH,
    serverKeys,
  });
}

/** What getTransaction would return for `tx` once confirmed, with the destination balance going 0 -> `received`. */
function confirmed(tx: Transaction, destinationOwner: PublicKey, received: bigint, blockTime = DUE - 100): VersionedTransactionResponse {
  const message = tx.compileMessage();
  const ata = getAssociatedTokenAddressSync(mint, destinationOwner);
  const accountIndex = message.accountKeys.findIndex((k) => k.equals(ata));
  return {
    slot: 1,
    blockTime,
    version: "legacy",
    transaction: { message, signatures: [] },
    meta: {
      err: null,
      fee: 5000,
      preBalances: [],
      postBalances: [],
      preTokenBalances: [],
      postTokenBalances: [
        { accountIndex, mint: mint.toBase58(), uiTokenAmount: { amount: received.toString(), decimals: 6, uiAmount: null } },
      ],
      loadedAddresses: { writable: [], readonly: [] },
    },
  } as unknown as VersionedTransactionResponse;
}

/** A payment the tenant built and signed on their own: tenant is fee payer and token authority, no server signature. */
function selfBuilt(authority: Keypair, sourceOwner: PublicKey, amount: bigint, feePayerKey: PublicKey = authority.publicKey) {
  const tx = new Transaction({ feePayer: feePayerKey, recentBlockhash: BLOCKHASH });
  const transfer = createTransferCheckedInstruction(
    getAssociatedTokenAddressSync(mint, sourceOwner),
    mint,
    getAssociatedTokenAddressSync(mint, landlord),
    authority.publicKey,
    amount,
    6,
  );
  transfer.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
  tx.add(memoInstruction(buildMemo(rent)), transfer);
  return tx;
}

function connectionWith(entries: { signature: string; err?: object | null; blockTime?: number; response: VersionedTransactionResponse | null }[]) {
  return {
    getSignaturesForAddress: async () =>
      // Real RPC returns newest first.
      [...entries].reverse().map((e) => ({ signature: e.signature, err: e.err ?? null, blockTime: e.blockTime ?? null, slot: 1, memo: null })),
    getTransaction: async (sig: string) => entries.find((e) => e.signature === sig)?.response ?? null,
  } as unknown as Connection;
}

describe("ticket", () => {
  const now = 1_700_000_000;

  it("round-trips the intent and binds the session and reference", () => {
    const { ticket, reference: ref, expiresAt } = mintTicket({ sessionId: "sess-1", intent: rent, nowSec: now });
    const payload = decodeTicket(ticket, now + 1);
    expect(payload.sessionId).toBe("sess-1");
    expect(payload.reference).toBe(ref);
    expect(payload.expiresAt).toBe(expiresAt);
    expect(payload.intent).toEqual(rent);
    expect(decodeTicket(mintTicket({ sessionId: "s", intent: deposit, nowSec: now }).ticket, now).intent).toEqual({
      ...deposit,
    });
  });

  it("issues ONE reference per payment slot, shared by every ticket and by the custodial button (B5 N1)", () => {
    const a = mintTicket({ sessionId: "s", intent: rent, nowSec: now });
    const b = mintTicket({ sessionId: "s", intent: rent, nowSec: now + 30 });
    expect(a.reference).toBe(b.reference);
    expect(a.ticket).not.toBe(b.ticket);
    expect(a.reference).toBe(slotReference("s", rent).toBase58());
    // Another session, month, kind or lease never collides.
    const others = [
      slotReference("other", rent),
      slotReference("s", { ...rent, monthIndex: 1 }),
      slotReference("s", deposit),
      slotReference("s", { ...rent, leaseId: "ls_other" }),
    ].map((k) => k.toBase58());
    expect(new Set([a.reference, ...others]).size).toBe(5);
  });

  it("derives the reference from the server secret, so it cannot be precomputed with another secret", () => {
    const before = slotReference("s", rent).toBase58();
    process.env.SESSION_SECRET = "y".repeat(40);
    expect(slotReference("s", rent).toBase58()).not.toBe(before);
    process.env.SESSION_SECRET = "x".repeat(40);
  });

  it("rejects a tampered body, a tampered signature and a ticket signed with another secret", () => {
    const { ticket } = mintTicket({ sessionId: "s", intent: rent, nowSec: now });
    const [body, sig] = ticket.split(".");
    // Same wire layout with a cheaper amount, original signature: must fail.
    const wire = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown[];
    wire[8] = "1";
    const forged = Buffer.from(JSON.stringify(wire)).toString("base64url");
    expect(() => decodeTicket(`${forged}.${sig}`, now)).toThrow(InvalidTicketError);
    expect(() => decodeTicket(`${body}.${sig.slice(0, -2)}AA`, now)).toThrow(InvalidTicketError);
    process.env.SESSION_SECRET = "y".repeat(40);
    expect(() => decodeTicket(ticket, now)).toThrow(InvalidTicketError);
    process.env.SESSION_SECRET = "x".repeat(40);
    expect(() => decodeTicket("garbage", now)).toThrow(InvalidTicketError);
  });

  it("expires by server time", () => {
    const { ticket, expiresAt } = mintTicket({ sessionId: "s", intent: rent, nowSec: now });
    expect(() => decodeTicket(ticket, expiresAt)).toThrow(/expired/);
    try {
      decodeTicket(ticket, expiresAt + 1);
    } catch (e) {
      expect((e as InvalidTicketError).expired).toBe(true);
    }
  });

  it("is not a valid ticket if the contract hash is not 64 hex chars", () => {
    expect(() =>
      encodeTicket({ sessionId: "s", reference: reference.toBase58(), expiresAt: now + 10, intent: { ...rent, contractHash: "zz" } }),
    ).toThrow();
  });
});

describe("quoteForIntent", () => {
  it("deposit is the full list amount with no discount", () => {
    expect(quoteForIntent(deposit, DUE + 10 ** 6)).toEqual({ amountBaseUnits: BigInt(1_000_000_000), discountBps: 0 });
  });
  it("rent applies usdc + on-time before the due date and only usdc after", () => {
    expect(quoteForIntent(rent, DUE)).toEqual({ amountBaseUnits: BigInt(920_000_000), discountBps: 800 });
    expect(quoteForIntent(rent, DUE + 1)).toEqual({ amountBaseUnits: BigInt(950_000_000), discountBps: 500 });
  });
});

describe("quoteForBuild", () => {
  it("quotes the price at the latest possible landing time, so an in-flight tx is never underpaid", () => {
    expect(quoteForBuild(rent, DUE - QUOTE_LOOKAHEAD_SECONDS - 1).amountBaseUnits).toBe(BigInt(920_000_000));
    expect(quoteForBuild(rent, DUE - QUOTE_LOOKAHEAD_SECONDS).amountBaseUnits).toBe(BigInt(920_000_000));
    expect(quoteForBuild(rent, DUE - QUOTE_LOOKAHEAD_SECONDS + 1).amountBaseUnits).toBe(BigInt(950_000_000));
    expect(quoteForBuild(rent, DUE + 10).amountBaseUnits).toBe(BigInt(950_000_000));
    expect(quoteForBuild(deposit, DUE - 10_000).amountBaseUnits).toBe(BigInt(1_000_000_000));
  });
});

describe("buildSolanaPayTransaction", () => {
  const amount = BigInt(920_000_000);
  const tx = build(rent, amount);

  it("orders instructions: create ATA, memo, transferChecked, and carries the reference read-only", () => {
    const [create, memo, transfer] = tx.instructions;
    expect(create.programId.toBase58()).toBe(
      createAssociatedTokenAccountIdempotentInstruction(feePayer.publicKey, landlord, landlord, mint).programId.toBase58(),
    );
    expect(memo.programId.toBase58()).toBe(memoInstruction("x").programId.toBase58());
    expect(memo.keys).toHaveLength(0);
    expect(memo.data.toString("utf8")).toBe(buildMemo(rent));
    expect(tx.instructions).toHaveLength(3);
    const last = transfer.keys[transfer.keys.length - 1];
    expect(last.pubkey.equals(reference)).toBe(true);
    expect(last.isSigner).toBe(false);
    expect(last.isWritable).toBe(false);
    expect(transfer.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())).toEqual([payer.toBase58()]);
    expect(transfer.data.readBigUInt64LE(1)).toBe(amount);
  });

  it("is signed by the fee payer only; the payer signature slot is empty", () => {
    expect(tx.feePayer?.equals(feePayer.publicKey)).toBe(true);
    const sigs = tx.signatures;
    expect(sigs.find((s) => s.publicKey.equals(feePayer.publicKey))?.signature).not.toBeNull();
    expect(sigs.find((s) => s.publicKey.equals(payer))?.signature).toBeNull();
    const roundTrip = Transaction.from(Buffer.from(serializeForWallet(tx), "base64"));
    expect(roundTrip.signatures).toHaveLength(2);
  });

  it("refuses a zero amount", () => {
    expect(() => build(rent, BigInt(0))).toThrow();
  });

  it("B5-1: refuses as payer the platform/fee payer/custody, the landlord or the agency", () => {
    const attempt = (intent: PaymentIntent, who: PublicKey) =>
      buildSolanaPayTransaction({
        intent,
        payer: who,
        reference,
        destinationOwner: intent.kind === "deposit" ? custody : landlord,
        mint,
        amountBaseUnits: amount,
        feePayer,
        blockhash: BLOCKHASH,
        serverKeys,
      });
    for (const who of [feePayer.publicKey, landlord, agency]) {
      expect(() => attempt(rent, who)).toThrow(ForbiddenPayerError);
      expect(() => attempt(deposit, who)).toThrow(ForbiddenPayerError);
    }
    expect(() => attempt(rent, Keypair.generate().publicKey)).not.toThrow();
  });

  it("B5-1: the transfer authority is the payer, the source is the payer's own token account, never custody", () => {
    const transfer = tx.instructions[2];
    expect(transfer.keys[0].pubkey.equals(getAssociatedTokenAddressSync(mint, payer))).toBe(true);
    expect(transfer.keys[3].pubkey.equals(payer)).toBe(true);
    expect(transfer.keys[3].isSigner).toBe(true);
    // The server (fee payer) signature alone leaves the tx incomplete: the payer's slot is empty.
    expect(tx.signatures.filter((s) => s.signature !== null).map((s) => s.publicKey.toBase58())).toEqual([feePayer.publicKey.toBase58()]);
    expect(tx.verifySignatures(true)).toBe(false);
  });

  it("B5-1: the fee payer appears only as the ATA-creation funder, so its signature can never authorise a token movement", () => {
    expect(() => assertFeePayerAuthorizesNothing(tx, feePayer.publicKey)).not.toThrow();
    // A tx in which the fee payer is a token authority must never be signed.
    const bad = selfBuilt(feePayer, custody, amount);
    expect(() => assertFeePayerAuthorizesNothing(bad, feePayer.publicKey)).toThrow(/Refusing to sign/);
  });
});

describe("transferAmountIfValid", () => {
  const amount = BigInt(920_000_000);
  const params = { intent: rent, reference, destinationOwner: landlord, mint, serverKeys };

  it("accepts a well-formed payment and returns the instruction amount", () => {
    expect(transferAmountIfValid(confirmed(build(rent, amount), landlord, amount), params)).toBe(amount);
  });

  it("still accepts a tx where a wallet appended an extra instruction", () => {
    const tx = build(rent, amount);
    tx.add(memoInstruction("wallet guard"));
    expect(transferAmountIfValid(confirmed(tx, landlord, amount), params)).toBe(amount);
  });

  it("rejects another reference, memo, destination, mint, or a failed tx", () => {
    const tx = build(rent, amount);
    const ok = confirmed(tx, landlord, amount);
    expect(transferAmountIfValid(ok, { ...params, reference: Keypair.generate().publicKey })).toBeNull();
    expect(transferAmountIfValid(ok, { ...params, intent: { ...rent, monthIndex: 1 } })).toBeNull();
    expect(transferAmountIfValid(ok, { ...params, destinationOwner: Keypair.generate().publicKey })).toBeNull();
    expect(transferAmountIfValid(ok, { ...params, mint: Keypair.generate().publicKey })).toBeNull();
    const failed = { ...ok, meta: { ...ok.meta!, err: { InstructionError: [0, "Custom"] } } } as VersionedTransactionResponse;
    expect(transferAmountIfValid(failed, params)).toBeNull();
  });

  it("rejects a payment with the right reference but no memo", () => {
    const tx = build(rent, amount);
    tx.instructions.splice(1, 1);
    expect(transferAmountIfValid(confirmed(tx, landlord, amount), params)).toBeNull();
  });
});

describe("B5-1 confirmation scan: server-held authorities are never a tenant payment", () => {
  const amount = BigInt(920_000_000);
  const params = { intent: rent, reference, destinationOwner: landlord, mint, serverKeys };

  it("rejects custody -> landlord authorised by the platform key (the original attack)", () => {
    // qa's probe: custody ATA -> landlord ATA, authority = platform = fee payer, with the reference and the memo.
    const tx = selfBuilt(feePayer, custody, amount);
    expect(transferAmountIfValid(confirmed(tx, landlord, amount), params)).toBeNull();
  });

  it("rejects any server-held authority: landlord, agency, platform", () => {
    const landlordKp = Keypair.generate();
    const agencyKp = Keypair.generate();
    const keys = [feePayer.publicKey, landlordKp.publicKey, agencyKp.publicKey];
    for (const kp of [feePayer, landlordKp, agencyKp]) {
      const tx = selfBuilt(kp, kp.publicKey, amount);
      expect(transferAmountIfValid(confirmed(tx, landlord, amount), { ...params, serverKeys: keys })).toBeNull();
    }
  });

  it("rejects a transfer whose source is not the authority's own token account (a pull from custody)", () => {
    const tenant = Keypair.generate();
    const tx = selfBuilt(tenant, custody, amount);
    expect(transferAmountIfValid(confirmed(tx, landlord, amount), params)).toBeNull();
  });

  it("rejects an authority that is not a signer of the transaction", () => {
    const tenant = Keypair.generate();
    const tx = selfBuilt(tenant, tenant.publicKey, amount, feePayer.publicKey);
    const res = confirmed(tx, landlord, amount);
    // Same instructions, but only the fee payer signed.
    (res.transaction.message as unknown as { header: { numRequiredSignatures: number } }).header.numRequiredSignatures = 1;
    expect(transferAmountIfValid(res, params)).toBeNull();
  });

  it("rejects a self-transfer where the authority is the destination owner", () => {
    const tx = selfBuilt(Keypair.generate(), landlord, amount);
    expect(transferAmountIfValid(confirmed(tx, landlord, amount), params)).toBeNull();
  });

  it("accepts the honest shape: tenant signs, source is the tenant's own token account", () => {
    const tenant = Keypair.generate();
    const tx = selfBuilt(tenant, tenant.publicKey, amount);
    expect(transferAmountIfValid(confirmed(tx, landlord, amount), params)).toBe(amount);
  });

  it("findValidPayment never records the crafted custody transfer", async () => {
    const tx = selfBuilt(feePayer, custody, amount);
    const conn = connectionWith([{ signature: "evil", response: confirmed(tx, landlord, amount, DUE - 5) }]);
    expect(await findValidPayment(conn, params)).toBeNull();
  });
});

describe("findValidPayment", () => {
  const amount = BigInt(920_000_000);
  const params = { intent: rent, reference, destinationOwner: landlord, mint, serverKeys };

  it("is pending until a tx references the reference", async () => {
    expect(await findValidPayment(connectionWith([]), params)).toBeNull();
  });

  it("confirms a valid payment and reports the chain blockTime", async () => {
    const res = confirmed(build(rent, amount), landlord, amount, DUE - 50);
    const found = await findValidPayment(connectionWith([{ signature: "sigA", response: res }]), params);
    expect(found).toEqual({ signature: "sigA", blockTime: DUE - 50, amountBaseUnits: amount });
    const result = toPaymentResult(rent, found!);
    expect(result).toMatchObject({ kind: "rent", signature: "sigA", onTime: true, discountAppliedBps: 800, amountBaseUnits: "920000000" });
    expect(result.memo).toBe(buildMemo(rent));
    expect(result.explorerUrl).toContain("?cluster=devnet");
  });

  it("skips junk that merely attached the reference and finds the real payment behind it", async () => {
    const junk = confirmed(build({ ...rent, monthIndex: 5 }, amount), landlord, amount);
    const good = confirmed(build(rent, amount), landlord, amount);
    const found = await findValidPayment(
      connectionWith([
        { signature: "junk", response: junk },
        { signature: "failed", err: { InstructionError: [0, "x"] }, response: good },
        { signature: "real", response: good },
      ]),
      params,
    );
    expect(found?.signature).toBe("real");
  });

  it("rejects an underpayment (tx built by the payer, not by our endpoint)", async () => {
    const cheap = BigInt(1_000_000);
    const res = confirmed(build(rent, cheap), landlord, cheap);
    expect(await findValidPayment(connectionWith([{ signature: "cheap", response: res }]), params)).toBeNull();
  });

  it("rejects an instruction that claims more than the balance really changed", async () => {
    const res = confirmed(build(rent, amount), landlord, BigInt(1));
    expect(await findValidPayment(connectionWith([{ signature: "lie", response: res }]), params)).toBeNull();
  });

  it("prices strictly by blockTime with no grace: the on-time amount confirmed even 1 s late is refused (B5 N2)", async () => {
    const at = (blockTime: number) =>
      connectionWith([{ signature: "t", response: confirmed(build(rent, amount), landlord, amount, blockTime) }]);
    expect((await findValidPayment(at(DUE), params))?.amountBaseUnits).toBe(amount);
    expect(await findValidPayment(at(DUE + 1), params)).toBeNull();
    expect(await findValidPayment(at(DUE + 149), params)).toBeNull(); // the old grace window
    expect(await findValidPayment(at(DUE + 3600), params)).toBeNull();
    // The late price (usdc discount only) is accepted after the due date and records onTime = false.
    const lateAmount = BigInt(950_000_000);
    const late = await findValidPayment(
      connectionWith([{ signature: "l", response: confirmed(build(rent, lateAmount), landlord, lateAmount, DUE + 600) }]),
      params,
    );
    expect(toPaymentResult(rent, late!)).toMatchObject({ onTime: false, discountAppliedBps: 500, amountBaseUnits: "950000000" });
  });

  it("a self-built tx (the tenant is fee payer, own blockhash) cannot get the on-time price after the due date", async () => {
    const tenant = Keypair.generate();
    const own = selfBuilt(tenant, tenant.publicKey, amount);
    const conn = connectionWith([{ signature: "own", response: confirmed(own, landlord, amount, DUE + 100) }]);
    expect(await findValidPayment(conn, params)).toBeNull();
  });

  it("returns every valid payment, oldest first, so a second approval can be flagged (B5 N1)", async () => {
    const one = confirmed(build(rent, amount), landlord, amount, DUE - 50);
    const two = confirmed(build(rent, amount), landlord, amount, DUE - 20);
    const conn = connectionWith([
      { signature: "first", response: one },
      { signature: "second", response: two },
    ]);
    expect((await findValidPayments(conn, params)).map((f) => f.signature)).toEqual(["first", "second"]);
    expect((await findValidPayment(conn, params))?.signature).toBe("first");
  });

  it("records the discount tier actually paid, never a bigger one", () => {
    const paid = (amt: bigint) => toPaymentResult(rent, { signature: "s", blockTime: DUE - 30, amountBaseUnits: amt });
    expect(paid(BigInt(920_000_000))).toMatchObject({ onTime: true, discountAppliedBps: 800 });
    // Paid the worst-case quote (usdc only) although it landed on time.
    expect(paid(BigInt(950_000_000))).toMatchObject({ onTime: true, discountAppliedBps: 500 });
    expect(paid(BigInt(1_000_000_000))).toMatchObject({ onTime: true, discountAppliedBps: 0 });
    expect(paid(BigInt(1_300_000_000))).toMatchObject({ onTime: true, discountAppliedBps: 0 });
  });

  it("deposit needs the full list amount and has no discount", async () => {
    const dep = { intent: deposit, reference, destinationOwner: custody, mint, serverKeys };
    const full = BigInt(1_000_000_000);
    const ok = confirmed(build(deposit, full), custody, full);
    expect((await findValidPayment(connectionWith([{ signature: "d", response: ok }]), dep))?.amountBaseUnits).toBe(full);
    const short = confirmed(build(deposit, BigInt(999_999_999)), custody, BigInt(999_999_999));
    expect(await findValidPayment(connectionWith([{ signature: "s", response: short }]), dep)).toBeNull();
  });
});

describe("nextPaymentSlot", () => {
  const lease = { leaseId: "ls_1", months: 2 } as never;
  const base = { sessionId: "s", stage: "PAYMENT" as const, history: [], lease };
  const dep = { kind: "deposit" as const, memo: "lease:v1:ls_1:deposit:" + HASH } as never;
  const r0 = { kind: "rent" as const, memo: `lease:v1:ls_1:rent:0:${HASH}` } as never;
  const r1 = { kind: "rent" as const, memo: `lease:v1:ls_1:rent:1:${HASH}` } as never;

  it("walks deposit then rent months in order", () => {
    expect(nextPaymentSlot({ ...base, payments: [] }, "deposit")).toEqual({ ok: true });
    expect(nextPaymentSlot({ ...base, payments: [] }, "rent")).toMatchObject({ ok: false });
    expect(nextPaymentSlot({ ...base, payments: [dep] }, "deposit")).toMatchObject({ ok: false });
    expect(nextPaymentSlot({ ...base, payments: [dep] }, "rent")).toEqual({ ok: true, monthIndex: 0 });
    expect(nextPaymentSlot({ ...base, payments: [dep, r0] }, "rent")).toEqual({ ok: true, monthIndex: 1 });
    expect(nextPaymentSlot({ ...base, payments: [dep, r0, r1] }, "rent")).toMatchObject({ ok: false });
  });
});
