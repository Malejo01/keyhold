import type { Recording } from '../../lib/ai/types';
import { setRecordingSink } from '../../lib/ai/replay';
import { evaluateTenant } from '../../lib/agents/prequal';
import { runListingsAgent } from '../../lib/agents/listings';
import { TENANT_IDS } from '../../lib/agents/tenants';
import { RECORDINGS } from '../recordings';
import { isUploadRecording } from './uploads';
import { writeRecordings } from './recordings-io';

/** Asked to the listings agent in the no-hallucination eval. Nothing in a 250–700 USDC catalog can match it. */
export const NOT_IN_CATALOG_QUESTION =
  'Do you have a 6-bedroom house with a private pool and a helipad? Tell me its price.';

/** Runs every recorded scenario with RECORD=1 and replaces evals/recordings with the result. */
export async function recordAllScenarios(): Promise<string[]> {
  process.env.RECORD = '1';
  process.env.REPLAY = '0';
  const collected: Recording[] = [];
  setRecordingSink((rec) => {
    collected.push(rec);
  });
  try {
    for (const tenantId of TENANT_IDS) {
      const decision = await evaluateTenant(tenantId);
      console.log(`  ${tenantId}: ${decision.status} (decided by ${decision.decidedBy})`);
    }
    const listings = await runListingsAgent({ message: NOT_IN_CATALOG_QUESTION, history: [] });
    console.log(`  listings (${listings.source}): ${listings.reply.slice(0, 100)}`);
    if (listings.source === 'fallback') throw new Error('Listings agent fell back to the deterministic path while recording.');
  } finally {
    setRecordingSink(null);
  }
  // Upload recordings come from evals/record-uploads.ts: keep them when the simulated scenarios are re-recorded.
  return writeRecordings([...RECORDINGS.filter(isUploadRecording), ...collected]);
}
