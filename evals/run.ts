/**
 * Product-agent evals (pnpm evals).
 *  - Ana = APPROVED, Bruno = NEEDS_INFO(expired_payslip) by prequal, Carla = NEEDS_INFO(name_mismatch) by crosscheck,
 *    RUNS times each.
 *  - Listings never invents a property that is not in the catalog.
 *  - Orchestrator smoke flow for Ana: SEARCH -> VISIT -> DOCUMENTS -> CONTRACT -> PAYMENT -> ACTIVE.
 * Mode: REPLAY=1 serves evals/recordings; otherwise live when the AI_PROVIDER key is set (GEMINI_API_KEY by default),
 * replay if not. Live runs are strict (no recording fallback, no memo) and spaced to respect free-tier rate limits.
 */
import { config } from 'dotenv';
import type { FinalDecision, PaymentResult, SessionState, TenantId } from '../lib/contracts';
import { aiDescribe, aiMode } from '../lib/ai';
import { RECORDINGS } from './recordings';
import { loadCatalog } from '../lib/agents/catalog';
import { runListingsAgent } from '../lib/agents/listings';
import { applyEvent, runTurn } from '../lib/agents/orchestrator';
import { evaluateTenant } from '../lib/agents/prequal';
import { NOT_IN_CATALOG_QUESTION } from './lib/scenarios';

config({ path: '.env.local', quiet: true });

const RUNS = 3;
/** Pause between live model-backed steps (free tier). EVAL_SPACING_MS overrides; no pause in replay. */
const LIVE_SPACING_MS = Number(process.env.EVAL_SPACING_MS ?? 4000);
let failures = 0;

async function space(): Promise<void> {
  if (aiMode() === 'live' && LIVE_SPACING_MS > 0) await new Promise((r) => setTimeout(r, LIVE_SPACING_MS));
}

function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

type Expectation = { status: FinalDecision['status']; decidedBy: FinalDecision['decidedBy']; code?: string };
const EXPECTED: Record<TenantId, Expectation> = {
  ana: { status: 'APPROVED', decidedBy: 'prequal' },
  bruno: { status: 'NEEDS_INFO', decidedBy: 'prequal', code: 'expired_payslip' },
  carla: { status: 'NEEDS_INFO', decidedBy: 'crosscheck', code: 'name_mismatch' },
};

function codesOf(d: FinalDecision): string[] {
  return d.decidedBy === 'crosscheck' ? d.crosscheck.discrepancies.map((i) => i.code) : d.prequal.issues.map((i) => i.code);
}

async function tenantEvals(): Promise<void> {
  for (const tenantId of Object.keys(EXPECTED) as TenantId[]) {
    const want = EXPECTED[tenantId];
    let passed = 0;
    let last = '';
    for (let run = 0; run < RUNS; run++) {
      await space();
      try {
        const d = await evaluateTenant(tenantId);
        const codes = codesOf(d);
        last = `${d.status}/${d.decidedBy}/[${codes.join(',')}] prequal=${d.prequal.status}`;
        const ok =
          d.status === want.status &&
          d.decidedBy === want.decidedBy &&
          (want.code ? codes.length === 1 && codes[0] === want.code : codes.length === 0) &&
          (tenantId !== 'carla' || d.prequal.status === 'APPROVED');
        if (ok) passed++;
      } catch (err) {
        last = err instanceof Error ? err.message : String(err);
      }
    }
    check(`${tenantId}: ${want.status}${want.code ? `(${want.code})` : ''} by ${want.decidedBy}, ${passed}/${RUNS}`, passed === RUNS, last);
  }
}

async function listingsEval(): Promise<void> {
  const catalogIds = new Set(loadCatalog().map((p) => p.id));
  await space();
  const turn = await runListingsAgent({ message: NOT_IN_CATALOG_QUESTION, history: [] });
  const mentionedIds = turn.reply.match(/\bprop-\d+\b/gi) ?? [];
  const onlyCatalog = turn.properties.every((p) => catalogIds.has(p.id)) && mentionedIds.every((id) => catalogIds.has(id.toLowerCase()));
  const saysUnknown = /(don't know|do not know|no (matching )?propert|not in (our|the) catalog|no such|couldn't find|could not find|found no|(does not|doesn't|do not|don't) (currently )?have|no tengo|no tenemos|no sé)/i.test(turn.reply);
  const noPrice = !/\b\d{3,5}\s*(usdc|usd)\b/i.test(turn.reply);
  check(
    `listings: no hallucination for an out-of-catalog request (${turn.source})`,
    turn.properties.length === 0 && onlyCatalog && saysUnknown && noPrice,
    turn.reply.replace(/\s+/g, ' ').slice(0, 140),
  );
}

async function flowEval(): Promise<void> {
  let state: SessionState = { sessionId: 'eval', stage: 'SEARCH', tenantId: 'ana', payments: [], history: [] };
  const stages: string[] = [state.stage];
  const say = async (msg: string) => {
    await space();
    const r = await runTurn(state, msg);
    state = r.state;
    stages.push(state.stage);
    return r;
  };
  const search = await say('2-bedroom near Tres Cerritos, under 500 USDC, pets ok');
  const props = search.cards.find((c) => c.type === 'properties');
  const first = props && props.type === 'properties' ? props.properties[0] : undefined;
  await say(`I'd like to visit ${first?.id ?? 'prop-01'}`);
  await say('Yes please, confirm the visit');
  const docs = await say("I'm uploading my documents now");
  const contract = await say('Yes, prepare the contract');
  const fakeReceipt = (kind: PaymentResult['kind']): PaymentResult => ({
    kind, signature: `sig-${kind}`, explorerUrl: '', blockTime: 0, amountBaseUnits: '0', discountAppliedBps: 0, onTime: true, memo: '',
  });
  state = applyEvent(state, { type: 'payment_confirmed', result: fakeReceipt('deposit') });
  state = applyEvent(state, { type: 'payment_confirmed', result: fakeReceipt('rent') });
  stages.push(state.stage);

  const ok =
    stages.join('>') === 'SEARCH>SEARCH>VISIT>DOCUMENTS>CONTRACT>PAYMENT>ACTIVE' &&
    docs.cards.some((c) => c.type === 'prequal') &&
    contract.cards.some((c) => c.type === 'contract') &&
    contract.cards.filter((c) => c.type === 'payment').length === 2 &&
    state.history.length <= 24;
  check('orchestrator: Ana end-to-end stage flow', ok, stages.join('>'));

  const bruno = await runTurn({ sessionId: 'eval-b', stage: 'DOCUMENTS', tenantId: 'bruno', selectedPropertyId: first?.id, payments: [], history: [] }, 'Uploading my documents');
  check('orchestrator: Bruno stays in DOCUMENTS', bruno.state.stage === 'DOCUMENTS', bruno.reply.split('\n')[0]);
}

async function main(): Promise<void> {
  const mode = aiMode();
  if (mode === 'live') {
    process.env.AI_STRICT_LIVE = '1';
    process.env.AI_MEMO = '0';
  }
  const handAuthored = RECORDINGS.filter((r) => r.source === 'hand-authored').length;
  console.log(`Mode: ${mode}${mode === 'replay' ? ` (${RECORDINGS.length} recordings, ${handAuthored} hand-authored)` : ` (${aiDescribe()})`}\n`);
  await tenantEvals();
  await listingsEval();
  await flowEval();
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
