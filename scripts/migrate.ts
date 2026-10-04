/**
 * Applies the committed migrations in ./drizzle to the database in DATABASE_URL (Neon). Idempotent: drizzle
 * records applied migrations in its own table, so running it twice is safe. Usage: `pnpm db:migrate`.
 * Reads .env.local if present. Never prints the connection string.
 */
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { config as loadDotenv } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set. Create the Neon database (see docs/03-architecture-decisions.md AD-11b) and set it.");
    process.exit(1);
  }
  const db = drizzle(neon(url));
  await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
