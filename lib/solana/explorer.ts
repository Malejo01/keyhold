const CLUSTER_QS = "?cluster=devnet";

function base(): string {
  return (process.env.NEXT_PUBLIC_EXPLORER_URL?.trim() || "https://explorer.solana.com").replace(/\/+$/, "");
}

export function explorerTxUrl(signature: string): string {
  return `${base()}/tx/${signature}${CLUSTER_QS}`;
}

export function explorerAddressUrl(address: string): string {
  return `${base()}/address/${address}${CLUSTER_QS}`;
}
