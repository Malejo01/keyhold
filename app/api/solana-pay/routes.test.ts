// Regression tests for the B5 security gate (docs/reviews/b5-solana-pay.md). They call the route handlers in-process
// with a fake RPC connection: nothing is sent to devnet and no secret is read from the environment.
import { getAssociatedTokenAddressSync, createTransferCheckedInstruction } from "@solana/spl-token";
import { Keypair, PublicKey, Transaction, type VersionedTransactionResponse } from "@solana/web3.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPaymentIntent, createLeaseDraft } from "@/lib/agents/lease";
import { applyEvent } from "@/lib/agents/orchestrator";
import type { PaymentIntent, SignedSession } from "@/lib/contracts";
import { newSession, signSession } from "@/lib/db/session";
import { buildMemo } from "@/lib/solana/pay";
import { resetRateLimits } from "@/lib/solana/rate-limit";
import { quoteForIntent } from "@/lib/solana/solana-pay";
import { memoInstruction } from "@/lib/solana/transfer";
import * as payRoute from "@/app/api/pay/route";
import * as statusRoute from "./status/route";
import * as ticketRoute from "./ticket/route";
import * as txRoute from "./tx/route";

const BLOCKHASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

const rpc = vi.hoisted(() => ({
  calls: 0,
  signatures: [] as { signature: string; err: object | null; blockTime: number | null; slot: number; memo: null }[],
  transactions: new Map<string, unknown>(),
}));

vi.mock("@/lib/solana/connection", () => ({
  getDevnetConnection: async () => {
    rpc.calls += 1;
    return {
      getSignaturesForAddress: async () => [...rpc.signatures].reverse(),
      getTransaction: async (sig: string) => rpc.transactions.get(sig) ?? null,
      getLatestBlockhash: async () => ({ blockhash: BLOCKHASH, lastValidBlockHeight: 1 }),
    };
  },
}));

const payment = vi.hoisted(() => ({ calls: [] as { reference?: PublicKey }[] }));

// The custodial button would send a real devnet tx: replace the two payment steps (prepare, then send) and keep
// everything else. `preparePayment` records the options the route hands over, so the shared reference is observable.
vi.mock("@/lib/solana/pay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/solana/pay")>()),
  preparePayment: async (intent: { kind: string; leaseId: string }, options: { reference?: PublicKey } = {}) => {
    payment.calls.push(options);
    return {
      kind: intent.kind,
      signature: "custodial-fixture",
      serializedTx: "",
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 1,
      amountBaseUnits: "1",
      discountAppliedBps: 0,
      memo: "lease:v1:" + intent.leaseId + ":rent:0:" + "a".repeat(64),
    };
  },
  submitPayment: async (
    intent: { kind: string },
    prepared: { signature: string; amountBaseUnits: string; discountAppliedBps: number; memo: string },
  ) => ({
    kind: intent.kind,
    signature: prepared.signature,
    explorerUrl: "",
    blockTime: Math.floor(Date.now() / 1000),
    amountBaseUnits: prepared.amountBaseUnits,
    discountAppliedBps: prepared.discountAppliedBps,
    onTime: true,
    memo: prepared.memo,
  }),
}));

// The wallet balance is not what is under test here.
vi.mock("@/lib/solana/solana-pay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/solana/solana-pay")>()),
  tokenBalanceOf: async () => BigInt(10 ** 12),
}));

const platform = Keypair.generate();
const landlord = Keypair.generate();
const agency = Keypair.generate();
const tenantWallet = Keypair.generate();
const mint = Keypair.generate().publicKey;

const secret = (k: Keypair) => JSON.stringify(Array.from(k.secretKey));

beforeAll(() => {
  process.env.SESSION_SECRET = "s".repeat(40);
  process.env.PLATFORM_SECRET_KEY = secret(platform);
  process.env.LANDLORD_SECRET_KEY = secret(landlord);
  process.env.AGENCY_SECRET_KEY = secret(agency);
  process.env.PAYMENT_MINT = mint.toBase58();
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_SOLANA_PAY = "1";
  resetRateLimits();
  rpc.calls = 0;
  rpc.signatures = [];
  rpc.transactions.clear();
  payment.calls = [];
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SOLANA_PAY;
});

const post = (handler: (r: Request) => Promise<Response>, url: string, body: unknown, headers: Record<string, string> = {}) =>
  handler(new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

/** A session whose deposit is already recorded, signed locally (no devnet tx). */
function sessionWithDeposit(): { session: SignedSession; rent: PaymentIntent } {
  const lease = createLeaseDraft("ana", "prop-01");
  let state = applyEvent(newSession("ana"), { type: "lease_created", lease });
  state = applyEvent(state, {
    type: "payment_confirmed",
    result: {
      kind: "deposit",
      signature: "fixture-deposit",
      explorerUrl: "",
      blockTime: Math.floor(Date.now() / 1000),
      amountBaseUnits: lease.depositBaseUnits,
      discountAppliedBps: 0,
      onTime: true,
      memo: buildMemo(buildPaymentIntent(lease, "deposit")),
    },
  });
  return { session: signSession(state), rent: buildPaymentIntent(lease, "rent", 0) };
}

async function mintRentTicket(session: SignedSession) {
  const res = await post(ticketRoute.POST, "http://localhost/api/solana-pay/ticket", { kind: "rent", session });
  expect(res.status).toBe(200);
  const json = (await res.json()) as { ticket: string; reference: string };
  return { ...json, txUrl: `http://localhost/api/solana-pay/tx?t=${encodeURIComponent(json.ticket)}` };
}

/** What getTransaction returns for `tx`: confirmed, with the landlord token account balance going 0 -> received. */
function confirmedResponse(tx: Transaction, received: bigint, blockTime: number): VersionedTransactionResponse {
  const message = tx.compileMessage();
  const ata = getAssociatedTokenAddressSync(mint, landlord.publicKey);
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
        { accountIndex: message.accountKeys.findIndex((k) => k.equals(ata)), mint: mint.toBase58(), uiTokenAmount: { amount: received.toString(), decimals: 6, uiAmount: null } },
      ],
      loadedAddresses: { writable: [], readonly: [] },
    },
  } as unknown as VersionedTransactionResponse;
}

/** A rent payment for `intent`: `authority` signs, tokens leave the token account of `sourceOwner`. */
function paymentTx(intent: PaymentIntent, reference: string, authority: PublicKey, sourceOwner: PublicKey, amount: bigint) {
  const tx = new Transaction({ feePayer: authority, recentBlockhash: BLOCKHASH });
  const transfer = createTransferCheckedInstruction(
    getAssociatedTokenAddressSync(mint, sourceOwner),
    mint,
    getAssociatedTokenAddressSync(mint, landlord.publicKey),
    authority,
    amount,
    6,
  );
  transfer.keys.push({ pubkey: new PublicKey(reference), isSigner: false, isWritable: false });
  tx.add(memoInstruction(buildMemo(intent)), transfer);
  return tx;
}

function land(signature: string, tx: Transaction, amount: bigint, blockTime: number) {
  rpc.signatures.push({ signature, err: null, blockTime, slot: 1, memo: null });
  rpc.transactions.set(signature, confirmedResponse(tx, amount, blockTime));
}

describe("flag off: the surface does not exist (B5 N6)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SOLANA_PAY;
  });

  it("answers 404 on every method, including the CORS preflight", async () => {
    expect(txRoute.OPTIONS().status).toBe(404);
    expect((await txRoute.GET(new Request("http://localhost/api/solana-pay/tx?t=x"))).status).toBe(404);
    expect((await post(txRoute.POST, "http://localhost/api/solana-pay/tx?t=x", { account: tenantWallet.publicKey.toBase58() })).status).toBe(404);
    expect((await post(ticketRoute.POST, "http://localhost/api/solana-pay/ticket", {})).status).toBe(404);
    expect((await post(statusRoute.POST, "http://localhost/api/solana-pay/status", {})).status).toBe(404);
  });

  it("answers the preflight with CORS headers only when the flag is on", () => {
    process.env.NEXT_PUBLIC_SOLANA_PAY = "1";
    const res = txRoute.OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("B5-1: tx endpoint never hands out a transaction the server alone can complete", () => {
  it("refuses account = platform, landlord or agency with 400, before any RPC call or signature", async () => {
    const { session } = sessionWithDeposit();
    const { txUrl } = await mintRentTicket(session);
    for (const who of [platform, landlord, agency]) {
      const res = await post(txRoute.POST, txUrl, { account: who.publicKey.toBase58() });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { transaction?: string }).transaction).toBeUndefined();
    }
    expect(rpc.calls).toBe(0);
  });

  it("refuses the platform for a deposit ticket too (custody is the destination owner there)", async () => {
    const fresh = signSession(applyEvent(newSession("ana"), { type: "lease_created", lease: createLeaseDraft("ana", "prop-01") }));
    const res = await post(ticketRoute.POST, "http://localhost/api/solana-pay/ticket", { kind: "deposit", session: fresh });
    const { ticket } = (await res.json()) as { ticket: string };
    const tx = await post(txRoute.POST, `http://localhost/api/solana-pay/tx?t=${encodeURIComponent(ticket)}`, { account: platform.publicKey.toBase58() });
    expect(tx.status).toBe(400);
  });

  it("builds for a normal wallet: the wallet is the token authority, the source is its own account, the server signature is not enough", async () => {
    const { session } = sessionWithDeposit();
    const { txUrl, reference } = await mintRentTicket(session);
    const res = await post(txRoute.POST, txUrl, { account: tenantWallet.publicKey.toBase58() });
    expect(res.status).toBe(200);
    const tx = Transaction.from(Buffer.from(((await res.json()) as { transaction: string }).transaction, "base64"));

    expect(tx.feePayer?.equals(platform.publicKey)).toBe(true);
    const transfer = tx.instructions[2];
    expect(transfer.keys[0].pubkey.equals(getAssociatedTokenAddressSync(mint, tenantWallet.publicKey))).toBe(true);
    expect(transfer.keys[3].pubkey.equals(tenantWallet.publicKey)).toBe(true);
    expect(transfer.keys[4].pubkey.toBase58()).toBe(reference);
    // Neither the platform, nor the custody token account, appears in any token-program instruction.
    const custodyAta = getAssociatedTokenAddressSync(mint, platform.publicKey);
    for (const k of transfer.keys) {
      expect(k.pubkey.equals(platform.publicKey)).toBe(false);
      expect(k.pubkey.equals(custodyAta)).toBe(false);
    }
    // Only the platform signed. The wallet's signature slot is still empty, so the tx cannot land as returned.
    expect(tx.signatures.filter((s) => s.signature !== null).map((s) => s.publicKey.toBase58())).toEqual([platform.publicKey.toBase58()]);
    expect(tx.verifySignatures(true)).toBe(false);
  });
});

describe("B5 N1: one reference per payment slot", () => {
  it("two tickets for the same slot share the reference, and a second wallet approval is refused", async () => {
    const { session, rent } = sessionWithDeposit();
    const a = await mintRentTicket(session);
    const b = await mintRentTicket(session);
    expect(a.reference).toBe(b.reference);

    expect((await post(txRoute.POST, a.txUrl, { account: tenantWallet.publicKey.toBase58() })).status).toBe(200);
    // The first approval lands on chain.
    const amount = quoteForIntent(rent, Math.floor(Date.now() / 1000)).amountBaseUnits;
    land("sig-1", paymentTx(rent, a.reference, tenantWallet.publicKey, tenantWallet.publicKey, amount), amount, Math.floor(Date.now() / 1000));
    // A second ticket, a second tx request for the same slot: refused.
    const second = await post(txRoute.POST, b.txUrl, { account: tenantWallet.publicKey.toBase58() });
    expect(second.status).toBe(409);
  });

  it("custodial button: carries the slot reference, and refuses to pay when a wallet payment is already on chain", async () => {
    const { session, rent } = sessionWithDeposit();
    const { reference } = await mintRentTicket(session);

    // Nothing on chain: the button pays, and hands the SAME reference to the transfer.
    const ok = await post(payRoute.POST, "http://localhost/api/pay", { kind: "rent", session });
    expect(ok.status).toBe(200);
    expect(payment.calls).toHaveLength(1);
    expect(payment.calls[0].reference?.toBase58()).toBe(reference);

    // A QR payment for the same slot is already on chain (not yet recorded in the session): refused, nothing sent.
    const now = Math.floor(Date.now() / 1000);
    const amount = quoteForIntent(rent, now).amountBaseUnits;
    land("qr-sig", paymentTx(rent, reference, tenantWallet.publicKey, tenantWallet.publicKey, amount), amount, now - 3);
    const refused = await post(payRoute.POST, "http://localhost/api/pay", { kind: "rent", session });
    expect(refused.status).toBe(409);
    expect(payment.calls).toHaveLength(1);
  });

  it("custodial button with the flag off is unchanged: no reference, no extra RPC read", async () => {
    delete process.env.NEXT_PUBLIC_SOLANA_PAY;
    const { session } = sessionWithDeposit();
    const res = await post(payRoute.POST, "http://localhost/api/pay", { kind: "rent", session });
    expect(res.status).toBe(200);
    expect(payment.calls).toEqual([{ reference: undefined }]);
    expect(rpc.calls).toBe(0);
  });

  it("status records the first payment and flags the second one instead of recording it", async () => {
    const { session, rent } = sessionWithDeposit();
    const { ticket, reference } = await mintRentTicket(session);
    const amount = quoteForIntent(rent, Math.floor(Date.now() / 1000)).amountBaseUnits;
    const now = Math.floor(Date.now() / 1000);
    land("first", paymentTx(rent, reference, tenantWallet.publicKey, tenantWallet.publicKey, amount), amount, now - 5);
    land("second", paymentTx(rent, reference, tenantWallet.publicKey, tenantWallet.publicKey, amount), amount, now - 1);

    const res = await post(statusRoute.POST, "http://localhost/api/solana-pay/status", { ticket, session });
    const json = (await res.json()) as { status: string; result: { signature: string }; duplicatePayments?: string[]; session: SignedSession };
    expect(json.status).toBe("confirmed");
    expect(json.result.signature).toBe("first");
    expect(json.duplicatePayments).toEqual(["second"]);

    // Polling again with the updated session stays idempotent and keeps flagging the extra payment.
    const again = await post(statusRoute.POST, "http://localhost/api/solana-pay/status", { ticket, session: json.session });
    const againJson = (await again.json()) as { result: { signature: string }; duplicatePayments?: string[]; session: { state: { payments: unknown[] } } };
    expect(againJson.result.signature).toBe("first");
    expect(againJson.duplicatePayments).toEqual(["second"]);
    expect(againJson.session.state.payments).toHaveLength(2); // deposit + rent, rent only once
  });

  it("status flags a wallet payment that lands after the custodial button recorded the slot", async () => {
    const { session, rent } = sessionWithDeposit();
    const { ticket, reference } = await mintRentTicket(session);
    const now = Math.floor(Date.now() / 1000);
    const amount = quoteForIntent(rent, now).amountBaseUnits;
    // Session already shows the rent as paid by the button (a different signature, same memo).
    const decoded = JSON.parse(JSON.stringify(session)) as SignedSession;
    const recorded = signSession(
      applyEvent(decoded.state, {
        type: "payment_confirmed",
        result: { kind: "rent", signature: "custodial-sig", explorerUrl: "", blockTime: now - 30, amountBaseUnits: amount.toString(), discountAppliedBps: 800, onTime: true, memo: buildMemo(rent) },
      }),
    );
    land("custodial-sig", paymentTx(rent, reference, tenantWallet.publicKey, tenantWallet.publicKey, amount), amount, now - 30);
    land("qr-sig", paymentTx(rent, reference, tenantWallet.publicKey, tenantWallet.publicKey, amount), amount, now - 2);
    const res = await post(statusRoute.POST, "http://localhost/api/solana-pay/status", { ticket, session: recorded });
    const json = (await res.json()) as { result: { signature: string }; duplicatePayments?: string[] };
    expect(json.result.signature).toBe("custodial-sig");
    expect(json.duplicatePayments).toEqual(["qr-sig"]);
  });
});

describe("B5-1: status never records custody funds moved by a server-held key", () => {
  it("a crafted custody -> landlord transfer authorised by the platform stays pending and is not recorded", async () => {
    const { session, rent } = sessionWithDeposit();
    const { ticket, reference } = await mintRentTicket(session);
    const amount = quoteForIntent(rent, Math.floor(Date.now() / 1000)).amountBaseUnits;
    land("drain", paymentTx(rent, reference, platform.publicKey, platform.publicKey, amount), amount, Math.floor(Date.now() / 1000));

    const res = await post(statusRoute.POST, "http://localhost/api/solana-pay/status", { ticket, session });
    expect(((await res.json()) as { status: string }).status).toBe("pending");
  });

  it("an honest wallet payment under the same reference is still recorded when the junk tx is also attached", async () => {
    const { session, rent } = sessionWithDeposit();
    const { ticket, reference } = await mintRentTicket(session);
    const now = Math.floor(Date.now() / 1000);
    const amount = quoteForIntent(rent, now).amountBaseUnits;
    land("drain", paymentTx(rent, reference, platform.publicKey, platform.publicKey, amount), amount, now - 10);
    land("honest", paymentTx(rent, reference, tenantWallet.publicKey, tenantWallet.publicKey, amount), amount, now - 5);
    const res = await post(statusRoute.POST, "http://localhost/api/solana-pay/status", { ticket, session });
    const json = (await res.json()) as { status: string; result: { signature: string; amountBaseUnits: string }; duplicatePayments?: string[] };
    expect(json.status).toBe("confirmed");
    expect(json.result.signature).toBe("honest");
    expect(json.duplicatePayments).toBeUndefined();
  });
});

describe("B5 N2: no grace for a self-built late transaction", () => {
  it("the discounted amount confirmed after the due date stays pending; the late price is accepted as not on time", async () => {
    const { session, rent } = sessionWithDeposit();
    const { ticket, reference } = await mintRentTicket(session);
    const onTime = quoteForIntent(rent, rent.dueTs).amountBaseUnits;
    const late = quoteForIntent(rent, rent.dueTs + 1).amountBaseUnits;
    expect(late > onTime).toBe(true);

    land("cheap-late", paymentTx(rent, reference, tenantWallet.publicKey, tenantWallet.publicKey, onTime), onTime, rent.dueTs + 100);
    const pending = await post(statusRoute.POST, "http://localhost/api/solana-pay/status", { ticket, session });
    expect(((await pending.json()) as { status: string }).status).toBe("pending");

    rpc.signatures = [];
    land("full-late", paymentTx(rent, reference, tenantWallet.publicKey, tenantWallet.publicKey, late), late, rent.dueTs + 100);
    const ok = await post(statusRoute.POST, "http://localhost/api/solana-pay/status", { ticket, session });
    const json = (await ok.json()) as { status: string; result: { onTime: boolean; discountAppliedBps: number } };
    expect(json.status).toBe("confirmed");
    expect(json.result.onTime).toBe(false);
    expect(json.result.discountAppliedBps).toBe(rent.discountUsdcBps);
  });
});

describe("B5 N3: per-IP rate limits", () => {
  it("limits ticket, tx and status requests from one IP with 429 and Retry-After, and counts IPs separately", async () => {
    const { session } = sessionWithDeposit();
    const ip = { "x-forwarded-for": "203.0.113.7" };
    const ticketCall = () => post(ticketRoute.POST, "http://localhost/api/solana-pay/ticket", { kind: "rent", session }, ip);
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await ticketCall()).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect((await ticketCall()).headers.get("retry-after")).toMatch(/^\d+$/);
    // Another client is unaffected.
    expect((await post(ticketRoute.POST, "http://localhost/api/solana-pay/ticket", { kind: "rent", session }, { "x-forwarded-for": "198.51.100.1" })).status).toBe(200);

    const { ticket, txUrl } = await mintRentTicket(session);
    const txCall = () => post(txRoute.POST, txUrl, { account: platform.publicKey.toBase58() }, ip);
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await txCall()).status;
    expect(last).toBe(429);

    const statusCall = () => post(statusRoute.POST, "http://localhost/api/solana-pay/status", { ticket, session }, ip);
    let lastStatus = 0;
    for (let i = 0; i < 201; i++) lastStatus = (await statusCall()).status;
    expect(lastStatus).toBe(429);
  });
});
