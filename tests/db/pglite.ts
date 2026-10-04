// Test helper: an in-process Postgres (PGlite, WASM) with the committed drizzle migrations applied.
// Same SQL as Neon, no service container and no network.
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  return { db: db as unknown as Db, close: () => client.close() };
}
