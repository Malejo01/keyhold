// Server-only: database handle. Persistence is optional by design (AD-11b):
//  - DATABASE_URL set   -> Neon Postgres over HTTP (@neondatabase/serverless + drizzle neon-http).
//  - DATABASE_URL unset -> getDb() returns null and the routes fall back to the client-held HMAC session.
// Tests inject an in-process PGlite instance with setDbForTests(); the app never imports PGlite.
//
// neon-http runs one statement per HTTP request and has no interactive transactions, so every helper in
// lib/db/store.ts is a single atomic statement (INSERT ... ON CONFLICT, UPDATE ... WHERE) by design.
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: Db | null = null;
let override: Db | null | undefined;
let warned = false;

/** Returns the database, or null when persistence is off (no DATABASE_URL). */
export function getDb(): Db | null {
  if (override !== undefined) return override;
  if (cached) return cached;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    if (!warned) {
      warned = true;
      console.warn(
        '[db] DATABASE_URL is not set: persistence is OFF. Sessions use the signed client-held blob only ' +
          '(no replay protection beyond one instance, no payment idempotency across instances).',
      );
    }
    return null;
  }
  cached = drizzle(neon(url), { schema }) as unknown as Db;
  return cached;
}

export function persistenceEnabled(): boolean {
  return getDb() !== null;
}

/** Test hook. Pass a PGlite-backed drizzle instance, null to force fallback mode, undefined to reset. */
export function setDbForTests(db: Db | null | undefined): void {
  override = db;
  warned = false;
}
