/**
 * Records real model responses for the demo scenarios into evals/recordings (used by REPLAY=1).
 * Usage: pnpm exec tsx evals/record.ts   (needs ANTHROPIC_API_KEY in .env.local)
 * Env is read lazily by lib/ai, so loading it here before the first call is enough.
 */
import { config } from 'dotenv';
import { aiMode } from '../lib/ai';
import { recordAllScenarios } from './lib/scenarios';

config({ path: '.env.local', quiet: true });

async function main(): Promise<void> {
  process.env.REPLAY = '0';
  if (aiMode() !== 'live') {
    console.error('No ANTHROPIC_API_KEY configured: cannot record live responses.');
    process.exit(1);
  }
  console.log('Recording live responses...');
  const files = await recordAllScenarios();
  console.log(`Wrote ${files.length} recordings to evals/recordings.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
