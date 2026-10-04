import { z } from 'zod';
import type { ExtractedApplication, FinalDecision, PrequalResult, TenantId } from '../contracts';
import { generateStructured } from '../ai';
import { finalizeDecision } from '../rules/crosscheck';
import { evaluatePrequalRules, type RuleContext } from '../rules/prequal';
import { runCrosscheck } from './crosscheck';
import { PREQUAL_EXTRACTION_SYSTEM, PROMPT_VERSION, renderDocuments } from './prompts';
import { DOCUMENTS_AS_OF, tenantDocuments, type SeedDocument } from './tenants';

/** Used when the caller does not pass the selected property's rent: the top of the demo catalog range. */
export const DEFAULT_RENT_USDC = 700;

export const ExtractedApplicationSchema = z.strictObject({
  applicantName: z.string().nullable(),
  documentsPresent: z.array(z.enum(['dni', 'payslip', 'income_proof', 'guarantee'])),
  payslipIssueDate: z.string().nullable(),
  monthlyIncomeUsdc: z.number().nullable(),
});

export const PREQUAL_AGENT = `prequal.extract@${PROMPT_VERSION}`;

export async function extractApplication(tenantId: TenantId, docs: SeedDocument[]): Promise<ExtractedApplication> {
  const { data } = await generateStructured({
    agent: PREQUAL_AGENT,
    role: 'extraction',
    system: PREQUAL_EXTRACTION_SYSTEM,
    input: renderDocuments(docs),
    schema: ExtractedApplicationSchema,
    label: tenantId,
  });
  return { ...data, documentsPresent: [...new Set(data.documentsPresent)] };
}

/**
 * Prequal + independent crosscheck + deterministic rules.
 * The model extracts; lib/rules decides every status (AD-01, AD-02).
 */
export async function evaluateTenant(tenantId: TenantId, rentUsdc: number = DEFAULT_RENT_USDC): Promise<FinalDecision> {
  const docs = tenantDocuments(tenantId);
  const ctx: RuleContext = { rentUsdc, asOf: DOCUMENTS_AS_OF };

  const extracted = await extractApplication(tenantId, docs);
  const { status, issues } = evaluatePrequalRules(extracted, ctx);
  const prequal: PrequalResult = { tenantId, status, issues, extracted };

  const { agrees, discrepancies } = await runCrosscheck(tenantId, docs, prequal, ctx);
  return finalizeDecision(prequal, { agrees, discrepancies });
}
