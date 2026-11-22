ALTER TABLE "calendar" ADD COLUMN "counts_as" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar" ADD COLUMN "color" text;--> statement-breakpoint
UPDATE "calendar" c SET "position" = r.n FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at) - 1 AS n FROM "calendar") r WHERE c.id = r.id;
