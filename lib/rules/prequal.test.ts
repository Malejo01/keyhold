import { describe, expect, it } from 'vitest';
import type { ExtractedApplication } from '../contracts';
import { checkPayslipAge, checkRentToIncome, daysBetween, evaluatePrequalRules, statusFromIssues } from './prequal';

const AS_OF = '2026-10-03';
const complete: ExtractedApplication = {
  applicantName: 'Ana Lucia Testa Ficticia',
  documentsPresent: ['dni', 'payslip', 'income_proof', 'guarantee'],
  payslipIssueDate: '2026-09-30',
  monthlyIncomeUsdc: 2450,
};

describe('daysBetween', () => {
  it('counts whole days and rejects invalid dates', () => {
    expect(daysBetween('2026-06-05', AS_OF)).toBe(120);
    expect(daysBetween('05/06/2026', AS_OF)).toBeNull();
  });
});

describe('checkPayslipAge', () => {
  it('accepts exactly 90 days', () => {
    expect(checkPayslipAge('2026-07-05', AS_OF)).toEqual([]);
  });
  it('flags 91 days as expired', () => {
    expect(checkPayslipAge('2026-07-04', AS_OF)[0]?.code).toBe('expired_payslip');
  });
  it('treats missing or future dates as needing info, not as expired', () => {
    expect(checkPayslipAge(null, AS_OF)[0]?.code).toBe('missing_document');
    expect(checkPayslipAge('2026-12-01', AS_OF)[0]?.code).toBe('missing_document');
  });
});

describe('checkRentToIncome', () => {
  it('accepts rent at exactly 35% of income', () => {
    expect(checkRentToIncome(2000, 700)).toEqual([]);
  });
  it('rejects rent above 35% of income', () => {
    expect(checkRentToIncome(1500, 700)[0]?.code).toBe('income_ratio_exceeded');
  });
  it('asks for info when income is unknown', () => {
    expect(checkRentToIncome(null, 500)[0]?.code).toBe('missing_document');
  });
});

describe('evaluatePrequalRules', () => {
  it('approves a complete, recent, affordable application', () => {
    expect(evaluatePrequalRules(complete, { rentUsdc: 700, asOf: AS_OF })).toEqual({ status: 'APPROVED', issues: [] });
  });
  it('returns NEEDS_INFO(expired_payslip) for an old payslip', () => {
    const r = evaluatePrequalRules({ ...complete, payslipIssueDate: '2026-06-05' }, { rentUsdc: 480, asOf: AS_OF });
    expect(r.status).toBe('NEEDS_INFO');
    expect(r.issues.map((i) => i.code)).toEqual(['expired_payslip']);
  });
  it('returns NEEDS_INFO(missing_document) for a missing guarantee', () => {
    const r = evaluatePrequalRules({ ...complete, documentsPresent: ['dni', 'payslip', 'income_proof'] }, { rentUsdc: 480, asOf: AS_OF });
    expect(r.status).toBe('NEEDS_INFO');
    expect(r.issues).toEqual([expect.objectContaining({ code: 'missing_document', docType: 'guarantee' })]);
  });
  it('rejects when the rent-to-income ratio is exceeded', () => {
    expect(statusFromIssues(evaluatePrequalRules({ ...complete, monthlyIncomeUsdc: 1000 }, { rentUsdc: 700, asOf: AS_OF }).issues)).toBe('REJECTED');
  });
});
