import type {
  ChatTurn,
  FinalDecision,
  Issue,
  Lang,
  LeaseDraft,
  PaymentKind,
  PaymentResult,
  PriceQuoteDto,
  Property,
  SessionState,
  TurnResult,
  UiCard,
} from '../contracts';
import { computePrice } from '../rules/pricing';
import { findProperty, loadCatalog, propertyTitle } from './catalog';
import { formatUsdc, resolveLanguage } from './language';
import { addMonthsTs, createLeaseDraft } from './lease';
import { runListingsAgent } from './listings';
import { evaluateTenant, evaluateUploadedDocuments } from './prequal';
import type { UploadedDocument } from './uploads';
import { createHash } from 'node:crypto';

/**
 * Stage machine: SEARCH -> VISIT -> DOCUMENTS -> CONTRACT -> PAYMENT -> ACTIVE -> MOVE_OUT.
 * Each stage handler only reaches the tools of its stage, and every transition is decided here in code.
 * The model is used for free-form catalog Q&A (listings agent) and for document extraction (prequal,
 * crosscheck); it never moves the stage and never decides an approval.
 */

const MAX_HISTORY_ENTRIES = 24; // ~12 turns; the client carries the session blob
export const VISIT_SLOT = { en: 'tomorrow at 10:00', es: 'mañana a las 10:00' } as const;

type StageOutput = { reply: string; cards: UiCard[]; state: SessionState };

// ---------- Intent detection (deterministic) ----------

/** Whole-word, accent-aware matcher (JS \b treats accented letters as non-word characters). */
function intent(words: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])(?:${words})(?![\\p{L}\\d])`, 'iu');
}

const SELECT_INTENT = intent(
  'visit|book|choose|pick|select|take|want|like|interested|go with|schedule|quiero|quisiera|visitar|visita|elijo|elegir|me interesa|reservar|reserva|agendar|agendá|me quedo',
);
const UPLOAD_INTENT = intent(
  'upload|uploading|uploaded|attach|attaching|attached|sending|send|here are|documents?|docs|papers|subo|subir|subí|subiendo|cargo|cargar|adjunto|adjunté|envío|envio|mando|documentos|documentación|documentacion',
);
const NEGATIVE_INTENT = intent('no|not now|cancel|another|other one|otra|cancelar|cambiar');
const RENT_INTENT = intent('rent|first month|alquiler|primer mes|cuota');
const MOVE_OUT_INTENT = intent('move out|move-out|moving out|end the lease|terminate|mudanza|mudarme|rescindir|dejar el departamento');

function referencedProperty(message: string, catalog: Property[]): Property | undefined {
  const id = message.match(/\bprop-\d+\b/i)?.[0]?.toLowerCase();
  if (id) return catalog.find((p) => p.id === id);
  const folded = message.toLowerCase();
  return catalog.find((p) => folded.includes(p.title.toLowerCase()) || (p.titleEs !== undefined && folded.includes(p.titleEs.toLowerCase())));
}

// ---------- Cards ----------

function quoteDto(lease: LeaseDraft, kind: PaymentKind, atTs: number, monthIndex = 0): PriceQuoteDto {
  // The deposit is held in custody, not earned, so no discount applies to it (same rule as lib/solana/pay.ts).
  const q = computePrice({
    listBaseUnits: BigInt(kind === 'deposit' ? lease.depositBaseUnits : lease.rentBaseUnits),
    discountUsdcBps: kind === 'deposit' ? 0 : lease.discountUsdcBps,
    discountOntimeBps: kind === 'deposit' ? 0 : lease.discountOntimeBps,
    dueTs: kind === 'deposit' ? lease.dueTs : addMonthsTs(lease.dueTs, monthIndex),
    atTs,
    method: 'usdc',
  });
  return {
    listBaseUnits: q.listBaseUnits.toString(),
    amountBaseUnits: q.amountBaseUnits.toString(),
    discountBps: q.discountBps,
    onTime: q.onTime,
    breakdown: q.breakdown,
  };
}

type PendingPayment = { kind: 'deposit' } | { kind: 'rent'; monthIndex: number };

/**
 * Payments are offered strictly in order: the deposit first, then the next unpaid rent month.
 * Only one card is ever pending, so rent can never be paid before the deposit from the chat.
 */
function nextPendingPayment(state: SessionState): PendingPayment | undefined {
  if (!state.lease) return undefined;
  if (!state.payments.some((p) => p.kind === 'deposit')) return { kind: 'deposit' };
  // Receipts are appended in order and deduped by signature, so the count is the next month index.
  const monthIndex = state.payments.filter((p) => p.kind === 'rent').length;
  return monthIndex < state.lease.months ? { kind: 'rent', monthIndex } : undefined;
}

function paymentCards(state: SessionState): UiCard[] {
  const lease = state.lease;
  const pending = nextPendingPayment(state);
  if (!lease || !pending) return [];
  const now = Math.floor(Date.now() / 1000);
  const monthIndex = pending.kind === 'rent' ? pending.monthIndex : 0;
  return [{ type: 'payment', kind: pending.kind, quote: quoteDto(lease, pending.kind, now, monthIndex) }];
}

// ---------- Copy ----------

function issueText(issue: Issue, lang: Lang): string {
  const es = lang === 'es';
  switch (issue.code) {
    case 'expired_payslip':
      return es
        ? 'tu recibo de sueldo tiene más de 90 días. Subí uno de los últimos 90 días.'
        : 'your payslip is more than 90 days old. Please upload one from the last 90 days.';
    case 'name_mismatch':
      return es
        ? `el nombre en ${issue.docType === 'payslip' ? 'el recibo de sueldo' : 'uno de los documentos'} no coincide con el de tu DNI. Subí un documento a tu nombre; una inmobiliaria revisaría el caso.`
        : `the name on ${issue.docType === 'payslip' ? 'your payslip' : 'one of your documents'} does not match your ID. Please upload a document in your name; an agency would review the case.`;
    case 'income_ratio_exceeded':
      return es
        ? 'el alquiler supera el 35% de tus ingresos mensuales.'
        : 'the rent is above 35% of your monthly income.';
    case 'missing_document':
      return es ? `falta o no se puede leer un documento (${issue.docType ?? 'documento'}).` : `a document is missing or unreadable (${issue.docType ?? 'document'}).`;
  }
}

function decisionReply(decision: FinalDecision, lang: Lang): string {
  const es = lang === 'es';
  if (decision.status === 'APPROVED') {
    return es
      ? '¡Precalificación aprobada! Tus documentos están completos, el recibo es reciente, el alquiler está dentro del 35% de tus ingresos y el control cruzado independiente coincide. ¿Preparo el contrato?'
      : "You're pre-qualified! Your documents are complete, the payslip is recent, the rent is within 35% of your income, and our independent cross-check agrees. Shall I prepare the lease contract?";
  }
  const issues = decision.decidedBy === 'crosscheck' ? decision.crosscheck.discrepancies : [...decision.prequal.issues, ...decision.crosscheck.discrepancies];
  const reasons = issues.map((i) => `- ${issueText(i, lang)}`).join('\n');
  if (decision.decidedBy === 'crosscheck') {
    return es
      ? `El agente de precalificación aprobó tus documentos, pero el agente de control cruzado encontró una inconsistencia:\n${reasons}\nPor eso queda en "necesita información" hasta que se resuelva.`
      : `The pre-qualification agent approved your documents, but our independent cross-check agent found an inconsistency:\n${reasons}\nSo your application needs more information before we can continue.`;
  }
  if (decision.status === 'REJECTED') {
    return es
      ? `Por ahora no podemos avanzar con esta propiedad:\n${reasons}\nPodés buscar una opción más económica.`
      : `We can't move forward with this property for now:\n${reasons}\nYou could look for a more affordable option.`;
  }
  return es ? `Necesito un poco más de información:\n${reasons}` : `I need a bit more information:\n${reasons}`;
}

/** Copy for the single pending payment card. `rentAskedFirst`: the tenant asked to pay rent before the deposit. */
function paymentReply(state: SessionState, cards: UiCard[], lang: Lang, rentAskedFirst = false): string {
  const es = lang === 'es';
  const card = cards.find((c) => c.type === 'payment');
  if (!card || card.type !== 'payment') return es ? 'No hay pagos pendientes.' : 'There are no pending payments.';
  const list = formatUsdc(card.quote.listBaseUnits);
  const amount = formatUsdc(card.quote.amountBaseUnits);
  const tail = es
    ? 'Usá el botón de pago. Demo en Solana devnet con un token de prueba.'
    : 'Use the pay button. Demo on Solana devnet with a test token.';

  if (card.kind === 'deposit') {
    const lead = rentAskedFirst ? (es ? 'Primero va el depósito. ' : 'The deposit comes first. ') : '';
    const body = es
      ? `Depósito: ${amount} USDC, en la billetera de custodia de la demo (sin descuento). Apenas lo pagues, sigue el primer mes de alquiler.`
      : `Deposit: ${amount} USDC, held in the demo custody wallet (no discount). Once it is paid, the first month's rent comes next.`;
    return `${lead}${body}\n${tail}`;
  }

  const rentPaid = state.payments.filter((p) => p.kind === 'rent').length;
  const label =
    rentPaid === 0 ? (es ? 'Depósito recibido. Primer mes de alquiler' : "Deposit received. First month's rent") : es ? `Alquiler del mes ${rentPaid + 1}` : `Rent for month ${rentPaid + 1}`;
  const body = es
    ? `${label}: ${list} USDC de lista, ${amount} USDC pagando en USDC y a tiempo (${card.quote.discountBps / 100}% de descuento).`
    : `${label}: ${list} USDC list price, ${amount} USDC if you pay in USDC and on time (${card.quote.discountBps / 100}% off).`;
  return `${body}\n${tail}`;
}

// ---------- Stage handlers ----------

async function handleSearch(s: SessionState, message: string, lang: Lang): Promise<StageOutput> {
  const catalog = loadCatalog();
  const picked = SELECT_INTENT.test(message) ? referencedProperty(message, catalog) : undefined;
  if (picked) {
    const next: SessionState = { ...s, selectedPropertyId: picked.id, stage: 'VISIT' };
    const reply =
      lang === 'es'
        ? `Buena elección: ${propertyTitle(picked, 'es')} (${picked.zone}, ${picked.priceUsdc} USDC/mes). Puedo agendarte una visita ${VISIT_SLOT.es} (agenda simulada). ¿La confirmo?`
        : `Great choice: ${propertyTitle(picked, 'en')} (${picked.zone}, ${picked.priceUsdc} USDC/month). I can book a visit ${VISIT_SLOT.en} (simulated agenda). Shall I confirm it?`;
    return { reply, cards: [{ type: 'properties', properties: [picked] }], state: next };
  }
  const turn = await runListingsAgent({ message, history: s.history, catalog, lang });
  const cards: UiCard[] = turn.properties.length > 0 ? [{ type: 'properties', properties: turn.properties }] : [];
  return { reply: turn.reply, cards, state: s };
}

function documentsRequest(lang: Lang): string {
  return lang === 'es'
    ? 'Siguiente paso: precalificación. Necesito tu DNI, tu último recibo de sueldo, una constancia de ingresos y una garantía (seguro de caución). En esta demo, solo decime que estás subiendo tus documentos.'
    : 'Next step: pre-qualification. I need your ID (DNI), your latest payslip, an income certificate and a guarantee (surety insurance). In this demo, just tell me you are uploading your documents.';
}

async function handleVisit(s: SessionState, message: string, lang: Lang): Promise<StageOutput> {
  const catalog = loadCatalog();
  const other = SELECT_INTENT.test(message) ? referencedProperty(message, catalog) : undefined;
  if (other && other.id !== s.selectedPropertyId) return handleSearch({ ...s, stage: 'SEARCH' }, message, lang);
  if (NEGATIVE_INTENT.test(message) && !UPLOAD_INTENT.test(message)) {
    const reply = lang === 'es' ? 'Sin problema. ¿Qué otra propiedad querés ver?' : 'No problem. Which other property would you like to see?';
    return { reply, cards: [], state: { ...s, stage: 'SEARCH', selectedPropertyId: undefined } };
  }
  const property = s.selectedPropertyId ? findProperty(s.selectedPropertyId) : undefined;
  const confirmed =
    lang === 'es'
      ? `Visita confirmada ${VISIT_SLOT.es}${property ? ` en ${propertyTitle(property, 'es')}` : ''} (agenda simulada).`
      : `Visit confirmed for ${VISIT_SLOT.en}${property ? ` at ${propertyTitle(property, 'en')}` : ''} (simulated agenda).`;
  const next: SessionState = { ...s, stage: 'DOCUMENTS' };
  if (UPLOAD_INTENT.test(message)) {
    const docs = await handleDocuments(next, message, lang);
    return { ...docs, reply: `${confirmed}\n${docs.reply}` };
  }
  return { reply: `${confirmed}\n${documentsRequest(lang)}`, cards: [], state: next };
}

async function handleDocuments(s: SessionState, message: string, lang: Lang): Promise<StageOutput> {
  if (!s.tenantId) {
    const reply = lang === 'es' ? 'Elegí primero un inquilino de demo (Ana, Bruno o Carla).' : 'Please pick a demo tenant first (Ana, Bruno or Carla).';
    return { reply, cards: [], state: s };
  }
  if (!UPLOAD_INTENT.test(message)) return { reply: documentsRequest(lang), cards: [], state: s };

  const property = s.selectedPropertyId ? findProperty(s.selectedPropertyId) : undefined;
  let decision: FinalDecision;
  try {
    decision = await evaluateTenant(s.tenantId, property?.priceUsdc);
  } catch (err) {
    console.error('[orchestrator] evaluateTenant failed:', err instanceof Error ? err.message : err);
    const reply = lang === 'es' ? 'No pude revisar tus documentos en este momento. Probá de nuevo en un minuto.' : "I couldn't review your documents right now. Please try again in a minute.";
    return { reply, cards: [], state: s };
  }
  const next: SessionState = decision.status === 'APPROVED' ? { ...s, stage: 'CONTRACT' } : s;
  return { reply: decisionReply(decision, lang), cards: [{ type: 'prequal', decision }], state: next };
}

async function handleContract(s: SessionState, message: string, lang: Lang): Promise<StageOutput> {
  if (s.lease) {
    const next: SessionState = { ...s, stage: 'PAYMENT' };
    const cards: UiCard[] = [{ type: 'contract', lease: s.lease }, ...paymentCards(next)];
    return { reply: paymentReply(next, cards, lang, RENT_INTENT.test(message)), cards, state: next };
  }
  if (NEGATIVE_INTENT.test(message)) {
    const reply = lang === 'es' ? 'Dale, avisame cuando quieras que prepare el contrato.' : "Sure, tell me when you'd like me to prepare the contract.";
    return { reply, cards: [], state: s };
  }
  if (!s.tenantId || !s.selectedPropertyId) {
    const reply = lang === 'es' ? 'Primero elegí una propiedad.' : 'Please pick a property first.';
    return { reply, cards: [], state: { ...s, stage: 'SEARCH' } };
  }
  const property = findProperty(s.selectedPropertyId);
  // Never trust the client-held stage for an approval: recompute on the server. Uploaded files are not stored, so
  // for them the server-signed attestation set by runDocumentsUpload stands in for the recomputation.
  if (!hasUploadApproval(s)) {
    const decision = await evaluateTenant(s.tenantId, property?.priceUsdc);
    if (decision.status !== 'APPROVED') {
      return { reply: decisionReply(decision, lang), cards: [{ type: 'prequal', decision }], state: { ...s, stage: 'DOCUMENTS' } };
    }
  }
  const lease = createLeaseDraft(s.tenantId, s.selectedPropertyId, lang);
  const next = applyEvent(s, { type: 'lease_created', lease });
  const cards: UiCard[] = [{ type: 'contract', lease }, ...paymentCards(next)];
  const intro =
    lang === 'es'
      ? `Contrato listo (demo, datos simulados, no es asesoramiento legal). Su huella SHA-256 es ${lease.contractHash.slice(0, 12)}…; va a quedar registrada en cada pago para que cualquiera pueda verificarlo.`
      : `Your lease contract is ready (demo, simulated data, not legal advice). Its SHA-256 fingerprint is ${lease.contractHash.slice(0, 12)}…, and it is recorded with every payment so anyone can verify it.`;
  return { reply: `${intro}\n${paymentReply(next, cards, lang)}`, cards, state: next };
}

function handlePayment(s: SessionState, message: string, lang: Lang): StageOutput {
  const cards = paymentCards(s);
  return { reply: paymentReply(s, cards, lang, RENT_INTENT.test(message)), cards, state: s };
}

function handleActive(s: SessionState, message: string, lang: Lang): StageOutput {
  if (MOVE_OUT_INTENT.test(message)) return handleMoveOut({ ...s, stage: 'MOVE_OUT' }, lang);
  const cards: UiCard[] = s.payments.map((result) => ({ type: 'receipt', result }));
  const onTime = s.payments.filter((p) => p.kind === 'rent' && p.onTime).length;
  const reply =
    lang === 'es'
      ? `Tu contrato está activo. Pagos registrados: ${s.payments.length}${onTime > 0 ? `, ${onTime} ${onTime === 1 ? 'alquiler pagado' : 'alquileres pagados'} a tiempo` : ''}. Cada recibo tiene su link al explorador de devnet.`
      : `Your lease is active. Payments on record: ${s.payments.length}${onTime > 0 ? `, ${onTime} on-time rent ${onTime === 1 ? 'payment' : 'payments'}` : ''}. Each receipt links to the devnet explorer.`;
  return { reply, cards, state: s };
}

function handleMoveOut(s: SessionState, lang: Lang): StageOutput {
  const reply =
    lang === 'es'
      ? 'La mudanza y la devolución del depósito con firma 2 de 3 (inquilino, propietario, inmobiliaria) llegan en la próxima versión. En esta demo esta etapa todavía no está construida.'
      : 'Move-out and the 2-of-3 deposit release (tenant, landlord, agency) are coming in the next version. In this demo this stage is not built yet.';
  return { reply, cards: [], state: s };
}

// ---------- Public API ----------

function boundedHistory(history: ChatTurn[]): ChatTurn[] {
  return history.slice(-MAX_HISTORY_ENTRIES);
}

/**
 * `routeLang` is the route language (es/en) and wins over detection; when absent (old clients, e2e) the language is
 * detected from the message.
 */
export async function runTurn(state: SessionState, message: string, routeLang?: Lang): Promise<TurnResult> {
  const lang = resolveLanguage(routeLang, message);
  const s: SessionState = { ...state, payments: [...state.payments], history: boundedHistory(state.history) };

  let out: StageOutput;
  switch (s.stage) {
    case 'SEARCH':
      out = await handleSearch(s, message, lang);
      break;
    case 'VISIT':
      out = await handleVisit(s, message, lang);
      break;
    case 'DOCUMENTS':
      out = await handleDocuments(s, message, lang);
      break;
    case 'CONTRACT':
      out = await handleContract(s, message, lang);
      break;
    case 'PAYMENT':
      out = handlePayment(s, message, lang);
      break;
    case 'ACTIVE':
      out = handleActive(s, message, lang);
      break;
    case 'MOVE_OUT':
      out = handleMoveOut(s, lang);
      break;
  }

  const history = boundedHistory([
    ...out.state.history,
    { role: 'user', text: message },
    { role: 'assistant', text: out.reply },
  ]);
  return { reply: out.reply, cards: out.cards, state: { ...out.state, history } };
}

/** True when this (signed) session carries an APPROVED upload evaluation for the currently selected property. */
export function hasUploadApproval(state: SessionState): boolean {
  const u = state.uploadedDocs;
  return Boolean(u && u.status === 'APPROVED' && state.selectedPropertyId && u.propertyId === state.selectedPropertyId);
}

function filesDigest(docs: readonly UploadedDocument[]): string {
  return createHash('sha256')
    .update(docs.map((d) => d.sha256).sort().join(','))
    .digest('hex');
}

/** Route language when the client sent one; otherwise detected from the last user message (old clients, e2e). */
function lastUserLanguage(history: ChatTurn[], routeLang?: Lang): Lang {
  const last = [...history].reverse().find((t) => t.role === 'user');
  return resolveLanguage(routeLang, last?.text ?? '');
}

/**
 * DOCUMENTS stage, real files: the same decision pipeline as the simulated chip, fed with the uploaded files.
 * The model only reads the files; approval, expiry, name matching and income ratio come from lib/rules, and the stage
 * moves to CONTRACT here, in code, only on APPROVED. Throws (ReplayMissError, provider errors) for the route to map.
 */
export async function runDocumentsUpload(
  state: SessionState,
  docs: readonly UploadedDocument[],
  routeLang?: Lang,
): Promise<TurnResult> {
  if (state.stage !== 'DOCUMENTS' || !state.tenantId) throw new Error('Documents can only be uploaded in the DOCUMENTS stage.');
  const lang = lastUserLanguage(state.history, routeLang);
  const property = state.selectedPropertyId ? findProperty(state.selectedPropertyId) : undefined;
  const decision = await evaluateUploadedDocuments(state.tenantId, docs, property?.priceUsdc);

  const approved = decision.status === 'APPROVED' && property;
  const next: SessionState = approved
    ? { ...state, stage: 'CONTRACT', uploadedDocs: { status: 'APPROVED', propertyId: property.id, filesDigest: filesDigest(docs) } }
    : { ...state, uploadedDocs: undefined };
  const n = docs.length;
  const intro =
    lang === 'es'
      ? `Revisé ${n === 1 ? 'el archivo' : `los ${n} archivos`} que subiste (demo, datos simulados; no se guardan).`
      : `I reviewed the ${n === 1 ? 'file' : `${n} files`} you uploaded (demo, simulated data; nothing is stored).`;
  const reply = `${intro}\n${decisionReply(decision, lang)}`;
  const userText = lang === 'es' ? `Subí ${n} ${n === 1 ? 'documento' : 'documentos'}.` : `Uploaded ${n} ${n === 1 ? 'document' : 'documents'}.`;
  const history = boundedHistory([...next.history, { role: 'user', text: userText }, { role: 'assistant', text: reply }]);
  return { reply, cards: [{ type: 'prequal', decision }], state: { ...next, history } };
}

export type SessionEvent =
  | { type: 'lease_created'; lease: LeaseDraft }
  | { type: 'payment_confirmed'; result: PaymentResult };

/** Applied by API routes after server-side actions. Deposit + first rent confirmed => ACTIVE. */
export function applyEvent(state: SessionState, event: SessionEvent): SessionState {
  if (event.type === 'lease_created') {
    return {
      ...state,
      lease: event.lease,
      selectedPropertyId: event.lease.propertyId,
      payments: [],
      stage: 'PAYMENT',
    };
  }
  const payments = state.payments.some((p) => p.signature === event.result.signature)
    ? state.payments
    : [...state.payments, event.result];
  const paid = new Set(payments.map((p) => p.kind));
  const complete = Boolean(state.lease) && paid.has('deposit') && paid.has('rent');
  const stage = complete && (state.stage === 'PAYMENT' || state.stage === 'CONTRACT') ? 'ACTIVE' : state.stage;
  return { ...state, payments, stage };
}
