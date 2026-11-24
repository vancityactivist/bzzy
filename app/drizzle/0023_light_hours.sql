ALTER TABLE "device" ADD COLUMN "hours_mode" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "work_hours" jsonb;