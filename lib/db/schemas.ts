// Server-only: zod schemas for API request bodies. Typed against the frozen contracts in lib/contracts.ts.
// Nested objects use looseObject so unknown keys are preserved: stripping them would change the
// canonical JSON and invalidate the HMAC signature of an otherwise untouched session.
import { z } from 'zod';
import type {
  ChatRequest,
  LeaseRequest,
  PaymentResult,
  SessionState,
  SignedSession,
  VerifyRequest,
  LeaseDraft,
  ChatTurn,
} from '../contracts';

/** Cost guard: longest chat message accepted by /api/chat. */
export const MAX_MESSAGE_CHARS = 2000;

export const tenantIdSchema = z.enum(['ana', 'bruno', 'carla']);

export const stageSchema = z.enum([
  'SEARCH',
  'VISIT',
  'DOCUMENTS',
  'CONTRACT',
  'PAYMENT',
  'ACTIVE',
  'MOVE_OUT',
]);

const leaseDraftSchema: z.ZodType<LeaseDraft> = z.looseObject({
  leaseId: z.string().min(1).max(128),
  tenantId: tenantIdSchema,
  propertyId: z.string().min(1).max(128),
  startDate: z.string().max(32),
  months: z.number().int().positive(),
  rentBaseUnits: z.string().regex(/^\d+$/),
  depositBaseUnits: z.string().regex(/^\d+$/),
  dueTs: z.number().int(),
  discountUsdcBps: z.number().int().min(0).max(10_000),
  discountOntimeBps: z.number().int().min(0).max(10_000),
  contractText: z.string().max(100_000),
  contractHash: z.string().regex(/^[0-9a-f]{64}$/),
});

const paymentResultSchema: z.ZodType<PaymentResult> = z.looseObject({
  kind: z.enum(['deposit', 'rent']),
  signature: z.string().min(1).max(256),
  explorerUrl: z.string().max(512),
  blockTime: z.number().int(),
  amountBaseUnits: z.string().regex(/^\d+$/),
  discountAppliedBps: z.number().int().min(0).max(10_000),
  onTime: z.boolean(),
  memo: z.string().max(512),
});

const chatTurnSchema: z.ZodType<ChatTurn> = z.looseObject({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(50_000),
});

const sessionStateSchema: z.ZodType<SessionState> = z.looseObject({
  sessionId: z.string().min(1).max(128),
  stage: stageSchema,
  tenantId: tenantIdSchema.optional(),
  selectedPropertyId: z.string().max(128).optional(),
  lease: leaseDraftSchema.optional(),
  payments: z.array(paymentResultSchema).max(100),
  history: z.array(chatTurnSchema).max(500),
});

/** Reusable: a client-held session blob. Shape only; the signature is checked by verifySession. */
export const signedSessionSchema: z.ZodType<SignedSession> = z.object({
  state: sessionStateSchema,
  sig: z.string().min(1).max(256),
});

export const chatRequestSchema: z.ZodType<ChatRequest> = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  session: signedSessionSchema.optional(),
  tenantId: tenantIdSchema.optional(),
});

export const leaseRequestSchema: z.ZodType<LeaseRequest> = z.object({
  session: signedSessionSchema,
});

export const verifyRequestSchema: z.ZodType<VerifyRequest> = z.object({
  contractText: z.string().min(1).max(100_000),
  // Base58 Solana signature: 64 bytes -> 87-88 chars.
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,100}$/, 'Invalid transaction signature'),
});
