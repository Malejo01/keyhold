import { getDevnetConnection } from "./connection";
import { MEMO_PROGRAM_ID } from "./transfer";

const TRAILING_HASH_RE = /:([0-9a-f]{64})$/;

/**
 * Fetches the confirmed tx and returns the trailing sha256 hex of its Tuki memo
 * (`tuki:lease:...:<sha256hex>`), or null if the tx or a valid memo is not found.
 */
export async function readMemoHash(signature: string): Promise<string | null> {
  const connection = await getDevnetConnection();
  const tx = await connection.getParsedTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || tx.meta?.err) return null;

  for (const ix of tx.transaction.message.instructions) {
    if (!ix.programId.equals(MEMO_PROGRAM_ID)) continue;
    // Parsed memo instructions expose the memo as a plain string.
    const memo = "parsed" in ix && typeof ix.parsed === "string" ? ix.parsed : null;
    if (memo?.startsWith("tuki:")) {
      const match = TRAILING_HASH_RE.exec(memo);
      if (match) return match[1];
    }
  }
  return null;
}
