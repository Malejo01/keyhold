import type { DocType, IssueCode, PaymentKind, PrequalStatus, Stage } from "../contracts";

/**
 * English dictionary. It defines the shape: `es.ts` is typed as `Dict`, so a key missing there is a type error.
 * Values are plain strings, or small functions when a number or a name is part of the sentence.
 * Server values (names, dates, amounts) are never translated here; they are passed in as arguments.
 */
type Step = { title: string; text: string };

export const en = {
  meta: {
    tagline: "AI leasing back-office for rental agencies",
    description:
      "AI agents for rental agencies: tenant pre-qualification, contracts and USDC deposit escrow on Solana. Demo on devnet with simulated data.",
    ogHeadline: "Rental paperwork, checked by AI agents and decided by clear rules.",
    ogLocation: "Built for Salta, Argentina.",
    ogLocale: "en_US",
  },
  banner: "Demo · Solana devnet · simulated data",
  lang: {
    groupLabel: "Language",
    switchTo: { en: "Switch to English", es: "Switch to Spanish" },
  },
  hero: {
    title: "Rental paperwork, checked by AI agents and decided by clear rules.",
    intro: (app: string) =>
      `${app} is an AI leasing back-office built for rental agencies in Salta, Argentina. It pre-qualifies tenants, prepares the contract and collects the deposit and rent (custodial, devnet test tokens).`,
    cta: "Try the demo",
    ctaNote: "No sign-up. Test tokens only.",
    howTitle: "How it works",
    steps: [
      { title: "Find and visit", text: "Search listings and book a viewing in a chat." },
      { title: "Two AI agents check documents", text: "One reads the documents, an independent one cross-checks it." },
      {
        title: "Contract hash, deposit and rent",
        text: "The contract fingerprint and USDC payments are recorded on Solana devnet.",
      },
    ] as [Step, Step, Step],
    demoRegion: "Demo",
    preview: {
      badge: "Preview",
      user: "2-bedroom near Tres Cerritos, pets ok",
      assistant: "Here are the listings that match. Want to book a visit?",
      prequal: "Pre-qualification",
      first: "First review: Approved",
      cross: "Cross-check: reads the same documents again",
      warning: "Name on the payslip does not match the ID.",
    },
  },
  persona: { label: "Demo tenant" },
  chat: {
    region: "Chat",
    conversation: "Conversation",
    typing: (app: string) => `${app} is typing`,
    greeting: (name: string, app: string) => `Hi ${name}, I'm ${app}.`,
    intro:
      "I find rentals, check your documents, prepare the contract and take the deposit. Tell me what you are looking for, or pick a suggestion below.",
    suggested: "Suggested prompts",
    inputLabel: "Message",
    placeholder: "Type your message",
    send: "Send",
    errorPrefix: "Error: ",
    genericError: "Something went wrong. Please try again.",
    startFirst: "Start the conversation first.",
    depositConfirmed: "Deposit payment confirmed.",
    rentConfirmed: "Rent payment confirmed.",
    timelineTitle: "Lease timeline",
    timelineHint: "Follows your conversation, step by step.",
    footnote: "Amounts are in USDC (devnet test token). No real money moves.",
  },
  /** Chip label = button text; `text` is the message sent to the server (the server decides what it means). */
  chips: {
    find: { label: "Find a place" },
    visit: { label: "Book a visit" },
    docs: { label: "Upload my documents" },
    contract: { label: "Generate the contract" },
    deposit: { label: "Pay the deposit" },
    rent: { label: "Pay my first rent" },
  },
  stages: {
    SEARCH: { label: "Search", hint: "Find a place that fits" },
    VISIT: { label: "Visit", hint: "Confirm a viewing" },
    DOCUMENTS: { label: "Documents", hint: "Pre-qualification check" },
    CONTRACT: { label: "Contract", hint: "Review and verify the text" },
    PAYMENT: { label: "Payment", hint: "Deposit and rent" },
    ACTIVE: { label: "Active lease", hint: "Rent payments on record" },
    MOVE_OUT: { label: "Move-out", hint: "Deposit return (coming next)" },
  } as Record<Stage, { label: string; hint: string }>,
  timeline: {
    label: "Lease timeline",
    now: "Now",
    done: "Done",
    state: { done: "completed", current: "current step", pending: "upcoming" },
    stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
  },
  agents: {
    title: "Agent activity",
    waiting: "waiting",
    idleHint: "Agents light up as they work.",
    reviewedBy: "reviewed by cross-check",
    meta: {
      orchestrator: { name: "Orchestrator", role: "Routes each request" },
      listings: { name: "Listings", role: "Searches the catalog" },
      prequal: { name: "Pre-qualification", role: "Reads the documents" },
      crosscheck: { name: "Cross-check", role: "Reviews the first result" },
      lease: { name: "Lease", role: "Drafts the contract" },
    },
    routing: "Working out the next step",
    routed: (stageLabel: string) => `Routed your request · now: ${stageLabel}`,
    listingSingle: (total: number) => `Showing your chosen listing (1 of ${total})`,
    listingFound: (n: number) => `Found ${n} ${n === 1 ? "listing" : "listings"} in the catalog`,
    prequalChecked: (docs: number, approved: boolean) =>
      `Checked ${docs} ${docs === 1 ? "document" : "documents"} → ${approved ? "Approved" : "Needs info"}`,
    crosscheckRead: (agrees: boolean) =>
      `Re-read the documents independently → ${agrees ? "agrees" : "found a mismatch"}`,
    leaseDrafted: (hash8: string) => `Drafted the contract · SHA-256 ${hash8}…`,
  },
  errors: {
    unreachable: "Could not reach the server. Check your connection and try again.",
    notAvailable: "That step is not available yet.",
    failed: (status: number) => `Request failed (${status}).`,
  },
  cards: {
    property: {
      searchResults: "Search results",
      empty: "No matching properties in the catalog. Try a wider budget or zone.",
      listLabel: "Matching properties",
      perMonth: " / month",
      bedrooms: (n: number) => `${n} ${n === 1 ? "bedroom" : "bedrooms"}`,
      petsOk: "Pets ok",
      bookVisit: "Book a visit",
    },
    prequal: {
      region: "Pre-qualification result",
      title: "Pre-qualification",
      status: {
        APPROVED: "Approved",
        NEEDS_INFO: "More information needed",
        REJECTED: "Not eligible",
      } as Record<PrequalStatus, string>,
      issueLabel: {
        missing_document: "Missing document",
        expired_payslip: "Payslip out of date",
        name_mismatch: "Name does not match",
        income_ratio_exceeded: "Income too low for this rent",
      } as Record<IssueCode, string>,
      docLabel: {
        dni: "ID",
        payslip: "Payslip",
        income_proof: "Income proof",
        guarantee: "Guarantee",
      } as Record<DocType, string>,
      /** Lowercase noun used inside sentences. */
      docNoun: {
        dni: "ID (DNI)",
        payslip: "payslip",
        income_proof: "income certificate",
        guarantee: "guarantee",
      } as Record<DocType, string>,
      /** Sentences for each rule finding, built from the server values in `Issue.evidence`. */
      message: {
        missingDocument: (doc: string) => `Missing required document: ${doc}.`,
        unreadable: (doc: string) => `We could not read or validate the data on the ${doc}.`,
        expiredPayslip: (issueDate: string, ageDays: number, asOf: string, maxDays: number) =>
          `The payslip was issued on ${issueDate}, ${ageDays} days before ${asOf}. It must be at most ${maxDays} days old.`,
        nameMismatch: (doc: string, docName: string, idName: string) =>
          `The ${doc} is issued to "${docName}", but the ID (DNI) belongs to "${idName}".`,
        incomeRatio: (rent: string, pct: string, income: string, maxPct: string) =>
          `Rent of ${rent} USDC is ${pct}% of a monthly income of ${income} USDC (max ${maxPct}%).`,
      },
      ruleLabel: "Rule: ",
      /** One sentence per RuleKey. */
      rule: {
        nameMustMatchId: "The name on every document must match the ID.",
        payslipMaxAge: (maxDays: number) => `The payslip must be at most ${maxDays} days old.`,
        rentMaxIncome: (maxPct: string) => `Rent must be at most ${maxPct}% of monthly income.`,
      },
      /** Labels of the compared values, by EvidenceLabelKey. */
      evidenceLabel: {
        nameOnId: "Name on ID",
        nameOnDocument: (doc: string) => `Name on ${doc}`,
        payslipIssueDate: "Payslip issue date",
        referenceDate: "Reference date",
        monthlyIncome: "Monthly income",
        monthlyRent: "Monthly rent",
      },
      daysOld: (n: number) => `${n} days old`,
      ofIncome: (pct: string) => `${pct}% of income`,
      usdc: (amount: string) => `${amount} USDC`,
      /** Tag on the value that breaks the rule, by evidence field. */
      mismatchTag: {
        holderName: "Does not match",
        payslipAge: (maxDays: number) => `Over ${maxDays} days old`,
        rentRatio: (maxPct: string) => `Above ${maxPct}% of income`,
        generic: "Fails the rule",
      },
      bannerTitle: "Independent cross-check found a discrepancy",
      bannerText: "A second agent read the same documents on its own and disagreed with the first result.",
      firstReview: "First review",
      crosscheck: "Cross-check",
      discrepancyFound: "Discrepancy found",
      vs: "vs",
      whatFound: "What the cross-check found",
      why: "Why",
      allPassed: "All checks passed, and the independent cross-check agrees.",
      needsInfoFooter:
        "The agency can continue once the items above are fixed. Upload the updated documents to try again.",
      generate: "Generate the contract",
      preparing: "Preparing contract…",
    },
    contract: {
      region: "Lease contract",
      title: "Lease contract",
      months: (n: number) => `${n} months`,
      rent: "Monthly rent",
      deposit: "Deposit",
      start: "Start date",
      discounts: "Discounts",
      discountsValue: (usdc: string, ontime: string) => `−${usdc} USDC, −${ontime} on time`,
      textLabel: "Contract text",
      fingerprint: "Contract fingerprint (SHA-256)",
      verify: "Verify",
      verifying: "Verifying…",
      hintLocked: "Available after the deposit is paid.",
      hintReady: "Checks this text against the fingerprint recorded with your deposit payment.",
      match: "Match: this is the contract you paid against",
      mismatch: "Mismatch: the text was changed",
      computed: "Computed",
      stored: "Stored",
      notFound: "not found on the payment",
      failed: "Verification failed.",
    },
    payment: {
      kind: {
        deposit: { title: "Security deposit", action: "Pay deposit" },
        rent: { title: "Rent payment", action: "Pay rent" },
      } as Record<PaymentKind, { title: string; action: string }>,
      onTime: "On time",
      afterDue: "After due date",
      listPrice: "List price",
      unit: "USDC (devnet test token)",
      paidInUsdc: "Paid in USDC",
      onTimePayment: "On-time payment",
      notApplied: "not applied",
      totalDiscount: "Total discount",
      none: "none",
      confirmed: "Payment confirmed",
      processing: "Confirming your payment…",
      tryAgain: "Try again",
      actionWithAmount: (action: string, amount: string) => `${action} · ${amount} USDC`,
      locked: "Available after the deposit is paid.",
      failed: "The payment could not be completed.",
    },
    receipt: {
      region: "Receipt",
      kindName: { deposit: "Deposit", rent: "Rent" } as Record<PaymentKind, string>,
      title: (kind: string) => `Payment confirmed · ${kind}`,
      onTime: "On-time payment",
      afterDue: "Paid after due date",
      amountPaid: "Amount paid",
      unit: "USDC (devnet test token)",
      discountApplied: "Discount applied",
      none: "none",
      confirmed: "Confirmed",
      receiptId: "Receipt ID",
      explorer: "View on Solana Explorer",
      newTab: "(opens in a new tab)",
    },
  },
};
