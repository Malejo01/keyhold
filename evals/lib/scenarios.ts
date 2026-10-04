import type { Lang } from '../../lib/contracts';
import type { Recording } from '../../lib/ai/types';
import { setRecordingSink } from '../../lib/ai/replay';
import { evaluateTenant } from '../../lib/agents/prequal';
import { runListingsAgent } from '../../lib/agents/listings';
import { TENANT_IDS } from '../../lib/agents/tenants';
import { RECORDINGS } from '../recordings';
import { isUploadRecording } from './uploads';
import { CHIP_TEXT } from '../../lib/i18n/chips';
import { writeRecordings } from './recordings-io';

/** Asked to the listings agent in the no-hallucination eval. Nothing in a 250–700 USDC catalog can match it. */
export const NOT_IN_CATALOG_QUESTION =
  'Do you have a 6-bedroom house with a private pool and a helipad? Tell me its price.';
export const NOT_IN_CATALOG_QUESTION_ES =
  '¿Tenés una casa de 6 dormitorios con pileta privada y helipuerto? Decime el precio.';

/** Listings scenarios recorded for REPLAY (keyed by user text, so one per language). Extraction is language-neutral. */
export const LISTINGS_SCENARIOS: ReadonlyArray<{ label: string; message: string; lang: Lang }> = [
  { label: 'en-not-in-catalog', message: NOT_IN_CATALOG_QUESTION, lang: 'en' },
  { label: 'es-not-in-catalog', message: NOT_IN_CATALOG_QUESTION_ES, lang: 'es' },
  { label: 'en-chip-search', message: CHIP_TEXT.en[0], lang: 'en' },
  { label: 'es-chip-search', message: CHIP_TEXT.es[0], lang: 'es' },
];

async function recordListings(only?: readonly string[]): Promise<void> {
  for (const s of LISTINGS_SCENARIOS) {
    if (only && !only.includes(s.label)) continue;
    const turn = await runListingsAgent({ message: s.message, history: [], lang: s.lang, label: s.label });
    console.log(`  listings ${s.label} (${turn.source}): ${turn.reply.replace(/\s+/g, ' ').slice(0, 110)}`);
    if (turn.source === 'fallback') throw new Error(`Listings agent fell back to the deterministic path while recording ${s.label}.`);
  }
}

/** Runs the scenarios with RECORD=1. `listingsOnly` merges the listings recordings into the existing ones. */
export async function recordAllScenarios(opts: { listingsOnly?: boolean; only?: readonly string[] } = {}): Promise<string[]> {
  process.env.RECORD = '1';
  process.env.REPLAY = '0';
  const collected: Recording[] = [];
  setRecordingSink((rec) => {
    collected.push(rec);
  });
  try {
    if (!opts.listingsOnly) {
      for (const tenantId of TENANT_IDS) {
        const decision = await evaluateTenant(tenantId);
        console.log(`  ${tenantId}: ${decision.status} (decided by ${decision.decidedBy})`);
      }
    }
    await recordListings(opts.only);
  } finally {
    setRecordingSink(null);
  }
  // Upload recordings come from evals/record-uploads.ts: keep them when the simulated scenarios are re-recorded.
  return writeRecordings([...RECORDINGS.filter(isUploadRecording), ...collected], { merge: opts.listingsOnly });
}
