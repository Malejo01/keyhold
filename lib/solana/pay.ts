import type { PublicKey } from "@solana/web3.js";
import type { PaymentIntent, PaymentResult } from "../contracts";
import { computePrice } from "../rules/pricing";
import { explorerTxUrl } from "./explorer";
import { landlordKeypair, platformKeypair, tenantKeypair } from "./keys";
import { fetchBlockTime, sendTokenTransferWithMemo } from "./transfer";

const ID_RE = /^[A-Za-z0-9_-]+$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const DECIMAL_RE = /^[0-9]+$/;

/** Memo strings carry only ids, month numbers and a hash. Anything else is rejected, so no PII can leak in. */
export function buildMemo(intent: Pick<PaymentIntent, "leaseId" | "kind" | "monthIndex" | "contractHash">): string {
  const { leaseId, kind, monthIndex, contractHash } = intent;
  if (!ID_RE.test(leaseId)) throw new Error("Invalid leaseId for memo.");
  if (!HASH_RE.test(contractHash)) throw new Error("Invalid contractHash for memo (expected 64 hex chars).");
  if (kind === "deposit") return `tuki:lease:${leaseId}:deposit:${contractHash}`;
  if (!Number.isInteger(monthIndex) || (monthIndex as number) < 0) {
    throw new Error("monthIndex is required for rent payments.");
  }
  return `tuki:lease:${leaseId}:rent:${monthIndex}:${contractHash}`;
}

/**
 * Custodial escrow, real devnet transactions. The platform keypair pays every fee.
 *  - deposit: tenant -> platform custody token account, full list amount.
 *  - rent:    tenant -> landlord, amount quoted by computePrice with server time and method 'usdc'.
 * After confirmation, `onTime` is recomputed from the confirmed tx blockTime.
 */
export async function executePayment(intent: PaymentIntent): Promise<PaymentResult> {
  if (!DECIMAL_RE.test(intent.listAmountBaseUnits)) throw new Error("Invalid listAmountBaseUnits.");
  const memo = buildMemo(intent);
  const list = BigInt(intent.listAmountBaseUnits);
  const pricing = {
    listBaseUnits: list,
    discountUsdcBps: intent.discountUsdcBps,
    discountOntimeBps: intent.discountOntimeBps,
    dueTs: intent.dueTs,
  };

  let amount: bigint;
  let discountAppliedBps: number;
  let destination: PublicKey;
  if (intent.kind === "deposit") {
    // The deposit is returned in full at move-out: no discounts apply.
    amount = list;
    discountAppliedBps = 0;
    destination = platformKeypair().publicKey;
  } else {
    const quote = computePrice({ ...pricing, atTs: Math.floor(Date.now() / 1000), method: "usdc" });
    amount = quote.amountBaseUnits;
    discountAppliedBps = quote.discountBps;
    destination = landlordKeypair().publicKey;
  }

  const signature = await sendTokenTransferWithMemo({
    owner: tenantKeypair(intent.payer),
    destination,
    amountBaseUnits: amount,
    memo,
  });

  // The record is always based on the chain's clock, never the client's or the server's.
  const blockTime = await fetchBlockTime(signature);
  const { onTime } = computePrice({ ...pricing, atTs: blockTime, method: "usdc" });

  return {
    kind: intent.kind,
    signature,
    explorerUrl: explorerTxUrl(signature),
    blockTime,
    amountBaseUnits: amount.toString(),
    discountAppliedBps,
    onTime,
    memo,
  };
}
