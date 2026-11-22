CREATE TABLE "light_claim" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"user_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp,
	"claimed_at" timestamp,
	"invited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "light_claim_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "claim_id" text;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "ship_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "shipped_at" timestamp;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "arrived_at" timestamp;--> statement-breakpoint
ALTER TABLE "light_claim" ADD CONSTRAINT "light_claim_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "light_claim_user_idx" ON "light_claim" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_claim_id_light_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."light_claim"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_claim_idx" ON "device" USING btree ("claim_id");