import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { type Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
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
 * One transaction: [create destination ATA if missing] + transferChecked + Memo.
 * The platform keypair is the fee payer; the owner signs as token authority.
 * Resolves once the tx is confirmed. Returns the signature.
 */
export async function sendTokenTransferWithMemo(params: TransferParams): Promise<string> {
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

  const signature = await connection.sendRawTransaction(tx.serialize());
  const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  if (confirmation.value.err) {
    throw new Error(`Transaction ${signature} failed on chain: ${JSON.stringify(confirmation.value.err)}`);
  }
  return signature;
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
