/**
 * Devnet setup for the demo. Idempotent: safe to run as many times as needed.
 *
 * Step 1: make sure every demo keypair exists in .env.local and print the platform address.
 *         Stops here while the platform wallet has no SOL (ask the faucet, then rerun).
 * Step 2: mint tUSDC, create token accounts and fund the tenants (added in task F0-03b).
 *
 * Devnet only. .env.local is gitignored; never commit it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

const ENV_PATH = resolve(process.cwd(), ".env.local");
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

const KEY_VARS = [
  "PLATFORM_SECRET_KEY",
  "LANDLORD_SECRET_KEY",
  "AGENCY_SECRET_KEY",
  "TENANT_ANA_SECRET_KEY",
  "TENANT_BRUNO_SECRET_KEY",
  "TENANT_CARLA_SECRET_KEY",
] as const;
type KeyVar = (typeof KEY_VARS)[number];

function readEnvFile(): Map<string, string> {
  const env = new Map<string, string>();
  if (!existsSync(ENV_PATH)) return env;
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env.set(match[1], match[2]);
  }
  return env;
}

/** Sets or replaces KEY=value lines in .env.local, leaving every other line untouched. */
export function upsertEnv(values: Record<string, string>): void {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8").split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) lines[index] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  writeFileSync(ENV_PATH, lines.join("\n").replace(/\n*$/, "\n"));
}

export function ensureKeypairs(): Record<KeyVar, Keypair> {
  const env = readEnvFile();
  const created: Record<string, string> = {};
  const keypairs = {} as Record<KeyVar, Keypair>;
  for (const name of KEY_VARS) {
    const stored = env.get(name);
    if (stored) {
      keypairs[name] = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored)));
    } else {
      keypairs[name] = Keypair.generate();
      created[name] = JSON.stringify(Array.from(keypairs[name].secretKey));
    }
  }
  if (Object.keys(created).length > 0) upsertEnv(created);
  return keypairs;
}

async function main() {
  const keypairs = ensureKeypairs();
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("Demo wallets (devnet):");
  for (const name of KEY_VARS) {
    console.log(`  ${name.replace("_SECRET_KEY", "").padEnd(14)} ${keypairs[name].publicKey.toBase58()}`);
  }

  const platform = keypairs.PLATFORM_SECRET_KEY.publicKey;
  const lamports = await connection.getBalance(platform);
  console.log(`\nPlatform balance: ${lamports / LAMPORTS_PER_SOL} SOL`);

  if (lamports === 0) {
    console.log(`\nThe platform wallet pays every fee. Request devnet SOL for:\n  ${platform.toBase58()}\nat https://faucet.solana.com and run this script again.`);
    return;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
