/**
 * Fixtures for reviewing the UI without a backend. Used only when the page is opened with `?fixtures=1`.
 * They imitate the server contracts in lib/contracts.ts; the real routes never read this file.
 */
import type {
  ChatRequest,
  ChatResponse,
  FinalDecision,
  LeaseDraft,
  LeaseRequest,
  LeaseResponse,
  PayRequest,
  PayResponse,
  PaymentKind,
  PaymentResult,
  PriceQuoteDto,
  Property,
  SessionState,
  SignedSession,
  TenantId,
  UiCard,
  VerifyRequest,
  VerifyResponse,
} from "@/lib/contracts";
import { FIXTURE_CONTRACT_HASH, FIXTURE_CONTRACT_TEXT } from "./contract";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sign = (state: SessionState): SignedSession => ({ state, sig: "fixture" });
const nowSec = () => Math.floor(Date.now() / 1000);

export const FIXTURE_PROPERTIES: Property[] = [
  {
    id: "prop-01",
    title: "Bright 2-bedroom with balcony",
    zone: "Tres Cerritos",
    priceUsdc: 450,
    bedrooms: 2,
    petsAllowed: true,
    description:
      "Third floor, east-facing balcony, 5 minutes from the park. Building allows small and medium pets.",
  },
  {
    id: "prop-02",
    title: "2-bedroom near Paseo Güemes",
    zone: "Tres Cerritos",
    priceUsdc: 480,
    bedrooms: 2,
    petsAllowed: true,
    description: "Renovated kitchen, shared courtyard and a covered parking spot included in the rent.",
  },
  {
    id: "prop-03",
    title: "Modern 2-bedroom, quiet street",
    zone: "Grand Bourg",
    priceUsdc: 495,
    bedrooms: 2,
    petsAllowed: false,
    description: "New building with a laundry room and a rooftop terrace. Pets are not allowed.",
  },
];

const QUOTE_BASE = {
  listBaseUnits: "450000000",
  amountBaseUnits: "427500000",
  discountBps: 500,
  onTime: true,
  breakdown: { usdcBps: 300, ontimeBps: 200 },
} satisfies PriceQuoteDto;

export const FIXTURE_LEASE: LeaseDraft = {
  leaseId: "lease_7f3a9c21",
  tenantId: "ana",
  propertyId: "prop-01",
  startDate: "2026-11-01",
  months: 12,
  rentBaseUnits: "450000000",
  depositBaseUnits: "450000000",
  dueTs: nowSec() + 5 * 24 * 3600,
  discountUsdcBps: 300,
  discountOntimeBps: 200,
  contractText: FIXTURE_CONTRACT_TEXT,
  contractHash: FIXTURE_CONTRACT_HASH,
};

function decisionFor(tenantId: TenantId): FinalDecision {
  const baseExtracted = {
    documentsPresent: ["dni", "payslip", "income_proof"] as const,
    payslipIssueDate: "2026-09-12",
    monthlyIncomeUsdc: 1400,
  };
  if (tenantId === "bruno") {
    const issue = {
      code: "expired_payslip" as const,
      docType: "payslip" as const,
      message: "The payslip is dated 7 months ago. Documents must be less than 90 days old.",
      evidence: {
        field: "payslip_issue_date" as const,
        rule: "Payslips must be less than 90 days old.",
        compared: [
          { docType: "payslip" as const, label: "Issue date", value: "2026-03-02", mismatch: true },
          { docType: "payslip" as const, label: "Oldest accepted date", value: "2026-07-06" },
        ],
      },
    };
    return {
      status: "NEEDS_INFO",
      decidedBy: "prequal",
      prequal: {
        tenantId,
        status: "NEEDS_INFO",
        issues: [issue],
        extracted: {
          applicantName: "Bruno",
          ...baseExtracted,
          documentsPresent: [...baseExtracted.documentsPresent],
          payslipIssueDate: "2026-03-02",
        },
      },
      crosscheck: { agrees: true, discrepancies: [] },
    };
  }
  if (tenantId === "carla") {
    return {
      status: "NEEDS_INFO",
      decidedBy: "crosscheck",
      prequal: {
        tenantId,
        status: "APPROVED",
        issues: [],
        extracted: {
          applicantName: "Carla",
          ...baseExtracted,
          documentsPresent: [...baseExtracted.documentsPresent],
        },
      },
      crosscheck: {
        agrees: false,
        discrepancies: [
          {
            code: "name_mismatch",
            docType: "payslip",
            message:
              "The name on the payslip differs from the name on the ID. Please upload a matching document.",
            evidence: {
              field: "holder_name",
              rule: "The name on every document must match the ID.",
              compared: [
                { docType: "dni", label: "Holder name", value: "CARLA BEATRIZ DEMO INVENTADA" },
                { docType: "payslip", label: "Employee name", value: "Camila Demo Inventada", mismatch: true },
              ],
            },
          },
        ],
      },
    };
  }
  return {
    status: "APPROVED",
    decidedBy: "prequal",
    prequal: {
      tenantId,
      status: "APPROVED",
      issues: [],
      extracted: {
        applicantName: "Ana",
        ...baseExtracted,
        documentsPresent: [...baseExtracted.documentsPresent],
      },
    },
    crosscheck: { agrees: true, discrepancies: [] },
  };
}

function freshState(tenantId: TenantId): SessionState {
  return {
    sessionId: `fx-${Math.random().toString(36).slice(2, 10)}`,
    stage: "SEARCH",
    tenantId,
    payments: [],
    history: [],
  };
}

export async function fixtureChat(req: ChatRequest): Promise<ChatResponse> {
  await wait(700);
  const tenantId = req.tenantId ?? req.session?.state.tenantId ?? "ana";
  let state: SessionState =
    req.session && req.session.state.tenantId === tenantId
      ? structuredClone(req.session.state)
      : freshState(tenantId);

  const text = req.message.toLowerCase();
  let reply: string;
  const cards: UiCard[] = [];

  if (/document|upload|payslip/.test(text)) {
    const decision = decisionFor(tenantId);
    state.stage = "DOCUMENTS";
    reply =
      decision.status === "APPROVED"
        ? "Thanks, I reviewed your documents. Everything checks out."
        : decision.decidedBy === "crosscheck"
          ? "I reviewed your documents. A second, independent check disagreed with my first result, so I need one more thing from you."
          : "I reviewed your documents. One of them needs to be updated before we can continue.";
    cards.push({ type: "prequal", decision });
  } else if (/contract/.test(text)) {
    if (tenantId !== "ana") {
      reply =
        "I can prepare the contract once your documents are approved. Upload them first and I will check.";
    } else {
      state.stage = "CONTRACT";
      state.lease = { ...FIXTURE_LEASE, tenantId };
      reply =
        "Your contract is ready. Read it through; its fingerprint will be recorded with your deposit payment.";
      cards.push({ type: "contract", lease: state.lease });
    }
  } else if (/deposit/.test(text)) {
    if (!state.lease) {
      reply = "Let's generate the contract first, then I can set up the deposit.";
    } else {
      state.stage = "PAYMENT";
      reply = "Here is your deposit. Paying in USDC and on time lowers the price.";
      cards.push({ type: "payment", kind: "deposit", quote: QUOTE_BASE });
    }
  } else if (/rent/.test(text)) {
    if (!state.lease) {
      reply = "Let's generate the contract first, then we can handle the rent.";
    } else {
      state.stage = "PAYMENT";
      reply = "Here is your first rent payment.";
      cards.push({ type: "payment", kind: "rent", quote: QUOTE_BASE });
    }
  } else if (/visit|book/.test(text)) {
    state.stage = "VISIT";
    reply = "Done. I booked a visit for Saturday at 11:00. I will remind you the day before.";
  } else {
    state.stage = "SEARCH";
    reply = "I found 3 places that match, all from the agency catalog.";
    cards.push({ type: "properties", properties: FIXTURE_PROPERTIES });
  }

  state = {
    ...state,
    history: [...state.history, { role: "user", text: req.message }, { role: "assistant", text: reply }],
  };
  return { reply, stage: state.stage, cards, session: sign(state) };
}

export async function fixtureLease(req: LeaseRequest): Promise<LeaseResponse> {
  await wait(600);
  const tenantId = req.session.state.tenantId ?? "ana";
  if (decisionFor(tenantId).status !== "APPROVED") {
    throw new Error("The contract is available once your documents are approved.");
  }
  const lease = { ...FIXTURE_LEASE, tenantId };
  return { lease, session: sign({ ...req.session.state, stage: "CONTRACT", lease }) };
}

function fakeSignature(): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return Array.from({ length: 88 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export async function fixturePay(req: PayRequest): Promise<PayResponse> {
  await wait(1600);
  const kind: PaymentKind = req.kind;
  const signature = fakeSignature();
  const result: PaymentResult = {
    kind,
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    blockTime: nowSec(),
    amountBaseUnits: QUOTE_BASE.amountBaseUnits,
    discountAppliedBps: QUOTE_BASE.discountBps,
    onTime: true,
    memo: `lease:v1:${FIXTURE_LEASE.leaseId}:${kind === "rent" ? "rent:0" : kind}:${FIXTURE_CONTRACT_HASH}`,
  };
  const state = req.session.state;
  return {
    result,
    session: sign({
      ...state,
      stage: kind === "rent" ? "ACTIVE" : "PAYMENT",
      payments: [...state.payments, result],
    }),
  };
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function fixtureVerify(req: VerifyRequest): Promise<VerifyResponse> {
  await wait(700);
  const computedHash = await sha256Hex(req.contractText);
  return { computedHash, memoHash: FIXTURE_CONTRACT_HASH, match: computedHash === FIXTURE_CONTRACT_HASH };
}
