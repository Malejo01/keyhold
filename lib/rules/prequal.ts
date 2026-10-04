import type { DocType, ExtractedApplication, Issue, PrequalStatus } from '../contracts';

/**
 * Deterministic prequalification rules (AD-01: the model extracts, the code decides).
 * Pure functions: same extraction + same context => same decision.
 */

export const REQUIRED_DOCUMENTS: readonly DocType[] = ['dni', 'payslip', 'income_proof', 'guarantee'];
export const MAX_PAYSLIP_AGE_DAYS = 90;
/** Rent must be at most 35% of monthly income. */
export const MAX_RENT_TO_INCOME = 0.35;
/**
 * Sanity bound on an extracted monthly income. A figure above it is treated as unverifiable, never as an approval:
 * it is the deterministic backstop for a document that tries to inflate the income the model reads from it
 * (prompt injection inside an uploaded file).
 */
export const MAX_PLAUSIBLE_MONTHLY_INCOME_USDC = 25_000;

export interface RuleContext {
  /** Monthly rent being applied for, in USDC. */
  rentUsdc: number;
  /** ISO date (YYYY-MM-DD) the documents are evaluated against. */
  asOf: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(value: string): number | null {
  if (!ISO_DATE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** Whole days from `from` to `to` (both ISO dates). Null if either date is invalid. */
export function daysBetween(from: string, to: string): number | null {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

export function checkRequiredDocuments(present: readonly DocType[]): Issue[] {
  return REQUIRED_DOCUMENTS.filter((d) => !present.includes(d)).map((docType) => ({
    code: 'missing_document' as const,
    docType,
    message: `Missing required document: ${docType.replace('_', ' ')}.`,
  }));
}

/** Only meaningful when a payslip is present. */
export function checkPayslipAge(issueDate: string | null, asOf: string): Issue[] {
  if (issueDate === null) {
    return [{ code: 'missing_document', docType: 'payslip', message: 'The payslip issue date could not be read.' }];
  }
  const age = daysBetween(issueDate, asOf);
  if (age === null) {
    return [{ code: 'missing_document', docType: 'payslip', message: `The payslip issue date "${issueDate}" is not a valid date.` }];
  }
  if (age < 0) {
    return [{ code: 'missing_document', docType: 'payslip', message: `The payslip is dated in the future (${issueDate}).` }];
  }
  if (age > MAX_PAYSLIP_AGE_DAYS) {
    return [{
      code: 'expired_payslip',
      docType: 'payslip',
      message: `The payslip was issued on ${issueDate}, ${age} days before ${asOf}. It must be at most ${MAX_PAYSLIP_AGE_DAYS} days old.`,
      evidence: {
        field: 'payslip_issue_date',
        rule: `The payslip must be at most ${MAX_PAYSLIP_AGE_DAYS} days old.`,
        compared: [
          { docType: 'payslip', label: 'Payslip issue date', value: `${issueDate} (${age} days old)`, mismatch: true },
          { docType: 'payslip', label: 'Reference date', value: asOf },
        ],
      },
    }];
  }
  return [];
}

/** `incomeDocType`: the document the income figure was read from (for the evidence only). */
export function checkRentToIncome(monthlyIncomeUsdc: number | null, rentUsdc: number, incomeDocType: DocType = 'payslip'): Issue[] {
  if (monthlyIncomeUsdc === null || !(monthlyIncomeUsdc > 0)) {
    return [{ code: 'missing_document', docType: 'income_proof', message: 'Monthly income could not be read from the documents.' }];
  }
  if (monthlyIncomeUsdc > MAX_PLAUSIBLE_MONTHLY_INCOME_USDC) {
    return [{
      code: 'missing_document',
      docType: 'income_proof',
      message: `The monthly income read from the documents (${monthlyIncomeUsdc} USDC) is implausible and could not be verified automatically.`,
    }];
  }
  const ratio = rentUsdc / monthlyIncomeUsdc;
  if (ratio > MAX_RENT_TO_INCOME) {
    const pct = (ratio * 100).toFixed(1);
    return [{
      code: 'income_ratio_exceeded',
      message: `Rent of ${rentUsdc} USDC is ${pct}% of a monthly income of ${monthlyIncomeUsdc} USDC (max ${MAX_RENT_TO_INCOME * 100}%).`,
      evidence: {
        field: 'rent_to_income',
        rule: `Rent must be at most ${MAX_RENT_TO_INCOME * 100}% of monthly income.`,
        compared: [
          { docType: incomeDocType, label: 'Monthly income', value: `${monthlyIncomeUsdc} USDC` },
          { docType: incomeDocType, label: 'Monthly rent', value: `${rentUsdc} USDC (${pct}% of income)`, mismatch: true },
        ],
      },
    }];
  }
  return [];
}

/** income_ratio_exceeded => REJECTED; any other issue => NEEDS_INFO; none => APPROVED. */
export function statusFromIssues(issues: readonly Issue[]): PrequalStatus {
  if (issues.some((i) => i.code === 'income_ratio_exceeded')) return 'REJECTED';
  return issues.length > 0 ? 'NEEDS_INFO' : 'APPROVED';
}

/**
 * Prequal rules: completeness, payslip age and rent-to-income.
 * Name matching is deliberately NOT here: it runs on crosscheck's independent per-document extraction
 * (PLAN.md §4, design note for Carla).
 */
export function evaluatePrequalRules(
  extracted: ExtractedApplication,
  ctx: RuleContext,
): { status: PrequalStatus; issues: Issue[] } {
  const issues: Issue[] = [...checkRequiredDocuments(extracted.documentsPresent)];
  if (extracted.documentsPresent.includes('payslip')) {
    issues.push(...checkPayslipAge(extracted.payslipIssueDate, ctx.asOf));
  }
  issues.push(...checkRentToIncome(extracted.monthlyIncomeUsdc, ctx.rentUsdc));
  return { status: statusFromIssues(issues), issues };
}
