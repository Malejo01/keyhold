#!/usr/bin/env node
// Creates the two DEVNET-only keypairs used by .github/workflows/deploy-devnet.yml, if they do not exist yet:
//   .keys/devnet-deployer.json        deployer = fee payer + program upgrade authority
//   .keys/rental_escrow-program.json  program keypair = the stable program id
// Format: the solana-keygen JSON array of 64 bytes (what the Actions secrets expect).
// Prints ONLY the public keys. Never prints, logs or returns secret bytes. Existing files are never overwritten.
// `.keys/` is gitignored (`/.keys/` in .gitignore). Usage: node scripts/anchor/make-deploy-keys.mjs
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const keysDir = join(root, ".keys");

const FILES = [
  { label: "deployer (upgrade authority)", file: "devnet-deployer.json" },
  { label: "rental_escrow program id", file: "rental_escrow-program.json" },
];

function loadPublicKey(path) {
  try {
    const bytes = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")));
    return Keypair.fromSecretKey(bytes).publicKey.toBase58();
  } catch {
    // Deliberately no underlying error: it could echo key material.
    throw new Error(`${path} exists but is not a valid 64-byte JSON keypair. Inspect it by hand; it was not modified.`);
  }
}

mkdirSync(keysDir, { recursive: true, mode: 0o700 });

for (const { label, file } of FILES) {
  const path = join(keysDir, file);
  let status = "existing";
  if (!existsSync(path)) {
    const kp = Keypair.generate();
    // flag "wx": fail instead of overwriting if the file appeared meanwhile. mode 0600 where the OS supports it.
    writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600, flag: "wx" });
    status = "created";
  }
  try {
    chmodSync(path, 0o600); // no-op on Windows beyond the read-only bit
  } catch {
    /* best effort */
  }
  console.log(`${label}: ${loadPublicKey(path)}  (.keys/${file}, ${status})`);
}
