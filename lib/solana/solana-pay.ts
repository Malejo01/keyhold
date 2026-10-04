// Solana Pay transaction requests (custodial mode, devnet). Server-side building and validation.
//
// Instruction order is fixed by what @solana/pay's validateTransfer expects:
//   [create destination ATA (idempotent)] , Memo , transferChecked(+ reference as read-only non-signer key)
// The platform wallet is the fee payer and signs first; the payer signs in their wallet.
import {
  TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { type Connection, type Keypair, type PublicKey, Transaction, type VersionedTransactionResponse } from "@solana/web3.js";
import type { PaymentIntent, PaymentResult } from "../contracts";
import { computePrice } from "../rules/pricing";
import { explorerTxUrl } from "./explorer";
import { PAYMENT_DECIMALS } from "./keys";
import { buildMemo } from "./pay";
import { MEMO_PROGRAM_ID, memoInstruction } from "./transfer";

/**
 * A tx is built with the quote at build time and lands up to ~2 minutes later (blockhash lifetime), so a payment
 * that crossed the due date while in flight is still accepted at the discounted amount. Beyond this window the
 * strict blockTime price applies. Bounded by the blockhash lifetime.
 */
export const IN_FLIGHT_GRACE_SECONDS = 150;

export interface Quote {
  amountBaseUnits: bigint;
  discountBps: number;
}

/** What to charge at `atTs`. Deposit: full list, no discount. Rent: computePrice, method usdc. */
export function quoteForIntent(intent: PaymentIntent, atTs: number): Quote {
  const list = BigInt(intent.listAmountBaseUnits);
  if (intent.kind === "deposit") return { amountBaseUnits: list, discountBps: 0 };
  const q = computePrice({
    listBaseUnits: list,
    discountUsdcBps: intent.discountUsdcBps,
    discountOntimeBps: intent.discountOntimeBps,
    dueTs: intent.dueTs,
    atTs,
    method: "usdc",
  });
  return { amountBaseUnits: q.amountBaseUnits, discountBps: q.discountBps };
}

export interface BuildParams {
  intent: PaymentIntent;
  /** The wallet that will pay and sign (the `account` field of the POST). */
  payer: PublicKey;
  reference: PublicKey;
  /** Owner of the destination token account: platform custody (deposit) or landlord (rent). */
  destinationOwner: PublicKey;
  mint: PublicKey;
  amountBaseUnits: bigint;
  feePayer: Keypair;
  blockhash: string;
}

/** Builds the transaction and signs it with the fee payer only. The payer's signature slot stays empty. */
export function buildSolanaPayTransaction(params: BuildParams): Transaction {
  const { intent, payer, reference, destinationOwner, mint, amountBaseUnits, feePayer, blockhash } = params;
  if (amountBaseUnits <= BigInt(0)) throw new RangeError("amount must be > 0");
  const source = getAssociatedTokenAddressSync(mint, payer);
  const destinationAta = getAssociatedTokenAddressSync(mint, destinationOwner);

  const transfer = createTransferCheckedInstruction(source, mint, destinationAta, payer, amountBaseUnits, PAYMENT_DECIMALS);
  // Solana Pay: the reference is a read-only, non-signer key on the transfer instruction.
  transfer.keys.push({ pubkey: reference, isSigner: false, isWritable: false });

  const tx = new Transaction({ feePayer: feePayer.publicKey, recentBlockhash: blockhash });
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(feePayer.publicKey, destinationAta, destinationOwner, mint),
    memoInstruction(buildMemo(intent)),
    transfer,
  );
  tx.partialSign(feePayer);
  return tx;
}

/** Spec-compliant serialization for the POST response (the payer signature is still missing). */
export function serializeForWallet(tx: Transaction): string {
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

/** Tokens held by `owner` for `mint` (0 when the token account does not exist). */
export async function tokenBalanceOf(connection: Connection, mint: PublicKey, owner: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(connection, getAssociatedTokenAddressSync(mint, owner))).amount;
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) return BigInt(0);
    throw error;
  }
}

/** True when any non-failed tx already references this reference (used to refuse a second payment). */
export async function referenceAlreadyUsed(connection: Connection, reference: PublicKey): Promise<boolean> {
  const sigs = await connection.getSignaturesForAddress(reference, { limit: 10 }, "confirmed");
  return sigs.some((s) => !s.err);
}

export interface FoundPayment {
  signature: string;
  blockTime: number;
  /** Tokens that actually reached the destination token account, in base units. */
  amountBaseUnits: bigint;
}

export interface ValidateParams {
  intent: PaymentIntent;
  reference: PublicKey;
  destinationOwner: PublicKey;
  mint: PublicKey;
}

const TRANSFER_CHECKED_TAG = 12;

/**
 * Structural check of a confirmed tx against the ticket. It scans all instructions instead of assuming positions
 * (@solana/pay's validateTransfer requires the transfer to be the very last instruction, which breaks as soon as a
 * wallet appends or prepends an instruction of its own, e.g. compute budget). Requires:
 *  - the tx succeeded;
 *  - one SPL transferChecked to the destination token account, of our mint and decimals, whose extra keys are
 *    exactly [reference] (this is how Solana Pay binds a payment to a reference);
 *  - a Memo instruction (no keys) whose data equals our memo byte for byte.
 * Returns the amount of that instruction, or null if the tx is not a valid payment for the intent.
 */
export function transferAmountIfValid(
  response: VersionedTransactionResponse,
  p: ValidateParams,
): bigint | null {
  if (!response.meta || response.meta.err) return null;
  const message = response.transaction.message;
  const keys = message.getAccountKeys({ accountKeysFromLookups: response.meta.loadedAddresses });
  const destinationAta = getAssociatedTokenAddressSync(p.mint, p.destinationOwner);
  const memo = Buffer.from(buildMemo(p.intent), "utf8");

  let memoSeen = false;
  let amount: bigint | null = null;
  for (const ix of message.compiledInstructions) {
    const program = keys.get(ix.programIdIndex);
    if (!program) return null;
    if (program.equals(MEMO_PROGRAM_ID)) {
      if (ix.accountKeyIndexes.length === 0 && Buffer.from(ix.data).equals(memo)) memoSeen = true;
      continue;
    }
    if (!program.equals(TOKEN_PROGRAM_ID) || ix.data[0] !== TRANSFER_CHECKED_TAG || ix.data.length !== 10) continue;
    const accounts = ix.accountKeyIndexes.map((i) => keys.get(i));
    const [, mint, dest, , ...extra] = accounts;
    if (!mint?.equals(p.mint) || !dest?.equals(destinationAta)) continue;
    if (ix.data[9] !== PAYMENT_DECIMALS) continue;
    if (extra.length !== 1 || !extra[0]?.equals(p.reference)) continue;
    if (amount !== null) return null; // two matching transfers: ambiguous, refuse
    amount = Buffer.from(ix.data).readBigUInt64LE(1);
  }
  return memoSeen ? amount : null;
}

/**
 * Looks for a confirmed transaction that carries `reference` AND is a valid payment for this intent.
 * Candidates are tried oldest first and invalid ones are skipped, so someone who merely attaches the public
 * reference to an unrelated tx cannot block the real payment. Returns null while nothing valid exists yet.
 * The amount must reach the minimum: the price at the confirmed blockTime (never client time), relaxed by
 * IN_FLIGHT_GRACE_SECONDS for txs that were quoted just before the due date. The amount that counts is the
 * smaller of the instruction amount and the real balance change of the destination token account.
 */
export async function findValidPayment(connection: Connection, p: ValidateParams): Promise<FoundPayment | null> {
  const sigs = await connection.getSignaturesForAddress(p.reference, { limit: 20 }, "confirmed");
  const destinationAta = getAssociatedTokenAddressSync(p.mint, p.destinationOwner);

  for (const info of [...sigs].reverse()) {
    if (info.err) continue;
    try {
      const response = await connection.getTransaction(info.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!response) continue;
      const ixAmount = transferAmountIfValid(response, p);
      if (ixAmount === null) continue;
      const blockTime = response.blockTime ?? info.blockTime;
      if (!blockTime) continue; // not timestamped yet: try again on the next poll

      const keys = response.transaction.message.getAccountKeys({
        accountKeysFromLookups: response.meta?.loadedAddresses,
      });
      let index = -1;
      for (let i = 0; i < keys.length; i++) if (keys.get(i)?.equals(destinationAta)) index = i;
      const pre = response.meta?.preTokenBalances?.find((b) => b.accountIndex === index);
      const post = response.meta?.postTokenBalances?.find((b) => b.accountIndex === index);
      const delta = BigInt(post?.uiTokenAmount.amount ?? "0") - BigInt(pre?.uiTokenAmount.amount ?? "0");
      const received = delta < ixAmount ? delta : ixAmount;

      const strict = quoteForIntent(p.intent, blockTime).amountBaseUnits;
      const graced = quoteForIntent(p.intent, blockTime - IN_FLIGHT_GRACE_SECONDS).amountBaseUnits;
      const minimum = strict < graced ? strict : graced;
      if (received <= BigInt(0) || received < minimum) continue;
      return { signature: info.signature, blockTime, amountBaseUnits: received };
    } catch {
      continue; // unreadable or not a valid payment for this ticket
    }
  }
  return null;
}

/** The record stored in the session. onTime always comes from the confirmed blockTime. */
export function toPaymentResult(intent: PaymentIntent, found: FoundPayment): PaymentResult {
  const strict = quoteForIntent(intent, found.blockTime);
  const graced = quoteForIntent(intent, found.blockTime - IN_FLIGHT_GRACE_SECONDS);
  const discountAppliedBps = found.amountBaseUnits >= strict.amountBaseUnits ? strict.discountBps : graced.discountBps;
  const onTime = computePrice({
    listBaseUnits: BigInt(intent.listAmountBaseUnits),
    discountUsdcBps: intent.discountUsdcBps,
    discountOntimeBps: intent.discountOntimeBps,
    dueTs: intent.dueTs,
    atTs: found.blockTime,
    method: "usdc",
  }).onTime;
  return {
    kind: intent.kind,
    signature: found.signature,
    explorerUrl: explorerTxUrl(found.signature),
    blockTime: found.blockTime,
    amountBaseUnits: found.amountBaseUnits.toString(),
    discountAppliedBps: intent.kind === "deposit" ? 0 : discountAppliedBps,
    onTime,
    memo: buildMemo(intent),
  };
}
