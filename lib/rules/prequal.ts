import type { DocType, ExtractedApplication, Issue, PrequalStatus } from '../contracts';

/**
 * Deterministic prequalification rules (AD-01: the model extracts, the code decides).
 * Pure functions: same extraction + same context => same decision.
 */

export const REQUIRED_DOCUMENTS: readonly DocType[] = ['dni', 'payslip', 'income_proof', 'guarantee'];
export const MAX_PAYSLIP_AGE_DAYS = 90;
/** Rent must be at most 35% of monthly income. */
export const MAX_RENT_TO_INCOME = 0.35;

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
    }];
  }
  return [];
}

export function checkRentToIncome(monthlyIncomeUsdc: number | null, rentUsdc: number): Issue[] {
  if (monthlyIncomeUsdc === null || !(monthlyIncomeUsdc > 0)) {
    return [{ code: 'missing_document', docType: 'income_proof', message: 'Monthly income could not be read from the documents.' }];
  }
  const ratio = rentUsdc / monthlyIncomeUsdc;
  if (ratio > MAX_RENT_TO_INCOME) {
    return [{
      code: 'income_ratio_exceeded',
      message: `Rent of ${rentUsdc} USDC is ${(ratio * 100).toFixed(1)}% of a monthly income of ${monthlyIncomeUsdc} USDC (max ${MAX_RENT_TO_INCOME * 100}%).`,
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
