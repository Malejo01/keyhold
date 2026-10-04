/**
 * Seeds the reference rows the foreign keys need: the demo agency and the 3 demo tenants (Ana, Bruno, Carla).
 * Idempotent. Properties are NOT seeded: they stay in seed/properties.json (see lib/db/schema.ts).
 * Wallet pubkeys are filled in when the demo keypairs exist in the environment (public keys only).
 * Usage: `pnpm db:seed` after `pnpm db:migrate`. The app also seeds these rows lazily on first write.
 */
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { config as loadDotenv } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const schema = await import("../lib/db/schema");
  const { seedReferenceData, DEMO_AGENCY_ID } = await import("../lib/db/reference");
  const { loadKeypair } = await import("../lib/solana/keys");

  const wallets: Record<string, string> = {};
  const names = [["agency", DEMO_AGENCY_ID], ["ana", "ana"], ["bruno", "bruno"], ["carla", "carla"]] as const;
  for (const [keyName, rowId] of names) {
    try {
      wallets[rowId] = loadKeypair(keyName).publicKey.toBase58();
    } catch {
      // Keypair not configured in this environment: leave the wallet empty.
    }
  }

  const db = drizzle(neon(url), { schema });
  // neon-http typing differs slightly from the shared Db alias; the calls are plain inserts.
  await seedReferenceData(db as never, wallets);
  console.log("Reference data seeded.");
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
