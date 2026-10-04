import type { TenantId } from '../contracts';
import tenantsSeed from '../../seed/tenants.json';
import anaDni from '../../seed/docs/ana/dni.json';
import anaPayslip from '../../seed/docs/ana/payslip.json';
import anaIncome from '../../seed/docs/ana/income_proof.json';
import anaGuarantee from '../../seed/docs/ana/guarantee.json';
import brunoDni from '../../seed/docs/bruno/dni.json';
import brunoPayslip from '../../seed/docs/bruno/payslip.json';
import brunoIncome from '../../seed/docs/bruno/income_proof.json';
import brunoGuarantee from '../../seed/docs/bruno/guarantee.json';
import carlaDni from '../../seed/docs/carla/dni.json';
import carlaPayslip from '../../seed/docs/carla/payslip.json';
import carlaIncome from '../../seed/docs/carla/income_proof.json';
import carlaGuarantee from '../../seed/docs/carla/guarantee.json';

/** A simulated uploaded document. `docType` is the seed label; agents classify by content. */
export interface SeedDocument {
  tenantId: string;
  docType: string;
  fileName: string;
  simulated: boolean;
  text: string;
}

const DOCS: Record<TenantId, SeedDocument[]> = {
  ana: [anaDni, anaPayslip, anaIncome, anaGuarantee],
  bruno: [brunoDni, brunoPayslip, brunoIncome, brunoGuarantee],
  carla: [carlaDni, carlaPayslip, carlaIncome, carlaGuarantee],
};

export const TENANT_IDS: readonly TenantId[] = ['ana', 'bruno', 'carla'];

/**
 * Documents are a frozen snapshot, so they are evaluated as of the seed reference date.
 * This keeps Bruno's payslip "expired" and Ana's "recent" forever (no rotting demo cases).
 */
export const DOCUMENTS_AS_OF: string = tenantsSeed.referenceDate;

export function isTenantId(value: unknown): value is TenantId {
  return typeof value === 'string' && (TENANT_IDS as readonly string[]).includes(value);
}

export function tenantDocuments(tenantId: TenantId): SeedDocument[] {
  return DOCS[tenantId];
}

export function tenantDisplayName(tenantId: TenantId): string {
  return tenantsSeed.tenants.find((t) => t.id === tenantId)?.displayName ?? tenantId;
}
