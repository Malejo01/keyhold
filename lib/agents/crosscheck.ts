import { z } from 'zod';
import type { CrosscheckResult, PrequalResult, TenantId } from '../contracts';
import { generateStructured } from '../ai';
import { compareWithPrequal, findCrosscheckIssues, type CrosscheckExtraction } from '../rules/crosscheck';
import type { RuleContext } from '../rules/prequal';
import { CROSSCHECK_EXTRACTION_SYSTEM, PROMPT_VERSION, renderDocuments } from './prompts';
import type { SeedDocument } from './tenants';

const DocTypeSchema = z.enum(['dni', 'payslip', 'income_proof', 'guarantee']);

export const CrosscheckExtractionSchema = z.strictObject({
  documents: z.array(
    z.strictObject({
      docType: DocTypeSchema,
      holderName: z.string().nullable(),
      issueDate: z.string().nullable(),
      monthlyIncomeUsdc: z.number().nullable(),
    }),
  ),
});

export const CROSSCHECK_AGENT = `crosscheck.extract@${PROMPT_VERSION}`;

/**
 * Independent crosscheck (AD-02): its own prompt and its own per-document extraction of the original
 * documents, then deterministic rules on that extraction. The model never returns a verdict.
 * Only prequal's extraction (not its status) is shown, so the replay key does not depend on the rent.
 */
export async function runCrosscheck(
  tenantId: TenantId,
  docs: SeedDocument[],
  prequal: PrequalResult,
  ctx: RuleContext,
): Promise<CrosscheckResult & { extraction: CrosscheckExtraction }> {
  const input = `${renderDocuments(docs)}\n<prequal_output>\n${JSON.stringify(prequal.extracted)}\n</prequal_output>`;
  const { data: extraction } = await generateStructured({
    agent: CROSSCHECK_AGENT,
    role: 'extraction',
    system: CROSSCHECK_EXTRACTION_SYSTEM,
    input,
    schema: CrosscheckExtractionSchema,
    label: tenantId,
  });
  const issues = findCrosscheckIssues(extraction, ctx);
  return { ...compareWithPrequal(prequal, issues), extraction };
}
