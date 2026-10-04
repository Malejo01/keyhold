/**
 * Devnet setup for the demo. Idempotent: safe to run as many times as needed.
 *
 * Step 1: make sure every demo keypair exists in .env.local and print the addresses.
 *         The platform wallet is the fee payer of every transaction, so only it needs SOL.
 *         If it has none, try one airdrop; if that fails, print the address and stop.
 * Step 2: create the tUSDC mint (6 decimals, authority = platform) unless PAYMENT_MINT is already
 *         set, create token accounts for platform (custody), landlord and the 3 tenants, and mint
 *         1,000,000 tUSDC to every tenant whose balance is below 100,000.
 *
 * Devnet only. .env.local is gitignored; never commit it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  TokenAccountNotFoundError,
  createAssociatedTokenAccountIdempotentInstruction,
  createMint,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { config as loadDotenv } from "dotenv";

const ENV_PATH = resolve(process.cwd(), ".env.local");
loadDotenv({ path: ENV_PATH, quiet: true });

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const DECIMALS = 6;
// BigInt() instead of literals: tsconfig targets ES2017.
const ONE_TOKEN = BigInt(10 ** DECIMALS);
const MIN_TENANT_BALANCE = BigInt(100_000) * ONE_TOKEN;
const TENANT_TOP_UP = BigInt(1_000_000) * ONE_TOKEN;

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

async function ensurePlatformFunds(connection: Connection, platform: PublicKey): Promise<boolean> {
  let lamports = await connection.getBalance(platform);
  console.log(`\nPlatform balance: ${lamports / LAMPORTS_PER_SOL} SOL`);
  if (lamports > 0) return true;

  console.log("Platform has no SOL. Trying one devnet airdrop of 1 SOL...");
  try {
    const signature = await connection.requestAirdrop(platform, LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    lamports = await connection.getBalance(platform);
    console.log(`Airdrop confirmed. Platform balance: ${lamports / LAMPORTS_PER_SOL} SOL`);
    return lamports > 0;
  } catch (error) {
    console.log(`Airdrop failed (${error instanceof Error ? error.message.split("\n")[0] : "unknown error"}).`);
    console.log(`\nThe platform wallet pays every fee. Request devnet SOL for:\n  ${platform.toBase58()}\nat https://faucet.solana.com and run this script again.`);
    return false;
  }
}

async function ensureMint(connection: Connection, platform: Keypair): Promise<PublicKey> {
  const existing = process.env.PAYMENT_MINT?.trim();
  if (existing) {
    const mint = new PublicKey(existing);
    try {
      const info = await getMint(connection, mint);
      if (info.decimals !== DECIMALS) throw new Error(`PAYMENT_MINT has ${info.decimals} decimals, expected ${DECIMALS}.`);
      console.log(`\ntUSDC mint (existing): ${mint.toBase58()}`);
      return mint;
    } catch (error) {
      if (!(error instanceof TokenAccountNotFoundError)) throw error;
      console.log(`\nPAYMENT_MINT ${existing} does not exist on this cluster; creating a new one.`);
    }
  }
  const mint = await createMint(connection, platform, platform.publicKey, null, DECIMALS);
  upsertEnv({ PAYMENT_MINT: mint.toBase58() });
  process.env.PAYMENT_MINT = mint.toBase58();
  console.log(`\ntUSDC mint (created): ${mint.toBase58()}`);
  return mint;
}

async function tokenBalance(connection: Connection, ata: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(connection, ata)).amount;
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) return BigInt(0);
    throw error;
  }
}

async function main() {
  const keypairs = ensureKeypairs();
  const connection = new Connection(RPC_URL, "confirmed");

  if (/mainnet|testnet/i.test(RPC_URL) || (await connection.getGenesisHash()) !== DEVNET_GENESIS_HASH) {
    throw new Error("Refusing to run: SOLANA_RPC_URL is not Solana devnet.");
  }

  console.log("Demo wallets (devnet):");
  for (const name of KEY_VARS) {
    console.log(`  ${name.replace("_SECRET_KEY", "").padEnd(14)} ${keypairs[name].publicKey.toBase58()}`);
  }

  const platform = keypairs.PLATFORM_SECRET_KEY;
  if (!(await ensurePlatformFunds(connection, platform.publicKey))) return;

  // ---- Step 2: tUSDC mint, token accounts, tenant balances ----
  const mint = await ensureMint(connection, platform);

  const owners: Record<string, PublicKey> = {
    platform: platform.publicKey,
    landlord: keypairs.LANDLORD_SECRET_KEY.publicKey,
    ana: keypairs.TENANT_ANA_SECRET_KEY.publicKey,
    bruno: keypairs.TENANT_BRUNO_SECRET_KEY.publicKey,
    carla: keypairs.TENANT_CARLA_SECRET_KEY.publicKey,
  };
  const atas = Object.fromEntries(
    Object.entries(owners).map(([name, owner]) => [name, getAssociatedTokenAddressSync(mint, owner)]),
  ) as Record<string, PublicKey>;

  // Idempotent create: no-op for accounts that already exist. One tx for all five.
  const tx = new Transaction();
  for (const [name, owner] of Object.entries(owners)) {
    tx.add(createAssociatedTokenAccountIdempotentInstruction(platform.publicKey, atas[name], owner, mint));
  }
  await sendAndConfirmTransaction(connection, tx, [platform]);

  const tenantNames = ["ana", "bruno", "carla"] as const;
  const mintTx = new Transaction();
  const toppedUp: string[] = [];
  for (const name of tenantNames) {
    if ((await tokenBalance(connection, atas[name])) < MIN_TENANT_BALANCE) {
      mintTx.add(createMintToInstruction(mint, atas[name], platform.publicKey, TENANT_TOP_UP, [], undefined));
      toppedUp.push(name);
    }
  }
  if (mintTx.instructions.length > 0) {
    await sendAndConfirmTransaction(connection, mintTx, [platform]);
    console.log(`Minted 1,000,000 tUSDC to: ${toppedUp.join(", ")}`);
  } else {
    console.log("All tenants already hold at least 100,000 tUSDC.");
  }

  console.log("\nToken accounts and balances (tUSDC):");
  for (const name of Object.keys(owners)) {
    const balance = await tokenBalance(connection, atas[name]);
    console.log(`  ${name.padEnd(9)} ${atas[name].toBase58()}  ${(Number(balance) / 10 ** DECIMALS).toLocaleString("en-US")}`);
  }
  console.log("\nDone. PAYMENT_MINT is saved in .env.local.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
