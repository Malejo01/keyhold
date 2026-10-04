// Server-only: reference rows every FK depends on (demo agency + demo tenants). Idempotent, so it can run
// from scripts/seed.ts and, lazily, before the first write of a server instance. Simulated data only.
import { agencies, tenants } from './schema';
import type { Db } from './client';
import tenantSeed from '../../seed/tenants.json';

export const DEMO_AGENCY_ID = 'agency-demo';

const ready = new WeakMap<object, Promise<void>>();

export async function seedReferenceData(db: Db, wallets: Partial<Record<string, string>> = {}): Promise<void> {
  await db
    .insert(agencies)
    .values({ id: DEMO_AGENCY_ID, name: 'Demo agency (simulated)', walletAddress: wallets[DEMO_AGENCY_ID] ?? null })
    .onConflictDoNothing();
  await db
    .insert(tenants)
    .values(
      tenantSeed.tenants.map((t) => ({
        id: t.id,
        displayName: t.displayName,
        walletAddress: wallets[t.id] ?? null,
      })),
    )
    .onConflictDoNothing();
}

/** Seeds once per db handle and instance; a failure is not cached so the next request retries. */
export function ensureReferenceData(db: Db): Promise<void> {
  let p = ready.get(db);
  if (!p) {
    p = seedReferenceData(db).catch((err) => {
      ready.delete(db);
      throw err;
    });
    ready.set(db, p);
  }
  return p;
}
