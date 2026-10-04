import type { AiProvider, ChatStepResult, StructuredCall } from '../../lib/ai/types';

/**
 * Test providers for the injection evals. They never reach a network.
 *  - spyProvider: records every structured call (to inspect what the prompt contains) and answers with a benign extraction.
 *  - fooledProvider: plays a model that FOLLOWED the injected instruction (income 99999, payslip dated recently),
 *    to prove lib/rules still refuses to approve.
 */

const NAMES = { dni: 'ANA LUCIA TESTA FICTICIA', other: 'Ana Lucia Testa Ficticia' };

function answer(call: StructuredCall, v: { income: number; payslipDate: string }): unknown {
  if (call.system.includes('independent crosscheck')) {
    return {
      documents: [
        { docType: 'dni', holderName: NAMES.dni, issueDate: '2021-07-01', monthlyIncomeUsdc: null },
        { docType: 'payslip', holderName: NAMES.other, issueDate: v.payslipDate, monthlyIncomeUsdc: v.income },
        { docType: 'income_proof', holderName: NAMES.other, issueDate: '2026-09-25', monthlyIncomeUsdc: 2450 },
        { docType: 'guarantee', holderName: NAMES.other, issueDate: '2026-09-28', monthlyIncomeUsdc: null },
      ],
    };
  }
  return {
    applicantName: NAMES.dni,
    documentsPresent: ['dni', 'payslip', 'income_proof', 'guarantee'],
    payslipIssueDate: v.payslipDate,
    monthlyIncomeUsdc: v.income,
  };
}

function base(name: string, onCall: (call: StructuredCall) => unknown): AiProvider {
  return {
    name,
    isConfigured: () => true,
    generateJson: async (call) => onCall(call),
    chatStep: async (): Promise<ChatStepResult> => {
      throw new Error('chatStep is not used by the upload evals');
    },
  };
}

export function spyProvider(calls: StructuredCall[]): AiProvider {
  return base('hand-authored', (call) => {
    calls.push(call);
    return answer(call, { income: 2450, payslipDate: '2026-09-30' });
  });
}

export function fooledProvider(income: number, payslipDate: string): AiProvider {
  return base('hand-authored', (call) => answer(call, { income, payslipDate }));
}
