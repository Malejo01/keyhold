import { Connection } from "@solana/web3.js";

/** Genesis hash of Solana devnet. Used to refuse any other cluster. */
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

let cached: Connection | undefined;
let devnetVerified: Promise<void> | undefined;

export function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL?.trim() || DEFAULT_RPC_URL;
}

/** Synchronous guard: configuration must say devnet and the URL must not look like mainnet/testnet. */
function assertDevnetConfig(url: string): void {
  const cluster = process.env.SOLANA_CLUSTER?.trim();
  if (cluster && cluster !== "devnet") {
    throw new Error(`Refusing to run: SOLANA_CLUSTER is "${cluster}", only "devnet" is allowed.`);
  }
  if (/mainnet|testnet/i.test(url)) {
    throw new Error("Refusing to run: SOLANA_RPC_URL does not look like a devnet endpoint.");
  }
}

/** Shared devnet connection (confirmed commitment). Throws if the config is not devnet. */
export function getConnection(): Connection {
  const url = getRpcUrl();
  assertDevnetConfig(url);
  cached ??= new Connection(url, "confirmed");
  return cached;
}

/**
 * Returns the connection after checking once, against the RPC node itself, that its genesis hash is
 * devnet's. Use this before sending any transaction.
 */
export async function getDevnetConnection(): Promise<Connection> {
  const connection = getConnection();
  devnetVerified ??= connection.getGenesisHash().then((hash) => {
    if (hash !== DEVNET_GENESIS_HASH) {
      throw new Error("Refusing to run: the RPC endpoint is not Solana devnet.");
    }
  });
  try {
    await devnetVerified;
  } catch (error) {
    devnetVerified = undefined; // allow a retry after a transient network failure
    throw error;
  }
  return connection;
}
