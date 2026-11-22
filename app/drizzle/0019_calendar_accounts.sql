CREATE TABLE "calendar_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"external_id" text,
	"server_url" text,
	"username" text,
	"secret" text NOT NULL,
	"key_id" text NOT NULL,
	"scopes" text,
	"state" text DEFAULT 'ok' NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar" ALTER COLUMN "ics_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar" ADD COLUMN "source" text DEFAULT 'ics' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "calendar" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "calendar" ADD COLUMN "sets_status" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar" ADD COLUMN "sync_state" jsonb;--> statement-breakpoint
ALTER TABLE "calendar_account" ADD CONSTRAINT "calendar_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_account_user_idx" ON "calendar_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_account_provider_ext_idx" ON "calendar_account" USING btree ("user_id","provider","external_id");--> statement-breakpoint
ALTER TABLE "calendar" ADD CONSTRAINT "calendar_account_id_calendar_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."calendar_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_account_idx" ON "calendar" USING btree ("account_id");