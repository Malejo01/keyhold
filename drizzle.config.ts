// drizzle-kit config: only used to GENERATE migrations (`pnpm db:generate`). Applying them is done by
// scripts/migrate.ts (`pnpm db:migrate`), which uses the same driver as the app.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
});
