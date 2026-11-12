ALTER TABLE "device" ADD COLUMN "allow_flash" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "led_styles" jsonb;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "meeting_warn" jsonb;