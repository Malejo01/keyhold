// Server-only: Drizzle schema for Neon Postgres (AD-11b). Off-chain data model of docs/01-spec-mvp.md §6,
// plus `agencies` and `leases.agency_id` (AD-04, 2-of-3 release with tenant, landlord, agency).
//
// Decisions
//  - Properties stay in `seed/properties.json` (read by lib/agents/catalog.ts) and are referenced by a plain
//    `property_id` text column without a foreign key. The seed is the single catalog today; a table would be a
//    second source of truth and would need seeding before the first lease insert. When landlords can publish
//    listings (agency panel), `properties` becomes a table and the FK is added in a new migration.
//  - Money is stored as bigint base units (6 decimals) so the DB never sees floats.
//  - Enumerations are text + CHECK constraints (simple to migrate, same behaviour on Neon and PGlite).
//  - No PII beyond the simulated demo data: no file paths or raw documents, only metadata and hashes.
//    Chat history is NOT stored; it stays in the signed session blob.
//  - `payments.month_index` is NOT NULL with the sentinel -1 for the deposit. Postgres treats NULLs as distinct
//    in unique constraints, so a nullable month_index would let the deposit be inserted twice. The sentinel
//    works on every Postgres version (NULLS NOT DISTINCT needs PG15+). A CHECK keeps the sentinel honest.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** month_index value used by deposit payments. */
export const DEPOSIT_MONTH_INDEX = -1;

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const agencies = pgTable('agencies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Devnet pubkey of the agency signer (2-of-3 release). Null until the program mode ships. */
  walletAddress: text('wallet_address'),
  createdAt: createdAt(),
});

export const tenants = pgTable('tenants', {
  /** Demo tenant id: 'ana' | 'bruno' | 'carla'. */
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  walletAddress: text('wallet_address'),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    /** The opaque `sessionId` inside the signed blob. */
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').references(() => tenants.id),
    stage: text('stage').notNull(),
    selectedPropertyId: text('selected_property_id'),
    /**
     * Latest session version the server has accepted or issued. A blob with a lower version is stale and is
     * rejected (replay protection, docs/reviews/phase-0.md issue 1).
     */
    version: integer('version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('sessions_version_nonneg', sql`${t.version} >= 0`)],
);

/** Metadata of an uploaded/seeded document. No raw file, no file path. */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    type: text('type').notNull(),
    issueDate: text('issue_date'),
    extractedFields: jsonb('extracted_fields'),
    /** sha256 hex of the document content, so it can be proven unchanged without storing it. */
    contentSha256: text('content_sha256'),
    createdAt: createdAt(),
  },
  (t) => [index('documents_tenant_idx').on(t.tenantId)],
);

export const prequalDecisions = pgTable(
  'prequal_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: text('session_id').references(() => sessions.id),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id'),
    /** APPROVED | NEEDS_INFO | REJECTED, decided by lib/rules, never by the model. */
    status: text('status').notNull(),
    decidedBy: text('decided_by').notNull(),
    issues: jsonb('issues').notNull().default(sql`'[]'::jsonb`),
    crosscheck: jsonb('crosscheck'),
    createdAt: createdAt(),
  },
  (t) => [
    check('prequal_status_valid', sql`${t.status} in ('APPROVED','NEEDS_INFO','REJECTED')`),
    index('prequal_tenant_idx').on(t.tenantId),
  ],
);

export const leases = pgTable(
  'leases',
  {
    /** Opaque random lease id, the same one used in the memo. */
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    propertyId: text('property_id').notNull(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    agencyId: text('agency_id')
      .notNull()
      .references(() => agencies.id),
    contractText: text('contract_text').notNull(),
    contractHash: text('contract_hash').notNull(),
    lang: text('lang').notNull().default('en'),
    stage: text('stage').notNull(),
    startDate: text('start_date').notNull(),
    months: integer('months').notNull(),
    rentBaseUnits: bigint('rent_base_units', { mode: 'bigint' }).notNull(),
    depositBaseUnits: bigint('deposit_base_units', { mode: 'bigint' }).notNull(),
    dueTs: bigint('due_ts', { mode: 'number' }).notNull(),
    discountUsdcBps: integer('discount_usdc_bps').notNull(),
    discountOntimeBps: integer('discount_ontime_bps').notNull(),
    /** PDA of the Anchor Lease account. Null in custodial mode. */
    onchainAddress: text('onchain_address'),
    createdAt: createdAt(),
  },
  (t) => [
    check('leases_hash_hex', sql`${t.contractHash} ~ '^[0-9a-f]{64}$'`),
    index('leases_session_idx').on(t.sessionId),
    index('leases_agency_idx').on(t.agencyId),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leaseId: text('lease_id')
      .notNull()
      .references(() => leases.id),
    /**
     * Session that opened the claim. With the partial unique index below it enforces "one lease per session may
     * hold a deposit" even across serverless instances. Null only for rows created before it existed.
     */
    sessionId: text('session_id').references(() => sessions.id),
    kind: text('kind').notNull(),
    /** 0-based rent month, or DEPOSIT_MONTH_INDEX (-1) for the deposit. See the note at the top of the file. */
    monthIndex: integer('month_index').notNull(),
    /**
     * pending: intent recorded BEFORE the transfer is sent (the unique constraint is the idempotency lock).
     * confirmed: transfer confirmed on chain, signature stored.
     */
    status: text('status').notNull().default('pending'),
    /**
     * Known as soon as the tx is signed and stored BEFORE it is sent, so an ambiguous send (timeout, crash) can be
     * reconciled against the cluster. Pending rows may therefore carry a signature.
     */
    signature: text('signature'),
    /** Blockhash validity of the stored signature: past it (plus a margin) the tx can never land. */
    lastValidBlockHeight: bigint('last_valid_block_height', { mode: 'number' }),
    amountBaseUnits: bigint('amount_base_units', { mode: 'bigint' }),
    discountAppliedBps: integer('discount_applied_bps'),
    /** Unix seconds from the confirmed tx, never from the client. */
    blockTime: bigint('block_time', { mode: 'number' }),
    onTime: boolean('on_time'),
    memo: text('memo'),
    createdAt: createdAt(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => [
    unique('payments_lease_kind_month_uq').on(t.leaseId, t.kind, t.monthIndex),
    // A tx signature can back only one payment. NULLs (pending rows) are distinct, so they never collide.
    unique('payments_signature_uq').on(t.signature),
    check('payments_kind_valid', sql`${t.kind} in ('deposit','rent')`),
    check('payments_status_valid', sql`${t.status} in ('pending','confirmed')`),
    check(
      'payments_month_matches_kind',
      sql`(${t.kind} = 'deposit' and ${t.monthIndex} = -1) or (${t.kind} = 'rent' and ${t.monthIndex} >= 0)`,
    ),
    check(
      'payments_confirmed_has_signature',
      sql`${t.status} <> 'confirmed' or ${t.signature} is not null`,
    ),
    index('payments_lease_idx').on(t.leaseId),
    // One paid lease per session (deposit is the entry ticket). A released claim is deleted, which frees the slot.
    uniqueIndex('payments_one_deposit_per_session_uq').on(t.sessionId).where(sql`${t.kind} = 'deposit'`),
  ],
);
