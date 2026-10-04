// Solana Pay transaction requests (custodial mode, devnet). Server-side building and validation.
//
// Instruction order is fixed by what @solana/pay's validateTransfer expects:
//   [create destination ATA (idempotent)] , Memo , transferChecked(+ reference as read-only non-signer key)
// The platform wallet is the fee payer and signs first; the payer signs in their wallet.
//
// Security invariant (B5-1): the server's signature must never authorise a token movement. The transfer authority is
// always the requesting wallet and the source is that wallet's own token account; the payer can never be a key the
// server holds; and before signing, the fee payer is proven to appear in the message only as the funder of the
// (idempotent) destination token account creation. The confirmation scan enforces the same rules on chain data.
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
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
 * A tx built now can land until its blockhash expires (about 60 to 90 s, bounded with margin here). The endpoint
 * therefore quotes the price that applies at the LATEST possible landing time, so a transaction that crosses the
 * due date while in flight is never underpaid and no grace period exists at confirmation: the confirmed blockTime
 * alone decides the price (see findValidPayments). A payer in the last two minutes before the due date is quoted
 * the non-discounted-on-time price; if the tx still lands on time, the receipt records the discount tier that was
 * actually paid.
 */
export const QUOTE_LOOKAHEAD_SECONDS = 120;

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

/** What the endpoint charges for a transaction built at `nowSec` (worst-case landing time, see above). */
export function quoteForBuild(intent: PaymentIntent, nowSec: number): Quote {
  return quoteForIntent(intent, nowSec + QUOTE_LOOKAHEAD_SECONDS);
}

/** The requested paying wallet is a key the server holds (or the destination owner): never allowed. */
export class ForbiddenPayerError extends Error {
  constructor() {
    super("This wallet cannot be used for this payment.");
    this.name = "ForbiddenPayerError";
  }
}

export function isForbiddenPayer(payer: PublicKey, destinationOwner: PublicKey, serverKeys: PublicKey[]): boolean {
  return payer.equals(destinationOwner) || serverKeys.some((k) => payer.equals(k));
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
  /** Every key the server can sign with (serverHeldPublicKeys()). The payer must not be one of them. */
  serverKeys: PublicKey[];
}

/**
 * Proof obligation before the fee payer signs: in the compiled message its key may appear only in the
 * associated-token-account creation, as funder (account 0) or as the owner value (account 2, never a signer there). It
 * is in no token-program or system-program instruction, so its signature cannot authorise moving any token or
 * lamport, whatever it holds. Throws otherwise.
 */
export function assertFeePayerAuthorizesNothing(tx: Transaction, feePayer: PublicKey): void {
  for (const ix of tx.instructions) {
    ix.keys.forEach((k, i) => {
      if (!k.pubkey.equals(feePayer)) return;
      // Associated-token-account creation: position 0 is the funder (pays rent only if the account is missing) and
      // position 2 is the account owner, a plain value that never signs (it is the platform itself for deposits).
      if (ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) && (i === 0 || i === 2)) return;
      throw new Error("Refusing to sign: the fee payer would take part in an instruction other than paying the fee.");
    });
  }
}

/** Builds the transaction and signs it with the fee payer only. The payer's signature slot stays empty. */
export function buildSolanaPayTransaction(params: BuildParams): Transaction {
  const { intent, payer, reference, destinationOwner, mint, amountBaseUnits, feePayer, blockhash, serverKeys } = params;
  if (amountBaseUnits <= BigInt(0)) throw new RangeError("amount must be > 0");
  if (payer.equals(feePayer.publicKey) || isForbiddenPayer(payer, destinationOwner, serverKeys)) throw new ForbiddenPayerError();
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
  assertFeePayerAuthorizesNothing(tx, feePayer.publicKey);
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
  /** Every key the server can sign with. A transfer authorised by one of them is never a tenant payment. */
  serverKeys: PublicKey[];
}

const TRANSFER_CHECKED_TAG = 12;

/**
 * Structural check of a confirmed tx against the ticket. It scans all instructions instead of assuming positions
 * (@solana/pay's validateTransfer requires the transfer to be the very last instruction, which breaks as soon as a
 * wallet appends or prepends an instruction of its own, e.g. compute budget). Requires:
 *  - the tx succeeded;
 *  - one SPL transferChecked to the destination token account, of our mint and decimals, whose extra keys are
 *    exactly [reference] (this is how Solana Pay binds a payment to a reference);
 *  - that transfer is authorised by a wallet that signed the tx, is neither a key the server holds nor the
 *    destination owner, and moves tokens out of that wallet's own associated token account (never custody);
 *  - a Memo instruction (no keys) whose data equals our memo byte for byte.
 * Returns the amount of that instruction, or null if the tx is not a valid payment for the intent. A transfer that
 * matches the reference but breaks the authority rules makes the whole tx invalid.
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
    const [source, mint, dest, authority, ...extra] = accounts;
    if (!mint?.equals(p.mint) || !dest?.equals(destinationAta)) continue;
    if (ix.data[9] !== PAYMENT_DECIMALS) continue;
    if (extra.length !== 1 || !extra[0]?.equals(p.reference)) continue;
    // From here on the instruction claims this payment: any authority problem invalidates the whole tx.
    if (!source || !authority) return null;
    if (ix.accountKeyIndexes[3] >= message.header.numRequiredSignatures) return null; // authority did not sign
    if (isForbiddenPayer(authority, p.destinationOwner, p.serverKeys)) return null;
    if (!source.equals(getAssociatedTokenAddressSync(p.mint, authority))) return null;
    if (amount !== null) return null; // two matching transfers: ambiguous, refuse
    amount = Buffer.from(ix.data).readBigUInt64LE(1);
  }
  return memoSeen ? amount : null;
}

/**
 * Every confirmed transaction that carries `reference` AND is a valid payment for this intent, oldest first.
 * Candidates are tried oldest first and invalid ones are skipped, so someone who merely attaches the public
 * reference to an unrelated tx cannot block the real payment. The amount must reach the price at the confirmed
 * blockTime (never client time), with no grace: the quote was already computed for the latest possible landing time
 * (quoteForBuild), so an honest payment always reaches it and a self-built late tx never gets the on-time price.
 * The amount that counts is the smaller of the instruction amount and the real balance change of the destination
 * token account. `stopAtFirst` ends the scan at the first valid payment.
 */
export async function findValidPayments(
  connection: Connection,
  p: ValidateParams,
  stopAtFirst = false,
): Promise<FoundPayment[]> {
  const sigs = await connection.getSignaturesForAddress(p.reference, { limit: 20 }, "confirmed");
  const destinationAta = getAssociatedTokenAddressSync(p.mint, p.destinationOwner);
  const found: FoundPayment[] = [];

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

      const minimum = quoteForIntent(p.intent, blockTime).amountBaseUnits;
      if (received <= BigInt(0) || received < minimum) continue;
      found.push({ signature: info.signature, blockTime, amountBaseUnits: received });
      if (stopAtFirst) break;
    } catch {
      continue; // unreadable or not a valid payment for this ticket
    }
  }
  return found;
}

/** The first valid payment for the reference, or null while nothing valid exists yet. */
export async function findValidPayment(connection: Connection, p: ValidateParams): Promise<FoundPayment | null> {
  return (await findValidPayments(connection, p, true))[0] ?? null;
}

/**
 * The record stored in the session. onTime always comes from the confirmed blockTime. discountAppliedBps is the
 * discount tier the payer actually paid for: the cheapest of [price at blockTime, usdc-only price, list price] that
 * does not exceed the amount received. Paying more than the on-time price in the last minutes before the due date
 * (see QUOTE_LOOKAHEAD_SECONDS) therefore records a smaller discount than the rules would have granted, never a
 * bigger one.
 */
export function toPaymentResult(intent: PaymentIntent, found: FoundPayment): PaymentResult {
  const strict = quoteForIntent(intent, found.blockTime);
  let discountAppliedBps = strict.discountBps;
  if (intent.kind === "rent") {
    const list = BigInt(intent.listAmountBaseUnits);
    const tiers: Quote[] = [
      strict,
      quoteForIntent(intent, intent.dueTs + 1),
      { amountBaseUnits: list, discountBps: 0 },
    ].filter((t) => t.amountBaseUnits <= found.amountBaseUnits);
    const best = tiers.reduce((a, b) => (b.amountBaseUnits > a.amountBaseUnits ? b : a), strict);
    discountAppliedBps = best.discountBps;
  }
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
