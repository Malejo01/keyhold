import type { CrosscheckResult, DocType, FinalDecision, Issue, PrequalResult } from '../contracts';
import { namesMatch } from './names';
import { checkPayslipAge, checkRentToIncome, checkRequiredDocuments, type RuleContext } from './prequal';

/** One entry per document, extracted independently by the crosscheck agent. */
export interface CrosscheckDocument {
  docType: DocType;
  holderName: string | null;
  /** ISO date (YYYY-MM-DD). */
  issueDate: string | null;
  monthlyIncomeUsdc: number | null;
}

export interface CrosscheckExtraction {
  documents: CrosscheckDocument[];
}

function firstOf(ext: CrosscheckExtraction, docType: DocType): CrosscheckDocument | undefined {
  return ext.documents.find((d) => d.docType === docType);
}

/** Every person name on a supporting document must match the DNI holder. */
export function checkNameConsistency(ext: CrosscheckExtraction): Issue[] {
  const dni = firstOf(ext, 'dni');
  if (!dni) return [];
  if (!dni.holderName) {
    return [{ code: 'missing_document', docType: 'dni', message: 'The name on the ID (DNI) could not be read.' }];
  }
  const issues: Issue[] = [];
  for (const doc of ext.documents) {
    if (doc.docType === 'dni' || !doc.holderName) continue;
    if (!namesMatch(dni.holderName, doc.holderName)) {
      issues.push({
        code: 'name_mismatch',
        docType: doc.docType,
        message: `The ${doc.docType.replace('_', ' ')} is issued to "${doc.holderName}", but the ID (DNI) belongs to "${dni.holderName}".`,
        evidence: {
          field: 'holder_name',
          rule: 'The name on every document must match the ID.',
          ruleKey: 'name_must_match_id',
          compared: [
            { docType: 'dni', label: 'Name on ID', labelKey: 'name_on_id', raw: dni.holderName, value: dni.holderName },
            { docType: doc.docType, label: `Name on ${DOC_LABEL[doc.docType]}`, labelKey: 'name_on_document', raw: doc.holderName, value: doc.holderName, mismatch: true },
          ],
        },
      });
    }
  }
  return issues;
}

const DOC_LABEL: Record<DocType, string> = {
  dni: 'ID',
  payslip: 'payslip',
  income_proof: 'income certificate',
  guarantee: 'guarantee',
};

/** Crosscheck's own rule pass over its own extraction. */
export function findCrosscheckIssues(ext: CrosscheckExtraction, ctx: RuleContext): Issue[] {
  const present = [...new Set(ext.documents.map((d) => d.docType))];
  const issues: Issue[] = [...checkRequiredDocuments(present), ...checkNameConsistency(ext)];
  const payslip = firstOf(ext, 'payslip');
  if (payslip) issues.push(...checkPayslipAge(payslip.issueDate, ctx.asOf));
  const fromPayslip = payslip?.monthlyIncomeUsdc ?? null;
  const income = fromPayslip ?? firstOf(ext, 'income_proof')?.monthlyIncomeUsdc ?? null;
  issues.push(...checkRentToIncome(income, ctx.rentUsdc, fromPayslip !== null ? 'payslip' : 'income_proof'));
  return issues;
}

function sameIssue(a: Issue, b: Issue): boolean {
  return a.code === b.code && (a.docType ?? null) === (b.docType ?? null);
}

/** Discrepancies are crosscheck findings that prequal did not report. */
export function compareWithPrequal(prequal: PrequalResult, crosscheckIssues: readonly Issue[]): CrosscheckResult {
  const discrepancies = crosscheckIssues.filter((i) => !prequal.issues.some((p) => sameIssue(p, i)));
  return { agrees: discrepancies.length === 0, discrepancies };
}

/**
 * Final decision. Disagreement forces NEEDS_INFO (AD-02). `decidedBy` is 'crosscheck' only when
 * crosscheck changed prequal's outcome.
 */
export function finalizeDecision(prequal: PrequalResult, crosscheck: CrosscheckResult): FinalDecision {
  if (crosscheck.agrees) {
    return { status: prequal.status, decidedBy: 'prequal', prequal, crosscheck };
  }
  const changed = prequal.status !== 'NEEDS_INFO';
  return { status: 'NEEDS_INFO', decidedBy: changed ? 'crosscheck' : 'prequal', prequal, crosscheck };
}
