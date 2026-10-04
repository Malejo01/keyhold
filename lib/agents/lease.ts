import { randomBytes } from 'node:crypto';
import type { LeaseDraft, PaymentIntent, PaymentKind, Property, TenantId } from '../contracts';
import { sha256Hex } from '../solana/hash';
import { findProperty } from './catalog';
import { tenantDisplayName } from './tenants';

/** Lease parameters (not pricing logic): pricing.ts applies them. */
export const LEASE_MONTHS = 12;
export const DISCOUNT_USDC_BPS = 300;
export const DISCOUNT_ONTIME_BPS = 200;
const DAY_SECONDS = 24 * 60 * 60;
const USDC_DECIMALS = 1_000_000;

function toBaseUnits(usdc: number): string {
  return BigInt(Math.round(usdc * USDC_DECIMALS)).toString();
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Unix seconds of `baseTs` shifted by `months` calendar months (UTC). */
export function addMonthsTs(baseTs: number, months: number): number {
  const d = new Date(baseTs * 1000);
  d.setUTCMonth(d.getUTCMonth() + months);
  return Math.floor(d.getTime() / 1000);
}

export function renderContract(p: {
  leaseId: string;
  tenantLabel: string;
  property: Property;
  startDate: string;
  months: number;
  rentUsdc: number;
  depositUsdc: number;
  dueDate: string;
}): string {
  return [
    'RESIDENTIAL LEASE AGREEMENT (DEMO)',
    '',
    'DEMO CONTRACT WITH SIMULATED DATA. This text was generated from a template for a hackathon demo. It is not a',
    'legal document and it is not legal or tax advice. For a real lease, consult a licensed professional.',
    '',
    `Lease ID: ${p.leaseId}`,
    `Tenant: ${p.tenantLabel}`,
    'Landlord: Demo Landlord (simulated)',
    'Intermediary: Demo real-estate agency (simulated)',
    `Property: ${p.property.title} (catalog id ${p.property.id}), ${p.property.zone}, Salta, Argentina`,
    '',
    '1. Term.',
    `   ${p.months} months starting on ${p.startDate}.`,
    '2. Rent.',
    `   ${p.rentUsdc} USDC per month. The first rent payment is due on ${p.dueDate}; each following payment is due on`,
    '   the same day of each following month.',
    '3. Discounts.',
    `   Paying in USDC reduces the rent by ${DISCOUNT_USDC_BPS / 100}%. Paying on or before the due date reduces it by a`,
    `   further ${DISCOUNT_ONTIME_BPS / 100}%. Timeliness is determined by the confirmation time of the payment`,
    '   transaction on Solana devnet, never by a device clock.',
    '4. Security deposit.',
    `   ${p.depositUsdc} USDC (one month of rent), held in custody by the platform during the lease (custodial escrow`,
    '   in this demo) and returned at move-out, less any amounts agreed by the parties.',
    '5. Payment record.',
    '   Each payment carries a memo with this lease ID and the SHA-256 hash of this exact contract text. No personal',
    '   data is written on-chain.',
    '6. Pets and use.',
    `   Residential use only. Pets: ${p.property.petsAllowed ? 'allowed' : 'not allowed'}, as stated in the listing.`,
    '',
    'Signed electronically by the parties (simulated).',
  ].join('\n');
}

/** Builds the lease draft from the catalog and a fixed template. Deterministic except leaseId and dates. */
export function createLeaseDraft(tenantId: TenantId, propertyId: string): LeaseDraft {
  const property = findProperty(propertyId);
  if (!property) throw new Error(`Unknown property id: ${propertyId}`);

  const nowMs = Date.now();
  const leaseId = `ls_${randomBytes(8).toString('hex')}`;
  const startDate = isoDate(nowMs);
  const dueTs = Math.floor(nowMs / 1000) + DAY_SECONDS; // tomorrow, so the demo payment is on time
  const contractText = renderContract({
    leaseId,
    tenantLabel: tenantDisplayName(tenantId),
    property,
    startDate,
    months: LEASE_MONTHS,
    rentUsdc: property.priceUsdc,
    depositUsdc: property.priceUsdc,
    dueDate: isoDate(dueTs * 1000),
  });

  return {
    leaseId,
    tenantId,
    propertyId: property.id,
    startDate,
    months: LEASE_MONTHS,
    rentBaseUnits: toBaseUnits(property.priceUsdc),
    depositBaseUnits: toBaseUnits(property.priceUsdc),
    dueTs,
    discountUsdcBps: DISCOUNT_USDC_BPS,
    discountOntimeBps: DISCOUNT_ONTIME_BPS,
    contractText,
    contractHash: sha256Hex(contractText),
  };
}

/** Typed payment request for lib/solana. Agents never touch Solana libraries. */
export function buildPaymentIntent(lease: LeaseDraft, kind: PaymentKind, monthIndex?: number): PaymentIntent {
  const base = {
    leaseId: lease.leaseId,
    kind,
    payer: lease.tenantId,
    contractHash: lease.contractHash,
    discountUsdcBps: lease.discountUsdcBps,
    discountOntimeBps: lease.discountOntimeBps,
  };
  if (kind === 'deposit') {
    return { ...base, listAmountBaseUnits: lease.depositBaseUnits, dueTs: lease.dueTs };
  }
  const month = monthIndex ?? 0;
  if (!Number.isInteger(month) || month < 0 || month >= lease.months) {
    throw new RangeError(`monthIndex must be an integer in [0, ${lease.months - 1}]`);
  }
  return { ...base, monthIndex: month, listAmountBaseUnits: lease.rentBaseUnits, dueTs: addMonthsTs(lease.dueTs, month) };
}
