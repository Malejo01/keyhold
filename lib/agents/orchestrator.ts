import type {
  ChatTurn,
  FinalDecision,
  Issue,
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
import { findProperty, loadCatalog } from './catalog';
import { detectLanguage, formatUsdc, type Lang } from './language';
import { createLeaseDraft } from './lease';
import { runListingsAgent } from './listings';
import { evaluateTenant } from './prequal';

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

const SELECT_INTENT =
  /\b(visit|book|choose|pick|select|take|want|like|interested|go with|schedule|quiero|quisiera|visitar|elijo|me interesa|reservar|agendar|me quedo)\b/i;
const UPLOAD_INTENT =
  /\b(upload|uploading|uploaded|attach|attaching|attached|sending|send|here are|documents?|docs|papers|subo|subiendo|adjunto|adjunté|envío|envio|mando|documentos|documentación|documentacion)\b/i;
const NEGATIVE_INTENT = /\b(no|not now|cancel|another|other one|otra|cancelar|cambiar)\b/i;
const MOVE_OUT_INTENT = /\b(move out|move-out|moving out|end the lease|terminate|mudanza|mudarme|rescindir|dejar el departamento)\b/i;

function referencedProperty(message: string, catalog: Property[]): Property | undefined {
  const id = message.match(/\bprop-\d+\b/i)?.[0]?.toLowerCase();
  if (id) return catalog.find((p) => p.id === id);
  const folded = message.toLowerCase();
  return catalog.find((p) => folded.includes(p.title.toLowerCase()));
}

// ---------- Cards ----------

function quoteDto(lease: LeaseDraft, kind: PaymentKind, atTs: number): PriceQuoteDto {
  // The deposit is returned at move-out, so no discount applies to it (same rule as lib/solana/pay.ts).
  const q = computePrice({
    listBaseUnits: BigInt(kind === 'deposit' ? lease.depositBaseUnits : lease.rentBaseUnits),
    discountUsdcBps: kind === 'deposit' ? 0 : lease.discountUsdcBps,
    discountOntimeBps: kind === 'deposit' ? 0 : lease.discountOntimeBps,
    dueTs: lease.dueTs,
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

function pendingKinds(state: SessionState): PaymentKind[] {
  const paid = new Set(state.payments.map((p) => p.kind));
  return (['deposit', 'rent'] as const).filter((k) => !paid.has(k));
}

function paymentCards(state: SessionState): UiCard[] {
  if (!state.lease) return [];
  const now = Math.floor(Date.now() / 1000);
  const lease = state.lease;
  return pendingKinds(state).map((kind) => ({ type: 'payment', kind, quote: quoteDto(lease, kind, now) }));
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
        ? `el nombre en ${issue.docType === 'payslip' ? 'el recibo de sueldo' : 'uno de los documentos'} no coincide con el de tu DNI. Subí un documento a tu nombre; la inmobiliaria va a revisar el caso.`
        : `the name on ${issue.docType === 'payslip' ? 'your payslip' : 'one of your documents'} does not match your DNI. Please upload a document in your name; the agency will review the case.`;
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
      : "You're prequalified! Your documents are complete, the payslip is recent, the rent is within 35% of your income, and our independent crosscheck agrees. Shall I prepare the lease contract?";
  }
  const issues = decision.decidedBy === 'crosscheck' ? decision.crosscheck.discrepancies : [...decision.prequal.issues, ...decision.crosscheck.discrepancies];
  const reasons = issues.map((i) => `- ${issueText(i, lang)}`).join('\n');
  if (decision.decidedBy === 'crosscheck') {
    return es
      ? `El agente de precalificación aprobó tus documentos, pero el agente de control cruzado encontró una inconsistencia:\n${reasons}\nPor eso queda en "necesita información" hasta que se resuelva.`
      : `The prequalification agent approved your documents, but our independent crosscheck agent found an inconsistency:\n${reasons}\nSo your application needs more information before we can continue.`;
  }
  if (decision.status === 'REJECTED') {
    return es
      ? `Por ahora no podemos avanzar con esta propiedad:\n${reasons}\nPodés buscar una opción más económica.`
      : `We can't move forward with this property for now:\n${reasons}\nYou could look for a more affordable option.`;
  }
  return es ? `Necesito un poco más de información:\n${reasons}` : `I need a bit more information:\n${reasons}`;
}

function paymentReply(cards: UiCard[], lang: Lang): string {
  const es = lang === 'es';
  const parts = cards.flatMap((c) => {
    if (c.type !== 'payment') return [];
    const list = formatUsdc(c.quote.listBaseUnits);
    const amount = formatUsdc(c.quote.amountBaseUnits);
    if (c.kind === 'deposit') {
      return [es ? `Depósito: ${amount} USDC (se devuelve al final, sin descuento).` : `Deposit: ${amount} USDC (returned at move-out, no discount).`];
    }
    return [
      es
        ? `Primer mes: ${list} USDC de lista, ${amount} USDC pagando en USDC y a tiempo (${c.quote.discountBps / 100}% de descuento).`
        : `First month's rent: ${list} USDC list price, ${amount} USDC if you pay in USDC and on time (${c.quote.discountBps / 100}% off).`,
    ];
  });
  if (parts.length === 0) return es ? 'No hay pagos pendientes.' : 'There are no pending payments.';
  const tail = es
    ? 'Usá los botones de pago. Demo en Solana devnet con un token de prueba.'
    : 'Use the pay buttons. Demo on Solana devnet with a test token.';
  return `${parts.join('\n')}\n${tail}`;
}

// ---------- Stage handlers ----------

async function handleSearch(s: SessionState, message: string, lang: Lang): Promise<StageOutput> {
  const catalog = loadCatalog();
  const picked = SELECT_INTENT.test(message) ? referencedProperty(message, catalog) : undefined;
  if (picked) {
    const next: SessionState = { ...s, selectedPropertyId: picked.id, stage: 'VISIT' };
    const reply =
      lang === 'es'
        ? `Buena elección: ${picked.title} (${picked.zone}, ${picked.priceUsdc} USDC/mes). Puedo agendarte una visita ${VISIT_SLOT.es} (agenda simulada). ¿La confirmo?`
        : `Great choice: ${picked.title} (${picked.zone}, ${picked.priceUsdc} USDC/month). I can book a visit ${VISIT_SLOT.en} (simulated agenda). Shall I confirm it?`;
    return { reply, cards: [{ type: 'properties', properties: [picked] }], state: next };
  }
  const turn = await runListingsAgent({ message, history: s.history, catalog, lang });
  const cards: UiCard[] = turn.properties.length > 0 ? [{ type: 'properties', properties: turn.properties }] : [];
  return { reply: turn.reply, cards, state: s };
}

function documentsRequest(lang: Lang): string {
  return lang === 'es'
    ? 'Siguiente paso: precalificación. Necesito tu DNI, tu último recibo de sueldo, una constancia de ingresos y una garantía (seguro de caución). En esta demo, solo decime que estás subiendo tus documentos.'
    : 'Next step: prequalification. I need your DNI, your latest payslip, an income certificate and a guarantee (surety insurance). In this demo, just tell me you are uploading your documents.';
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
      ? `Visita confirmada ${VISIT_SLOT.es}${property ? ` en ${property.title}` : ''} (agenda simulada).`
      : `Visit confirmed for ${VISIT_SLOT.en}${property ? ` at ${property.title}` : ''} (simulated agenda).`;
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
    return { reply: paymentReply(cards, lang), cards, state: next };
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
  // Never trust the client-held stage for an approval: recompute on the server.
  const decision = await evaluateTenant(s.tenantId, property?.priceUsdc);
  if (decision.status !== 'APPROVED') {
    return { reply: decisionReply(decision, lang), cards: [{ type: 'prequal', decision }], state: { ...s, stage: 'DOCUMENTS' } };
  }
  const lease = createLeaseDraft(s.tenantId, s.selectedPropertyId);
  const next = applyEvent(s, { type: 'lease_created', lease });
  const cards: UiCard[] = [{ type: 'contract', lease }, ...paymentCards(next)];
  const intro =
    lang === 'es'
      ? `Contrato listo (demo, datos simulados, no es asesoramiento legal). Su huella SHA-256 es ${lease.contractHash.slice(0, 12)}…; va a quedar registrada en cada pago para que cualquiera pueda verificarlo.`
      : `Your lease contract is ready (demo, simulated data, not legal advice). Its SHA-256 fingerprint is ${lease.contractHash.slice(0, 12)}…, and it is recorded with every payment so anyone can verify it.`;
  return { reply: `${intro}\n${paymentReply(cards, lang)}`, cards, state: next };
}

function handlePayment(s: SessionState, lang: Lang): StageOutput {
  const cards = paymentCards(s);
  return { reply: paymentReply(cards, lang), cards, state: s };
}

function handleActive(s: SessionState, message: string, lang: Lang): StageOutput {
  if (MOVE_OUT_INTENT.test(message)) return handleMoveOut({ ...s, stage: 'MOVE_OUT' }, lang);
  const cards: UiCard[] = s.payments.map((result) => ({ type: 'receipt', result }));
  const onTime = s.payments.filter((p) => p.kind === 'rent' && p.onTime).length;
  const reply =
    lang === 'es'
      ? `Tu contrato está activo. Pagos registrados: ${s.payments.length}${onTime > 0 ? `, ${onTime} alquiler(es) a tiempo` : ''}. Cada recibo tiene su link al explorador de devnet.`
      : `Your lease is active. Payments on record: ${s.payments.length}${onTime > 0 ? `, ${onTime} on-time rent payment(s)` : ''}. Each receipt links to the devnet explorer.`;
  return { reply, cards, state: s };
}

function handleMoveOut(s: SessionState, lang: Lang): StageOutput {
  const reply =
    lang === 'es'
      ? 'La mudanza y la devolución del depósito con firma 2 de 3 (inquilino, propietario, inmobiliaria) llegan en la próxima versión. En esta demo esta etapa es un esbozo.'
      : 'Move-out and the 2-of-3 deposit release (tenant, landlord, agency) are coming in the next version. In this demo this stage is a stub.';
  return { reply, cards: [], state: s };
}

// ---------- Public API ----------

function boundedHistory(history: ChatTurn[]): ChatTurn[] {
  return history.slice(-MAX_HISTORY_ENTRIES);
}

export async function runTurn(state: SessionState, message: string): Promise<TurnResult> {
  const lang = detectLanguage(message);
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
      out = handlePayment(s, lang);
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
