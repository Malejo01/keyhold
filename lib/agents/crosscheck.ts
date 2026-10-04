import { z } from 'zod';
import type { CrosscheckResult, PrequalResult, TenantId } from '../contracts';
import { generateStructured } from '../ai';
import { compareWithPrequal, findCrosscheckIssues, type CrosscheckExtraction } from '../rules/crosscheck';
import type { RuleContext } from '../rules/prequal';
import {
  CROSSCHECK_EXTRACTION_SYSTEM,
  CROSSCHECK_UPLOAD_SYSTEM,
  PROMPT_VERSION,
  UPLOAD_PROMPT_VERSION,
  escapeForTag,
  renderDocuments,
  renderUploadedDocuments,
} from './prompts';
import type { SeedDocument } from './tenants';
import { toAttachments, type UploadedDocument } from './uploads';

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

export const CROSSCHECK_UPLOAD_AGENT = `crosscheck.extract.upload@${UPLOAD_PROMPT_VERSION}`;

/**
 * Same independent crosscheck for real uploads: the original files are attached to the call (multimodal), the
 * prompt treats their content as untrusted data, and the verdict still comes from lib/rules on the extraction.
 * Replay key: agent + sha256 of the file bytes + prequal's extraction (file names never enter the key).
 */
export async function runUploadCrosscheck(
  tenantId: TenantId,
  docs: readonly UploadedDocument[],
  prequal: PrequalResult,
  ctx: RuleContext,
): Promise<CrosscheckResult & { extraction: CrosscheckExtraction }> {
  // prequal's extraction is model output derived from untrusted files: escape it like any other untrusted value.
  const input = `${renderUploadedDocuments(docs)}\n<prequal_output>\n${escapeForTag(JSON.stringify(prequal.extracted))}\n</prequal_output>`;
  const { data: extraction } = await generateStructured({
    agent: CROSSCHECK_UPLOAD_AGENT,
    role: 'extraction',
    system: CROSSCHECK_UPLOAD_SYSTEM,
    input,
    attachments: toAttachments(docs),
    keyContext: prequal.extracted,
    schema: CrosscheckExtractionSchema,
    label: `${tenantId}-upload`,
  });
  const issues = findCrosscheckIssues(extraction, ctx);
  return { ...compareWithPrequal(prequal, issues), extraction };
}
