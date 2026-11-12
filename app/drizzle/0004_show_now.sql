CREATE TABLE "show_now" (
	"user_id" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"asset_id" text,
	"builtin" text,
	"text" text DEFAULT '' NOT NULL,
	"until" integer DEFAULT 0 NOT NULL,
	"updated_at" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "show_now" ADD CONSTRAINT "show_now_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_now" ADD CONSTRAINT "show_now_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;