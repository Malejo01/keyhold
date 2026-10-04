/**
 * Writes HAND-AUTHORED recordings for REPLAY=1 when no API key is available.
 * A scripted provider returns, for each call, the exact JSON shape the real model returns
 * (structured-output JSON for extraction, text/tool_use blocks for chat steps). The real agents and
 * rules run on top of it, so the replay keys are the ones the app computes.
 * Every file is marked "source": "hand-authored". Replace them with `tsx evals/record.ts` once a key exists.
 *
 * Usage: pnpm exec tsx evals/hand-author.ts
 */
import type { TenantId } from '../lib/contracts';
import { setProvider } from '../lib/ai';
import type { AiProvider, ChatStepCall, ChatStepResult, StructuredCall } from '../lib/ai/types';
import { CROSSCHECK_EXTRACTION_SYSTEM, PREQUAL_EXTRACTION_SYSTEM } from '../lib/agents/prompts';
import { recordAllScenarios } from './lib/scenarios';

const PREQUAL: Record<TenantId, unknown> = {
  ana: {
    applicantName: 'ANA LUCIA TESTA FICTICIA',
    documentsPresent: ['dni', 'payslip', 'income_proof', 'guarantee'],
    payslipIssueDate: '2026-09-30',
    monthlyIncomeUsdc: 2450,
  },
  bruno: {
    applicantName: 'BRUNO EJEMPLO SIMULADO',
    documentsPresent: ['dni', 'payslip', 'income_proof', 'guarantee'],
    payslipIssueDate: '2026-06-05',
    monthlyIncomeUsdc: 2700,
  },
  carla: {
    applicantName: 'CARLA BEATRIZ DEMO INVENTADA',
    documentsPresent: ['dni', 'payslip', 'income_proof', 'guarantee'],
    payslipIssueDate: '2026-09-29',
    monthlyIncomeUsdc: 2300,
  },
};

const CROSSCHECK: Record<TenantId, unknown> = {
  ana: {
    documents: [
      { docType: 'dni', holderName: 'ANA LUCIA TESTA FICTICIA', issueDate: '2021-07-01', monthlyIncomeUsdc: null },
      { docType: 'payslip', holderName: 'Ana Lucia Testa Ficticia', issueDate: '2026-09-30', monthlyIncomeUsdc: 2450 },
      { docType: 'income_proof', holderName: 'Ana Testa Ficticia', issueDate: '2026-09-25', monthlyIncomeUsdc: 2450 },
      { docType: 'guarantee', holderName: 'Ana Lucia Testa Ficticia', issueDate: '2026-09-28', monthlyIncomeUsdc: null },
    ],
  },
  bruno: {
    documents: [
      { docType: 'dni', holderName: 'BRUNO EJEMPLO SIMULADO', issueDate: '2020-05-15', monthlyIncomeUsdc: null },
      { docType: 'payslip', holderName: 'Bruno Ejemplo Simulado', issueDate: '2026-06-05', monthlyIncomeUsdc: 2700 },
      { docType: 'income_proof', holderName: 'Bruno Ejemplo Simulado', issueDate: '2026-09-22', monthlyIncomeUsdc: 2700 },
      { docType: 'guarantee', holderName: 'Bruno Ejemplo Simulado', issueDate: '2026-09-20', monthlyIncomeUsdc: null },
    ],
  },
  carla: {
    documents: [
      { docType: 'dni', holderName: 'CARLA BEATRIZ DEMO INVENTADA', issueDate: '2022-01-10', monthlyIncomeUsdc: null },
      { docType: 'payslip', holderName: 'Camila Demo Inventada', issueDate: '2026-09-29', monthlyIncomeUsdc: 2300 },
      { docType: 'income_proof', holderName: 'Carla Beatriz Demo Inventada', issueDate: '2026-09-24', monthlyIncomeUsdc: 2300 },
      { docType: 'guarantee', holderName: 'Carla Demo Inventada', issueDate: '2026-09-26', monthlyIncomeUsdc: null },
    ],
  },
};

function tenantOf(user: string): TenantId {
  for (const t of ['ana', 'bruno', 'carla'] as const) if (user.includes(`file_name="${t}-dni-front.txt"`)) return t;
  throw new Error('Hand-authored provider: unknown tenant in input.');
}

const handAuthored: AiProvider = {
  name: 'hand-authored',
  isConfigured: () => true,
  async generateJson(call: StructuredCall): Promise<unknown> {
    const tenant = tenantOf(call.user);
    if (call.system === PREQUAL_EXTRACTION_SYSTEM) return PREQUAL[tenant];
    if (call.system === CROSSCHECK_EXTRACTION_SYSTEM) return CROSSCHECK[tenant];
    throw new Error('Hand-authored provider: unknown structured agent.');
  },
  async chatStep(call: ChatStepCall): Promise<ChatStepResult> {
    const last = call.messages[call.messages.length - 1];
    const answeredTool = last.content.some((b) => b.type === 'tool_result');
    if (!answeredTool) {
      return {
        stopReason: 'tool_use',
        content: [
          { type: 'text', text: 'Let me check the catalog.' },
          { type: 'tool_use', id: 'toolu_hand_authored_01', name: 'search_properties', input: { bedrooms: 6 } },
        ],
      };
    }
    return {
      stopReason: 'end_turn',
      content: [
        {
          type: 'text',
          text:
            "I searched our catalog for homes with 6 or more bedrooms and found no matching property, so I don't know of " +
            "any house like that and can't give you a price. If you tell me a zone in Salta, a budget or a smaller number " +
            "of bedrooms, I'll search again.",
        },
      ],
    };
  },
};

async function main(): Promise<void> {
  setProvider(handAuthored);
  console.log('Writing hand-authored recordings...');
  const files = await recordAllScenarios();
  console.log(`Wrote ${files.length} hand-authored recordings to evals/recordings.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
