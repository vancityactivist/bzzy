ALTER TABLE "authenticator" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "authenticator" ADD COLUMN "createdAt" timestamp;--> statement-breakpoint
ALTER TABLE "authenticator" ADD COLUMN "lastUsedAt" timestamp;