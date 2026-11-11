ALTER TABLE "device_asset" ALTER COLUMN "asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "sha" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "device_asset" ADD COLUMN "builtin" text;