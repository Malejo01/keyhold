ALTER TABLE "payments" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "last_valid_block_height" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_deposit_per_session_uq" ON "payments" USING btree ("session_id") WHERE "payments"."kind" = 'deposit';