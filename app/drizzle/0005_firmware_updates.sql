CREATE TABLE "firmware_release" (
	"id" text PRIMARY KEY NOT NULL,
	"tag" text,
	"version" text,
	"manifest" jsonb,
	"assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "auto_update" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "firmware_version" text;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "board" text;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "firmware_failed" text;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "update_requested_at" integer DEFAULT 0 NOT NULL;