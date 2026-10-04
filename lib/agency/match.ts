// JSON-RPC batch responses can come back in any order (public devnet does this), and web3.js pairs them by array
// index. Pair each transaction with the signature it actually carries instead, so amounts never cross between leases.

/** Pairs every non-null transaction with the wanted entry whose signature is the transaction's first signature. */
export function matchBySignature<W extends { signature: string }, T extends { transaction: { signatures: string[] } }>(
  wanted: W[],
  txs: Array<T | null>,
): Array<[W, T]> {
  const bySig = new Map(wanted.map((w) => [w.signature, w] as const));
  const out: Array<[W, T]> = [];
  for (const tx of txs) {
    if (!tx) continue;
    const w = bySig.get(tx.transaction.signatures[0]);
    if (w) out.push([w, tx]);
  }
  return out;
}
