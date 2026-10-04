import { TokenAccountNotFoundError, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { PublicKey } from "@solana/web3.js";
import type { PaymentIntent, PaymentResult } from "../contracts";
import { computePrice } from "../rules/pricing";
import { explorerTxUrl } from "./explorer";
import { getDevnetConnection } from "./connection";
import { getPaymentMint, landlordKeypair, platformKeypair, tenantKeypair } from "./keys";
import { buildSignedTransfer, fetchBlockTime, getTransferStatus, sendPreparedTransfer } from "./transfer";

const ID_RE = /^[A-Za-z0-9_-]+$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const DECIMAL_RE = /^[0-9]+$/;

/** Neutral, versioned memo prefix (AD-03). */
export const MEMO_PREFIX = "lease:v1";

/** The payer does not hold enough test tokens. The route maps it to HTTP 409. */
export class InsufficientFundsError extends Error {
  constructor() {
    super("The tenant wallet does not hold enough test tokens for this payment.");
    this.name = "InsufficientFundsError";
  }
}

async function tokenBalance(owner: PublicKey): Promise<bigint> {
  const connection = await getDevnetConnection();
  try {
    return (await getAccount(connection, getAssociatedTokenAddressSync(getPaymentMint(), owner))).amount;
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) return BigInt(0);
    throw error;
  }
}

/** Memo strings carry only ids, month numbers and a hash. Anything else is rejected, so no PII can leak in. */
export function buildMemo(intent: Pick<PaymentIntent, "leaseId" | "kind" | "monthIndex" | "contractHash">): string {
  const { leaseId, kind, monthIndex, contractHash } = intent;
  if (!ID_RE.test(leaseId)) throw new Error("Invalid leaseId for memo.");
  if (!HASH_RE.test(contractHash)) throw new Error("Invalid contractHash for memo (expected 64 hex chars).");
  if (kind === "deposit") return `${MEMO_PREFIX}:${leaseId}:deposit:${contractHash}`;
  if (!Number.isInteger(monthIndex) || (monthIndex as number) < 0) {
    throw new Error("monthIndex is required for rent payments.");
  }
  return `${MEMO_PREFIX}:${leaseId}:rent:${monthIndex}:${contractHash}`;
}

/** What is needed to recognise, and later reconcile, one payment attempt. Stored on the pending DB row. */
export interface PaymentAttempt {
  signature: string;
  /** Past this block height (plus a margin) the signed tx can never land. */
  lastValidBlockHeight: number;
  amountBaseUnits: string;
  discountAppliedBps: number;
  memo: string;
}

/** A signed, NOT yet sent payment. Producing it has no side effect on the chain. */
export interface PreparedPayment extends PaymentAttempt {
  kind: PaymentIntent["kind"];
  serializedTx: string;
  blockhash: string;
}

function pricingOf(intent: PaymentIntent) {
  return {
    listBaseUnits: BigInt(intent.listAmountBaseUnits),
    discountUsdcBps: intent.discountUsdcBps,
    discountOntimeBps: intent.discountOntimeBps,
    dueTs: intent.dueTs,
  };
}

/**
 * Step 1 of a payment: validate, quote, check the payer balance, build and sign the transaction. Nothing is sent,
 * so ANY error thrown here (missing keypair env, RPC 429 on the balance read, blockhash failure, bad memo) means
 * the transfer provably did not happen and the caller may free its claim.
 *
 * Custodial escrow, real devnet transactions. The platform keypair pays every fee.
 *  - deposit: tenant -> platform custody token account, full list amount.
 *  - rent:    tenant -> landlord, amount quoted by computePrice with server time and method 'usdc'.
 */
export async function preparePayment(intent: PaymentIntent): Promise<PreparedPayment> {
  if (!DECIMAL_RE.test(intent.listAmountBaseUnits)) throw new Error("Invalid listAmountBaseUnits.");
  const memo = buildMemo(intent);
  const pricing = pricingOf(intent);

  let amount: bigint;
  let discountAppliedBps: number;
  let destination: PublicKey;
  if (intent.kind === "deposit") {
    // The deposit is returned in full at move-out: no discounts apply.
    amount = pricing.listBaseUnits;
    discountAppliedBps = 0;
    destination = platformKeypair().publicKey;
  } else {
    const quote = computePrice({ ...pricing, atTs: Math.floor(Date.now() / 1000), method: "usdc" });
    amount = quote.amountBaseUnits;
    discountAppliedBps = quote.discountBps;
    destination = landlordKeypair().publicKey;
  }

  const owner = tenantKeypair(intent.payer);
  if ((await tokenBalance(owner.publicKey)) < amount) throw new InsufficientFundsError();

  const transfer = await buildSignedTransfer({ owner, destination, amountBaseUnits: amount, memo });
  return {
    kind: intent.kind,
    signature: transfer.signature,
    serializedTx: transfer.serializedTx,
    blockhash: transfer.blockhash,
    lastValidBlockHeight: transfer.lastValidBlockHeight,
    amountBaseUnits: amount.toString(),
    discountAppliedBps,
    memo,
  };
}

/** The record is always based on the chain's clock, never the client's or the server's. */
async function resultFromChain(intent: PaymentIntent, attempt: PaymentAttempt): Promise<PaymentResult> {
  const blockTime = await fetchBlockTime(attempt.signature);
  const { onTime } = computePrice({ ...pricingOf(intent), atTs: blockTime, method: "usdc" });
  return {
    kind: intent.kind,
    signature: attempt.signature,
    explorerUrl: explorerTxUrl(attempt.signature),
    blockTime,
    amountBaseUnits: attempt.amountBaseUnits,
    discountAppliedBps: attempt.discountAppliedBps,
    onTime,
    memo: attempt.memo,
  };
}

/**
 * Step 2: send, wait for confirmation and read the chain's blockTime. A failure here is AMBIGUOUS: the
 * transfer may have landed. Do not assume otherwise; reconcile with `checkPayment` and the stored signature.
 */
export async function submitPayment(intent: PaymentIntent, prepared: PreparedPayment): Promise<PaymentResult> {
  await sendPreparedTransfer(prepared);
  return resultFromChain(intent, prepared);
}

export type PaymentCheck =
  | { state: "confirmed"; result: PaymentResult }
  /** Landed with an error or can never land: no tokens moved, the claim can be freed. */
  | { state: "failed" | "expired" }
  /** Might still land: keep the claim. */
  | { state: "pending" };

/**
 * Reconciliation of a stored attempt (after an ambiguous failure, a crash or a lost response). Throws on RPC
 * errors: the caller must then keep the claim.
 */
export async function checkPayment(intent: PaymentIntent, attempt: PaymentAttempt): Promise<PaymentCheck> {
  const state = await getTransferStatus(attempt.signature, attempt.lastValidBlockHeight);
  if (state === "confirmed") return { state, result: await resultFromChain(intent, attempt) };
  return { state };
}

/** Prepare + send in one call (scripts, tests against devnet). The API route uses the two steps separately. */
export async function executePayment(intent: PaymentIntent): Promise<PaymentResult> {
  return submitPayment(intent, await preparePayment(intent));
}
