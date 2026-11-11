CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing users get their real sign-up time from the personal team made at sign-up.
UPDATE "user" u SET "created_at" = t."created_at"
FROM "team_member" m JOIN "team" t ON t."id" = m."team_id" AND t."personal" = true
WHERE m."user_id" = u."id";--> statement-breakpoint
-- The first person to sign up becomes the site admin, if there isn't one yet.
UPDATE "user" SET "role" = 'admin'
WHERE "id" = (SELECT "id" FROM "user" ORDER BY "created_at" ASC, "id" ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "user" WHERE "role" = 'admin');
