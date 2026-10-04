/**
 * Shared contracts between dev-agent-owned modules. Types only, no runtime code.
 * Frozen after task F0-02: changing anything here needs the lead's approval and a note in PLAN.md §4.
 *
 * Function entry points each owner must export (signatures are part of the contract):
 *
 *   lib/agents/orchestrator.ts  runTurn(state: SessionState, message: string, lang?: Lang): Promise<TurnResult>
 *   lib/agents/prequal.ts       evaluateTenant(tenantId: TenantId): Promise<FinalDecision>   // prequal + crosscheck + rules
 *   lib/agents/lease.ts         createLeaseDraft(tenantId: TenantId, propertyId: string, lang?: Lang): LeaseDraft
 *                               buildPaymentIntent(lease: LeaseDraft, kind: PaymentKind, monthIndex?: number): PaymentIntent
 *   lib/rules/pricing.ts        computePrice(input: PricingInput): PriceQuote
 *   lib/solana/hash.ts          sha256Hex(text: string): string                              // node:crypto only
 *   lib/solana/pay.ts           executePayment(intent: PaymentIntent): Promise<PaymentResult>
 *   lib/solana/verify.ts        readMemoHash(signature: string): Promise<string | null>
 *   lib/db/session.ts           signSession(state: SessionState): SignedSession
 *                               verifySession(signed: SignedSession | undefined): SessionState // throws on bad signature, new session if undefined
 */

// ---------- Domain ----------

export type TenantId = 'ana' | 'bruno' | 'carla';

export type Stage =
  | 'SEARCH'
  | 'VISIT'
  | 'DOCUMENTS'
  | 'CONTRACT'
  | 'PAYMENT'
  | 'ACTIVE'
  | 'MOVE_OUT';

export type DocType = 'dni' | 'payslip' | 'income_proof' | 'guarantee';

/** UI / agent language. The route language (`lang` on the requests) overrides detection from the message text. */
export type Lang = 'es' | 'en';

export interface Property {
  id: string;
  title: string;
  /** Spanish title (optional; English `title` is the fallback). */
  titleEs?: string;
  zone: string;
  priceUsdc: number;
  bedrooms: number;
  petsAllowed: boolean;
  description: string;
  /** Spanish description (optional; English `description` is the fallback). */
  descriptionEs?: string;
}

// ---------- Prequal / crosscheck ----------

export type PrequalStatus = 'APPROVED' | 'NEEDS_INFO' | 'REJECTED';

export type IssueCode =
  | 'missing_document'
  | 'expired_payslip'
  | 'name_mismatch'
  | 'income_ratio_exceeded';

export type IssueEvidenceField = 'holder_name' | 'payslip_issue_date' | 'rent_to_income';

/** Stable keys of the deterministic rules, for the UI to translate. Set by lib/rules only. */
export type RuleKey = 'name_must_match_id' | 'payslip_max_90_days' | 'rent_max_35_pct_income';

/** Stable label keys of the compared values (translatable). */
export type EvidenceLabelKey =
  | 'name_on_id'
  | 'name_on_document'
  | 'payslip_issue_date'
  | 'reference_date'
  | 'monthly_income'
  | 'monthly_rent';

/** One value shown side by side in the UI. Simulated demo data only; never written on-chain. */
export interface IssueEvidenceItem {
  docType: DocType;
  /** English label, kept for the API and back-compat. Prefer `labelKey` for rendering. */
  label: string;
  /** English display value (may contain English words, e.g. "2026-06-05 (120 days old)"). Prefer `raw` plus `IssueEvidence.params`. */
  value: string;
  /** True on the value that breaks the rule. */
  mismatch?: boolean;
  /** Language-neutral label key. Always set by lib/rules (optional only so older fixtures still type-check). */
  labelKey?: EvidenceLabelKey;
  /** Language-neutral value: a name as written, an ISO date (YYYY-MM-DD) or a plain USDC number. */
  raw?: string;
}

/** What the deterministic rule compared, so the UI can show it. Filled by lib/rules only. */
export interface IssueEvidence {
  field: IssueEvidenceField;
  /** English rule sentence, kept for the API and back-compat. */
  rule: string;
  /** Language-neutral rule key. Always set by lib/rules (optional only so older fixtures still type-check). */
  ruleKey?: RuleKey;
  /**
   * Language-neutral numbers/strings the UI needs to phrase the reason, by `field`:
   *   payslip_issue_date: { ageDays, maxAgeDays, asOf }
   *   rent_to_income:     { rentPct, maxPct }
   *   holder_name:        none (the names are in `compared[].raw`)
   */
  params?: Record<string, string | number>;
  compared: IssueEvidenceItem[];
}

export interface Issue {
  code: IssueCode;
  docType?: DocType;
  message: string;
  /** Optional (backward compatible). Present on name_mismatch, expired_payslip and income_ratio_exceeded. */
  evidence?: IssueEvidence;
}

/** Model output of the prequal extraction, validated with zod before any rule runs. */
export interface ExtractedApplication {
  applicantName: string | null;
  documentsPresent: DocType[];
  /** ISO date (YYYY-MM-DD). */
  payslipIssueDate: string | null;
  monthlyIncomeUsdc: number | null;
}

export interface PrequalResult {
  tenantId: TenantId;
  /** Set by lib/rules, never by the model. */
  status: PrequalStatus;
  issues: Issue[];
  extracted: ExtractedApplication;
}

export interface CrosscheckResult {
  /** Set by lib/rules from crosscheck's own independent extraction. */
  agrees: boolean;
  discrepancies: Issue[];
}

export interface FinalDecision {
  /** NEEDS_INFO whenever crosscheck.agrees === false. */
  status: PrequalStatus;
  decidedBy: 'prequal' | 'crosscheck';
  prequal: PrequalResult;
  crosscheck: CrosscheckResult;
}

// ---------- Lease ----------

export interface LeaseDraft {
  /** Random opaque id. Never a name, DNI or address. */
  leaseId: string;
  tenantId: TenantId;
  propertyId: string;
  /** ISO date. */
  startDate: string;
  months: number;
  /** bigint as decimal string, 6 decimals. */
  rentBaseUnits: string;
  depositBaseUnits: string;
  /** Unix seconds; due date of the first rent period. */
  dueTs: number;
  discountUsdcBps: number;
  discountOntimeBps: number;
  /**
   * Language of `contractText`. The hash is over the exact text in that language, so the same lease
   * has a different hash in ES and EN. Absent on sessions created before bilingual support (English).
   */
  lang?: Lang;
  contractText: string;
  /** sha256 hex of contractText. */
  contractHash: string;
}

// ---------- Pricing (owner: solana-client-engineer) ----------

export interface PricingInput {
  listBaseUnits: bigint;
  discountUsdcBps: number;
  discountOntimeBps: number;
  dueTs: number;
  /** Server time for a quote, confirmed tx blockTime for the record. Never client time. */
  atTs: number;
  method: 'usdc' | 'offchain';
}

export interface PriceQuote {
  listBaseUnits: bigint;
  /** list * (10_000 - discountBps) / 10_000, integer math. */
  amountBaseUnits: bigint;
  discountBps: number;
  onTime: boolean;
  breakdown: { usdcBps: number; ontimeBps: number };
}

/** JSON-safe PriceQuote for API responses and UI. */
export interface PriceQuoteDto {
  listBaseUnits: string;
  amountBaseUnits: string;
  discountBps: number;
  onTime: boolean;
  breakdown: { usdcBps: number; ontimeBps: number };
}

// ---------- Payments (agents -> solana) ----------

export type PaymentKind = 'deposit' | 'rent';

/**
 * Memo convention (no PII, ever):
 *   lease:v1:<leaseId>:deposit:<sha256hex>
 *   lease:v1:<leaseId>:rent:<monthIndex>:<sha256hex>
 *   lease:v1:<leaseId>:release:<reasonSha256hex>   (agency panel, custodial deposit release; hash of the reason text)
 * Transactions sent before 2026-10-04 used the legacy prefix `tuki:lease:`; readMemoHash still accepts it.
 */
export interface PaymentIntent {
  leaseId: string;
  kind: PaymentKind;
  /** Required when kind === 'rent'. */
  monthIndex?: number;
  payer: TenantId;
  listAmountBaseUnits: string;
  contractHash: string;
  dueTs: number;
  discountUsdcBps: number;
  discountOntimeBps: number;
}

export interface PaymentResult {
  kind: PaymentKind;
  signature: string;
  explorerUrl: string;
  blockTime: number;
  amountBaseUnits: string;
  discountAppliedBps: number;
  /** Recomputed from blockTime after confirmation. */
  onTime: boolean;
  memo: string;
}

// ---------- UI cards ----------

export type UiCard =
  | { type: 'properties'; properties: Property[]; /** The single picked property awaiting visit confirmation. */ confirmVisit?: boolean }
  | { type: 'prequal'; decision: FinalDecision }
  | { type: 'contract'; lease: LeaseDraft }
  | { type: 'payment'; kind: PaymentKind; quote: PriceQuoteDto }
  | { type: 'receipt'; result: PaymentResult };

// ---------- Session (Phase 0-1: client-held, HMAC-signed by the server) ----------

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * The client stores and resends this blob but is never the source of truth for an approval:
 * prequal/crosscheck are recomputed on the server (evaluateTenant) before a lease is created,
 * and payment amounts are always derived on the server from `lease`.
 */
export interface SessionState {
  sessionId: string;
  stage: Stage;
  tenantId?: TenantId;
  selectedPropertyId?: string;
  lease?: LeaseDraft;
  /**
   * Set by the server after a real document upload was evaluated and APPROVED (B7). Uploaded files are never stored,
   * so the lease step cannot re-run the decision from them; this server-signed attestation (covered by the session
   * HMAC, only valid for `propertyId`) stands in for it. Absent for the simulated-document flow.
   */
  uploadedDocs?: UploadedDocsAttestation;
  payments: PaymentResult[];
  history: ChatTurn[];
  /**
   * Optional and backward compatible (blobs issued before AD-11b lack them; treated as version 0, no age check).
   * `version` increases by one every time the server signs the session; with a database the server keeps the
   * latest version per sessionId and rejects older blobs. `issuedAt` is server time in ms of the last signing.
   */
  version?: number;
  issuedAt?: number;
}

export interface UploadedDocsAttestation {
  status: PrequalStatus;
  propertyId: string;
  /** sha256 hex over the sorted sha256 of the evaluated files. Hashes only, no content, no names. */
  filesDigest: string;
}

export interface SignedSession {
  state: SessionState;
  /** HMAC-SHA256 hex over the canonical JSON of `state`, keyed with SESSION_SECRET. */
  sig: string;
}

export interface TurnResult {
  reply: string;
  cards: UiCard[];
  state: SessionState;
}

// ---------- API routes ----------

/** POST /api/chat */
export interface ChatRequest {
  message: string;
  session?: SignedSession;
  /** Demo persona switcher. Changing it resets the session. */
  tenantId?: TenantId;
  /** Route language. When present it overrides language detection; absent (old clients, e2e): detected from `message`. */
  lang?: Lang;
}
export interface ChatResponse {
  reply: string;
  stage: Stage;
  cards: UiCard[];
  session: SignedSession;
}

/** POST /api/lease — re-runs evaluateTenant on the server; 409 unless APPROVED. */
export interface LeaseRequest {
  session: SignedSession;
  /** Language of the generated contract. Absent: English. */
  lang?: Lang;
}
export interface LeaseResponse {
  lease: LeaseDraft;
  session: SignedSession;
}

/** POST /api/pay — the server builds the PaymentIntent from session.state.lease. */
export interface PayRequest {
  kind: PaymentKind;
  session: SignedSession;
  /** Route language (accepted for symmetry; the payment itself is language-neutral). */
  lang?: Lang;
}
export interface PayResponse {
  result: PaymentResult;
  session: SignedSession;
}

/** POST /api/verify — recomputes sha256(contractText) and compares with the hash in the tx Memo. */
export interface VerifyRequest {
  contractText: string;
  /** Deposit or rent tx signature whose Memo carries the hash. */
  signature: string;
}
export interface VerifyResponse {
  computedHash: string;
  memoHash: string | null;
  match: boolean;
}
