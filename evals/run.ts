/**
 * Product-agent evals (pnpm evals). Every language-dependent check runs in EN and ES.
 *  - Ana = APPROVED, Bruno = NEEDS_INFO(expired_payslip) by prequal, Carla = NEEDS_INFO(name_mismatch) by crosscheck,
 *    RUNS times each (decision) and RUNS times each through the orchestrator in both languages.
 *  - Rule reasons are renderable from keys (ruleKey, labelKey, raw, params) in the decision cards.
 *  - Listings never invents a property that is not in the catalog (EN and ES).
 *  - Orchestrator flow for Ana in each language with the exact UI chip strings (lib/i18n/chips.ts):
 *    SEARCH -> VISIT -> DOCUMENTS -> CONTRACT -> PAYMENT -> ACTIVE.
 *  - Route language wins over detection; detection is the fallback when `lang` is absent.
 *  - Lease template per language: hash is over the exact text, hashes differ across languages.
 * Mode: REPLAY=1 serves evals/recordings; otherwise live when the AI_PROVIDER key is set (GEMINI_API_KEY by default),
 * replay if not. Live runs are strict (no recording fallback, no memo) and spaced to respect free-tier rate limits.
 */
import { config } from 'dotenv';
import type { FinalDecision, Issue, Lang, PaymentResult, SessionState, TenantId, TurnResult, UiCard } from '../lib/contracts';
import { aiDescribe, aiMode } from '../lib/ai';
import { RECORDINGS } from './recordings';
import { loadCatalog } from '../lib/agents/catalog';
import { createLeaseDraft } from '../lib/agents/lease';
import { runListingsAgent } from '../lib/agents/listings';
import { applyEvent, runTurn } from '../lib/agents/orchestrator';
import { evaluateTenant } from '../lib/agents/prequal';
import { BOOK_VISIT_FOR, CHIP_TEXT } from '../lib/i18n/chips';
import { sha256Hex } from '../lib/solana/hash';
import { NOT_IN_CATALOG_QUESTION, NOT_IN_CATALOG_QUESTION_ES } from './lib/scenarios';

config({ path: '.env.local', quiet: true });

const RUNS = 3;
const LANGS: readonly Lang[] = ['en', 'es'];
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

type Expectation = { status: FinalDecision['status']; decidedBy: FinalDecision['decidedBy']; code?: string; ruleKey?: string };
const EXPECTED: Record<TenantId, Expectation> = {
  ana: { status: 'APPROVED', decidedBy: 'prequal' },
  bruno: { status: 'NEEDS_INFO', decidedBy: 'prequal', code: 'expired_payslip', ruleKey: 'payslip_max_90_days' },
  carla: { status: 'NEEDS_INFO', decidedBy: 'crosscheck', code: 'name_mismatch', ruleKey: 'name_must_match_id' },
};

/** Words that must appear in the orchestrator reply, per tenant and language. */
const REPLY_MARKER: Record<Lang, Record<TenantId, RegExp>> = {
  en: { ana: /pre-qualified/i, bruno: /90 days/i, carla: /cross-check/i },
  es: { ana: /aprobada/i, bruno: /90 días/i, carla: /control cruzado/i },
};

const ENGLISH_WORDS = /\b(the|your|please|payslip|shall|upload|must|within|deposit|rent)\b/i;
const SPANISH_WORDS = /\b(tu|tus|recibo|querés|necesito|contrato|alquiler|depósito|visita|propiedad)\b|[ñáéíóú¿¡]/i;
/** Cheap language check on an agent reply: the other language's function words must not show up. */
function looksLike(lang: Lang, text: string): boolean {
  return lang === 'es' ? SPANISH_WORDS.test(text) && !ENGLISH_WORDS.test(text) : ENGLISH_WORDS.test(text) && !/[ñáéíóú¿¡]/.test(text);
}

function codesOf(d: FinalDecision): string[] {
  return d.decidedBy === 'crosscheck' ? d.crosscheck.discrepancies.map((i) => i.code) : d.prequal.issues.map((i) => i.code);
}

function decidingIssues(d: FinalDecision): Issue[] {
  return d.decidedBy === 'crosscheck' ? d.crosscheck.discrepancies : d.prequal.issues;
}

/** True when the evidence of an issue can be rendered purely from keys. */
function evidenceHasKeys(issue: Issue | undefined, ruleKey: string): boolean {
  const ev = issue?.evidence;
  if (!issue || !ev || ev.ruleKey !== ruleKey || typeof ev.rule !== 'string' || !issue.message) return false;
  return ev.compared.length >= 2 && ev.compared.every((c) => Boolean(c.labelKey) && typeof c.raw === 'string' && c.raw.length > 0);
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
          (!want.ruleKey || evidenceHasKeys(decidingIssues(d)[0], want.ruleKey)) &&
          (tenantId !== 'carla' || d.prequal.status === 'APPROVED');
        if (ok) passed++;
      } catch (err) {
        last = err instanceof Error ? err.message : String(err);
      }
    }
    check(`${tenantId}: ${want.status}${want.code ? `(${want.code})` : ''} by ${want.decidedBy}, evidence keys, ${passed}/${RUNS}`, passed === RUNS, last);
  }
}

/** Ana/Bruno/Carla through the orchestrator (documents turn) in `lang`, with the UI chip text. */
async function tenantTurnEvals(lang: Lang): Promise<void> {
  for (const tenantId of Object.keys(EXPECTED) as TenantId[]) {
    const want = EXPECTED[tenantId];
    let passed = 0;
    let last = '';
    for (let run = 0; run < RUNS; run++) {
      await space();
      try {
        const state: SessionState = { sessionId: `eval-${tenantId}`, stage: 'DOCUMENTS', tenantId, selectedPropertyId: 'prop-02', payments: [], history: [] };
        const turn = await runTurn(state, CHIP_TEXT[lang][2], lang);
        const card = turn.cards.find((c) => c.type === 'prequal');
        const decision = card && card.type === 'prequal' ? card.decision : undefined;
        last = `${lang} ${turn.state.stage} ${decision?.status}/${decision?.decidedBy} :: ${turn.reply.split('\n')[0].slice(0, 70)}`;
        const ok =
          decision !== undefined &&
          decision.status === want.status &&
          decision.decidedBy === want.decidedBy &&
          turn.state.stage === (want.status === 'APPROVED' ? 'CONTRACT' : 'DOCUMENTS') &&
          REPLY_MARKER[lang][tenantId].test(turn.reply) &&
          looksLike(lang, turn.reply) &&
          (!want.code || decidingIssues(decision).map((i) => i.code).join() === want.code);
        if (ok) passed++;
      } catch (err) {
        last = err instanceof Error ? err.message : String(err);
      }
    }
    check(`${lang} orchestrator: ${tenantId} ${want.status}${want.code ? `(${want.code})` : ''} replies in ${lang}, ${passed}/${RUNS}`, passed === RUNS, last);
  }
}

async function listingsEval(lang: Lang): Promise<void> {
  const catalogIds = new Set(loadCatalog().map((p) => p.id));
  await space();
  const question = lang === 'es' ? NOT_IN_CATALOG_QUESTION_ES : NOT_IN_CATALOG_QUESTION;
  const turn = await runListingsAgent({ message: question, history: [], lang });
  const mentionedIds = turn.reply.match(/\bprop-\d+\b/gi) ?? [];
  const onlyCatalog = turn.properties.every((p) => catalogIds.has(p.id)) && mentionedIds.every((id) => catalogIds.has(id.toLowerCase()));
  const saysUnknown = /(don't know|do not know|no (matching )?propert|not in (our|the) catalog|no such|couldn't find|could not find|found no|(does not|doesn't|do not|don't) (currently )?have|no tengo|no tenemos|no sé|no (tiene|cuenta con|hay) ning[uú]n)/i.test(turn.reply);
  const noPrice = !/\b\d{3,5}\s*(usdc|usd)\b/i.test(turn.reply);
  check(
    `${lang} listings: no hallucination for an out-of-catalog request (${turn.source})`,
    turn.properties.length === 0 && onlyCatalog && saysUnknown && noPrice,
    turn.reply.replace(/\s+/g, ' ').slice(0, 140),
  );
}

async function chipSearchEval(lang: Lang): Promise<void> {
  const ids = new Set(loadCatalog().map((p) => p.id));
  await space();
  const turn = await runListingsAgent({ message: CHIP_TEXT[lang][0], history: [], lang });
  const mentioned = (turn.reply.match(/\bprop-\d+\b/gi) ?? []).map((id) => id.toLowerCase());
  const within = turn.properties.every((p) => ids.has(p.id) && p.priceUsdc < 500 && p.petsAllowed && p.zone === 'Tres Cerritos');
  check(
    `${lang} listings: search chip answered from the catalog (${turn.source})`,
    turn.properties.length > 0 && within && mentioned.every((id) => turn.properties.some((p) => p.id === id)) && (aiMode() === 'live' || turn.source === 'replay'),
    turn.reply.replace(/\s+/g, ' ').slice(0, 120),
  );
}

const fakeReceipt = (kind: PaymentResult['kind']): PaymentResult => ({
  kind, signature: `sig-${kind}`, explorerUrl: '', blockTime: 0, amountBaseUnits: '0', discountAppliedBps: 0, onTime: true, memo: '',
});
const paymentKinds = (cards: UiCard[]) => cards.flatMap((c) => (c.type === 'payment' ? [c.kind] : []));

async function flowEval(lang: Lang): Promise<void> {
  const chips = CHIP_TEXT[lang];
  let state: SessionState = { sessionId: 'eval', stage: 'SEARCH', tenantId: 'ana', payments: [], history: [] };
  const stages: string[] = [state.stage];
  const say = async (msg: string): Promise<TurnResult> => {
    await space();
    const r = await runTurn(state, msg, lang);
    state = r.state;
    stages.push(state.stage);
    return r;
  };
  const search = await say(chips[0]);
  const props = search.cards.find((c) => c.type === 'properties');
  const first = props && props.type === 'properties' ? props.properties[0] : undefined;
  const title = lang === 'es' ? (first?.titleEs ?? first?.title) : first?.title;
  // The property-card button sends "<book phrase> <title>" in the route language.
  const picked = await say(`${BOOK_VISIT_FOR[lang]} ${title ?? 'prop-01'}`);
  await say(chips[1]);
  const docs = await say(chips[2]);
  const contract = await say(chips[3]);
  // Deposit strictly before rent: asking for rent first still offers only the deposit.
  const rentFirst = await runTurn(state, chips[5], lang);
  const rentFirstOk = paymentKinds(rentFirst.cards).join(',') === 'deposit' && (lang === 'es' ? /primero va el depósito/i : /deposit comes first/i).test(rentFirst.reply);
  state = applyEvent(state, { type: 'payment_confirmed', result: fakeReceipt('deposit') });
  const afterDeposit = await runTurn(state, chips[5], lang);
  const afterDepositOk = afterDeposit.state.stage === 'PAYMENT' && paymentKinds(afterDeposit.cards).join(',') === 'rent' && looksLike(lang, afterDeposit.reply);
  state = applyEvent(state, { type: 'payment_confirmed', result: fakeReceipt('rent') });
  stages.push(state.stage);

  const leaseCard = contract.cards.find((c) => c.type === 'contract');
  const lease = leaseCard && leaseCard.type === 'contract' ? leaseCard.lease : undefined;
  const ok =
    stages.join('>') === 'SEARCH>SEARCH>VISIT>DOCUMENTS>CONTRACT>PAYMENT>ACTIVE' &&
    docs.cards.some((c) => c.type === 'prequal') &&
    lease !== undefined &&
    paymentKinds(contract.cards).join(',') === 'deposit' &&
    looksLike(lang, picked.reply) &&
    state.history.length <= 24;
  check(`${lang} orchestrator: Ana end-to-end stage flow with UI chips`, ok, stages.join('>'));
  check(`${lang} orchestrator: deposit before rent`, rentFirstOk && afterDepositOk, `${rentFirst.reply.split('\n')[0]} | ${afterDeposit.reply.split('\n')[0]}`);

  const marker = lang === 'es' ? /CONTRATO DE LOCACIÓN/ : /RESIDENTIAL LEASE AGREEMENT/;
  const disclaimer = lang === 'es' ? /DATOS SIMULADOS[\s\S]*constituye asesoramiento legal[\s\S]*custodia/ : /SIMULATED DATA[\s\S]*not legal or tax advice[\s\S]*custod/;
  check(
    `${lang} lease: text in ${lang}, lang field set, hash over the exact text, demo + custodial wording`,
    lease !== undefined && lease.lang === lang && marker.test(lease.contractText) && disclaimer.test(lease.contractText) && lease.contractHash === sha256Hex(lease.contractText),
    lease ? `${lease.lang} ${lease.contractHash.slice(0, 12)}` : 'no lease',
  );

  const bruno = await runTurn({ sessionId: 'eval-b', stage: 'DOCUMENTS', tenantId: 'bruno', selectedPropertyId: first?.id, payments: [], history: [] }, chips[2], lang);
  check(`${lang} orchestrator: Bruno stays in DOCUMENTS`, bruno.state.stage === 'DOCUMENTS', bruno.reply.split('\n')[0]);
}

async function languageRoutingEval(): Promise<void> {
  const base: SessionState = { sessionId: 'eval-lang', stage: 'DOCUMENTS', tenantId: 'bruno', selectedPropertyId: 'prop-02', payments: [], history: [] };
  // `lang` wins over detection in both directions.
  const esForced = await runTurn(base, 'Upload my documents', 'es');
  const enForced = await runTurn(base, 'Subir mis documentos', 'en');
  check('lang override: English text with lang=es replies in Spanish', /90 días/.test(esForced.reply) && looksLike('es', esForced.reply), esForced.reply.split('\n')[0]);
  check('lang override: Spanish text with lang=en replies in English', /90 days/.test(enForced.reply) && looksLike('en', enForced.reply), enForced.reply.split('\n')[0]);
  // Fallback: no lang -> detection from the message (old clients, e2e).
  const esDetected = await runTurn(base, 'Subir mis documentos');
  const enDetected = await runTurn(base, 'Upload my documents');
  check('lang fallback: detection used when lang is absent', /90 días/.test(esDetected.reply) && /90 days/.test(enDetected.reply));

  const en = createLeaseDraft('ana', 'prop-01', 'en');
  const es = createLeaseDraft('ana', 'prop-01', 'es');
  const legacy = createLeaseDraft('ana', 'prop-01');
  check('lease: ES and EN hashes differ; default is English', en.contractHash !== es.contractHash && legacy.lang === 'en' && /LEASE AGREEMENT/.test(legacy.contractText));
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
  for (const lang of LANGS) await tenantTurnEvals(lang);
  for (const lang of LANGS) await listingsEval(lang);
  for (const lang of LANGS) await chipSearchEval(lang);
  for (const lang of LANGS) await flowEval(lang);
  await languageRoutingEval();
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
