ALTER TABLE "calendar" ADD COLUMN "show_titles" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar" ADD COLUMN "events" jsonb DEFAULT '[]'::jsonb NOT NULL;