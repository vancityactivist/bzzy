CREATE TABLE "light_show" (
	"device_id" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"asset_id" text,
	"builtin" text,
	"text" text DEFAULT '' NOT NULL,
	"leds" jsonb,
	"until" integer DEFAULT 0 NOT NULL,
	"updated_at" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "light_status" (
	"device_id" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"status" "status_kind" DEFAULT 'free' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"until" integer DEFAULT 0 NOT NULL,
	"updated_at" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'web' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_gif" (
	"user_id" text NOT NULL,
	"status" "status_kind" NOT NULL,
	"asset_id" text,
	"builtin" text,
	CONSTRAINT "user_gif_user_id_status_pk" PRIMARY KEY("user_id","status")
);
--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "follows_owner" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "default_status" "status_kind" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "led_styles" jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "meeting_warn" jsonb;--> statement-breakpoint
ALTER TABLE "light_show" ADD CONSTRAINT "light_show_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "light_show" ADD CONSTRAINT "light_show_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "light_status" ADD CONSTRAINT "light_status_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_gif" ADD CONSTRAINT "user_gif_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_gif" ADD CONSTRAINT "user_gif_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Each person's look comes from their oldest light: what it showed between meetings, its
-- ring styles and meeting warning, and its GIF for each status.
UPDATE "user" u SET "default_status" = d."default_status", "led_styles" = d."led_styles", "meeting_warn" = d."meeting_warn"
FROM (
	SELECT DISTINCT ON ("owner_user_id") "owner_user_id", "default_status", "led_styles", "meeting_warn"
	FROM "device" ORDER BY "owner_user_id", "created_at", "id"
) d
WHERE d."owner_user_id" = u."id";--> statement-breakpoint
INSERT INTO "user_gif" ("user_id", "status", "asset_id", "builtin")
SELECT d."owner_user_id", a."status", a."asset_id", a."builtin"
FROM "device_asset" a
JOIN (
	SELECT DISTINCT ON ("owner_user_id") "id", "owner_user_id"
	FROM "device" ORDER BY "owner_user_id", "created_at", "id"
) d ON d."id" = a."device_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- The team a light was added to is now also the team whose announcements it shows.
UPDATE "device" d SET "push_team_id" = d."team_id"
FROM "team" t
WHERE t."id" = d."team_id" AND t."personal" = false AND d."push_team_id" IS NULL;
