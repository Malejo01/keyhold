CREATE TABLE "agencies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"wallet_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"type" text NOT NULL,
	"issue_date" text,
	"extracted_fields" jsonb,
	"content_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"property_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"agency_id" text NOT NULL,
	"contract_text" text NOT NULL,
	"contract_hash" text NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"stage" text NOT NULL,
	"start_date" text NOT NULL,
	"months" integer NOT NULL,
	"rent_base_units" bigint NOT NULL,
	"deposit_base_units" bigint NOT NULL,
	"due_ts" bigint NOT NULL,
	"discount_usdc_bps" integer NOT NULL,
	"discount_ontime_bps" integer NOT NULL,
	"onchain_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leases_hash_hex" CHECK ("leases"."contract_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" text NOT NULL,
	"kind" text NOT NULL,
	"month_index" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"signature" text,
	"amount_base_units" bigint,
	"discount_applied_bps" integer,
	"block_time" bigint,
	"on_time" boolean,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "payments_lease_kind_month_uq" UNIQUE("lease_id","kind","month_index"),
	CONSTRAINT "payments_signature_uq" UNIQUE("signature"),
	CONSTRAINT "payments_kind_valid" CHECK ("payments"."kind" in ('deposit','rent')),
	CONSTRAINT "payments_status_valid" CHECK ("payments"."status" in ('pending','confirmed')),
	CONSTRAINT "payments_month_matches_kind" CHECK (("payments"."kind" = 'deposit' and "payments"."month_index" = -1) or ("payments"."kind" = 'rent' and "payments"."month_index" >= 0)),
	CONSTRAINT "payments_confirmed_has_signature" CHECK ("payments"."status" <> 'confirmed' or "payments"."signature" is not null)
);
--> statement-breakpoint
CREATE TABLE "prequal_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text,
	"tenant_id" text NOT NULL,
	"property_id" text,
	"status" text NOT NULL,
	"decided_by" text NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"crosscheck" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prequal_status_valid" CHECK ("prequal_decisions"."status" in ('APPROVED','NEEDS_INFO','REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"stage" text NOT NULL,
	"selected_property_id" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_version_nonneg" CHECK ("sessions"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"wallet_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prequal_decisions" ADD CONSTRAINT "prequal_decisions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prequal_decisions" ADD CONSTRAINT "prequal_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_tenant_idx" ON "documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "leases_session_idx" ON "leases" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "leases_agency_idx" ON "leases" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "payments_lease_idx" ON "payments" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "prequal_tenant_idx" ON "prequal_decisions" USING btree ("tenant_id");