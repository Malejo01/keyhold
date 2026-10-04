import { describe, expect, it } from 'vitest';
import type { PrequalResult } from '../contracts';
import { compareWithPrequal, finalizeDecision, findCrosscheckIssues, type CrosscheckExtraction } from './crosscheck';

const ctx = { rentUsdc: 480, asOf: '2026-10-03' };

function docs(payslipName: string, payslipDate = '2026-09-29'): CrosscheckExtraction {
  return {
    documents: [
      { docType: 'dni', holderName: 'DEMO INVENTADA, CARLA BEATRIZ', issueDate: '2022-01-10', monthlyIncomeUsdc: null },
      { docType: 'payslip', holderName: payslipName, issueDate: payslipDate, monthlyIncomeUsdc: 2300 },
      { docType: 'income_proof', holderName: 'Carla Beatriz Demo Inventada', issueDate: '2026-09-24', monthlyIncomeUsdc: 2300 },
      { docType: 'guarantee', holderName: 'Carla Demo Inventada', issueDate: '2026-09-26', monthlyIncomeUsdc: null },
    ],
  };
}

function prequal(status: PrequalResult['status'], issues: PrequalResult['issues'] = []): PrequalResult {
  return {
    tenantId: 'carla',
    status,
    issues,
    extracted: { applicantName: 'Carla Beatriz Demo Inventada', documentsPresent: ['dni', 'payslip', 'income_proof', 'guarantee'], payslipIssueDate: '2026-09-29', monthlyIncomeUsdc: 2300 },
  };
}

describe('crosscheck rules', () => {
  it('finds no issue when every name matches the DNI', () => {
    expect(findCrosscheckIssues(docs('Carla Beatriz Demo Inventada'), ctx)).toEqual([]);
  });

  it('flags a payslip issued to a different name', () => {
    const issues = findCrosscheckIssues(docs('Camila Demo Inventada'), ctx);
    expect(issues).toEqual([expect.objectContaining({ code: 'name_mismatch', docType: 'payslip' })]);
  });

  it('Carla: prequal APPROVED + crosscheck name_mismatch => NEEDS_INFO decided by crosscheck', () => {
    const pq = prequal('APPROVED');
    const cc = compareWithPrequal(pq, findCrosscheckIssues(docs('Camila Demo Inventada'), ctx));
    expect(cc.agrees).toBe(false);
    const final = finalizeDecision(pq, cc);
    expect(final.status).toBe('NEEDS_INFO');
    expect(final.decidedBy).toBe('crosscheck');
  });

  it('Bruno: both agents find the expired payslip => crosscheck agrees, decided by prequal', () => {
    const expired = { code: 'expired_payslip' as const, docType: 'payslip' as const, message: 'old' };
    const pq = prequal('NEEDS_INFO', [expired]);
    const cc = compareWithPrequal(pq, findCrosscheckIssues(docs('Carla Beatriz Demo Inventada', '2026-06-05'), ctx));
    expect(cc.agrees).toBe(true);
    const final = finalizeDecision(pq, cc);
    expect(final).toMatchObject({ status: 'NEEDS_INFO', decidedBy: 'prequal' });
  });

  it('Ana: agreement keeps APPROVED', () => {
    const pq = prequal('APPROVED');
    const final = finalizeDecision(pq, compareWithPrequal(pq, []));
    expect(final).toMatchObject({ status: 'APPROVED', decidedBy: 'prequal' });
  });
});

describe('name_mismatch evidence keys', () => {
  it('carries ruleKey, labelKeys and the raw names', () => {
    const ev = findCrosscheckIssues(docs('Camila Demo Inventada'), ctx)[0]?.evidence;
    expect(ev?.ruleKey).toBe('name_must_match_id');
    expect(ev?.compared.map((c) => [c.labelKey, c.raw, Boolean(c.mismatch)])).toEqual([
      ['name_on_id', 'DEMO INVENTADA, CARLA BEATRIZ', false],
      ['name_on_document', 'Camila Demo Inventada', true],
    ]);
  });
});
