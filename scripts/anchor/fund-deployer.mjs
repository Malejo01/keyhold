#!/usr/bin/env node
// Transfers devnet SOL from the platform wallet (PLATFORM_SECRET_KEY in .env.local) to the deployer pubkey read
// from .keys/devnet-deployer.json. DEVNET ONLY: refuses unless the RPC URL names devnet AND the cluster's genesis
// hash is devnet's. Never prints secret material. Prints the signature, the explorer link and both balances.
// Usage: node scripts/anchor/fund-deployer.mjs [SOL]   (default 4)
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: join(root, ".env.local"), quiet: true });

function fail(msg) {
  console.error(`fund-deployer: ${msg}`);
  process.exit(1);
}

function keypairFrom(raw, what) {
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    // Deliberately no underlying error: it could echo key material.
    fail(`${what} is not a valid 64-byte JSON array keypair.`);
  }
}

const sol = Number(process.argv[2] ?? "4");
if (!Number.isFinite(sol) || sol <= 0 || sol > 10) fail("amount must be a number of SOL in (0, 10].");
const lamports = Math.round(sol * LAMPORTS_PER_SOL);

const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
let host;
try {
  host = new URL(rpcUrl).hostname;
} catch {
  fail("SOLANA_RPC_URL is not a valid URL.");
}
if (!host.includes("devnet") || host.includes("mainnet")) fail(`refusing: RPC host "${host}" is not a devnet endpoint.`);

const platformRaw = process.env.PLATFORM_SECRET_KEY;
if (!platformRaw) fail("PLATFORM_SECRET_KEY is not set in .env.local.");
const platform = keypairFrom(platformRaw, "PLATFORM_SECRET_KEY");

let deployerRaw;
try {
  deployerRaw = readFileSync(join(root, ".keys", "devnet-deployer.json"), "utf8");
} catch {
  fail("missing .keys/devnet-deployer.json. Run `node scripts/anchor/make-deploy-keys.mjs` first.");
}
const deployer = keypairFrom(deployerRaw, ".keys/devnet-deployer.json").publicKey;

const connection = new Connection(rpcUrl, "confirmed");
const genesis = await connection.getGenesisHash();
if (genesis !== DEVNET_GENESIS_HASH) fail(`refusing: genesis hash ${genesis} is not devnet's.`);

const before = await connection.getBalance(platform.publicKey);
if (before < lamports + 0.01 * LAMPORTS_PER_SOL) {
  fail(`platform balance ${before / LAMPORTS_PER_SOL} SOL is too low to send ${sol} SOL.`);
}

const tx = new Transaction().add(
  SystemProgram.transfer({ fromPubkey: platform.publicKey, toPubkey: deployer, lamports }),
);
const signature = await sendAndConfirmTransaction(connection, tx, [platform], { commitment: "confirmed" });

const [platformAfter, deployerAfter] = await Promise.all([
  connection.getBalance(platform.publicKey),
  connection.getBalance(deployer),
]);

console.log(`sent ${sol} SOL (devnet) platform ${platform.publicKey.toBase58()} -> deployer ${deployer.toBase58()}`);
console.log(`signature: ${signature}`);
console.log(`explorer:  https://explorer.solana.com/tx/${signature}?cluster=devnet`);
console.log(`platform balance: ${platformAfter / LAMPORTS_PER_SOL} SOL`);
console.log(`deployer balance: ${deployerAfter / LAMPORTS_PER_SOL} SOL`);
