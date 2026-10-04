import { z } from 'zod';
import type { ExtractedApplication, FinalDecision, PrequalResult, TenantId } from '../contracts';
import { generateStructured } from '../ai';
import { finalizeDecision } from '../rules/crosscheck';
import { evaluatePrequalRules, type RuleContext } from '../rules/prequal';
import { runCrosscheck, runUploadCrosscheck } from './crosscheck';
import {
  PREQUAL_EXTRACTION_SYSTEM,
  PREQUAL_UPLOAD_SYSTEM,
  PROMPT_VERSION,
  UPLOAD_PROMPT_VERSION,
  renderDocuments,
  renderUploadedDocuments,
} from './prompts';
import { DOCUMENTS_AS_OF, tenantDocuments, type SeedDocument } from './tenants';
import { toAttachments, type UploadedDocument } from './uploads';

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

export const PREQUAL_UPLOAD_AGENT = `prequal.extract.upload@${UPLOAD_PROMPT_VERSION}`;

/** Multimodal extraction of real uploads. Replay key: agent + sha256 of the file bytes. */
export async function extractUploadedApplication(tenantId: TenantId, docs: readonly UploadedDocument[]): Promise<ExtractedApplication> {
  const { data } = await generateStructured({
    agent: PREQUAL_UPLOAD_AGENT,
    role: 'extraction',
    system: PREQUAL_UPLOAD_SYSTEM,
    input: renderUploadedDocuments(docs),
    attachments: toAttachments(docs),
    schema: ExtractedApplicationSchema,
    label: `${tenantId}-upload`,
  });
  return { ...data, documentsPresent: [...new Set(data.documentsPresent)] };
}

/**
 * Same pipeline as evaluateTenant, but the documents are the files the applicant uploaded. The model only reads the
 * files; every status still comes from lib/rules (payslip age, rent-to-income, name matching, completeness) and a
 * crosscheck disagreement still forces NEEDS_INFO. `tenantId` is the demo persona of the session (labels only).
 */
export async function evaluateUploadedDocuments(
  tenantId: TenantId,
  docs: readonly UploadedDocument[],
  rentUsdc: number = DEFAULT_RENT_USDC,
): Promise<FinalDecision> {
  const ctx: RuleContext = { rentUsdc, asOf: DOCUMENTS_AS_OF };
  const extracted = await extractUploadedApplication(tenantId, docs);
  const { status, issues } = evaluatePrequalRules(extracted, ctx);
  const prequal: PrequalResult = { tenantId, status, issues, extracted };
  const { agrees, discrepancies } = await runUploadCrosscheck(tenantId, docs, prequal, ctx);
  return finalizeDecision(prequal, { agrees, discrepancies });
}
