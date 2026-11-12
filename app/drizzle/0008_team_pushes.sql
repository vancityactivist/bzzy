CREATE TYPE "public"."push_target" AS ENUM('all', 'users');--> statement-breakpoint
CREATE TABLE "team_push_ack" (
	"push_id" text NOT NULL,
	"user_id" text NOT NULL,
	"at" integer NOT NULL,
	"device_id" text,
	CONSTRAINT "team_push_ack_push_id_user_id_pk" PRIMARY KEY("push_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "team_push_target" (
	"push_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "team_push_target_push_id_user_id_pk" PRIMARY KEY("push_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "team_push" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"created_by" text,
	"target" "push_target" DEFAULT 'all' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"asset_id" text,
	"builtin" text,
	"leds" jsonb,
	"until" integer DEFAULT 0 NOT NULL,
	"updated_at" integer NOT NULL,
	"ended_at" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "features" text;--> statement-breakpoint
ALTER TABLE "team_push_ack" ADD CONSTRAINT "team_push_ack_push_id_team_push_id_fk" FOREIGN KEY ("push_id") REFERENCES "public"."team_push"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_push_ack" ADD CONSTRAINT "team_push_ack_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_push_target" ADD CONSTRAINT "team_push_target_push_id_team_push_id_fk" FOREIGN KEY ("push_id") REFERENCES "public"."team_push"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_push_target" ADD CONSTRAINT "team_push_target_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_push" ADD CONSTRAINT "team_push_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_push" ADD CONSTRAINT "team_push_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_push" ADD CONSTRAINT "team_push_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_push_team_idx" ON "team_push" USING btree ("team_id","updated_at");