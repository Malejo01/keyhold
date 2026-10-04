import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { type Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { base58Encode } from "./base58";
import { getDevnetConnection } from "./connection";
import { PAYMENT_DECIMALS, getPaymentMint, platformKeypair } from "./keys";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
/** Memo program limit is 566 bytes for a tx without extra signers; ours are ~130. */
const MAX_MEMO_BYTES = 566;

/** Memo v2 instruction built by hand (no extra dependency). No signer accounts. */
export function memoInstruction(memo: string): TransactionInstruction {
  const data = Buffer.from(memo, "utf8");
  if (data.length > MAX_MEMO_BYTES) throw new Error("Memo too long.");
  return new TransactionInstruction({ keys: [], programId: MEMO_PROGRAM_ID, data });
}

export interface TransferParams {
  /** Token owner that authorises the transfer (tenant keypair). */
  owner: Keypair;
  /** Owner of the destination token account (platform custody or landlord). */
  destination: PublicKey;
  amountBaseUnits: bigint;
  memo: string;
  /**
   * Optional Solana Pay reference, added as a read-only non-signer key on the transfer. Used when Solana Pay is on, so
   * the custodial button and the QR flow share one reference per payment slot and each can see the other's payment.
   */
  reference?: PublicKey;
}

/**
 * A fully built and signed transfer that has NOT been sent yet. Building has no network side effect (only reads:
 * the blockhash), so any failure before this object exists means nothing reached the chain. The signature is
 * known up front, which lets the caller persist it BEFORE sending and reconcile an ambiguous send later.
 */
export interface PreparedTransfer {
  /** Base58 signature of the fee payer (the transaction id). */
  signature: string;
  /** Wire-format signed transaction, base64. */
  serializedTx: string;
  blockhash: string;
  /** Last block height at which the blockhash is valid; past it the tx can never land. */
  lastValidBlockHeight: number;
}

/**
 * One transaction: [create destination ATA if missing] + transferChecked + Memo.
 * The platform keypair is the fee payer; the owner signs as token authority. NOTHING is sent here.
 */
export async function buildSignedTransfer(params: TransferParams): Promise<PreparedTransfer> {
  const { owner, destination, amountBaseUnits, memo, reference } = params;
  if (amountBaseUnits <= BigInt(0)) throw new RangeError("amount must be > 0");

  const connection = await getDevnetConnection();
  const feePayer = platformKeypair();
  const mint = getPaymentMint();
  const source = getAssociatedTokenAddressSync(mint, owner.publicKey);
  const destinationAta = getAssociatedTokenAddressSync(mint, destination);

  const transfer = createTransferCheckedInstruction(source, mint, destinationAta, owner.publicKey, amountBaseUnits, PAYMENT_DECIMALS);
  if (reference) transfer.keys.push({ pubkey: reference, isSigner: false, isWritable: false });

  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(feePayer.publicKey, destinationAta, destination, mint),
    transfer,
    memoInstruction(memo),
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = feePayer.publicKey;
  tx.sign(feePayer, owner);

  const feePayerSignature = tx.signatures[0]?.signature;
  if (!feePayerSignature) throw new Error("Transaction was not signed by the fee payer.");
  return {
    signature: base58Encode(feePayerSignature),
    serializedTx: tx.serialize().toString("base64"),
    blockhash,
    lastValidBlockHeight,
  };
}

/**
 * Sends a prepared transfer and resolves once it is confirmed. A failure here is AMBIGUOUS (the tx may or may not
 * have landed): never assume it was not sent, check `getTransferStatus` with the stored signature instead.
 */
export async function sendPreparedTransfer(prepared: PreparedTransfer): Promise<void> {
  const connection = await getDevnetConnection();
  const signature = await connection.sendRawTransaction(Buffer.from(prepared.serializedTx, "base64"));
  // The stored signature is what reconciliation relies on: it must be the one the cluster knows.
  if (signature !== prepared.signature) throw new Error("Signature mismatch between the prepared and the sent transaction.");
  const confirmation = await connection.confirmTransaction(
    { signature, blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw new Error(`Transaction ${signature} failed on chain: ${JSON.stringify(confirmation.value.err)}`);
  }
}

/** Build, sign, send and confirm in one go (scripts). Returns the signature. */
export async function sendTokenTransferWithMemo(params: TransferParams): Promise<string> {
  const prepared = await buildSignedTransfer(params);
  await sendPreparedTransfer(prepared);
  return prepared.signature;
}

/**
 * Safety margin (blocks, ~0.4 s each) added to lastValidBlockHeight before a tx is declared dead, so a lagging
 * RPC node cannot make us release a payment that is about to land.
 */
const EXPIRY_MARGIN_BLOCKS = 40;

export type TransferStatus = "confirmed" | "failed" | "pending" | "expired";

/**
 * Where is a previously stored transfer?
 *  - confirmed: landed without error (money moved)
 *  - failed:    landed with an error (no tokens moved)
 *  - expired:   unknown to the cluster and its blockhash can no longer be used: it can never land
 *  - pending:   unknown or only processed, and could still land
 * Throws on RPC errors: the caller must then keep the claim.
 */
export async function getTransferStatus(signature: string, lastValidBlockHeight: number): Promise<TransferStatus> {
  const connection = await getDevnetConnection();
  const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
  const status = value[0];
  if (status) {
    if (status.err) return "failed";
    if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return "confirmed";
    return "pending";
  }
  const height = await connection.getBlockHeight("confirmed");
  return height > lastValidBlockHeight + EXPIRY_MARGIN_BLOCKS ? "expired" : "pending";
}

/** Waits for the confirmed tx's blockTime (unix seconds). Never uses local time. */
export async function fetchBlockTime(signature: string, attempts = 12): Promise<number> {
  const connection = await getDevnetConnection();
  for (let i = 0; i < attempts; i++) {
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (tx?.blockTime) return tx.blockTime;
    if (tx?.slot) {
      const t = await connection.getBlockTime(tx.slot).catch(() => null);
      if (t) return t;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Could not read blockTime for confirmed transaction ${signature}.`);
}
