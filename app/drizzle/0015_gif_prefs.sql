CREATE TABLE "gif_pref" (
	"user_id" text NOT NULL,
	"choice" text NOT NULL,
	"favourite" boolean DEFAULT false NOT NULL,
	"last_shown_at" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gif_pref_user_id_choice_pk" PRIMARY KEY("user_id","choice")
);
--> statement-breakpoint
ALTER TABLE "gif_pref" ADD CONSTRAINT "gif_pref_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;