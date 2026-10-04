/**
 * Records real model responses for the demo scenarios into evals/recordings (used by REPLAY=1).
 * Usage: pnpm exec tsx evals/record.ts [--listings [label,label]]   (needs the key of AI_PROVIDER in .env.local: GEMINI_API_KEY by default)
 * Recordings store provider + model; replay keys depend only on (agent, input), so they stay valid across providers.
 * Env is read lazily by lib/ai, so loading it here before the first call is enough.
 */
import { config } from 'dotenv';
import { aiDescribe, aiMode, selectedProviderName } from '../lib/ai';
import { recordAllScenarios } from './lib/scenarios';

config({ path: '.env.local', quiet: true });

async function main(): Promise<void> {
  process.env.REPLAY = '0';
  process.env.AI_STRICT_LIVE = '1';
  process.env.AI_MEMO = '0';
  if (aiMode() !== 'live') {
    console.error(`No API key configured for provider "${selectedProviderName()}": cannot record live responses.`);
    process.exit(1);
  }
  // --listings: only the listings scenarios (no extraction calls), merged into the existing recordings.
  const args = process.argv.slice(2);
  const listingsIdx = args.indexOf('--listings');
  const listingsOnly = listingsIdx >= 0;
  const only = listingsOnly && args[listingsIdx + 1] ? args[listingsIdx + 1].split(',') : undefined;
  console.log(`Recording live responses with ${aiDescribe()}${listingsOnly ? ' (listings only)' : ''}...`);
  const files = await recordAllScenarios({ listingsOnly, only });
  console.log(`Wrote ${files.length} recordings to evals/recordings.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
