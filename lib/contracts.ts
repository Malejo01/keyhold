/**
 * Shared contracts between dev-agent-owned modules. Types only, no runtime code.
 * Frozen after task F0-02: changing anything here needs the lead's approval and a note in PLAN.md §4.
 *
 * Function entry points each owner must export (signatures are part of the contract):
 *
 *   lib/agents/orchestrator.ts  runTurn(state: SessionState, message: string): Promise<TurnResult>
 *   lib/agents/prequal.ts       evaluateTenant(tenantId: TenantId): Promise<FinalDecision>   // prequal + crosscheck + rules
 *   lib/agents/lease.ts         createLeaseDraft(tenantId: TenantId, propertyId: string): LeaseDraft
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

export interface Property {
  id: string;
  title: string;
  zone: string;
  priceUsdc: number;
  bedrooms: number;
  petsAllowed: boolean;
  description: string;
}

// ---------- Prequal / crosscheck ----------

export type PrequalStatus = 'APPROVED' | 'NEEDS_INFO' | 'REJECTED';

export type IssueCode =
  | 'missing_document'
  | 'expired_payslip'
  | 'name_mismatch'
  | 'income_ratio_exceeded';

export type IssueEvidenceField = 'holder_name' | 'payslip_issue_date' | 'rent_to_income';

/** One value shown side by side in the UI. Simulated demo data only; never written on-chain. */
export interface IssueEvidenceItem {
  docType: DocType;
  label: string;
  value: string;
  /** True on the value that breaks the rule. */
  mismatch?: boolean;
}

/** What the deterministic rule compared, so the UI can show it. Filled by lib/rules only. */
export interface IssueEvidence {
  field: IssueEvidenceField;
  rule: string;
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
  | { type: 'properties'; properties: Property[] }
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
}
export interface LeaseResponse {
  lease: LeaseDraft;
  session: SignedSession;
}

/** POST /api/pay — the server builds the PaymentIntent from session.state.lease. */
export interface PayRequest {
  kind: PaymentKind;
  session: SignedSession;
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
