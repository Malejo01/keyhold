import { Keypair, PublicKey } from "@solana/web3.js";
import type { TenantId } from "../contracts";

// Server-only: never import from a Client Component. Secret keys come from env as JSON arrays of
// 64 bytes and are never logged or returned. (`server-only` is not installed; this guard stands in.)
if (typeof window !== "undefined") {
  throw new Error("lib/solana/keys.ts must only be imported on the server.");
}

export type KeyName = "platform" | "landlord" | "agency" | TenantId;

const ENV_BY_KEY: Record<KeyName, string> = {
  platform: "PLATFORM_SECRET_KEY",
  landlord: "LANDLORD_SECRET_KEY",
  agency: "AGENCY_SECRET_KEY",
  ana: "TENANT_ANA_SECRET_KEY",
  bruno: "TENANT_BRUNO_SECRET_KEY",
  carla: "TENANT_CARLA_SECRET_KEY",
};

export function loadKeypair(name: KeyName): Keypair {
  const envName = ENV_BY_KEY[name];
  const raw = process.env[envName];
  if (!raw) throw new Error(`${envName} is not set. Run \`pnpm setup:devnet\`.`);
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    // Deliberately do not include the underlying error: it could echo key material.
    throw new Error(`${envName} is not a valid JSON array secret key.`);
  }
}

export const platformKeypair = () => loadKeypair("platform");
export const landlordKeypair = () => loadKeypair("landlord");
export const tenantKeypair = (tenant: TenantId) => loadKeypair(tenant);

/**
 * Public keys of every key the SERVER can sign with on its own authority: platform (custody + fee payer), landlord and
 * agency. None of them may ever be accepted as the paying wallet or token authority of a Solana Pay payment: the
 * server's own signature must never be enough to move custody or landlord funds. Unset optional keys are skipped.
 * The demo tenant keys (ana, bruno, carla) are deliberately NOT in this list: they stand in for the tenant's own
 * wallet (the e2e script and the custodial button sign with them) and hold only the tenant's own test tokens.
 */
export function serverHeldPublicKeys(): PublicKey[] {
  const keys: PublicKey[] = [];
  for (const name of ["platform", "landlord", "agency"] as const) {
    if (!process.env[ENV_BY_KEY[name]]) {
      if (name === "agency") continue;
      throw new Error(`${ENV_BY_KEY[name]} is not set. Run \`pnpm setup:devnet\`.`);
    }
    keys.push(loadKeypair(name).publicKey);
  }
  return keys;
}

/** tUSDC mint address, written to PAYMENT_MINT by scripts/setup-devnet.ts. */
export function getPaymentMint(): PublicKey {
  const raw = process.env.PAYMENT_MINT?.trim();
  if (!raw) throw new Error("PAYMENT_MINT is not set. Run `pnpm setup:devnet`.");
  return new PublicKey(raw);
}

export const PAYMENT_DECIMALS = 6;
