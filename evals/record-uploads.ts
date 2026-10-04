/**
 * Records the multimodal extraction of the sample uploads (seed/docs/samples) into evals/recordings, keyed by agent +
 * sha256 of the file bytes. Existing recordings are kept. Live calls: 2 per bundle, 8 bundles = 16 (plus retries).
 * Usage: pnpm exec tsx evals/record-uploads.ts   (needs the key of AI_PROVIDER in .env.local)
 */
import { config } from 'dotenv';
import { aiDescribe, aiMode, selectedProviderName } from '../lib/ai';
import { recordUploadScenarios } from './lib/uploads';

config({ path: '.env.local', quiet: true });

async function main(): Promise<void> {
  process.env.REPLAY = '0';
  process.env.AI_STRICT_LIVE = '1';
  process.env.AI_MEMO = '0';
  if (aiMode() !== 'live') {
    console.error(`No API key configured for provider "${selectedProviderName()}": cannot record live responses.`);
    process.exit(1);
  }
  console.log(`Recording upload extractions with ${aiDescribe()}...`);
  const files = await recordUploadScenarios();
  console.log(`Wrote ${files.length} recordings to evals/recordings.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
